import { getStroke } from './vendor/perfect-freehand.mjs';
import { WIDTH, HEIGHT, contourPath, serializePaths } from './signature-geometry.js';

const svgNS = 'http://www.w3.org/2000/svg';
export class SignaturePad {
  constructor(svg, {status, undo, redo, clear, onChange = () => {}}) {
    this.svg = svg; this.status = status; this.onChange = onChange;
    this.buttons = {undo, redo, clear}; this.strokes = []; this.redoStack = []; this.active = null;
    svg.setAttribute('viewBox', `0 0 ${WIDTH} ${HEIGHT}`);
    svg.addEventListener('pointerdown', event => this.start(event));
    svg.addEventListener('pointermove', event => this.move(event));
    svg.addEventListener('pointerup', event => this.finish(event));
    svg.addEventListener('pointercancel', () => this.cancel());
    svg.addEventListener('lostpointercapture', () => { if(this.active) this.cancel(); });
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
      event.pressure > 0 ? event.pressure : 0.5];
  }
  start(event) {
    if(this.active || event.isPrimary === false || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.preventDefault();
    if(this.strokes.length >= 24){this.message('You have reached the stroke limit. Undo a stroke or clear the signature.');return;}
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
    for(const packet of coalesced?.length ? coalesced : [event]) {
      const point=this.point(packet), last=this.active.points.at(-1);
      const distance=Math.hypot(point[0]-last[0],point[1]-last[1]);
      if(distance<0.55) continue;
      if(this.active.points.length>=1200){this.message('This stroke is too long. Finish it, then use another stroke.');break;}
      this.active.distance+=distance; this.active.points.push(point);
    }
    if(!this.frame)this.frame=requestAnimationFrame(()=>{this.frame=null;this.draw();});
  }
  finish(event) {
    if(!this.active || event.pointerId !== this.active.pointerId) return;
    this.move(event);
    const stroke=this.active; this.active=null;
    if(this.svg.hasPointerCapture(event.pointerId))this.svg.releasePointerCapture(event.pointerId);
    if(stroke.points.length>1)this.strokes.push(stroke);
    this.changed();
  }
  cancel(){this.active=null;this.message('That stroke was interrupted. Please draw it again.');this.draw();}
  clear({quiet=false}={}) {
    this.active=null;this.strokes=[];this.redoStack=[];this.draw();
    if(!quiet)this.message('Signature cleared.');
    this.onChange();
  }
  paths() {
    return [...this.strokes,...(this.active?[this.active]:[])].map(stroke=>contourPath(getStroke(stroke.points,{
      size:3.2, thinning:0.55, smoothing:0.65, streamline:0.55, simulatePressure:!stroke.pressure,
      start:{cap:true,taper:0}, end:{cap:true,taper:0}, last:stroke!==this.active
    }))).filter(Boolean);
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
  export() {
    if(this.active)throw new Error('Finish your signature before submitting.');
    const distance=this.strokes.reduce((sum,s)=>sum+s.distance,0);
    if(distance<45 || this.strokes.reduce((sum,s)=>sum+s.points.length,0)<8)throw new Error('Please draw your full signature, rather than a tap or short mark.');
    const paths=this.paths(), vector=serializePaths(paths);
    for(const width of [1200,900,600]) {
      const canvas=document.createElement('canvas');canvas.width=width;canvas.height=width*HEIGHT/WIDTH;
      const ctx=canvas.getContext('2d');ctx.scale(width/WIDTH,width/WIDTH);ctx.fillStyle='#172b22';
      for(const d of paths)ctx.fill(new Path2D(d));
      const base64=canvas.toDataURL('image/png').split(',')[1];
      if(base64.length<=28000)return {vector,base64,width,height:canvas.height};
    }
    throw new Error('Your signature is too large to submit. Please clear it and sign again using fewer strokes.');
  }
}
