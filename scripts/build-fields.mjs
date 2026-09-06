import fs from 'node:fs';
import vm from 'node:vm';
const root = new URL('../', import.meta.url);
const read = p => fs.readFileSync(new URL(p, root), 'utf8').replace(/^\uFEFF/, '');
const write = (p, s) => { const u = new URL(p, root); fs.mkdirSync(new URL('.', u), {recursive:true}); fs.writeFileSync(u, s); };
const context = {window:{}};
vm.runInNewContext(read('reference/site-assets/config.js'), context);
const original = context.window.NTE_CONFIG;
const html = read('reference/partner-sponsor-application.html');
const names = [...new Set([...html.matchAll(/data-sf-field="([^"]+__c)"/g)].map(m=>m[1]))];
const packages = [...html.matchAll(/value="([^"]+)" data-package-price="(\d+)"/g)].map(m=>({name:m[1],fee:Number(m[2])}));
const fields = names.map(name => {
  let type='Text', length=original.fieldLimits[name] || 255;
  const control = [...html.matchAll(/<(input|textarea|select)\b[^>]*data-sf-field="([^"]+)"[^>]*>/g)].find(m=>m[2]===name)?.[0] || '';
  if (name==='Sponsor_Package__c') type='MultiselectPicklist';
  else if(name==='Terms_and_Conditions__c') type='Checkbox';
  else if(name==='Declaration_Date__c') type='Date';
  else if(/_(Total|Price|Unit_Price)__c$/.test(name)) type='Currency';
  else if(/_Count__c$/.test(name)) type='Number';
  else if(/_Email__c$/.test(name)) type='Email';
  else if(/_(Phone|Mobile)__c$/.test(name)) type='Phone';
  else if(control.startsWith('<textarea') || length>255) {type='LongTextArea';length=Math.max(1024,length);}
  else if(control.startsWith('<select')) type='Text';
  return {name,type,length,label:name.replace(/__c$/,'').replaceAll('_',' ').slice(0,40), source:'Existing partner form', unique:name==='Booking_Reference__c'};
});
const evidence = [
  ['Signature_Vector__c','LongTextArea',32768,'Signature Vector'],
  ['Signature_PNG_Base64__c','LongTextArea',32768,'Signature PNG Transport'],
  ['Agreement_Authority__c','Checkbox',0,'Authority Confirmed'],
  ['Agreement_Accepted__c','Checkbox',0,'Agreement Accepted'],
  ['Agreement_Version__c','Text',80,'Agreement Version'],
  ['Agreement_Config_Hash__c','Text',64,'Agreement Configuration Hash'],
  ['Agreement_Client_Time__c','Text',30,'Browser Signing Time'],
  ['Agreement_Signed_At__c','DateTime',0,'Signed At'],
  ['Agreement_Received_At__c','DateTime',0,'Agreement Received At'],
  ['Agreement_Status__c','Picklist',0,'Agreement Status'],
  ['Agreement_Error__c','LongTextArea',4000,'Agreement Processing Error'],
  ['Agreement_Snapshot__c','LongTextArea',131072,'Signed Agreement Snapshot'],
  ['Agreement_SHA256__c','Text',64,'Agreement Evidence SHA256'],
  ['Agreement_Signature_File__c','Text',18,'Signature File Version'],
  ['Agreement_PDF_File__c','Text',18,'Agreement PDF File Version'],
  ['Agreement_PDF_SHA256__c','Text',64,'Agreement PDF SHA256'],
  ['Agreement_Email_Sent_At__c','DateTime',0,'Agreement Email Sent At'],
  ['Agreement_Attempts__c','Number',0,'Agreement Processing Attempts'],
  ['Agreement_Job_Id__c','Text',18,'Agreement Processing Job']
];
fields.push(...evidence.map(([name,type,length,label])=>({name,type,length,label,source:'Signature and agreement evidence'})));
const esc = s => String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
for(const f of fields){
  const values=f.type==='MultiselectPicklist' ? packages.map(p=>p.name) : ['Received','Signature Saved','PDF Saved','Email Sent','Error'];
  let extra='';
  if(f.type==='Checkbox') extra+='<defaultValue>false</defaultValue>';
  if(f.type==='Text' || f.type==='LongTextArea') extra+=`<length>${f.length}</length>`;
  if(f.type==='Number'||f.type==='Currency') extra+=`<precision>18</precision><scale>${f.type==='Currency'?2:0}</scale>`;
  if(f.type==='Picklist'||f.type==='MultiselectPicklist') extra+=`<valueSet><restricted>true</restricted><valueSetDefinition><sorted>false</sorted>${values.map(v=>`<value><fullName>${esc(v)}</fullName><default>false</default><label>${esc(v)}</label></value>`).join('')}</valueSetDefinition></valueSet>`;
  if(f.type==='LongTextArea'||f.type==='MultiselectPicklist') extra+='<visibleLines>3</visibleLines>';
  if(f.unique) extra+='<caseSensitive>false</caseSensitive><externalId>true</externalId><unique>true</unique>';
  const desc=f.source==='Existing partner form'?`Preserves the partner application value for ${f.label.toLowerCase()}.`:`Records ${f.label.toLowerCase()} for the auditable signed agreement workflow.`;
  write(`force-app/main/default/objects/Lead/fields/${f.name}.field-meta.xml`,`<?xml version="1.0" encoding="UTF-8"?>\n<CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>${f.name}</fullName><description>${esc(desc)}</description><inlineHelpText>${esc(f.source==='Existing partner form'?'Captured from the applicant form.':'Managed by agreement processing; use the signature viewer to inspect the agreement.')}</inlineHelpText><label>${f.label}</label><type>${f.type}</type>${extra}</CustomField>\n`);
}
write('config/field-inventory.json',JSON.stringify(fields,null,2)+'\n');
write('config/source-packages.json',JSON.stringify(packages,null,2)+'\n');
write('config/source-field-limits.json',JSON.stringify(Object.fromEntries(fields.filter(f=>f.length).map(f=>[f.name,f.length])),null,2)+'\n');
console.log(JSON.stringify({formFields:names.length,evidenceFields:evidence.length,total:fields.length,packages:packages.length}));
