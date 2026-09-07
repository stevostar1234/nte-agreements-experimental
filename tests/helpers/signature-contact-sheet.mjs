import fs from 'node:fs';
import {signatureCases,runCase,nativeCanvas,visibleSpan} from './signature-stress-harness.mjs';
import {submissionFixture,syntheticApplication} from './form-transport-harness.mjs';

if(!nativeCanvas)throw new Error('Set NTE_CANVAS_MODULE to an installed @napi-rs/canvas entry point.');
const definitions=signatureCases(),columns=3,tileWidth=440,tileHeight=185;
const sheet=nativeCanvas.createCanvas(columns*tileWidth,Math.ceil(definitions.length/columns)*tileHeight+70);
const context=sheet.getContext('2d');
const {utils,form}=submissionFixture(syntheticApplication);
context.fillStyle='#eaf2f7';context.fillRect(0,0,sheet.width,sheet.height);
context.fillStyle='#0b3553';context.font='bold 23px sans-serif';context.fillText('Synthetic signature capacity checks',22,31);
context.font='13px sans-serif';context.fillText('Actual native Canvas raster and form encoder; synthetic application; complete POST budget 92,160 bytes.',22,53);
for(let index=0;index<definitions.length;index++) {
  const definition=definitions[index],x=(index%columns)*tileWidth,y=Math.floor(index/columns)*tileHeight+70;
  const {pad}=runCase(definition,{native:true});
  let image,caption;
  try {
    const output=pad.export({fits:candidate=>utils.submissionBytes(form,{Signature_Vector__c:candidate.vector,Signature_PNG_Base64__c:candidate.base64})<=92160});
    image=await nativeCanvas.loadImage(Buffer.from(output.base64,'base64'));
    const bytes=utils.submissionBytes(form,{Signature_Vector__c:output.vector,Signature_PNG_Base64__c:output.base64});
    caption=`${bytes.toLocaleString('en-GB')} POST bytes · ${output.width} × ${output.height} PNG`;
  }catch(error) {
    if(!(error instanceof RangeError) && visibleSpan(definition)>=12)throw error;
    const visible=nativeCanvas.createCanvas(1200,360),ink=visible.getContext('2d');
    ink.scale(2,2);ink.fillStyle='#172b22';for(const path of pad.paths())ink.fill(new nativeCanvas.Path2D(path));
    image=visible;caption=visibleSpan(definition)<12?'Below 12-pixel visible minimum; continue the mark':'Above submission capacity; ink remains available to edit';
  }
  context.fillStyle='#ffffff';context.fillRect(x+8,y+8,tileWidth-16,tileHeight-16);
  context.fillStyle='#0b3553';context.font='bold 13px sans-serif';context.fillText(definition.name,x+20,y+29);
  context.drawImage(image,x+20,y+41,tileWidth-40,(tileWidth-40)*180/600);
  context.fillStyle='#415666';context.font='11px sans-serif';context.fillText(caption,x+20,y+171);
}
fs.mkdirSync(new URL('../../artifacts/',import.meta.url),{recursive:true});
fs.writeFileSync(new URL('../../artifacts/signature-stress-contact-sheet.png',import.meta.url),sheet.toBuffer('image/png'));
process.stdout.write('artifacts/signature-stress-contact-sheet.png\n');
