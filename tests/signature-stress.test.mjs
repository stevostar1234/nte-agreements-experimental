import test from 'node:test';
import assert from 'node:assert/strict';
import {getStroke} from '../public/assets/vendor/perfect-freehand.mjs';
import {contourPath,parseVector,serializePaths,MAX_VECTOR,CONTOUR_TOLERANCES} from '../public/assets/signature-geometry.js';
import {signatureCases,seededSignatureCases,runCase,setupPad,enterStroke,cursive,line,nativeCanvas,alphaStats,fieldExport,visibleSpan} from './helpers/signature-stress-harness.mjs';
import {measureTransportSignatures} from './helpers/signature-stress-report.mjs';

for(const definition of signatureCases()) {
  test(`signature stress: ${definition.name}`,()=>{
    const {pad,canvases}=runCase(definition);
    if(visibleSpan(definition)<12) {
      assert.throws(()=>fieldExport(pad),/slightly larger mark/);
      assert.equal(pad.strokes.length,definition.strokes.length,'small marks are retained for continuation');
      return;
    }
    if(definition.capacityCase) {
      const original=pad.paths();
      assert.throws(()=>fieldExport(pad),error=>error instanceof RangeError && /storage limit/.test(error.message));
      assert.deepEqual(pad.paths(),original,'over-capacity input remains available for undo or editing');
      assert.equal(pad.strokes.length,definition.strokes.length);
      for(const smooth of [false,true])for(const tolerance of CONTOUR_TOLERANCES)
        assert.ok(JSON.stringify({version:1,width:600,height:180,paths:pad.paths(tolerance,smooth)}).length>MAX_VECTOR,
          'the remaining rejection is supported by the actual complete serialized payload size');
      return;
    }
    const output=fieldExport(pad);
    const vector=parseVector(output.vector);
    assert.equal(pad.strokes.length,definition.strokes.length,'every completed stroke is retained');
    assert.equal(vector.paths.length,definition.strokes.length,'each disconnected stroke has a contour');
    assert.ok(output.vector.length<=131072,'vector stays within the configured Salesforce field ceiling');
    assert.ok(output.base64.length<=131072,'PNG Base64 stays within the configured Salesforce field ceiling');
    const input=definition.strokes.at(-1).at(-1),last=pad.strokes.at(-1).points.at(-1);
    assert.ok(Math.hypot(last[0]-Math.max(0,Math.min(600,input[0])),last[1]-Math.max(0,Math.min(180,input[1])))<=0.6,
      'capture reaches the end of the submitted stroke instead of silently stopping at a sample cap');
    if(nativeCanvas) {
      assert.ok(alphaStats(canvases.at(-1)).visible>0,'the actual PNG has visible ink');
      const png=Buffer.from(output.base64,'base64');
      assert.equal(png.subarray(1,4).toString(),'PNG');
      assert.equal(png.readUInt32BE(16),output.width);
      assert.equal(png.readUInt32BE(20),output.height);
    }
  });
}

test('a single contour larger than the old 18000-character limit remains valid',()=>{
  const outline=getStroke(cursive(25,1200),{size:3.2,thinning:0.55,smoothing:0.65,streamline:0.55,last:true});
  // Directly encode a high-fidelity legacy Q path; the parser must not reject it
  // simply because the same legal contour uses more text than the new encoder.
  const round=value=>Math.round(value*10)/10;
  const tokens=['M',round(outline[0][0]),round(outline[0][1])];
  outline.forEach((point,index)=>{
    const next=outline[(index+1)%outline.length];
    tokens.push('Q',round(point[0]),round(point[1]),round((point[0]+next[0])/2),round((point[1]+next[1])/2));
  });
  tokens.push('Z');
  const path=tokens.join(' ');
  assert.ok(path.length>18000 && path.length<131000);
  assert.doesNotThrow(()=>serializePaths([path]));
});

test('512 seeded variants retain input and respect only visible-size and storage bounds',context=>{
  let largest=0,events=0,accepted=0,capacity=0,tooSmall=0;
  for(const definition of seededSignatureCases()) {
    const {pad}=runCase(definition,{native:false});
    let output;
    const original=pad.paths();
    try {
      output=fieldExport(pad);accepted++;
      assert.equal(parseVector(output.vector).paths.length,definition.strokes.length,definition.name);
      largest=Math.max(largest,output.vector.length);
    }catch(error) {
      if(visibleSpan(definition)<12) {
        assert.match(error.message,/slightly larger mark/);tooSmall++;
      }else {
      assert.ok(error instanceof RangeError && /storage limit/.test(error.message),`${definition.name}: ${error.message}`);
      for(const smooth of [false,true])for(const tolerance of CONTOUR_TOLERANCES)
        assert.ok(JSON.stringify({version:1,width:600,height:180,paths:pad.paths(tolerance,smooth)}).length>MAX_VECTOR,definition.name);
      assert.deepEqual(pad.paths(),original,`${definition.name}: refused input stays intact`);
      capacity++;
      }
    }
    assert.equal(pad.strokes.length,definition.strokes.length,definition.name);
    const input=definition.strokes.at(-1).at(-1),last=pad.strokes.at(-1).points.at(-1);
    assert.ok(Math.hypot(last[0]-Math.max(0,Math.min(600,input[0])),last[1]-Math.max(0,Math.min(180,input[1])))<=0.6,definition.name);
    events+=definition.strokes.reduce((sum,points)=>sum+points.length,0);
  }
  assert.ok(accepted+tooSmall>=509,'acceptance of sufficiently visible input must not regress');
  context.diagnostic(`512 deterministic variants, ${events} input events: ${accepted} accepted, ${tooSmall} below the visible-size minimum, ${capacity} above field capacity; largest accepted vector ${largest} characters.`);
});

