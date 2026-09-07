import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';

const forms=fs.readFileSync(new URL('../public/assets/forms.js',import.meta.url),'utf8');
function loadAt(instant) {
  class DeviceDate extends Date {constructor(...args){super(...(args.length?args:[instant]));}static now(){return new Date(instant).getTime();}}
  const declaration={tagName:'INPUT',type:'date',dataset:{sfField:'Declaration_Date__c'},max:'2000-01-01',
    hasAttribute(){return false;},removeAttribute(name){delete this[name];}};
  const document={querySelector(){return null;},querySelectorAll(selector){
    return selector==='[data-sf-field]'||selector==='[data-sf-field="Declaration_Date__c"]'?[declaration]:[];
  }};
  const window={NTE_CONFIG:{eventCodeOverride:'NTE2027'},crypto:webcrypto,location:{href:'https://example.invalid/form.html',pathname:'/form.html'}};
  vm.runInNewContext(forms,{window,document,Date:DeviceDate,Intl,Uint8Array,URL,console});
  return {utils:window.NTEFormUtils,declaration};
}
for(const instant of ['1900-01-01','1960-01-01','1970-01-01','2000-01-01','2026-09-07','2500-01-01','9999-01-01']) {
  test(`clock ${instant}: references and declaration acceptance do not depend on browser year`,()=>{
    const {utils,declaration}=loadAt(instant+'T12:00:00Z');
    assert.match(utils.bookingReference(),/^NTE-[0-9]{13}-[A-Z2-9]{8}$/);
    assert.equal(declaration.max,undefined);
    assert.equal(utils.resolveEventCode(), 'NTE2027');
  });
}
test('independent references remain unique when a device clock is frozen',()=>{
  const {utils}=loadAt('1970-01-01T00:00:00Z');
  assert.equal(new Set(Array.from({length:1000},()=>utils.bookingReference())).size,1000);
});
