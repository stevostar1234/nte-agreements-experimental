import test from 'node:test';
import assert from 'node:assert/strict';
import {MAX_VECTOR, MAX_PNG, CONTOUR_TOLERANCES, parseVector, serializePaths} from '../public/assets/signature-geometry.js';
import {MIN_VISIBLE_SPAN,smoothDensePoints} from '../public/assets/signature-pad.js';
import {setupPad, pointer, enterStroke, line, cursive, jitter} from './helpers/signature-stress-harness.mjs';

test('released pen retains its last pressure instead of adding an artificial thick endpoint',()=>{
  const {pad}=setupPad({native:false});
  pad.start(pointer([50,50,0],{type:'pen'}));
  pad.move(pointer([80,70,0.1],{type:'pen'}));
  pad.finish(pointer([120,90,0],{type:'pen'}));
  assert.equal(pad.strokes[0].pressure,true);
  assert.deepEqual(pad.strokes[0].points.at(-1),[120,90,0.1]);
  assert.doesNotThrow(()=>pad.export());
});

test('coalesced events and the final pointer endpoint are retained without duplicate samples',()=>{
  const {pad}=setupPad({native:false});
  pad.start(pointer([20,30,0.5]));
  pad.move({...pointer([60,70,0.5]),getCoalescedEvents:()=>[
    pointer([30,40,0.5]),pointer([40,50,0.5]),pointer([40,50,0.5])
  ]});
  pad.finish(pointer([90,100,0.5]));
  assert.deepEqual(pad.strokes[0].points,[[20,30,0.5],[30,40,0.5],[40,50,0.5],[60,70,0.5],[90,100,0.5]]);
});

test('cancellation from another pointer cannot terminate the active signature',()=>{
  const {pad,svg}=setupPad({native:false});
  pad.start(pointer([20,30,0.5],{type:'touch',pointerId:1}));
  svg.listeners.pointercancel({pointerId:2});
  svg.listeners.lostpointercapture({pointerId:2});
  assert.equal(pad.active.pointerId,1);
  pad.finish(pointer([90,100,0.5],{type:'touch',pointerId:1}));
  assert.equal(pad.strokes.length,1);
});

test('lost capture preserves the mark exactly once and it can be undone and redone',()=>{
  const {pad,svg,undo,redo}=setupPad({native:false});
  pad.start(pointer([20,30,0.5]));pad.move(pointer([40,80,0.5]));
  svg.listeners.lostpointercapture({pointerId:1});
  svg.listeners.pointercancel({pointerId:1});
  assert.equal(pad.strokes.length,1);
  const saved=pad.export().vector;
  undo.listeners.click();assert.equal(pad.hasInk,false);
  redo.listeners.click();assert.equal(pad.export().vector,saved);
});

test('Clear releases pointer capture and a subsequent lostcapture cannot restore cleared ink',()=>{
  const {pad,svg}=setupPad({native:false});
  pad.start(pointer([20,30,0.5]));pad.move(pointer([40,80,0.5]));
  pad.clear();svg.listeners.lostpointercapture({pointerId:1});
  assert.equal(svg.hasPointerCapture(1),false);
  assert.equal(pad.hasInk,false);
  assert.throws(()=>pad.export(),/add your signature/);
});

test('one long contour beyond the old18,000-character cap is valid',()=>{
  const path='M 10 10 '+Array.from({length:2400},(_,i)=>`L ${20+i%500} ${20+i%140}`).join(' ')+' Z';
  assert.ok(path.length>18000);
  const vector=serializePaths([path]);
  assert.ok(vector.length<MAX_VECTOR);
  assert.equal(parseVector(vector).paths[0],path);
});

test('the exact Salesforce vector character boundary is accepted and one more character is rejected',()=>{
  const envelope=path=>JSON.stringify({version:1,width:600,height:180,paths:[path]});
  const count=Math.floor((MAX_VECTOR-envelope('M 0 0 Z').length)/6);
  let path='M 0 0 '+'L 1 1 '.repeat(count)+'Z';
  let extra=MAX_VECTOR-envelope(path).length;
  path=path.replace(/\b1\b/g,token=>extra-- >0?'10':token);
  const raw=envelope(path);
  assert.equal(raw.length,MAX_VECTOR);
  assert.doesNotThrow(()=>parseVector(raw));
  assert.throws(()=>parseVector(raw+' '),RangeError);
});

test('legacy quadratic contours remain readable while malformed geometry still fails safely',()=>{
  assert.doesNotThrow(()=>serializePaths(['M 40 100 Q 60 50 80 100 Q 100 140 120 90 Z']));
  for(const path of ['M 0 0 Z','M 0 0 L NaN 2 Z','M 0 0 L 2 3 L 4 Z',
    'M 0 0 M 4 4 Z','M 0 0 L 2 3 Z onload=alert(1)','M 0 0 L 611 90 Z']) {
    assert.throws(()=>serializePaths([path]));
  }
});

test('PNG fallback retains the same vector and uses the first raster resolution that fits',()=>{
  const {pad,canvases}=setupPad({native:false});
  enterStroke(pad,cursive(8,800));
  const makeCanvas=document.createElement;
  document.createElement=tag=>{
    const canvas=makeCanvas(tag);
    canvas.toDataURL=()=>`data:image/png;base64,${'A'.repeat(canvas.width>450 ? MAX_PNG+4 : MAX_PNG)}`;
    return canvas;
  };
  const output=pad.export({maxPng:MAX_PNG});
  assert.equal(output.width,450);assert.equal(output.height,135);assert.equal(output.base64.length,MAX_PNG);
  assert.deepEqual(canvases.map(canvas=>canvas.width),[1200,900,600,450]);
  const paths=JSON.parse(output.vector).paths;
  for(const canvas of canvases)assert.deepEqual(canvas.fills,paths);
  assert.deepEqual(pad.svg.children.map(child=>child.attrs.d),paths);
});

