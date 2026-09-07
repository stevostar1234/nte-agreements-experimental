import { getStroke } from './vendor/perfect-freehand.mjs';
import { WIDTH, HEIGHT, MAX_VECTOR, MAX_PNG, CONTOUR_TOLERANCES, contourPath, serializePaths } from './signature-geometry.js?v=20260907';

const svgNS = 'http://www.w3.org/2000/svg';
export const MIN_VISIBLE_SPAN = 12;

export function smoothDensePoints(points) {
  // Used only if the complete ordinary contour cannot fit. Preserve sample count,
  // pressure and endpoints; remove only local micro-jitter, at most one viewport pixel.
  return points.map((point,index)=>{
    if(!index || index===points.length-1)return point;
    const radius=Math.min(3,index,points.length-1-index);
    let x=0,y=0;
    for(let offset=index-radius;offset<=index+radius;offset++) {
      const neighbor=points[offset],dx=neighbor[0]-point[0],dy=neighbor[1]-point[1];
      if(dx*dx+dy*dy>4)return point;
      x+=neighbor[0];y+=neighbor[1];
    }
    x/=radius*2+1;y/=radius*2+1;
    const distance=Math.hypot(x-point[0],y-point[1]),scale=distance>1?1/distance:1;
    return [point[0]+(x-point[0])*scale,point[1]+(y-point[1])*scale,point[2]];
  });
}

