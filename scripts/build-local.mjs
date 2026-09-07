import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url);
const read=p=>fs.readFileSync(new URL(p,root),'utf8').replace(/^\uFEFF/,'');
const write=(p,s)=>{const u=new URL(p,root);fs.mkdirSync(new URL('.',u),{recursive:true});fs.writeFileSync(u,s);};
const copy=(from,to)=>{const u=new URL(to,root);fs.mkdirSync(new URL('.',u),{recursive:true});fs.copyFileSync(new URL(from,root),u);};
const fields=JSON.parse(read('config/field-inventory.json'));
const target=JSON.parse(read('config-target.json'));
const agreement=JSON.parse(read('config/agreement.json'));
const originalContext={window:{}};vm.runInNewContext(read('reference/site-assets/config.js'),originalContext);
const mapping=JSON.parse(read('config/megistos-field-ids.json'));
if(target.orgId!=='00DQH00000MA4KG2A1'||mapping.orgId!==target.orgId)throw new Error('This local form build is restricted to Megistos.');
const ids=mapping.fields;
if(fields.some(f=>!ids[f.name]))throw new Error('A Megistos field mapping is missing.');
if(Object.values(ids).some(id=>!/^00N[A-Za-z0-9]{12}$/.test(id)))throw new Error('Invalid Web-to-Lead field ID.');
const config={...originalContext.window.NTE_CONFIG,mode:'live',eventCodeOverride:agreement.event.code,declarationMinDate:'',
  endpoint:'https://webto.salesforce.com/servlet/servlet.WebToLead?encoding=UTF-8&orgId=00DQH00000MA4KG',orgId:'00DQH00000MA4KG',
  termsUrl:'terms.html',termsLinkLabel:'agreement terms and privacy notice',siteNotice:'',logoFileRequestUrl:'',
  customFieldIds:ids,fieldLimits:JSON.parse(read('config/source-field-limits.json'))};
delete config.returnUrl;
write('public/assets/config.js',`window.NTE_CONFIG=${JSON.stringify(config,null,2)};\nwindow.NTE_CONFIG.returnUrl=new URL('thank-you.html',window.location.href).href;\nwindow.NTE27_CONFIG=window.NTE_CONFIG;\n`);
copy('reference/site-assets/styles.css','public/assets/styles.css');
copy('reference/site-assets/nte-logo-white.png','public/assets/nte-logo-white.png');
copy('reference/perfect-freehand/package/dist/esm/index.mjs','public/assets/vendor/perfect-freehand.mjs');
copy('reference/perfect-freehand/package/LICENSE','public/assets/vendor/perfect-freehand-LICENSE.txt');
let html=read('reference/partner-sponsor-application.html');
html=html.replace(/\s*<section class="email-preview-panel"[\s\S]*?<\/section>/,'');
html=html.replace('data-web-to-lead data-lead-source','data-web-to-lead data-return-path="thank-you.html" data-lead-source');
html=html.replace('partner-sponsor-application-v11','partner-sponsor-agreement-v1');
html=html.replace('All prices exclude VAT.','No VAT will be charged.');
html=html.replace('<a href="heavy-vehicle-details.html">Heavy Vehicle, Equipment and Haulier form</a>','Heavy Vehicle, Equipment and Haulier form');
html=html.replace('Digital signature (full name)','Signatory full legal name');
html=html.replace('Entering your name confirms that the information supplied is accurate and you have authority to proceed with booking.','Enter the full legal name of the person signing for your organisation.');
html=html.replace('<h2><span class="section-number">5</span>Declaration</h2>',`<h2><span class="section-number">5</span>Agreement and signature</h2>
        <p class="agreement-summary" data-agreement-summary></p>
        <details class="agreement-review"><summary>Read your agreement</summary><div class="agreement-preview" data-agreement-preview tabindex="0" aria-label="Agreement terms"></div></details>
        <p class="agreement-version" data-agreement-version></p>`);