test('32 seeded variants render to actual nonblank native PNGs',{skip:!nativeCanvas},context=>{
  let largest=0,fallbacks=0,rendered=0,tooSmall=0;
  for(const definition of seededSignatureCases().filter((_,index)=>index%16===0)) {
    const {pad,canvases}=runCase(definition,{native:true});
    if(visibleSpan(definition)<12){assert.throws(()=>fieldExport(pad),/slightly larger mark/);tooSmall++;continue;}
    const output=fieldExport(pad);
    rendered++;
    assert.ok(alphaStats(canvases.at(-1)).visible>0,definition.name);
    assert.ok(output.base64.length<=131072,definition.name);
    assert.equal(parseVector(output.vector).paths.length,definition.strokes.length,definition.name);
    largest=Math.max(largest,output.base64.length);if(output.width<1200)fallbacks++;
  }
  context.diagnostic(`32 variants: ${rendered} native PNGs and ${tooSmall} below the visible-size minimum; largest Base64 ${largest} characters; ${fallbacks} used size fallback.`);
});

test('512 seeded and 30 named inputs use actual form encoding to respect the complete POST budget',{skip:!nativeCanvas},context=>{
  const report=measureTransportSignatures();
  assert.equal(report.cases,542);
  assert.ok(report.accepted>510,'a broad set must succeed under the actual form envelope');
  for(const row of report.rows) {
    if(row.accepted)assert.ok(row.encodedPostBytes<=92160,row.name);
    else if(row.refusal==='submission-capacity' && row.smallestAttempt!==null)
      assert.ok(row.smallestAttempt>92160,`${row.name}: every tested fitting-field raster still exceeds the form envelope`);
    else assert.ok(['minimum-visible-span','submission-capacity'].includes(row.refusal),row.name);
  }
  context.diagnostic(`${report.cases} full-form native PNG cases: ${report.accepted} accepted, ${report.minimumVisible} below the visible-size minimum, ${report.cases-report.accepted-report.minimumVisible} above submission capacity; largest accepted POST ${report.largestAcceptedPost} encoded bytes.`);
});

test('payload ceiling is measured on complete serialized JSON, not handwriting shape',()=>{
  assert.equal(MAX_VECTOR,131072);
  const smallPath='M 0 0 L 1 0 L 1 1 Z';
  const overhead=JSON.stringify({version:1,width:600,height:180,paths:[smallPath]}).length-smallPath.length;
  const pathPrefix='M 0 0 ',segment='L 1 1 ',suffix='Z';
  const repeated=Math.floor((MAX_VECTOR-overhead-pathPrefix.length-suffix.length)/segment.length);
  const longest=pathPrefix+segment.repeat(repeated)+suffix;
  const vector=JSON.stringify({version:1,width:600,height:180,paths:[longest]});
  assert.ok(vector.length<=MAX_VECTOR && vector.length>=MAX_VECTOR-segment.length);
  assert.doesNotThrow(()=>parseVector(vector));
  const oversized=JSON.stringify({version:1,width:600,height:180,paths:[longest+segment]});
  assert.ok(oversized.length>MAX_VECTOR);
  assert.throws(()=>parseVector(oversized),/large|capacity|limit|fit/i);
});

test('high-frequency sampling preserves final endpoint and undo/redo of the whole stroke',()=>{
  const {pad,undo,redo}=setupPad();
  enterStroke(pad,cursive(30,25000),{coalesced:100});
  const first=fieldExport(pad);
  assert.ok(pad.strokes[0].points.length>1200);
  undo.listeners.click();assert.equal(pad.hasInk,false);
  redo.listeners.click();assert.equal(fieldExport(pad).vector,first.vector);
});

test('dense-input fallback retains original samples, pressures and endpoints',()=>{
  const definitions=[signatureCases().find(value=>value.name==='slow jittery signature'),
    ...seededSignatureCases().filter((_,index)=>[14,168,180].includes(index))];
  for(const definition of definitions) {
    const {pad}=runCase(definition,{native:false});
    const original=JSON.stringify(pad.strokes.map(stroke=>stroke.points));
    const output=fieldExport(pad);
    assert.ok(output.vector.length<=MAX_VECTOR,definition.name);
    assert.equal(JSON.stringify(pad.strokes.map(stroke=>stroke.points)),original,
      `${definition.name}: a rendering fallback must not replace the original captured input`);
    assert.deepEqual(parseVector(output.vector).paths,pad.paths(),
      `${definition.name}: the selected finalized paths are also displayed on screen`);
  }
});

