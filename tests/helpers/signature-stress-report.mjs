import {signatureCases,seededSignatureCases,runCase,nativeCanvas,alphaStats,fieldExport,visibleSpan} from './signature-stress-harness.mjs';
import {CONTOUR_TOLERANCES} from '../../public/assets/signature-geometry.js';
import {submissionFixture,syntheticApplication} from './form-transport-harness.mjs';

export function measureSignatures() {
  return signatureCases().map(definition=>{
    const started=performance.now();
    const {pad,canvases}=runCase(definition);
    const paths=pad.paths();
    const lastInput=definition.strokes.at(-1).at(-1);
    const lastStored=pad.strokes.at(-1)?.points.at(-1);
    const expected=[Math.max(0,Math.min(600,lastInput[0])),Math.max(0,Math.min(180,lastInput[1]))];
    const row={name:definition.name,inputEvents:definition.strokes.reduce((n,s)=>n+s.length,0),
      strokesSubmitted:definition.strokes.length,strokesStored:pad.strokes.length,
      samplesStored:pad.strokes.reduce((n,s)=>n+s.points.length,0),
      endpointDistance:lastStored?Number(Math.hypot(lastStored[0]-expected[0],lastStored[1]-expected[1]).toFixed(3)):null,
      rawContourLength:JSON.stringify({version:1,width:600,height:180,paths}).length,
      longestPath:Math.max(0,...paths.map(path=>path.length))};
    try {
      const output=fieldExport(pad);
      Object.assign(row,{accepted:true,vectorLength:output.vector.length,contourTolerance:pad.tolerance??null,smoothed:pad.smoothed??false,
        pngBase64Length:output.base64.length,pngWidth:output.width,pngHeight:output.height,
        raster:nativeCanvas?alphaStats(canvases.at(-1)):null});
    }catch(error){row.accepted=false;row.error=error.message;row.refusal=visibleSpan(definition)<12?'minimum-visible-span':'field-capacity';}
    row.elapsedMs=Math.round(performance.now()-started);
    return row;
  });
}

export function measureSeededSignatures() {
  const report={cases:512,inputEvents:0,accepted:0,largestAcceptedVector:0,capacityCases:[],minimumVisibleCases:[],smoothed:0,
    nativePngCases:0,largestNativePng:0,nativeSizeFallbacks:0};
  const definitions=seededSignatureCases();
  for(const definition of definitions) {
    const {pad}=runCase(definition,{native:false});
    report.inputEvents+=definition.strokes.reduce((sum,points)=>sum+points.length,0);
    try {
      const output=fieldExport(pad);report.accepted++;if(pad.smoothed)report.smoothed++;
      report.largestAcceptedVector=Math.max(report.largestAcceptedVector,output.vector.length);
    }catch(error) {
      if(visibleSpan(definition)<12){report.minimumVisibleCases.push(definition.name);continue;}
      if(!(error instanceof RangeError))throw error;
      report.capacityCases.push({name:definition.name,type:definition.type,
        samplesPerStroke:definition.strokes.map(points=>points.length),error:error.message,
        smallestVector:Math.min(...[false,true].flatMap(smooth=>CONTOUR_TOLERANCES.map(tolerance=>
          JSON.stringify({version:1,width:600,height:180,paths:pad.paths(tolerance,smooth)}).length)))});
    }
  }
  if(nativeCanvas)for(const definition of definitions.filter((_,index)=>index%16===0)) {
    if(visibleSpan(definition)<12)continue;
    const {pad}=runCase(definition,{native:true}),output=fieldExport(pad);
    report.nativePngCases++;report.largestNativePng=Math.max(report.largestNativePng,output.base64.length);
    if(output.width<1200)report.nativeSizeFallbacks++;
  }
  return report;
}

