import {createRequire} from 'node:module';
import {SignaturePad} from '../../public/assets/signature-pad.js';

// Native raster checks are optional developer tooling, never a form dependency.
// Set NTE_CANVAS_MODULE to an installed @napi-rs/canvas entry point to enable them.
export const nativeCanvas = process.env.NTE_CANVAS_MODULE
  ? createRequire(import.meta.url)(process.env.NTE_CANVAS_MODULE) : null;

class Element {
  constructor() {
    this.attrs={}; this.children=[]; this.listeners={}; this.disabled=false;
    this.captured=new Set(); this.classList={toggle(){}};
    this.box={left:20,top:30,width:600,height:180};
  }
  setAttribute(name,value){this.attrs[name]=value;}
  addEventListener(name,listener){this.listeners[name]=listener;}
  replaceChildren(){this.children=[];}
  append(child){this.children.push(child);}
  closest(){return this;}
  focus(){}
  setPointerCapture(id){this.captured.add(id);}
  releasePointerCapture(id){this.captured.delete(id);}
  hasPointerCapture(id){return this.captured.has(id);}
  getBoundingClientRect(){return this.box;}
}

export function setupPad({native=Boolean(nativeCanvas),width=600,height=180}={}) {
  const canvases=[];
  globalThis.document={
    createElementNS:()=>new Element(),
    createElement:tag=>{
      if(tag!=='canvas')throw new Error(`Unexpected element ${tag}`);
      const canvas=native ? nativeCanvas.createCanvas(1,1) : {
        width:0,height:0,fills:[],
        getContext(){return {scale(){},fillStyle:'',fill:path=>this.fills.push(path.d)};},
        toDataURL(){return 'data:image/png;base64,'+'A'.repeat(1000);}
      };
      canvases.push(canvas);return canvas;
    }
  };
  globalThis.Path2D=native ? nativeCanvas.Path2D : class {constructor(d){this.d=d;}};
  // Render immediately on start/finish as the real module does; moves coalesce.
  globalThis.requestAnimationFrame=()=>1;
  globalThis.cancelAnimationFrame=()=>{};
  const svg=new Element(),status={},undo=new Element(),redo=new Element(),clear=new Element();
  svg.box.width=width;svg.box.height=height;
  const pad=new SignaturePad(svg,{status,undo,redo,clear});
  return {pad,svg,status,undo,redo,clear,canvases};
}

export function pointer(point,{type='mouse',pointerId=1,box={left:20,top:30,width:600,height:180}}={}) {
  return {clientX:box.left+point[0]*box.width/600,clientY:box.top+point[1]*box.height/180,
    pointerId,pointerType:type,pressure:point[2]??0.5,button:0,isPrimary:true,
    preventDefault(){},timeStamp:0};
}

export function enterStroke(pad,points,{type='mouse',coalesced=0,pointerId=1}={}) {
  const options={type,pointerId,box:pad.svg.getBoundingClientRect()};
  pad.start(pointer(points[0],options));
  if(coalesced) {
    for(let offset=1;offset<points.length;offset+=coalesced) {
      const events=points.slice(offset,offset+coalesced).map(point=>pointer(point,options));
      const event={...events.at(-1),getCoalescedEvents:()=>events};
      pad.move(event);
    }
  } else for(const point of points.slice(1))pad.move(pointer(point,options));
  pad.finish(pointer(points.at(-1),options));
}

export const line=(x1,y1,x2,y2,count=24,pressure=0.5)=>Array.from({length:count},(_,index)=>{
  const t=count===1?0:index/(count-1);return [x1+(x2-x1)*t,y1+(y2-y1)*t,pressure];
});
export const cursive=(cycles=8,count=900,{height=50,pressure=false}={})=>Array.from({length:count},(_,index)=>{
  const t=index/(count-1),phase=t*cycles*Math.PI*2;
  return [24+t*550+8*Math.sin(phase),90-height*Math.sin(phase),pressure?0.01+0.98*(0.5+0.5*Math.sin(phase/3)):0.5];
});
export const flourish=(turns=12,count=1600)=>Array.from({length:count},(_,index)=>{
  const t=index/(count-1),angle=t*turns*Math.PI*2;
  return [300+270*(1-t*0.7)*Math.cos(angle),90+75*(1-t*0.7)*Math.sin(angle),0.5];
});
export const jitter=(count=4000)=>Array.from({length:count},(_,index)=>{
  const t=index/(count-1);return [25+550*t+0.7*Math.sin(index*1.79),90+35*Math.sin(t*Math.PI*16)+0.7*Math.sin(index*2.63),0.5];
});

