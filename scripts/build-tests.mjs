import fs from 'node:fs';
const root=new URL('../',import.meta.url);
const png=fs.readFileSync(new URL('tests/fixtures/signature-base64.txt',root),'utf8').trim();
const text=`/** Synthetic test data; no real applicant signatures or external addresses. */
@IsTest
public with sharing class NTEAgreementTestDataFactory {
    public static final String VECTOR='{"version":1,"width":600,"height":180,"paths":["M 40 100 Q 60 50 80 100 Q 100 140 120 90 Q 180 40 200 100 Q 240 130 280 90 Z"]}';
    public static final String PNG='${png}';
    public static Blob pdf(){return Blob.valueOf('%PDF-1.4 /Subtype /Image ${'x'.repeat(650)}');}
    public static Lead applicant(Integer numberValue) {
        NTEAgreementLeadHandler.enqueueEnabled=false;
        return new Lead(LastName='Test '+numberValue,FirstName='Alex',Company='Workflow Test '+numberValue,
            Email='nte-test-'+numberValue+'@example.invalid', Web_Form_Type__c='Partner / Sponsor Application',
            Invoiced_Company__c='Workflow Test '+numberValue, Invoice_Address__c='Synthetic address',
            Declaration_Name__c='Alex Test '+numberValue,Declaration_Date__c=Date.today(),
            Sponsor_Package__c='Gold Partner',Sponsor_Package_Total__c=15000,Listed_Price_Total__c=15000,
            NTE_Event_Code__c='NTE2027',Booking_Reference__c='NTE-1000000000000-'+String.valueOf(numberValue).replace('0','Y').replace('1','Z').leftPad(8,'A'),
            Agreement_Authority__c=true,Agreement_Accepted__c=true,Terms_and_Conditions__c=true,
            Agreement_Version__c=NTEAgreementTemplate.getBundle().config.version,
            Agreement_Config_Hash__c=NTEAgreementTemplate.getConfigHash(),
            Agreement_Client_Time__c=Datetime.now().formatGmt('yyyy-MM-dd\\'T\\'HH:mm:ss.SSS\\'Z\\''),
            Signature_Vector__c=VECTOR,Signature_PNG_Base64__c=PNG);
    }
    public static Lead insertApplicant(Integer numberValue) {Lead record=applicant(numberValue);insert as system record;return NTEAgreementWorker.loadApplicant(record.Id);}
    public static List<Lead> applicants(Integer count) {List<Lead> records=new List<Lead>();for(Integer i=2;i<count+2;i++)records.add(applicant(i));return records;}
    public class Gateway extends NTEAgreementGateway {
        public Boolean failFile=false,failPdf=false,failEmail=false;
        public Integer sent=0;
        public String deliveredTo, renderedHtml;
        public override Id createFile(Id leadId,String title,String name,Blob data){
            if(failFile)throw new NTEAgreementTemplate.AgreementException('Synthetic File creation failure.');
            return super.createFile(leadId,title,name,data);
        }
        public override Blob renderPdf(String html){renderedHtml=html;if(failPdf)throw new NTEAgreementTemplate.AgreementException('Synthetic PDF failure.');return pdf();}
        public override void sendAgreement(Lead applicant,NTEAgreementTemplate.Evidence evidence,Blob pdf,String name){
            if(failEmail)throw new NTEAgreementTemplate.AgreementException('Synthetic email failure.');sent++;deliveredTo=evidence.email;
        }
    }
}
`;
fs.writeFileSync(new URL('force-app/main/default/classes/NTEAgreementTestDataFactory.cls',root),text);
console.log('Generated isolated Apex signature fixtures.');
