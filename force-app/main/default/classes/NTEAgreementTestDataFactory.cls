/** Synthetic test data; no real applicant signatures or external addresses. */
@IsTest
public with sharing class NTEAgreementTestDataFactory {
    public static final String VECTOR='{"version":1,"width":600,"height":180,"paths":["M 40 100 Q 60 50 80 100 Q 100 140 120 90 Q 180 40 200 100 Q 240 130 280 90 Z"]}';
    public static final String PNG='iVBORw0KGgoAAAANSUhEUgAAAlgAAAC0CAYAAABIf1IMAAAELElEQVR4nO3WTW7bQAwG0Nyi+257//O1aIwsHCu2Rh5p+PMeoK1Ncgh8/PgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgOx+/fn9d3UNrPP//fd+q2sFgDQEaD8jR5VDCwAOEKB9vHtY2RMA2EmA9jD7uLInAPCE8KztzMPKngDAE8KzptmHkT0BgAOEZx1nvqVDCwAOEJ65XfV29gQADhCe+ax4M3sCAIOEZx4r38meAMAg4RlfhPexJwAwSHDGFe1totUDAOEJzliiHjNR6wKAsARnDNGPmMi1AUBIwnOt6MfVlww1AkAownONLMfVl0y1AsBy2YK+iowzz1gzACzjyLpW5llnrh0ALic4r5F9zo5xABgkOM9VZb5V+gCAywjPc1Sba7V+AOB0wnO+ijOt2BMAnEpwzlP5EKncGwBMJzjn6DDH6v0BwFQdjoMzdZlflz4BYBrheVynudkTABgkOMd1PDg69vwucwJoTHCO6Tyvrn0fYU4AtD4aRnSfU/f+R5gRAJ+E53Pmc/N9Dp1nscVsAHggHLY5Ku6ZxTZ7AsAmAbHNTB6ZySMzAeBHjqx7ZrHNntwzCwBeEhY35vCcI+vGHADYrXtgdO9/RPc5de8fgEGdj4yufR9hT/r1DcCbOoZnx57f1XFmHXsGYKJOISI0j+s0u069AnCSLmHSpc8zdZifPQFgmuqhUr2/q3SYY4ceAbhQ5WCp3NvVKs+ycm8ALFQxXITmfBVnWrEnAIKoFjLV+omk0mwr9QJAUFXCpkofUVWZb5U+AEgge+hkrz+LCnOu0AMAiWQNnu91Z6o9o8yzzlw7AEllPVQy1pxdxplnrBmAIrIdWZlqrSbT7DPVCkBRWY6sDDVWZk8AYFD08IxcWyfZ9iRafQA0FDWcItbUWZY9iVIXAIQLqWj1cBPtXaLVAwAPIoTVVg1CM5Yo7xOlDgB4aWVoOa7yWPlW9gSAlFYEmNDMx54AwKCrguyn/xGaOdgTABh0Zqg9+22hmYs9AYBBswNOYNb06l1H33b27wFAOHvCbsa3uk/eZ08AYJDQZA97AgCDBCZ72BMAOEBgsoc9AYADBCZ72RMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4Az/ACBKgGtUHExOAAAAAElFTkSuQmCC';
    public static Blob pdf(){return Blob.valueOf('%PDF-1.4 /Subtype /Image xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx');}
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
            Agreement_Client_Time__c=Datetime.now().formatGmt('yyyy-MM-dd\'T\'HH:mm:ss.SSS\'Z\''),
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
