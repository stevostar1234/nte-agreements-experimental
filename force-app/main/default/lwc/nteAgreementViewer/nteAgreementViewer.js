import { LightningElement, api, wire } from 'lwc';
import { getRecord, getFieldValue, notifyRecordUpdateAvailable } from 'lightning/uiRecordApi';
import retryAgreement from '@salesforce/apex/NTEAgreementController.retryAgreement';
import canOperate from '@salesforce/customPermission/NTE_Agreement_Operate';
import STATUS from '@salesforce/schema/Lead.Agreement_Status__c';
import ERROR from '@salesforce/schema/Lead.Agreement_Error__c';
import PDF from '@salesforce/schema/Lead.Agreement_PDF_File__c';

export default class NteAgreementViewer extends LightningElement {
  @api recordId;
  status; processingError; loadError; pdfId; busy=false;
  @wire(getRecord,{recordId:'$recordId',fields:[STATUS,ERROR,PDF]})
  receiveRecord({data,error}) {
    // Clear the previous Lead before handling a new record or an access error.
    this.status=this.processingError=this.pdfId=undefined;
    this.loadError=undefined;
    if(error){this.loadError='The agreement could not be loaded. Check your access to this Lead and its agreement fields.';return;}
    if(!data)return;
    this.status=getFieldValue(data,STATUS);this.processingError=getFieldValue(data,ERROR);
    this.pdfId=getFieldValue(data,PDF);
  }
  get hasAgreement(){return Boolean(this.status);}
  get canRetry(){return canOperate && this.status==='Error';}
  get pdfUrl(){return /^068[A-Za-z0-9]{12}([A-Za-z0-9]{3})?$/.test(this.pdfId||'')?'/sfc/servlet.shepherd/version/download/'+this.pdfId:undefined;}
  get previewUrl(){return this.pdfUrl?this.pdfUrl+'#view=FitH':undefined;}
  get isPreparing(){return this.hasAgreement&&this.status!=='Error'&&!this.pdfUrl;}
  async refresh(){this.busy=true;try{await notifyRecordUpdateAvailable([{recordId:this.recordId}]);}finally{this.busy=false;}}
  async retry(){this.busy=true;try{await retryAgreement({recordId:this.recordId});await notifyRecordUpdateAvailable([{recordId:this.recordId}]);}
    catch(problem){this.loadError=problem.body?.message||'The agreement could not be retried.';}finally{this.busy=false;}}
}
