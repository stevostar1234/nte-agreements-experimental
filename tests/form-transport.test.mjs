import test from 'node:test';
import assert from 'node:assert/strict';
import {submissionFixture,syntheticApplication} from './helpers/form-transport-harness.mjs';
import {runCase,signatureCases,nativeCanvas} from './helpers/signature-stress-harness.mjs';

test('POST measurement accounts for field IDs, UTF-8, Base64 escapes, line endings and grouped values',()=>{
  const values={Company:'A&B + 龍',Invoice_Address__c:'First\nSecond\rThird\r\nFourth',
    Declaration_Date__c:'2026-09-07',Sponsor_Package__c:['Gold Partner','Silver Partner']};
  const {utils,form,config}=submissionFixture(values);
  const encoded=new URLSearchParams([
    ['oid',config.orgId],['retURL',new URL('thank-you.html','https://stevostar1234.github.io/nte-agreements-experimental/partner-sponsor-application.html').href],
    ['lead_source','Web'],['useDefaultRule','1'],['company',values.Company],
    [config.customFieldIds.Invoice_Address__c,'First\r\nSecond\r\nThird\r\nFourth'],
    [config.customFieldIds.Declaration_Date__c,'07/09/2026'],[config.customFieldIds.Sponsor_Package__c,'Gold Partner;Silver Partner'],
    [config.customFieldIds.Signature_Vector__c,'{"version":1}'],[config.customFieldIds.Signature_PNG_Base64__c,'AA+/==']
  ]);
  assert.equal(utils.submissionBytes(form,{Signature_Vector__c:'{"version":1}',Signature_PNG_Base64__c:'AA+/=='}),Buffer.byteLength(encoded.toString()));
});

test('the final form budget includes long notes instead of budgeting signatures alone',()=>{
  const {utils,form}=submissionFixture({...syntheticApplication,Invoice_Additional_Information__c:'漢'.repeat(4000)});
  const small=utils.submissionBytes(form,{Signature_Vector__c:'v',Signature_PNG_Base64__c:'AAAA'});
  assert.ok(small>36000);
  assert.equal(utils.submissionBytes(form,{Signature_Vector__c:'v'.repeat(92160-small+1),Signature_PNG_Base64__c:'AAAA'}),92160);
  assert.equal(utils.submissionBytes(form,{Signature_Vector__c:'v'.repeat(92160-small+2),Signature_PNG_Base64__c:'AAAA'}),92161);
});

test('real PNG elaborate 80-loop signature adapts to the complete 90% Web-to-Lead budget',{skip:!nativeCanvas},()=>{
  const {pad}=runCase(signatureCases().find(item=>item.name==='very dense eighty-loop signature'));
  const {utils,form}=submissionFixture(syntheticApplication);
  let rejected=0;
  const output=pad.export({fits:candidate=>{
    const size=utils.submissionBytes(form,{Signature_Vector__c:candidate.vector,Signature_PNG_Base64__c:candidate.base64});
    if(size>92160)rejected++;
    return size<=92160;
  }});
  assert.ok(rejected>0,'native raster export must exercise real request-budget fallback');
  assert.ok(output.width<1200);
  assert.ok(utils.submissionBytes(form,{Signature_Vector__c:output.vector,Signature_PNG_Base64__c:output.base64})<=92160);
  assert.equal(JSON.parse(output.vector).paths.length,1);
});