export function measureTransportSignatures(definitions=[...signatureCases(),...seededSignatureCases()]) {
  if(!nativeCanvas)return {available:false};
  const {utils,form}=submissionFixture(syntheticApplication);
  const report={available:true,postBudget:92160,cases:definitions.length,accepted:0,minimumVisible:0,
    largestAcceptedPost:0,smoothed:0,sizeFallbacks:0,rows:[]};
  for(const definition of definitions) {
    const {pad}=runCase(definition,{native:true});
    let smallestAttempt=Infinity,attempts=0;
    const row={name:definition.name};
    try {
      const output=pad.export({fits:candidate=>{
        const size=utils.submissionBytes(form,{Signature_Vector__c:candidate.vector,Signature_PNG_Base64__c:candidate.base64});
        smallestAttempt=Math.min(smallestAttempt,size);attempts++;
        return size<=92160;
      }});
      const size=utils.submissionBytes(form,{Signature_Vector__c:output.vector,Signature_PNG_Base64__c:output.base64});
      report.accepted++;report.largestAcceptedPost=Math.max(report.largestAcceptedPost,size);
      if(pad.smoothed)report.smoothed++;if(output.width<1200)report.sizeFallbacks++;
      Object.assign(row,{accepted:true,encodedPostBytes:size,vectorLength:output.vector.length,pngBase64Length:output.base64.length,
        pngWidth:output.width,pngHeight:output.height,smoothed:pad.smoothed,contourTolerance:pad.tolerance});
    }catch(error) {
      if(visibleSpan(definition)<12){report.minimumVisible++;row.refusal='minimum-visible-span';}
      else if(error instanceof RangeError)row.refusal='submission-capacity';
      else throw error;
      Object.assign(row,{accepted:false,error:error.message,smallestAttempt:Number.isFinite(smallestAttempt)?smallestAttempt:null});
    }
    row.attempts=attempts;report.rows.push(row);
  }
  return report;
}

export function measureDotBoundary() {
  if(!nativeCanvas)return {available:false};
  const source=signatureCases().find(definition=>definition.name==='one-thousand isolated dots');
  const {utils,form}=submissionFixture(syntheticApplication),probes=new Map();
  function probe(count) {
    if(probes.has(count))return probes.get(count);
    const {pad}=runCase({...source,strokes:source.strokes.slice(0,count)},{native:true});
    let smallestAttempt=Infinity;
    const result={count};
    try {
      const output=pad.export({fits:candidate=>{
        const bytes=utils.submissionBytes(form,{Signature_Vector__c:candidate.vector,Signature_PNG_Base64__c:candidate.base64});
        smallestAttempt=Math.min(smallestAttempt,bytes);return bytes<=92160;
      }});
      Object.assign(result,{accepted:true,encodedPostBytes:utils.submissionBytes(form,{Signature_Vector__c:output.vector,Signature_PNG_Base64__c:output.base64}),
        vectorLength:output.vector.length,pngBase64Length:output.base64.length,pngWidth:output.width,pngHeight:output.height,
        contourTolerance:pad.tolerance});
    }catch(error) {
      if(!(error instanceof RangeError))throw error;
      Object.assign(result,{accepted:false,smallestAttempt:Number.isFinite(smallestAttempt)?smallestAttempt:null,error:error.message});
    }
    probes.set(count,result);return result;
  }
  let low=4,high=source.strokes.length;
  if(!probe(low).accepted || probe(high).accepted)throw new Error('The chosen dot boundary is not bracketed.');
  while(high-low>1){const middle=Math.floor((low+high)/2);if(probe(middle).accepted)low=middle;else high=middle;}
  return {available:true,postBudget:92160,maximumFitting:probe(low),nextDot:probe(high),
    probes:[...probes.values()].sort((a,b)=>a.count-b.count)};
}

if(process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll('\\','/').split('/').at(-1))) {
  process.stdout.write(JSON.stringify({nativeRaster:Boolean(nativeCanvas),cases:measureSignatures(),seeded:measureSeededSignatures(),transport:measureTransportSignatures(),dotBoundary:measureDotBoundary()},null,2)+'\n');
}