export class SignaturePad {
  constructor(svg, {status, undo, redo, clear, onChange = () => {}}) {
    this.svg = svg; this.status = status; this.onChange = onChange;
    this.buttons = {undo, redo, clear}; this.strokes = []; this.redoStack = []; this.active = null;
    this.tolerance = CONTOUR_TOLERANCES[0];this.smoothed=false;
    svg.setAttribute('viewBox', `0 0 ${WIDTH} ${HEIGHT}`);
    svg.addEventListener('pointerdown', event => this.start(event));
    svg.addEventListener('pointermove', event => this.move(event));
    svg.addEventListener('pointerup', event => this.finish(event));
    svg.addEventListener('pointercancel', event => this.cancel(event));
    svg.addEventListener('lostpointercapture', event => this.cancel(event));
    undo.addEventListener('click', () => {if(this.strokes.length){this.redoStack.push(this.strokes.pop());this.changed();}});
    redo.addEventListener('click', () => {if(this.redoStack.length){this.strokes.push(this.redoStack.pop());this.changed();}});
    clear.addEventListener('click', () => this.clear());
    this.draw();
  }
  get hasInk() {return this.strokes.length > 0 || Boolean(this.active);}
  point(event) {
    const box = this.svg.getBoundingClientRect();
    return [Math.max(0, Math.min(WIDTH, (event.clientX-box.left)*WIDTH/box.width)),
      Math.max(0, Math.min(HEIGHT, (event.clientY-box.top)*HEIGHT/box.height)),
      event.pressure > 0 ? Math.min(1, event.pressure) : (this.active?.points.at(-1)[2] ?? 0.5)];
  }
  start(event) {
    if(this.active || event.isPrimary === false || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.preventDefault();
    this.svg.focus({preventScroll:true});
    this.svg.setPointerCapture(event.pointerId);
    this.active = {pointerId:event.pointerId, points:[this.point(event)], pressure:event.pointerType==='pen' && event.pressure>0, distance:0};
    this.redoStack = [];
    this.message('Signing…');
    this.draw();
  }
  move(event) {
    if(!this.active || event.pointerId !== this.active.pointerId) return;
    event.preventDefault();
    const coalesced = event.getCoalescedEvents?.();
    const packets = coalesced?.length ? [...coalesced, event] : [event];
    for(const packet of packets) {
      const point=this.point(packet), last=this.active.points.at(-1);
      const distance=Math.hypot(point[0]-last[0],point[1]-last[1]);
      if(!distance && point[2] === last[2]) continue;
      if(event.pointerType === 'pen' && packet.pressure > 0) this.active.pressure=true;
      this.active.distance+=distance; this.active.points.push(point);
    }
    if(!this.frame)this.frame=requestAnimationFrame(()=>{this.frame=null;this.draw();});
  }
  finish(event) {
    if(!this.active || event.pointerId !== this.active.pointerId) return;
    this.move(event);
    this.commitActive();
    this.changed();
  }
  commitActive() {
    if(!this.active) return;
    const stroke=this.active; this.active=null;
    this.strokes.push(stroke);
    if(this.svg.hasPointerCapture(stroke.pointerId))this.svg.releasePointerCapture(stroke.pointerId);
  }
  cancel(event){
    if(!this.active || (event?.pointerId !== undefined && event.pointerId !== this.active.pointerId))return;
    this.commitActive();
    this.changed();
    this.message('Your mark has been kept. You can continue signing or undo it.');
  }
  clear({quiet=false}={}) {
    const pointerId=this.active?.pointerId;
    this.active=null;this.strokes=[];this.redoStack=[];this.tolerance=CONTOUR_TOLERANCES[0];this.smoothed=false;
    if(pointerId !== undefined && this.svg.hasPointerCapture(pointerId))this.svg.releasePointerCapture(pointerId);
    this.draw();
    if(!quiet)this.message('Signature cleared.');
    this.onChange();
  }
  path(stroke, tolerance, smoothed=false) {
    const contours=smoothed?'smoothedContours':'contours',outlineKey=smoothed?'smoothedOutline':'outline';
    if(stroke!==this.active && stroke[contours]?.has(tolerance))return stroke[contours].get(tolerance);
    const outline=stroke[outlineKey] ?? getStroke(smoothed?smoothDensePoints(stroke.points):stroke.points,{
      size:3.2, thinning:0.55, smoothing:0.65, streamline:0.55, simulatePressure:!stroke.pressure,
      start:{cap:true,taper:0}, end:{cap:true,taper:0}, last:stroke!==this.active
    });
    const path=contourPath(outline,tolerance);
    if(stroke!==this.active){
      stroke[outlineKey]=outline;stroke[contours] ??= new Map();stroke[contours].set(tolerance,path);
    }
    return path;
  }
  paths(tolerance = this.tolerance, smoothed = this.smoothed) {
    return [...this.strokes,...(this.active?[this.active]:[])].map(stroke=>this.path(stroke,tolerance,smoothed)).filter(Boolean);
  }
  draw() {
    this.svg.replaceChildren();
    for(const d of this.paths()) {const path=document.createElementNS(svgNS,'path');path.setAttribute('d',d);path.setAttribute('fill','#172b22');this.svg.append(path);}
    this.buttons.undo.disabled=!this.strokes.length;
    this.buttons.redo.disabled=!this.redoStack.length;
    this.buttons.clear.disabled=!this.hasInk;
    this.svg.closest('.signature-surface').classList.toggle('has-ink',this.hasInk);
  }
  changed(){this.draw();this.onChange();this.message(this.strokes.length?'Signature captured. You can undo, redo or clear it.':'Draw your signature in the box.');}
  message(text){this.status.textContent=text;}
  export({maxVector=Math.floor(MAX_VECTOR*0.9),maxPng=Math.floor(MAX_PNG*0.9),fits=()=>true}={}) {
    maxVector=Math.min(MAX_VECTOR,maxVector);maxPng=Math.min(MAX_PNG,maxPng);
    if(!Number.isInteger(maxVector) || maxVector<=0 || !Number.isInteger(maxPng) || maxPng<=0 || typeof fits!=='function')
      throw new Error('The signature submission limits are not configured correctly.');
    if(this.active)throw new Error('Finish your signature before submitting.');
    if(!this.strokes.length)throw new Error('Please add your signature in the box.');
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    for(const stroke of this.strokes)for(const [x,y] of stroke.points) {
      minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
    }
    if(maxX-minX<MIN_VISIBLE_SPAN && maxY-minY<MIN_VISIBLE_SPAN)
      throw new Error('Please draw a slightly larger mark so your signature is clearly visible.');
    let sizeError;
    for(const smoothed of [false,true]) {
      for(const tolerance of CONTOUR_TOLERANCES) {
        const paths=this.paths(tolerance,smoothed);
        let vector;
        try {
          vector=serializePaths(paths);
          if(vector.length>maxVector)throw new RangeError('The signature exceeds this form’s Salesforce storage limit. Please undo some marks and try again.');
        } catch(error) {
          if(!(error instanceof RangeError))throw error;
          sizeError=error;continue;
        }
        // Preserve the vector's detail before considering coarser geometry.
        for(const width of [1200,900,600,450,300]) {
          const canvas=document.createElement('canvas');canvas.width=width;canvas.height=width*HEIGHT/WIDTH;
          const ctx=canvas.getContext('2d');
          if(!ctx)throw new Error('Your browser could not prepare the signature image. Please try another browser.');
          ctx.scale(width/WIDTH,width/WIDTH);ctx.fillStyle='#172b22';
          for(const d of paths)ctx.fill(new Path2D(d));
          const base64=canvas.toDataURL('image/png').split(',')[1];
          const result={vector,base64,width,height:canvas.height};
          if(base64 && base64.length<=maxPng && fits(result)) {
            this.tolerance=tolerance;this.smoothed=smoothed;this.draw();return result;
          }
          sizeError=new RangeError('The signature exceeds this form’s Salesforce submission size limit. Please undo some marks and try again.');
        }
      }
    }
    throw sizeError;
  }
}
