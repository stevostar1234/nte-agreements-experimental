import fs from 'node:fs';
import assert from 'node:assert/strict';
import {formHarness} from './v2-form-harness.mjs';

const results=[];
const sign=h=>{for(const api of ['Agreement_Authority__c','Agreement_Accepted__c','Terms_and_Conditions__c'])h.field(api).checked=true;h.pad.hasInk=true;};
const postValues=h=>Object.fromEntries(h.document.posts.at(-1)?.entries??[]);
const record=(name,classification,evidence)=>results.push({name,classification,evidence});

{
 const h=formHarness();assert.equal(h.bootError,null);h.fillValid();const result=h.submit();assert.equal(result.posts,1);
 const values=postValues(h),config=h.window.NTE_CONFIG;
 assert.equal(values.oid,'00DQH00000MA4KG');assert.equal(values.email,'qa@example.invalid');
 assert.equal(values[config.customFieldIds.Invoiced_Email__c],'finance@example.invalid');
 assert.equal(values[config.customFieldIds.Declaration_Date__c],'07/09/2026');
 assert.equal(values[config.customFieldIds.Terms_and_Conditions__c],'1');
 assert.equal(values[config.customFieldIds.Agreement_Authority__c],'1');
 assert.ok(!Object.hasOwn(values,'website_confirm'));
 record('Baseline native POST mapping','pass',{posts:1,fields:Object.keys(values).length,encodedBytes:h.window.NTEFormUtils.submissionBytes(h.form),mainAndFinanceEmailSeparated:true,DMYDate:true});
}
{
 const h=formHarness({storageThrows:true});h.fillValid();const result=h.submit();assert.equal(result.posts,0);assert.match(result.status,/Storage access blocked/);
 record('Storage denied during reference persistence','confirmed finding',{...result,fieldAndConsentValidationPassed:true,signaturePrepared:Boolean(h.field('Signature_Vector__c').value)});
}
{
 const h=formHarness();h.fillValid();h.submit();const second=h.submit();assert.equal(second.posts,1);
 record('Repeated submit event','pass',{totalPosts:second.posts,submitting:second.submitting});
 const create=h.document.createElement;const failed=formHarness();failed.fillValid();
 const createFailed=failed.document.createElement;
 failed.document.createElement=tag=>{const node=createFailed(tag);if(tag==='form')node.submit=()=>{throw new Error('Synthetic native submission failure');};return node;};
 const first=failed.submit(),retry=failed.submit();assert.equal(first.posts,0);assert.match(first.error,/Synthetic native submission failure/);assert.equal(retry.posts,0);assert.equal(retry.submitting,'true');
 record('Native submission throws after UI lock','confirmed injected-failure finding',{first,retry,submitButtonDisabled:failed.form.querySelector('[type="submit"]').disabled});
}
{
 const h=formHarness();h.fillValid();h.change('partner-first-name','A'.repeat(40));h.change('partner-last-name','B'.repeat(80));sign(h);h.submit();
 assert.equal(h.field('Sponsored_Name__c').value.length,121);assert.equal(h.field('Event_Contact_Name__c').value.length,121);
 record('Maximum main contact names combine into200-character destinations','pass',{firstMax:h.get('partner-first-name').maxLength,lastMax:h.get('partner-last-name').maxLength,combinedLength:121});
}
{
 const h=formHarness();h.fillValid();h.change('partner-day-contact-same','No','change');
 assert.equal(h.get('partner-day-first-name').disabled,false);assert.equal(h.get('partner-day-first-name').required,true);
 assert.equal(h.submit().posts,0);
 for(const[id,value]of Object.entries({'partner-day-first-name':'A'.repeat(40),'partner-day-last-name':'B'.repeat(80),'partner-day-title':'Coordinator','partner-day-email':'day@example.invalid','partner-day-mobile':'07700900002'}))h.change(id,value);
 sign(h);assert.equal(h.submit().posts,1);assert.equal(h.field('Event_Contact_Name__c').value.length,121);
 const again=formHarness();again.fillValid();again.change('partner-day-contact-same','No','change');again.change('partner-day-email','old@example.invalid');again.change('partner-day-contact-same','Yes','change');sign(again);assert.equal(again.submit().posts,1);
 assert.equal(again.get('partner-day-email').disabled,true);assert.equal(again.field('Event_Contact_Email__c').value,'qa@example.invalid');
 record('Alternate contact conditional requirements and switching back','pass',{requiredWhenVisible:true,disabledWhenHidden:true,combinedLength:121,mainContactRestored:true});
}
for(const [select,details]of [['partner-accessibility','partner-accessibility-details'],['partner-po','partner-po-number'],['partner-invoice-additional-required','partner-invoice-additional-information']]){
 const h=formHarness();h.fillValid();h.change(select,'Yes','change');assert.equal(h.get(details).required,true);assert.equal(h.get(details).disabled,false);assert.equal(h.submit().posts,0);
 h.change(details,'Synthetic detail');h.change(select,'No','change');assert.equal(h.get(details).disabled,true);sign(h);assert.equal(h.submit().posts,1);
 const name=h.window.NTE_CONFIG.customFieldIds[h.get(details).dataset.sfField];assert.ok(!Object.hasOwn(postValues(h),name));
 record(`Conditional field ${details}`,'pass',{blankVisibleBlocked:true,hiddenValueOmitted:true});
}
{
 const h=formHarness();h.fillValid();const boxes=h.form.querySelectorAll('[data-package-price]'),catalog=h.window.NTE_AGREEMENT.config.packages;
 assert.deepEqual(boxes.map(box=>box.value),Array.from(catalog,pack=>pack.name));
 for(let mask=1;mask<(1<<boxes.length);mask++){
  const chosen=boxes.filter((_,index)=>mask&(1<<index)),posted=h.window.NTEFormUtils.calculatePartnerPricing(chosen.map(box=>box.dataset.packagePrice)).total;
  const configured=chosen.reduce((total,box)=>total+catalog.find(pack=>pack.name===box.value).fee,0);assert.equal(posted,configured);
 }
 for(const box of boxes){box.checked=true;box.dispatchEvent({type:'change',target:box,bubbles:true});}sign(h);assert.equal(h.submit().posts,1);
 record('Every current package combination and all14 choices','pass',{combinations:(1<<boxes.length)-1,total:h.field('Listed_Price_Total__c').value,combinedValueLength:boxes.map(box=>box.value).join(';').length,note:'Actual Salesforce field is MultiselectPicklist;261 is not an aggregate255 overflow. Root separately verified all14 native end-to-end.'});
}
{
 const h=formHarness();h.fillValid();const text=`O'Brien & Co <R&D> — 龍 🚗 {{signature}}`;
 h.change('partner-invoice-company',text);h.change('partner-declaration-name',text);sign(h);assert.equal(h.submit().posts,1);
 const values=postValues(h),preview=h.document.querySelector('[data-agreement-preview]').innerHTML;
 assert.equal(values[h.window.NTE_CONFIG.customFieldIds.Invoiced_Company__c],text);
 assert.ok(preview.includes('O&#39;Brien &amp; Co &lt;R&amp;D&gt;'));assert.ok(preview.includes('&#123;&#123;signature&#125;&#125;'));assert.ok(!preview.includes('<R&D>'));
 record('Unicode, emoji, HTML and nested merge tokens','pass',{postPreserved:true,previewEscaped:true,encodedBytes:h.window.NTEFormUtils.submissionBytes(h.form),pdfGlyphCoverage:'not exercised by this local harness'});
}
{
 const h=formHarness();h.fillValid();h.change('partner-invoice-additional-required','Yes','change');
 for(const control of h.form.querySelectorAll('[data-sf-field]'))if(!control.disabled&&control.type!=='hidden'&&['INPUT','TEXTAREA'].includes(control.tagName)&&!['email','date','number','checkbox','radio'].includes(control.type)&&control.maxLength>0)h.change(control.id,'x'.repeat(control.maxLength));
 sign(h);const result=h.submit();assert.equal(result.posts,1);
 record('All enabled text/tel/textarea controls at their configured maximum','pass',{encodedBytes:h.window.NTEFormUtils.submissionBytes(h.form),invoiceNotesLength:h.get('partner-invoice-additional-information').value.length,previewHtmlCharacters:h.document.querySelector('[data-agreement-preview]').innerHTML.length,values:h.apiValues()});
}
{
 const h=formHarness();h.fillValid();h.change('partner-invoice-additional-required','Yes','change');h.change('partner-invoice-additional-information','漢'.repeat(32768));sign(h);
 const result=h.submit();assert.equal(result.posts,0);assert.ok(h.window.NTEFormUtils.submissionBytes(h.form)>92160);
 record('Individually allowed maximum Unicode invoice notes exceed total transport capacity','intentional capacity refusal',{...result,encodedBytes:h.window.NTEFormUtils.submissionBytes(h.form),fieldCharacters:32768,note:'The complete request cannot fit even with a tiny signature. Error currently attributes this to the signature; this is a recovery diagnostic, not an arbitrary handwriting rejection.'});
}
{
 const h=formHarness();h.fillValid();h.change('partner-invoice-additional-required','Yes','change');
 for(const control of h.form.querySelectorAll('[data-sf-field]'))if(!control.disabled&&control.type!=='hidden'&&['INPUT','TEXTAREA'].includes(control.tagName)&&!['email','date','number','checkbox','radio'].includes(control.type)&&control.maxLength>0)h.change(control.id,'"'.repeat(control.maxLength));
 const notes=h.get('partner-invoice-additional-information');
 while(h.window.NTEFormUtils.submissionBytes(h.form,{Signature_Vector__c:'v'.repeat(100),Signature_PNG_Base64__c:'A'.repeat(1000)})>90000)notes.value=notes.value.slice(0,-1000);
 sign(h);const result=h.submit();assert.equal(result.posts,1);
 record('Quote-heavy maximum text bounded by actual total transport','pass',{encodedBytes:h.window.NTEFormUtils.submissionBytes(h.form),invoiceNotesLength:notes.value.length,previewHtmlCharacters:h.document.querySelector('[data-agreement-preview]').innerHTML.length,values:h.apiValues()});
}
for(const date of ['1900-01-01','2026-09-07','2100-12-31']){
 const h=formHarness();h.fillValid({'partner-declaration-date':date});const result=h.submit();assert.equal(result.posts,1);
 record(`Declaration date ${date}`,'pass',{postedDate:postValues(h)[h.window.NTE_CONFIG.customFieldIds.Declaration_Date__c],min:h.get('partner-declaration-date').min,max:h.get('partner-declaration-date').max,note:'Browser calendar validity is only approximated; actual clock skew/server timestamp tests belong to the release checks.'});
}
{
 const h=formHarness();h.fillValid();h.change('partner-company','   ');sign(h);const bad=h.submit();assert.equal(bad.posts,0);assert.match(bad.status,/required fields/);
 h.change('partner-company','Corrected organisation');sign(h);assert.equal(h.submit().posts,1);
 record('Whitespace-only required field and correction','pass',{blankBlocked:true,correctionAccepted:true});
}
{
 const h=formHarness();h.fillValid();const hadInk=h.pad.hasInk;h.change('partner-invoice-company','Revised organisation');
 assert.equal(hadInk,true);assert.equal(h.pad.hasInk,false);assert.equal(h.field('Agreement_Accepted__c').checked,false);assert.equal(h.field('Agreement_Authority__c').checked,false);assert.equal(h.field('Terms_and_Conditions__c').checked,false);
 sign(h);for(const api of ['Agreement_Authority__c','Agreement_Accepted__c','Terms_and_Conditions__c']){const element=h.field(api);element.dispatchEvent({type:'change',target:element,bubbles:true});}assert.equal(h.pad.hasInk,true);assert.equal(h.submit().posts,1);
 record('Application edits and consent-only changes','pass',{detailsChangeClearsSignatureAndAllConsent:true,consentChangeKeepsInk:true});
}
{
 const h=formHarness();h.fillValid();h.get('partner-invoice-company').value='Programmatic replacement without events';const before=h.document.querySelector('[data-agreement-preview]').innerHTML;
 assert.equal(h.submit().posts,1);assert.equal(h.pad.hasInk,true);assert.ok(!before.includes('Programmatic replacement without events'));
 record('Programmatic edit without input/change events','conditional integration risk',{submissionUsesNewValue:true,previewAndSignatureRemainFromOldDetails:true,note:'Direct property assignment is confirmed; silent browser autofill was not reproduced in a real browser.'});
}
for(const options of [{loadAgreement:false},{missingBundle:true},{loadForms:false}]){
 const h=formHarness(options);h.fillValid();const result=h.submit();
 record(`Missing asset ${JSON.stringify(options)}`,'asset outage behavior',{...result,bootError:h.bootError?.message??null,submitListenerCount:h.form.listeners.submit?.length??0,mainFormMethod:h.form.attrs.method??'GET(default)',mainFormAction:h.form.attrs.action??'current URL(default)',mainFormNamedInputs:h.form.querySelectorAll('input,select,textarea').filter(control=>control.name).length});
}
const output=new URL('../../artifacts/v2-form-audit-results.json',import.meta.url);fs.mkdirSync(new URL('.',output),{recursive:true});fs.writeFileSync(output,JSON.stringify(results,null,2));
for(const {name,classification,evidence}of results)console.log(JSON.stringify({name,classification,evidence:{...evidence,values:evidence.values?'Synthetic maximum-input fixture saved in JSON':undefined}}));
console.log(`Completed${results.length} case groups with assertions. This local harness never sends a network request.`);
