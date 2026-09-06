import fs from 'node:fs';
const root=new URL('../',import.meta.url);
const read=p=>fs.readFileSync(new URL(p,root),'utf8').replace(/^\uFEFF/,'');
const fields=JSON.parse(read('config/field-inventory.json'));
const list=p=>fs.readdirSync(new URL(p,root));
const clean=s=>String(s??'').replaceAll('|','\\|').replaceAll('\n',' ');
let doc='# Salesforce metadata inventory\n\nAll components below were added to Megistos for this workflow. Existing standard Lead fields are reused. No suitable existing agreement fields were present; the original form\'s 48 custom mappings therefore also required fields in this org.\n\n';
for(const [title,group] of [['Agreement and signature fields',fields.filter(f=>f.source!=='Existing partner form')],['Existing form mappings created in Megistos',fields.filter(f=>f.source==='Existing partner form')]]){
  doc+=`## ${title} (${group.length})\n\n| API name | Label | Type / limit | Notes |\n| --- | --- | --- | --- |\n`;
  for(const f of group.sort((a,b)=>a.name.localeCompare(b.name))){
    const details=f.length?`${f.type}, ${f.length} characters`:f.precision?`${f.type}(${f.precision}, ${f.scale??0})`:f.type;
    const notes=f.unique?'Unique, case-insensitive external reference':f.name==='Signature_PNG_Base64__c'?'Temporary; cleared after File creation':f.name==='Signature_Vector__c'?'Permanent versioned vector master':f.name==='Agreement_Snapshot__c'?'Frozen application, HTML and evidence':f.name.endsWith('_File__c')?'ContentVersion ID':'';
    doc+=`| \`${f.name}\` | ${clean(f.label)} | ${details} | ${notes} |\n`;
  }
  doc+='\n';
}
doc+='## Standard Lead fields reused\n\nCompany, FirstName, LastName, Title, Email and Phone retain their existing meanings. The signed organisation comes from Invoiced_Company__c, the signatory from Declaration_Name__c and delivery from the frozen main contact Email.\n\n';
const groups=[
  ['ApexClass','classes','.cls'],['ApexTrigger','triggers','.trigger'],['LightningComponentBundle','lwc',null],
  ['PermissionSet','permissionsets','.permissionset-meta.xml'],['CustomPermission','customPermissions','.customPermission-meta.xml'],
  ['StaticResource','staticresources','.resource'],['FlexiPage','flexipages','.flexipage-meta.xml'],['CustomApplication','applications','.app-meta.xml']
];
doc+='## Other component API names\n\n| Metadata type | Components |\n| --- | --- |\n';
let count=fields.length;
for(const [type,dir,suffix] of groups){
  const entries=list('force-app/main/default/'+dir).filter(n=>!suffix||n.endsWith(suffix)).map(n=>suffix?n.slice(0,-suffix.length):n).sort();
  count+=entries.length;
  doc+=`| ${type} | ${entries.map(n=>'`'+n+'`').join(', ')} |\n`;
}
doc+=`\n**Portable package total: ${count} components.**\n\n`;
doc+='## Existing metadata changed\n\n`Lead-Lead Layout` gained only the Files related list (`RelatedFileList`). The applied Megistos-specific overlay and its baseline are retained privately outside this repository because they contain unrelated Megistos managed-package references. Merge Files into a future target layout rather than deploying this overlay there.\n\n';
doc+='## Evidence and permissions\n\nThe trigger protects the agreement fields and the booking reference, legal name and declaration date once evidence exists. Normal Lead contact/business fields remain editable, but those edits do not rewrite the frozen signed document. Viewer/Operator access is limited by existing record access. Retry additionally requires `NTE_Agreement_Operate`. Neither permission set grants View All, Modify All or deletion rights.\n\nThe approved Megistos test user received `NTE_Agreement_Operator`. No profile-wide permissions or guest Apex access were added.\n';
fs.mkdirSync(new URL('docs/',root),{recursive:true});
fs.writeFileSync(new URL('docs/METADATA.md',root),doc);
console.log(JSON.stringify({fields:fields.length,components:count,document:'docs/METADATA.md'}));
