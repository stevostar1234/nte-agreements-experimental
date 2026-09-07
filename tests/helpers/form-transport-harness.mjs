import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';

const config=fs.readFileSync(new URL('../../public/assets/config.js',import.meta.url),'utf8');
const forms=fs.readFileSync(new URL('../../public/assets/forms.js',import.meta.url),'utf8');
export function submissionFixture(values={}) {
  const document={querySelector(){return null;},querySelectorAll(){return [];}};
  const window={crypto:webcrypto,location:{href:'https://stevostar1234.github.io/nte-agreements-experimental/partner-sponsor-application.html',pathname:'/nte-agreements-experimental/partner-sponsor-application.html'}};
  const context={window,document,Date,Intl,Uint8Array,URL,URLSearchParams,console};
  vm.runInNewContext(config,context);vm.runInNewContext(forms,context);
  const controls=Object.entries(values).flatMap(([api,value])=>(Array.isArray(value)?value:[value]).map(value=>({
    dataset:{sfField:api},type:api==='Declaration_Date__c'?'date':'text',value:String(value),disabled:false
  })));
  const form={dataset:{returnPath:'thank-you.html'},querySelectorAll(selector){return selector==='[data-sf-field]'?controls:[];}};
  return {utils:window.NTEFormUtils,form,controls,config:window.NTE_CONFIG};
}

export const syntheticApplication={
  Company:'NTE synthetic transport test',FirstName:'Alex',LastName:'Test',Email:'qa@example.invalid',Phone:'07700900000',
  Booking_Reference__c:'NTE-1234567890123-ABCDEFGH',Web_Form_Type__c:'Partner / Sponsor Application',
  NTE_Event_Code__c:'NTE2027',Sponsor_Package__c:'Gold Partner',Sponsor_Package_Total__c:'15000',Listed_Price_Total__c:'15000',
  Invoiced_Company__c:'NTE synthetic transport test',Invoice_Address__c:'Synthetic QA address',Declaration_Name__c:'Alex Test',
  Declaration_Date__c:'2026-09-07',Agreement_Authority__c:'1',Agreement_Accepted__c:'1',Terms_and_Conditions__c:'1',
  Agreement_Version__c:'NTE-PARTNER-1.0',Agreement_Config_Hash__c:'a'.repeat(64),Agreement_Client_Time__c:'2500-01-01T00:00:00.000Z'
};