const signature=`<div class="checkline"><input id="partner-authority" type="checkbox" value="1" required data-sf-field="Agreement_Authority__c"><label for="partner-authority">I confirm that I am authorised to enter into this agreement on behalf of the organisation named above.</label></div>
        <div class="checkline"><input id="partner-agreement-acceptance" type="checkbox" value="1" required data-sf-field="Agreement_Accepted__c"><label for="partner-agreement-acceptance">I have read and accept this agreement, including the selected packages, fees and Schedule, and intend my drawn signature to sign it electronically.</label></div>
        <div class="signature-field">
          <label class="required" id="signature-label">Draw your signature</label><p class="help" id="signature-instructions">Use your mouse, finger or pen. You can lift and continue for each part of your signature.</p>
          <p data-signature-loading role="status">Loading the signature pad…</p>
          <div data-signature-controls hidden><div class="signature-surface"><svg class="signature-pad" data-signature-pad viewBox="0 0 600 180" tabindex="0" role="img" aria-labelledby="signature-label" aria-describedby="signature-instructions"></svg></div>
          <div class="signature-tools"><button type="button" data-signature-undo>Undo</button><button type="button" data-signature-redo>Redo</button><button type="button" data-signature-clear>Clear signature</button></div></div>
          <p class="signature-status" data-signature-status aria-live="polite">Draw your signature in the box.</p>
        </div>
        ${['Signature_Vector__c','Signature_PNG_Base64__c','Agreement_Version__c','Agreement_Config_Hash__c','Agreement_Client_Time__c'].map(api=>`<input type="hidden" data-sf-field="${api}">`).join('\n        ')}
        <noscript><p>JavaScript is required to draw and submit your signature. Please enable it and reload this page.</p></noscript>`;
