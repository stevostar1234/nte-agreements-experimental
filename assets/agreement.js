import { SignaturePad } from './signature-pad.js';
const bundle=window.NTE_AGREEMENT, config=bundle.config;
const form=document.querySelector('form[data-web-to-lead]');
const field=api=>form.querySelector(`[data-sf-field="${api}"]`);
const value=api=>field(api)?.value.trim() || '';
const esc=input=>String(input??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;').replaceAll('{','&#123;').replaceAll('}','&#125;');
const money=amount=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',minimumFractionDigits:2}).format(amount);
const date=input=>new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'Europe/London'}).format(new Date(input+'T12:00:00Z'));
const status=document.querySelector('[data-signature-status]');
const pad=new SignaturePad(document.querySelector('[data-signature-pad]'),{
  status, undo:document.querySelector('[data-signature-undo]'),redo:document.querySelector('[data-signature-redo]'),clear:document.querySelector('[data-signature-clear]'),
  onChange(){field('Signature_Vector__c').value='';field('Signature_PNG_Base64__c').value='';}
});
const consentFields=['Agreement_Authority__c','Agreement_Accepted__c','Terms_and_Conditions__c'];
function selectedPackages(){return config.packages.filter(pack=>[...form.querySelectorAll('[data-package-price]:checked')].some(box=>box.value===pack.name));}
function updateAgreement() {
  const packages=selectedPackages(), total=packages.reduce((sum,pack)=>sum+pack.fee,0);
  const values={eventName:config.event.name,packageTitle:packages.length===1?packages[0].name:'Partner and Sponsor',organiser:config.event.organiser,
    organisation:value('Invoiced_Company__c'),address:value('Invoice_Address__c'),eventCode:config.event.code,eventDate:date(config.event.eventDate),venue:config.event.venue,
    signatory:value('Declaration_Name__c'),email:value('Email'),noticeEmail:config.event.noticeEmail,fee:money(total),taxText:config.taxText,paymentText:config.paymentText,
    version:config.version,reference:value('Booking_Reference__c'),signedAt:'On submission'};
  const schedule=packages.map(pack=>`<div class="package"><h3>${esc(pack.name)} — ${money(pack.fee)}</h3>${pack.benefits.length ? pack.benefits.map(group=>`<h4>${esc(group.heading)}</h4><table class="benefits">${group.items.map(item=>`<tr><td>${esc(item[0])}</td><td>${esc(item[1])}</td></tr>`).join('')}</table>`).join('') : '<p><strong>Benefits</strong></p><div class="blank-schedule">&#160;<br/>&#160;<br/>&#160;</div>'}</div>`).join('');
  const replacements={...Object.fromEntries(Object.entries(values).map(([key,val])=>[key,esc(val).replaceAll('\n','<br/>')])),packages:schedule,
    deadline:config.event.paperworkDeadline?`<p>Paperwork and payment (or a purchase order number) are required by ${date(config.event.paperworkDeadline)}.</p>`:'',
    signature:'<div class="signature-placeholder" aria-label="Signature will be added when you submit"></div>',evidence:''};
  const preview=bundle.template.replace(/\{\{(\w+)\}\}/g,(_,key)=>replacements[key]??'');
  document.querySelector('[data-agreement-preview]').innerHTML=preview;
  document.querySelector('[data-agreement-summary]').textContent=packages.length?`${packages.map(p=>p.name).join(' + ')} · ${money(total)} · ${config.taxText}`:'Select your package above to review the agreement.';
  document.querySelector('[data-agreement-version]').textContent=`Agreement version ${config.version} · ${config.event.code}`;
}
let lastDetails='';
function detailsFingerprint(){return JSON.stringify([...form.querySelectorAll('input,select,textarea')].filter(control=>!control.disabled && !consentFields.includes(control.dataset.sfField) && !control.dataset.sfField?.startsWith('Signature_') && !control.dataset.sfField?.startsWith('Agreement_') && control.type!=='hidden').map(control=>[control.id,control.type==='checkbox'?control.checked:control.value]));}
function handleChange(event) {
  if(event.target.closest('.signature-tools'))return;
  const details=detailsFingerprint();
  if(lastDetails && details!==lastDetails && pad.hasInk){
    pad.clear({quiet:true});consentFields.forEach(api=>{field(api).checked=false;});
    status.textContent='Your details changed. Please review the agreement and sign again.';
  }
  lastDetails=details;updateAgreement();
}
form.addEventListener('input',handleChange);
form.addEventListener('change',handleChange);
window.NTESignature={
  prepare(){
    if(!field('Agreement_Authority__c').checked || !field('Agreement_Accepted__c').checked)throw new Error('Please confirm your authority and accept the agreement.');
    const captured=pad.export();
    field('Signature_Vector__c').value=captured.vector;
    field('Signature_PNG_Base64__c').value=captured.base64;
    field('Agreement_Version__c').value=config.version;
    field('Agreement_Config_Hash__c').value=window.NTE_AGREEMENT_HASH;
    field('Agreement_Client_Time__c').value=new Date().toISOString();
    sessionStorage.setItem('nteAgreementReference',value('Booking_Reference__c'));
    return true;
  },
  clear:()=>pad.clear(),
  // A reusable capture API, also used by the browser acceptance checks.
  export:()=>pad.export()
};
lastDetails=detailsFingerprint();updateAgreement();
document.querySelector('[data-signature-loading]').hidden=true;
document.querySelector('[data-signature-controls]').hidden=false;