test('tiny and boundary contours are permitted while non-finite coordinates are rejected',()=>{
  for(const points of [[[0,0]],[[600,180]],line(200,80,200.1,80.1,2)]) {
    const outline=getStroke(points,{size:3.2,last:true});
    assert.doesNotThrow(()=>serializePaths([contourPath(outline)]));
  }
  for(const path of ['M NaN 0 L 1 1 Z','M Infinity 0 L 1 1 Z','M 0 0 L 1e9 1 Z','M 0 0 L 1 1 Z <script>']) {
    assert.throws(()=>serializePaths([path]));
  }
});

test('native raster draws every exported contour at its selected output resolution',{skip:!nativeCanvas},()=>{
  const definition=signatureCases().find(value=>value.name==='initials with disconnected dot');
  const {pad,canvases}=runCase(definition);
  const output=fieldExport(pad),vector=parseVector(output.vector),rendered=canvases.at(-1);
  const independent=nativeCanvas.createCanvas(output.width,output.height);
  const context=independent.getContext('2d');
  context.scale(output.width/600,output.width/600);context.fillStyle='#172b22';
  for(const path of vector.paths)context.fill(new nativeCanvas.Path2D(path));
  assert.deepEqual(Buffer.from(rendered.toBuffer('image/png')),Buffer.from(independent.toBuffer('image/png')),
    'native Canvas output is deterministically reconstructed from the actual exported vector');
});

test('native PNG size fallback selects the largest attempted image that fits',{skip:!nativeCanvas},()=>{
  const definition=signatureCases().find(value=>value.name==='twenty-loop ornament');
  const {pad,canvases}=runCase(definition);
  const output=fieldExport(pad);
  assert.ok(canvases.length>1,'a detailed ornament exercises an actual PNG size fallback');
  for(const canvas of canvases.slice(0,-1)) {
    assert.ok(canvas.toDataURL('image/png').split(',')[1].length>131072,'an earlier image really exceeded the transport ceiling');
  }
  assert.ok(output.base64.length<=131072);
  assert.equal(output.width,canvases.at(-1).width);
  assert.equal(output.height,output.width*180/600);
  assert.ok(alphaStats(canvases.at(-1)).visible>0);
});

test('compacted contours preserve the visible position of unsimplified perfect-freehand ink',{skip:!nativeCanvas},()=>{
  const names=['short horizontal mark','ordinary cursive','elaborate cursive','twenty-loop ornament','pen varying pressure','four viewport borders','slow jittery signature'];
  const definitions=[...signatureCases().filter(value=>names.includes(value.name)),
    ...seededSignatureCases().filter((_,index)=>[14,168,180].includes(index))];
  const round=value=>Math.round(value*10)/10;
  for(const definition of definitions) {
    const {pad,canvases}=runCase(definition);
    const output=fieldExport(pad),captured=canvases.at(-1);
    const reference=nativeCanvas.createCanvas(output.width,output.height),context=reference.getContext('2d');
    context.scale(output.width/600,output.width/600);context.fillStyle='#172b22';
    for(const stroke of pad.strokes) {
      const outline=getStroke(stroke.points,{size:3.2,thinning:0.55,smoothing:0.65,streamline:0.55,
        simulatePressure:!stroke.pressure,start:{cap:true,taper:0},end:{cap:true,taper:0},last:true});
      const tokens=['M',round(outline[0][0]),round(outline[0][1])];
      outline.forEach((point,index)=>{
        const next=outline[(index+1)%outline.length];
        tokens.push('Q',round(point[0]),round(point[1]),round((point[0]+next[0])/2),round((point[1]+next[1])/2));
      });
      tokens.push('Z');context.fill(new nativeCanvas.Path2D(tokens.join(' ')));
    }
    const width=output.width,height=output.height;
    const actual=captured.getContext('2d').getImageData(0,0,width,height).data;
    const expected=context.getImageData(0,0,width,height).data;
    const radius=Math.ceil(output.width/600*0.75+1);
    function farInk(source,target) {
      let escaped=0;
      for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
        if(source[(y*width+x)*4+3]<32)continue;
        let nearby=false;
        for(let oy=Math.max(0,y-radius);oy<=Math.min(height-1,y+radius)&&!nearby;oy++)
          for(let ox=Math.max(0,x-radius);ox<=Math.min(width-1,x+radius);ox++)
            if(target[(oy*width+ox)*4+3]>=32){nearby=true;break;}
        if(!nearby)escaped++;
      }
      return escaped;
    }
    assert.equal(farInk(expected,actual),0,`${definition.name}: reference ink stays near the compacted contour`);
    assert.equal(farInk(actual,expected),0,`${definition.name}: compacted ink stays near the reference contour`);
  }
});