export function signatureCases() {
  return [
    {name:'single deliberate dot',strokes:[[[250,90,0.5]]]},
    {name:'one-pixel short mark',strokes:[line(250,90,251,90,3)]},
    {name:'short horizontal mark',strokes:[line(250,90,265,90,8)]},
    {name:'short vertical mark',strokes:[line(250,90,250,102,8)]},
    {name:'long horizontal underline',strokes:[line(40,90,560,90,200)]},
    {name:'vertical flourish',strokes:[line(300,10,300,170,100)]},
    {name:'initials with disconnected dot',strokes:[line(100,120,150,40),line(150,40,185,120),line(121,87,171,87),[[218,105,0.5]]]},
    {name:'simple cursive',strokes:[cursive(5,160)]},
    {name:'ordinary cursive',strokes:[cursive(10,800)]},
    {name:'elaborate cursive',strokes:[cursive(24,2400)]},
    {name:'eight independent cursive strokes',strokes:Array.from({length:8},(_,i)=>cursive(3,150,{height:10+i*6}))},
    {name:'twenty-four independent strokes',strokes:Array.from({length:24},(_,i)=>line(20+i*23,25,35+i*23,145,24))},
    {name:'sixty-four independent strokes',strokes:Array.from({length:64},(_,i)=>line(15+(i%32)*18,20+Math.floor(i/32)*75,24+(i%32)*18,70+Math.floor(i/32)*75,10))},
    {name:'two-hundred-fifty-six dots',strokes:Array.from({length:256},(_,i)=>[[12+(i%64)*9,30+Math.floor(i/64)*40,0.5]])},
    {name:'six-loop ornament',strokes:[flourish(6,800)]},
    {name:'twenty-loop ornament',strokes:[flourish(20,2600)]},
    {name:'high-sample smooth signature',strokes:[cursive(8,20000)],coalesced:120},
    {name:'slow jittery signature',strokes:[jitter(12000)],coalesced:96},
    {name:'two-thousand-event jittery signature',strokes:[jitter(2000)],coalesced:96},
    {name:'pen varying pressure',strokes:[cursive(12,1200,{pressure:true})],type:'pen'},
    {name:'pen light pressure',strokes:[cursive(8,800).map(p=>[p[0],p[1],0.01])],type:'pen'},
    {name:'pen full pressure',strokes:[cursive(8,800).map(p=>[p[0],p[1],1])],type:'pen'},
    {name:'touch cursive',strokes:[cursive(10,1200)],type:'touch',coalesced:32},
    {name:'four viewport borders',strokes:[line(0,0,600,0,160),line(600,0,600,180,60),line(600,180,0,180,160),line(0,180,0,0,60)]},
    {name:'outside viewport excursion',strokes:[[[-100,-30,0.5],[300,50,0.5],[800,250,0.5],[200,140,0.5],[-100,90,0.5]]]},
    {name:'mobile viewport',strokes:[cursive(10,1400)],width:280,height:84,type:'touch'},
    {name:'very dense eighty-loop signature',strokes:[cursive(80,12000)],coalesced:120},
    {name:'maximum sampling sixty-thousand events',strokes:[cursive(50,60000)],coalesced:256},
    {name:'seven-hundred-seventy-six isolated dots',strokes:Array.from({length:776},(_,i)=>[[8+(i%100)*5.9,9+Math.floor(i/100)*17.5,0.5]])},
    {name:'one-thousand isolated dots',strokes:Array.from({length:1000},(_,i)=>[[8+(i%100)*5.9,9+Math.floor(i/100)*17.5,0.5]]),capacityCase:true}
  ];
}

export function seededSignatureCases(count=512) {
  let state=0x4e544553;
  const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
  const counts=[1,3,12,45,160,600,1200,3200];
  return Array.from({length:count},(_,caseIndex)=>{
    const strokeCount=1+Math.floor(random()*8),type=['mouse','touch','pen'][caseIndex%3];
    const strokes=[];
    for(let strokeIndex=0;strokeIndex<strokeCount;strokeIndex++) {
      const samples=counts[Math.floor(random()*counts.length)];
      const family=Math.floor(random()*4),cycles=1+Math.floor(random()*24);
      const width=25+random()*540,height=2+random()*145;
      const left=5+random()*(590-width),top=5+random()*(170-height);
      const phase=random()*Math.PI*2,penPhase=random()*Math.PI*2;
      const points=Array.from({length:samples},(_,index)=>{
        const t=samples===1?0:index/(samples-1),angle=t*cycles*Math.PI*2+phase;
        let x,y;
        if(family===0){x=left+width*t;y=top+height*(0.5+0.45*Math.sin(angle));}
        else if(family===1){x=left+width*(0.5+0.46*Math.cos(angle));y=top+height*(0.5+0.46*Math.sin(angle));}
        else if(family===2){x=left+width*t;y=top+height*t;}
        else {x=left+width*t+0.12*Math.sin(index*1.79);y=top+height*(0.5+0.4*Math.sin(angle))+0.12*Math.sin(index*2.63);}
        const pressure=type==='pen'?0.01+0.98*(0.5+0.5*Math.sin(t*Math.PI*2+penPhase)):0.5;
        return [x,y,pressure];
      });
      strokes.push(points);
    }
    return {name:`seeded signature ${String(caseIndex+1).padStart(3,'0')}`,strokes,type,
      coalesced:caseIndex%4===0?64:0,width:caseIndex%5===0?280:600,height:caseIndex%5===0?84:180};
  });
}

export function runCase(definition,{native=Boolean(nativeCanvas)}={}) {
  const state=setupPad({native,width:definition.width,height:definition.height});
  for(const points of definition.strokes)enterStroke(state.pad,points,definition);
  return state;
}

export const fieldExport=pad=>pad.export({maxVector:131072,maxPng:131072});
export function visibleSpan(definition) {
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(const points of definition.strokes)for(const point of points) {
    const x=Math.max(0,Math.min(600,point[0])),y=Math.max(0,Math.min(180,point[1]));
    minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
  }
  return Math.max(maxX-minX,maxY-minY);
}

export function alphaStats(canvas) {
  const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
  let visible=0,opaque=0,alphaSum=0;
  for(let index=3;index<pixels.length;index+=4){if(pixels[index])visible++;if(pixels[index]===255)opaque++;alphaSum+=pixels[index];}
  return {visible,opaque,alphaSum};
}
