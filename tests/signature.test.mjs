import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {SignaturePad} from '../public/assets/signature-pad.js';
import {parseVector,serializePaths} from '../public/assets/signature-geometry.js';

// These fixtures exercise pointer and geometry behaviour. Real browser Canvas/PNG/PDF
// rendering is separately verified by the saved Web-to-Lead end-to-end artifacts.
class Element {
  constructor(){this.attrs={};this.children=[];this.listeners={};this.disabled=false;this.captured=new Set();this.classList={toggle(){}};}
  setAttribute(k,v){this.attrs[k]=v;} addEventListener(k,v){this.listeners[k]=v;}
  replaceChildren(){this.children=[];} append(e){this.children.push(e);} closest(){return this;}
  focus(){} setPointerCapture(id){this.captured.add(id);} releasePointerCapture(id){this.captured.delete(id);}
  hasPointerCapture(id){return this.captured.has(id);} getBoundingClientRect(){return {left:20,top:30,width:600,height:180};}
}
let canvases=[];
globalThis.document={createElementNS:()=>new Element(),createElement:()=>{
  const canvas={width:0,height:0,fills:[],getContext(){return {scale(){},fillStyle:'',fill:p=>canvas.fills.push(p.d)};},toDataURL(){return 'data:image/png;base64,'+'A'.repeat(1000);}};
  canvases.push(canvas);return canvas;
}};
globalThis.Path2D=class {constructor(d){this.d=d;}};
globalThis.requestAnimationFrame=callback=>{queueMicrotask(callback);return 1;};
function setup(){canvases=[];const svg=new Element(),status={},undo=new Element(),redo=new Element(),clear=new Element();return {pad:new SignaturePad(svg,{status,undo,redo,clear}),svg,status,undo,redo,clear};}
function pointer(x,y,type='mouse',pressure=.5){return {clientX:x+20,clientY:y+30,pointerId:1,pointerType:type,pressure,button:0,isPrimary:true,prevented:0,preventDefault(){this.prevented++;}};}
function stroke(pad,{type='mouse',pressure=false,offset=0}={}){
  pad.start(pointer(40,90+offset,type,pressure?.1:.5));
  for(let i=1;i<=45;i++)pad.move(pointer(40+i*8,90+Math.sin(i/3)*35+offset,type,pressure?.1+.8*(i%10)/10:.5));
  pad.finish(pointer(400,90+Math.sin(15)*35+offset,type));
}
test('mouse contour is compact and Canvas paints exactly the vector paths',()=>{
  const {pad}=setup();stroke(pad);const output=pad.export(),vector=parseVector(output.vector);
  assert.equal(vector.paths.length,1);assert.ok(output.vector.length<28000);assert.equal(output.width,1200);assert.equal(output.height,360);
  assert.deepEqual(canvases.at(-1).fills,vector.paths);
});
test('multiple strokes support undo, redo, clear and redraw',()=>{
  const {pad,undo,redo,clear}=setup();stroke(pad);stroke(pad,{offset:25});assert.equal(pad.paths().length,2);
  undo.listeners.click();assert.equal(pad.paths().length,1);redo.listeners.click();assert.equal(pad.paths().length,2);
  clear.listeners.click();assert.equal(pad.hasInk,false);assert.throws(()=>pad.export());stroke(pad);assert.equal(parseVector(pad.export().vector).paths.length,1);
});
test('touch uses pointer capture and prevents scrolling while signing',()=>{
  const {pad,svg}=setup(),down=pointer(40,90,'touch');pad.start(down);assert.equal(down.prevented,1);assert.equal(svg.hasPointerCapture(1),true);
  const move=pointer(120,60,'touch');pad.move(move);assert.equal(move.prevented,1);assert.equal(pad.active.pressure,false);
  pad.finish(pointer(180,120,'touch'));assert.equal(svg.hasPointerCapture(1),false);
  assert.match(fs.readFileSync(new URL('../public/assets/agreement.css',import.meta.url),'utf8'),/touch-action:none/);
});
test('pen pressure changes the outline while mouse pressure is simulated',()=>{
  let {pad}=setup();stroke(pad,{type:'pen',pressure:true});const pressured=pad.paths()[0];
  ({pad}=setup());stroke(pad,{type:'pen',pressure:false});assert.notEqual(pad.paths()[0],pressured);
  ({pad}=setup());pad.start(pointer(40,90,'mouse',.7));assert.equal(pad.active.pressure,false);
});
test('secondary pointers and right mouse clicks do not add marks',()=>{
  const {pad}=setup();pad.start({...pointer(20,30),isPrimary:false});pad.start({...pointer(20,30),button:2});assert.equal(pad.hasInk,false);
});
test('tap, short mark and unfinished strokes cannot be submitted',()=>{
  const {pad}=setup();pad.start(pointer(50,80));assert.throws(()=>pad.export(),/Finish/);pad.finish(pointer(50,80));assert.throws(()=>pad.export(),/full signature/);
  pad.start(pointer(50,80));pad.move(pointer(53,82));pad.finish(pointer(55,83));assert.throws(()=>pad.export(),/full signature/);
});
test('cancelled pointer does not commit a partial stroke',()=>{
  const {pad,status}=setup();pad.start(pointer(50,80,'touch'));pad.move(pointer(180,90,'touch'));pad.cancel();assert.equal(pad.paths().length,0);assert.match(status.textContent,/interrupted/);
});
test('viewport resizing preserves completed geometry',()=>{
  const {pad,svg}=setup();stroke(pad);const original=pad.export().vector;svg.getBoundingClientRect=()=>({left:20,top:30,width:300,height:90});
  assert.equal(pad.export().vector,original);assert.deepEqual(pad.point(pointer(150,45,'touch')),[300,90,.5]);
});
test('viewport edges are clamped and remain valid contours',()=>{
  const {pad}=setup();pad.start(pointer(-10,-10));for(let i=0;i<=60;i++)pad.move(pointer(i*10,90+Math.sin(i/2)*95));pad.finish(pointer(620,190));assert.doesNotThrow(()=>parseVector(pad.export().vector));
});
test('excessive point and stroke counts are bounded',()=>{
  const {pad}=setup();pad.start(pointer(10,30));for(let i=1;i<1800;i++)pad.move(pointer(30+(i%500),70+Math.sin(i)*30));assert.equal(pad.active.points.length,1200);pad.cancel();
  for(let i=0;i<24;i++)stroke(pad);pad.start(pointer(10,30));assert.equal(pad.active,null);assert.throws(()=>pad.export(),/large|complex/);
});
test('malformed, executable and oversized vectors are rejected',()=>{
  const {pad}=setup();stroke(pad);const valid=JSON.parse(pad.export().vector);
  for(const changes of [{version:2},{width:601},{paths:['<svg onload=alert(1)>']},{extra:1},{paths:Array(25).fill(valid.paths[0])}])assert.throws(()=>parseVector(JSON.stringify({...valid,...changes})));
  assert.throws(()=>parseVector(' '.repeat(28001)));assert.throws(()=>serializePaths(['M 0 0 L 999 999 Z']));
});
test('internal LWC and public capture use the same geometry validator',()=>{
  assert.equal(fs.readFileSync(new URL('../public/assets/signature-geometry.js',import.meta.url),'utf8'),fs.readFileSync(new URL('../force-app/main/default/lwc/nteSignatureGeometry/nteSignatureGeometry.js',import.meta.url),'utf8'));
});