html=html.replace('        <div class="button-row"><button class="button" type="submit">',signature+'\n        <div class="button-row"><button class="button" type="submit">');
html=html.replace('</head>','  <link rel="stylesheet" href="assets/agreement.css">\n</head>');
html=html.replace('</body>','<script src="assets/agreement-bundle.js"></script><script type="module" src="assets/agreement.js"></script>\n</body>');
// Version the changed entry scripts so an existing Pages cache cannot restore the old signature limits.
html=html.replace(/(src="assets\/(?:config|forms|agreement|agreement-bundle)\.js)(?:\?[^\"]*)?"/g,'$1?v=20260907"');
write('public/partner-sponsor-application.html',html);
let forms=read('reference/site-assets/forms.js');
// A user's device clock is not a trustworthy limit on their declaration or a source of reference validity.
forms=forms.replace('      control.max = londonDate;', '      control.removeAttribute("max");');
forms=forms.replace('var bytes = new Uint8Array(8);', 'var bytes = new Uint8Array(21);');
forms=forms.replace('Array.prototype.map.call(bytes, function (value)', 'Array.prototype.map.call(bytes.slice(13), function (value)');
forms=forms.replace('return "NTE-" + Date.now() + "-" + suffix;', `var digits = Array.prototype.map.call(bytes.slice(0, 13), function (value, index) {
      return String(index === 0 ? 1 + value % 9 : value % 10);
    }).join("");
    return "NTE-" + digits + "-" + suffix;`);
forms=forms.replace(/  function submitToSalesforce\(form, grouped\) \{[\s\S]*?\n  \}\n\n  function enableForms/,read('scripts/form-transport.js.txt')+'\n\n  function enableForms');
forms=forms.replace('    eventCodeFor: eventCodeFor,','    submissionBytes: submissionBytes,\n    eventCodeFor: eventCodeFor,');
forms=forms.replace('        var grouped = collectFields(form);',`        if (!window.NTESignature) { setStatus(form, "The signature pad could not load. Please refresh the page and try again.", "error"); return; }
        try { window.NTESignature.prepare(form); }
        catch (error) { setStatus(form, error.message, "error"); document.querySelector('[data-signature-pad]').focus(); return; }
        var grouped = collectFields(form);`);
forms=forms.replace('"Submission is disabled because production configuration is missing: " + missingConfig.join(", ") + "."','"The form is temporarily unavailable. Please contact the NTE team."');
forms=forms.replace('"Submission is disabled because Salesforce field IDs are missing for: " + missing.join(", ") + "."','"The form is temporarily unavailable. Please contact the NTE team."');
write('public/assets/forms.js',forms);
const shell=(title,content,script='')=>`<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><link rel="stylesheet" href="assets/styles.css"><link rel="stylesheet" href="assets/agreement.css"></head><body><header class="site-header"><nav class="nav"><a class="brand" href="partner-sponsor-application.html"><img class="brand-logo" src="assets/nte-logo-white.png" alt="The National Transition Event"></a></nav><div class="hero"><h1>${title}</h1></div></header><main class="page-shell"><section class="card main-column">${content}</section></main><footer class="site-footer">Questions? <a href="mailto:nte@missioncommunity.org">nte@missioncommunity.org</a></footer>${script}</body></html>`;
write('public/thank-you.html',shell('Thank you for your application',`<p>Your partnership application has been submitted.</p><p>Your signed agreement will be sent to the contact email you provided once it has been processed.</p><p id="reference" hidden></p><p>If you do not receive the email, please contact the NTE team with your reference.</p><a class="button-secondary" href="partner-sponsor-application.html">Return to the application form</a>`,`<script>const ref=sessionStorage.getItem('nteAgreementReference');if(ref){const p=document.getElementById('reference');p.textContent='Your reference: '+ref;p.hidden=false;}</script>`));
write('public/terms.html',shell('Agreement terms and privacy notice',`<p>The full agreement for your selected packages is available in the Agreement and signature section of your application form.</p><p>It includes the event details, sponsorship fee, package Schedule and terms of the Partner Agreement.</p><p>Your application details and signature are used to prepare and retain your agreement and send you a copy. Read <a href="https://www.missionmotorsport.org/privacynotice" target="_blank" rel="noopener">Mission Motorsport’s privacy policy</a>.</p><a class="button-secondary" href="partner-sponsor-application.html">Return to your application</a>`));
const sourceFields=['Company','FirstName','LastName','Title','Email','Phone',...fields.filter(f=>f.source==='Existing partner form').map(f=>f.name)];
const protectedFields=[...fields.filter(f=>f.source!=='Existing partner form').map(f=>f.name),'Booking_Reference__c','Declaration_Name__c','Declaration_Date__c'];
write('force-app/main/default/classes/NTEAgreementFields.cls',`/** Stable allowlists for submission snapshots and immutable evidence. */\npublic inherited sharing class NTEAgreementFields {\n    public static final List<String> SOURCE_FIELDS=new List<String>{${sourceFields.map(s=>"'"+s+"'").join(',')}};\n    public static final List<String> PROTECTED_FIELDS=new List<String>{${protectedFields.map(s=>"'"+s+"'").join(',')}};\n}\n`);
const defaultRoot=new URL('force-app/main/default/',root);
for(const entry of fs.readdirSync(new URL('classes/',defaultRoot)).filter(f=>f.endsWith('.cls')))write('force-app/main/default/classes/'+entry+'-meta.xml',`<?xml version="1.0" encoding="UTF-8"?><ApexClass xmlns="http://soap.sforce.com/2006/04/metadata"><apiVersion>67.0</apiVersion><status>Active</status></ApexClass>`);
write('force-app/main/default/triggers/NTEAgreementLead.trigger-meta.xml','<?xml version="1.0" encoding="UTF-8"?><ApexTrigger xmlns="http://soap.sforce.com/2006/04/metadata"><apiVersion>67.0</apiVersion><status>Active</status></ApexTrigger>');
write('force-app/main/default/customPermissions/NTE_Agreement_Operate.customPermission-meta.xml','<?xml version="1.0" encoding="UTF-8"?><CustomPermission xmlns="http://soap.sforce.com/2006/04/metadata"><description>Allows authorised staff to retry failed, unsent NTE agreements.</description><label>Operate NTE Agreements</label></CustomPermission>');
for(const role of ['Viewer','Operator']) {
  let permissions='<applicationVisibilities><application>NTE_Agreements</application><visible>true</visible></applicationVisibilities>'+fields.map(f=>`<fieldPermissions><editable>${role==='Operator'&&f.source==='Existing partner form'}</editable><field>Lead.${f.name}</field><readable>true</readable></fieldPermissions>`).join('');
  if(role==='Operator')permissions+='<classAccesses><apexClass>NTEAgreementController</apexClass><enabled>true</enabled></classAccesses><customPermissions><enabled>true</enabled><name>NTE_Agreement_Operate</name></customPermissions>';
  permissions+=`<objectPermissions><allowCreate>${role==='Operator'}</allowCreate><allowDelete>false</allowDelete><allowEdit>${role==='Operator'}</allowEdit><allowRead>true</allowRead><modifyAllRecords>false</modifyAllRecords><object>Lead</object><viewAllRecords>false</viewAllRecords></objectPermissions>`;
  write(`force-app/main/default/permissionsets/NTE_Agreement_${role}.permissionset-meta.xml`,`<?xml version="1.0" encoding="UTF-8"?><PermissionSet xmlns="http://soap.sforce.com/2006/04/metadata"><description>${role==='Operator'?'Operate':'View'} signed partner agreements on accessible Leads.</description>${permissions}<label>NTE Agreement ${role}</label></PermissionSet>`);
}
target.sourceFormUrl='https://stevostar1234.github.io/nte27-web-to-lead-demo/partner-sponsor-application.html';target.partnerFormSha256=createHash('sha256').update(read('reference/partner-sponsor-application.html')).digest('hex');write('config-target.json',JSON.stringify(target,null,2)+'\n');
console.log(JSON.stringify({mappedFields:Object.keys(ids).length,sourceFields:sourceFields.length,publicForm:'public/partner-sponsor-application.html'}));