test('completed contours are cached and undo preserves full original pointer data',()=>{
  const {pad,undo,redo}=setupPad({native:false});
  const points=line(20,40,550,140,4000);enterStroke(pad,points);
  const saved=pad.strokes[0],originalOutline=saved.outline;
  assert.equal(saved.points.length,points.length);
  for(let index=0;index<10;index++)pad.draw();
  assert.equal(saved.outline,originalOutline);
  assert.equal(saved.contours.size,1);
  undo.listeners.click();redo.listeners.click();
  assert.equal(pad.strokes[0],saved);
  assert.equal(saved.points.length,4000);
  assert.equal(pad.tolerance,CONTOUR_TOLERANCES[0]);
});

test('dense-point fallback keeps every endpoint and pressure with at most one pixel movement',()=>{
  const original=jitter(12000).map((point,index)=>[point[0],point[1],index/11999]);
  const snapshot=JSON.stringify(original),smoothed=smoothDensePoints(original);
  assert.equal(smoothed.length,original.length);
  assert.deepEqual(smoothed[0],original[0]);assert.deepEqual(smoothed.at(-1),original.at(-1));
  for(let index=0;index<original.length;index++) {
    assert.equal(smoothed[index][2],original[index][2]);
    assert.ok(Math.hypot(smoothed[index][0]-original[index][0],smoothed[index][1]-original[index][1])<=1.00000001);
  }
  assert.equal(JSON.stringify(original),snapshot);
  const largeGestures=line(10,20,550,150,15);
  assert.deepEqual(smoothDensePoints(largeGestures),largeGestures,'larger deliberate movements are unchanged');
});

test('slow high-frequency jitter fits without deleting original samples or replacing normal capture',()=>{
  const {pad,svg,canvases}=setupPad({native:false}),points=jitter(12000);
  enterStroke(pad,points,{coalesced:96});
  const original=JSON.stringify(pad.strokes[0].points);
  const output=pad.export();
  assert.equal(pad.smoothed,true);
  assert.equal(pad.strokes[0].points.length,12000);
  assert.equal(JSON.stringify(pad.strokes[0].points),original);
  assert.ok(output.vector.length<10000);
  const paths=JSON.parse(output.vector).paths;
  assert.deepEqual(svg.children.map(child=>child.attrs.d),paths);
  assert.deepEqual(canvases.at(-1).fills,paths);
  const ordinary=setupPad({native:false}).pad;enterStroke(ordinary,cursive(8,800));ordinary.export();
  assert.equal(ordinary.smoothed,false);assert.equal(ordinary.strokes[0].smoothedOutline,undefined);
});

test('combined submission budget lowers PNG resolution before changing the vector',()=>{
  const {pad}=setupPad({native:false});enterStroke(pad,cursive(8,800));
  const original=serializePaths(pad.paths()),attempts=[];
  const output=pad.export({fits:result=>{attempts.push(result);return result.width<=600;}});
  assert.deepEqual(attempts.map(result=>result.width),[1200,900,600]);
  assert.equal(output.vector,original);
  assert.ok(attempts.every(result=>result.vector===original));
  assert.equal(pad.smoothed,false);
});

test('combined submission budget tries every PNG width before a more compact contour',()=>{
  const {pad}=setupPad({native:false});enterStroke(pad,cursive(8,800));
  const expected=serializePaths(pad.paths(CONTOUR_TOLERANCES[1])),attempts=[];
  const output=pad.export({fits:result=>{attempts.push(result);return result.vector===expected;}});
  assert.deepEqual(attempts.slice(0,5).map(result=>result.width),[1200,900,600,450,300]);
  assert.equal(attempts[5].width,1200);
  assert.equal(output.vector,expected);
  assert.equal(pad.tolerance,CONTOUR_TOLERANCES[1]);
});

test('an impossible combined submission budget leaves all visible ink available to edit',()=>{
  const {pad,svg}=setupPad({native:false});enterStroke(pad,cursive(8,800));
  const original=JSON.stringify(pad.strokes[0].points),displayed=svg.children.map(child=>child.attrs.d);
  assert.throws(()=>pad.export({fits:()=>false}),error=>error instanceof RangeError && /submission size limit/.test(error.message));
  assert.equal(JSON.stringify(pad.strokes[0].points),original);
  assert.deepEqual(svg.children.map(child=>child.attrs.d),displayed);
  assert.equal(pad.smoothed,false);
});

test('visible mark minimum measures span in either direction without judging handwriting shape',()=>{
  assert.equal(MIN_VISIBLE_SPAN,12);
  for(const points of [line(250,90,261.9,90,2),line(250,90,250,101.9,2),[[250,90,0.5]]]) {
    const {pad}=setupPad({native:false});enterStroke(pad,points);
    assert.throws(()=>pad.export(),/slightly larger mark/);
    assert.doesNotThrow(()=>serializePaths(pad.paths()),'legacy small vector geometry remains supported');
  }
  for(const points of [line(250,90,262,90,2),line(250,90,250,102,2),
    [[250,90,.5],[254,87,.5],[258,93,.5],[262,90,.5]]]) {
    const {pad}=setupPad({native:false});enterStroke(pad,points);
    assert.doesNotThrow(()=>pad.export());
  }
});
