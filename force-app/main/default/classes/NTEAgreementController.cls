/** Permission-aware operational retry action; evidence is read with Lightning Data Service. */
public with sharing class NTEAgreementController {
    /** Retries a failed agreement without replacing existing files or resending completed emails. */
    @AuraEnabled
    public static void retryAgreement(Id recordId) {
        if (!FeatureManagement.checkPermission('NTE_Agreement_Operate') || !Schema.sObjectType.Lead.isUpdateable()) {
            throw new AuraHandledException('You do not have permission to retry agreements.');
        }
        List<Lead> records = [SELECT Id, Agreement_Status__c, Agreement_Attempts__c, Agreement_Snapshot__c,
            Agreement_Signature_File__c, Agreement_PDF_File__c, Agreement_Email_Sent_At__c
            FROM Lead WHERE Id = :recordId WITH USER_MODE LIMIT 1 FOR UPDATE];
        if (records.isEmpty() || records[0].Agreement_Status__c != 'Error' || records[0].Agreement_Email_Sent_At__c != null) {
            throw new AuraHandledException('Only a failed, unsent agreement can be retried.');
        }
        Lead applicant=records[0];
        String nextStage=String.isNotBlank(applicant.Agreement_PDF_File__c) ? 'Email' :
            (String.isNotBlank(applicant.Agreement_Signature_File__c) ? 'PDF' : 'Signature');
        applicant.Agreement_Status__c=nextStage == 'Email' ? 'PDF Saved' : (nextStage == 'PDF' ? 'Signature Saved' : 'Received');
        applicant.Agreement_Attempts__c=(applicant.Agreement_Attempts__c ?? 0)+1;
        applicant.Agreement_Error__c=null;
        NTEAgreementLeadHandler.saveProcessing(new List<Lead>{applicant});
        System.enqueueJob(new NTEAgreementWorker(new List<Id>{applicant.Id}, nextStage));
    }
}
