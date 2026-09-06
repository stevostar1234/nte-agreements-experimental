import fs from 'node:fs';
import {createHash} from 'node:crypto';
const root = new URL('../',import.meta.url);
const read = p => fs.readFileSync(new URL(p,root),'utf8').replace(/^\uFEFF/,'');
const write = (p,s) => {const u=new URL(p,root);fs.mkdirSync(new URL('.',u),{recursive:true});fs.writeFileSync(u,s);};
const esc = s => String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const lines=read('reference/agreement-text.txt').split(/\r?\n/).map(s=>s.trim());
const catalogue=JSON.parse(read('config/source-packages.json'));
const goldBenefits = [
  {heading:'Before the event',items:[['Partnership announcement social media post','Individual post'],['Dedicated company story and social media posts','Included'],['Dedicated individual Armed Forces community member story post','Included'],['Partner logo montage on NTE website homepage with URL link','Included'],['Reserved complimentary tickets for Sunday Night Party at Escapade','6']]},
  {heading:'During the event',items:[['Exhibitor stand space included in location of choice','Very large stand'],['Thanked in speeches','Included'],['Branding placements','Gold banner in your hall'],['Partnership included in the event guide and PDF circulated to registered attendees and exhibitors before the event','Included'],['Advert in event guide','Full page'],['Team tickets to attend NTE on the stand with lunch vouchers','10'],['Event Partner Recognition Certificate for displaying on the stand','Included'],['GP circuit passenger rides for staff','10']]},
  {heading:'After the event',items:[['Post-event social media thank you','Included'],['Downloadable link to professional images and video','Included'],['Partnership remains on NTE website','10 months'],['Social Value Report on event community impact','Included'],['Armed Forces advocacy evidence for ERS awards/revalidation','Included']]}
];
const defaultConfig={schemaVersion:1,version:'NTE-PARTNER-1.0',resourceName:'NTEAgreementBundleV1',event:{code:'NTE2027',name:'National Transition Event',eventDate:'2027-03-01',venue:'The Wing, Silverstone, Towcester, Northamptonshire, NN12 8TN',organiser:'Mission Motorsport / Mission Community',noticeEmail:'nte@missioncommunity.org',paperworkDeadline:''},taxText:'No VAT will be charged.',paymentText:'The Sponsorship Fee is payable in full within 30 days of signing this Agreement and on receipt of the Organiser’s invoice.',packages:catalogue.map(p=>({...p,benefits:p.name==='Gold Partner'?goldBenefits:[]}))};
if(!fs.existsSync(new URL('config/agreement.json',root)))write('config/agreement.json',JSON.stringify(defaultConfig,null,2)+'\n');
const config=JSON.parse(read('config/agreement.json'));
function p(text){return `<p>${esc(text)}</p>`;}
function heading(text){return `<h2>${esc(text)}</h2>`;}
let terms=p('Thank you for your support for the Event. Without partnerships an event of this kind would not be possible.')+p(lines[13])+p(lines[14]);
terms+=heading('1. The Organiser’s responsibilities')+p(lines[16]);
for(let i=17;i<=22;i++)terms+=p(`1.${i-16} ${lines[i]}`);
terms+=heading('2. The Sponsor’s responsibilities')+p(lines[25]);
for(let i=26;i<=30;i++)terms+=p(`2.${i-25} ${lines[i]}`);
terms+=heading('3. Circumstances beyond the reasonable control of either party')+p(lines[32]);
terms+=heading('4. Termination')+'<h3>4.1 For force majeure</h3>'+p('4.1.1 '+lines[36])+p('4.1.2 '+lines[37])+p('4.1.2.1 '+lines[38]+' '+lines[39])+p('4.1.2.2 '+lines[40]);
terms+='<h3>4.2 For no good reason</h3>'+p(lines[43])+'<h3>4.3 For breach</h3>'+p(lines[46])+p(lines[47].replace('4.3.1the','4.3.1 The'))+p(lines[48]);
terms+=heading('5. Confidentiality')+p(lines[51].replace('Agreement,and','Agreement, and'))+heading('6. Data protection')+p(lines[54]);
terms+=heading('7. Notices')+p(lines[57])+'<p>7.1 To the Sponsor: {{email}}</p><p>7.2 To the Organiser: {{noticeEmail}}</p>';
terms+=heading('8. General');
for(let i=62;i<=64;i++)terms+=p(lines[i].replace(/^(8\.\d)/,'$1 '));
terms+=p(lines[66])+p(lines[67])+p(lines[71]);
const tail=lines.filter(s=>s.startsWith('“The Sponsor Branding”')||s.startsWith('“Intellectual Property Rights”')).map(p).join('');
const template=`<article class="agreement-document">
<h1>{{eventName}} {{packageTitle}} Agreement</h1>
<p><strong>Organiser:</strong> {{organiser}}</p>
<p><strong>Sponsor:</strong> {{organisation}}<br/>{{address}}</p>
<p><strong>Event:</strong> {{eventName}} ({{eventCode}}), {{eventDate}}<br/><strong>Venue:</strong> {{venue}}</p>
<p>Dear {{signatory}},</p>
${terms}
<h2>Schedule</h2>
<p>“The Event” means the {{eventName}} taking place on {{eventDate}}. “The Venue” means {{venue}}.</p>
<p>“Event Services” means the package services set out below.</p>
{{packages}}
<p><strong>The Sponsorship Fee: {{fee}}</strong> {{taxText}} {{paymentText}}</p>
{{deadline}}
${tail}
<div class="signature-block"><h2>Signed for and on behalf of {{organisation}}</h2>
<p>The Partner Sponsor agrees to the terms of this agreement and its Schedule.</p>
{{signature}}
<p><strong>Signatory:</strong> {{signatory}}<br/><strong>Email:</strong> {{email}}<br/><strong>Signed:</strong> {{signedAt}}</p>
<p><strong>Authority confirmed:</strong> Yes<br/><strong>Agreement accepted:</strong> Yes</p>
</div>
<p class="audit"><strong>Agreement version:</strong> {{version}}<br/><strong>Reference:</strong> {{reference}}{{evidence}}</p>
</article>`;
write('config/agreement-template.html',template+'\n');
const bundle=JSON.stringify({config,template});
const hash=createHash('sha256').update(bundle).digest('hex');
write(`force-app/main/default/staticresources/${config.resourceName}.resource`,bundle);
write(`force-app/main/default/staticresources/${config.resourceName}.resource-meta.xml`,`<?xml version="1.0" encoding="UTF-8"?><StaticResource xmlns="http://soap.sforce.com/2006/04/metadata"><cacheControl>Private</cacheControl><contentType>application/json</contentType><description>Versioned NTE agreement terms, event details and package schedules.</description></StaticResource>`);
write('public/assets/agreement-bundle.js',`window.NTE_AGREEMENT=${bundle};\nwindow.NTE_AGREEMENT_HASH=${JSON.stringify(hash)};\n`);
write('artifacts/agreement-bundle-hash.txt',hash+'\n');
console.log(JSON.stringify({version:config.version,event:config.event.code,packageCount:config.packages.length,sha256:hash,bytes:bundle.length}));
