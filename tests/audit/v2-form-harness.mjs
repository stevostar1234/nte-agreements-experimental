import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';

const root=new URL('../../',import.meta.url);
const read=name=>fs.readFileSync(new URL(name,root),'utf8');
const decode=value=>value.replaceAll('&amp;','&').replaceAll('&quot;','"').replaceAll('&#39;',"'").replaceAll('&lt;','<').replaceAll('&gt;','>');
const camel=value=>value.replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase());
const voidTags=new Set(['AREA','BASE','BR','COL','EMBED','HR','IMG','INPUT','LINK','META','PARAM','SOURCE','TRACK','WBR']);

class Element {
  constructor(tag,attrs={},document=null) {
    this.tagName=tag.toUpperCase();this.attrs={...attrs};this.children=[];this.parentElement=null;
    this.dataset=Object.fromEntries(Object.entries(attrs).filter(([key])=>key.startsWith('data-')).map(([key,value])=>[camel(key.slice(5)),value]));
    this.style={};this.listeners={};this.ownerDocument=document;this._value=attrs.value;
    this.disabled=Object.hasOwn(attrs,'disabled');this.required=Object.hasOwn(attrs,'required');
    this.checked=Object.hasOwn(attrs,'checked');this.hidden=Object.hasOwn(attrs,'hidden');
    this.textContent='';this.innerHTML='';this.customValidity='';this.className=attrs.class||'';
    this.classList={toggle:()=>{}};
  }
  get id(){return this.attrs.id||'';}set id(value){this.attrs.id=value;}
  get name(){return this.attrs.name||'';}set name(value){this.attrs.name=value;}
  get type(){return this.attrs.type||(this.tagName==='INPUT'?'text':this.tagName==='BUTTON'?'submit':'');}set type(value){this.attrs.type=value;}
  get value(){if(this._value!==undefined)return this._value;if(this.tagName==='SELECT')return this.children.find(c=>c.attrs.selected!==undefined)?.value??this.children[0]?.value??'';if(this.tagName==='OPTION')return this.textContent;return this.type==='checkbox'?'on':'';}
  set value(value){this._value=String(value);}
  get maxLength(){return Number(this.attrs.maxlength??-1);}set maxLength(value){this.attrs.maxlength=String(value);}
  get min(){return this.attrs.min||'';}set min(value){this.attrs.min=String(value);}
  get max(){return this.attrs.max||'';}set max(value){this.attrs.max=String(value);}
  get form(){return this.closest('form');}
  get parentNode(){return this.parentElement;}
  hasAttribute(name){return Object.hasOwn(this.attrs,name);}
  setAttribute(name,value){this.attrs[name]=String(value);if(name.startsWith('data-'))this.dataset[camel(name.slice(5))]=String(value);}
  removeAttribute(name){delete this.attrs[name];}
  appendChild(child){this.children.push(child);child.parentElement=this;child.ownerDocument=this.ownerDocument;return child;}
  append(child){return this.appendChild(child);}
  replaceChildren(){this.children=[];}
  matches(selector) {
    return selector.split(',').some(part=>{
      part=part.trim();if(part.includes(' '))return false;
      if(part.includes(':checked')&&!this.checked)return false;part=part.replace(':checked','');
      const tag=/^[a-z][a-z0-9-]*/i.exec(part)?.[0];if(tag&&this.tagName!==tag.toUpperCase())return false;
      const id=/#([\w-]+)/.exec(part)?.[1];if(id&&this.id!==id)return false;
      const classes=[...part.matchAll(/\.([\w-]+)/g)].map(match=>match[1]);
      if(classes.some(name=>!this.className.split(/\s+/).includes(name)))return false;
      for(const [,attribute,,value]of part.matchAll(/\[([^\]=]+)(?:=(["']?)(.*?)\2)?\]/g)){
        let actual=this.attrs[attribute];if(attribute==='required')actual=this.required?'':undefined;
        if(actual===undefined)return false;if(value!==undefined&&actual!==value)return false;
      }
      return true;
    });
  }
  querySelectorAll(selector){const results=[];for(const child of this.children){if(child.matches(selector))results.push(child);results.push(...child.querySelectorAll(selector));}return results;}
  querySelector(selector){return this.querySelectorAll(selector)[0]??null;}
  closest(selector){return this.matches(selector)?this:this.parentElement?.closest(selector)??null;}
  addEventListener(name,callback){(this.listeners[name]??=[]).push(callback);}
  dispatchEvent(event){event.target??=this;for(const callback of this.listeners[event.type]||[])callback(event);if(event.bubbles!==false)this.parentElement?.dispatchEvent(event);return true;}
  focus(){if(this.ownerDocument)this.ownerDocument.focused=this;}
  setCustomValidity(message){this.customValidity=message;}
  reportValidity(){
    if(this.tagName==='FORM')return this.querySelectorAll('input,select,textarea').every(control=>control.reportValidity());
    if(this.disabled||this.type==='hidden')return true;
    if(this.customValidity)return false;
    if(this.required&&((this.type==='checkbox'||this.type==='radio')?!this.checked:!this.value))return false;
    if(this.value&&this.type==='number')return Number.isFinite(Number(this.value))&&(!this.min||Number(this.value)>=Number(this.min))&&(!this.max||Number(this.value)<=Number(this.max));
    if(this.value&&this.type==='email')return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.value);
    if(this.value&&this.type==='date')return /^\d{4,}-\d\d-\d\d$/.test(this.value)&&(!this.min||this.value>=this.min)&&(!this.max||this.value<=this.max);
    return true;
  }
  submit(){this.ownerDocument.posts.push({action:this.action,method:this.method,entries:this.children.map(input=>[input.name,input.value])});}
}

function parse(html) {
  const document=new Element('document');document.ownerDocument=document;document.posts=[];
  document.createElement=tag=>new Element(tag,{},document);
  document.createElementNS=(_,tag)=>document.createElement(tag);
  document.getElementById=id=>document.querySelector('#'+id);
  const stack=[document];
  for(const token of html.match(/<!--[\s\S]*?-->|<[^>]+>|[^<]+/g)||[]) {
    if(token.startsWith('<!'))continue;
    if(token.startsWith('</')){const tag=token.slice(2,-1).trim().toUpperCase();while(stack.length>1&&stack.at(-1).tagName!==tag)stack.pop();if(stack.length>1)stack.pop();continue;}
    if(token.startsWith('<')) {
      const [,tag,raw='']=/^<([\w-]+)([\s\S]*?)\/?\s*>$/.exec(token)||[];if(!tag)continue;
      const attrs=Object.fromEntries([...raw.matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)].map(([,name,a,b,c])=>[name,decode(a??b??c??'')]));
      const element=new Element(tag,attrs,document);stack.at(-1).appendChild(element);if(!voidTags.has(element.tagName))stack.push(element);
    }else stack.at(-1).textContent+=decode(token);
  }
  document.body=document.querySelector('body');return document;
}

export function formHarness({storageThrows=false,loadForms=true,loadAgreement=true,missingBundle=false,dateClass=Date}={}) {
  const document=parse(read('public/partner-sponsor-application.html'));
  const window={location:{href:'https://stevostar1234.github.io/nte-agreements-experimental/partner-sponsor-application.html',pathname:'/nte-agreements-experimental/partner-sponsor-application.html'},crypto:webcrypto};
  const storage=new Map();const sessionStorage={setItem:(key,value)=>{if(storageThrows)throw new DOMException('Storage access blocked','SecurityError');storage.set(key,value);},getItem:key=>storage.get(key)??null};
  let pad;
  class SignaturePad {
    constructor(svg,options){this.svg=svg;this.options=options;this.hasInk=false;this.calls=0;pad=this;}
    clear(){this.hasInk=false;this.options.onChange();}
    export(options={}){if(!this.hasInk)throw new Error('Please add your signature in the box.');this.calls++;const result={vector:'{"version":1,"width":600,"height":180,"paths":["M 40 80 L 70 60 L 90 90 Z"]}',base64:'A'.repeat(1000),width:1200,height:360};if(options.fits&&!options.fits(result))throw new RangeError('The signature exceeds this form’s Salesforce submission size limit.');return result;}
  }
  const context=vm.createContext({window,document,Date:dateClass,Intl,Uint8Array,URL,URLSearchParams,console,sessionStorage,DOMException,SignaturePad,Event:class {constructor(type,options={}){this.type=type;Object.assign(this,options);}preventDefault(){this.defaultPrevented=true;}}});
  vm.runInContext(read('public/assets/config.js'),context);
  let bootError=null;
  try {if(loadForms)vm.runInContext(read('public/assets/forms.js'),context);if(!missingBundle)vm.runInContext(read('public/assets/agreement-bundle.js'),context);if(loadAgreement)vm.runInContext(read('public/assets/agreement.js').replace(/^import[^\n]+\n/,'').replace('export const MAX_SUBMISSION_BYTES','const MAX_SUBMISSION_BYTES'),context);}catch(error){bootError=error;}
  const form=document.querySelector('form[data-web-to-lead]');
  const get=id=>document.getElementById(id),field=api=>form.querySelector(`[data-sf-field="${api}"]`);
  const change=(id,value,type='input')=>{const element=get(id);if(!element)throw new Error(`Missing control ${id}`);if(element.type==='checkbox')element.checked=Boolean(value);else element.value=value;element.dispatchEvent({type,target:element,bubbles:true,preventDefault(){}});};
  function fillValid(overrides={}) {
    const values={
      'partner-company':'NTE QA synthetic organisation','partner-first-name':'Alex','partner-last-name':'Example','partner-title':'Coordinator',
      'partner-email':'qa@example.invalid','partner-phone':'07700900000','partner-day-contact-same':'Yes',
      'partner-sunday':'Yes','partner-power':'No','partner-equipment':'None','partner-heavy-vehicle':'No','partner-accessibility':'No',
      'partner-planned-count':'2','partner-extra-notes':'None','partner-quote':'No','partner-payment-method':'Bank transfer','partner-po':'No',
      'partner-supplier-agreement':'No','partner-invoice-company':'NTE QA synthetic organisation','partner-invoice-address':'Synthetic address',
      'partner-invoice-person':'Finance Example','partner-invoice-email':'finance@example.invalid','partner-invoice-phone':'07700900001',
      'partner-invoice-additional-required':'No','partner-declaration-name':'Alex Example','partner-declaration-date':'2026-09-07',...overrides};
    for(const [id,value]of Object.entries(values))if(get(id))change(id,value,get(id).tagName==='SELECT'?'change':'input');
    const packageBox=form.querySelectorAll('[data-package-price]').find(box=>box.value==='Gold Partner');packageBox.checked=true;packageBox.dispatchEvent({type:'change',target:packageBox,bubbles:true});
    for(const api of ['Agreement_Authority__c','Agreement_Accepted__c','Terms_and_Conditions__c']){const element=field(api);element.checked=true;element.dispatchEvent({type:'change',target:element,bubbles:true});}
    if(pad)pad.hasInk=true;
    return apiValues();
  }
  function apiValues(){return Object.fromEntries(form.querySelectorAll('[data-sf-field]').filter(c=>!c.disabled&&(!(c.type==='checkbox'||c.type==='radio')||c.checked)).map(c=>[c.dataset.sfField,c.value]));}
  const submit=()=>{let error=null;try{form.dispatchEvent({type:'submit',target:form,bubbles:false,preventDefault(){}});}catch(problem){error=problem;}return {posts:document.posts.length,error:error?.message??null,status:form.querySelector('[data-form-status]')?.textContent,submitting:form.dataset.submitting,focused:document.focused?.id??null};};
  return {window,document,form,pad,get,field,change,fillValid,apiValues,submit,bootError,storage};
}
