/** Captures the submission before other users can change it; protects permanent evidence. */
public inherited sharing class NTEAgreementLeadHandler {
    private static Boolean internalWrite = false;
    @TestVisible private static Boolean enqueueEnabled = true;

    /** Takes a small snapshot in the insert transaction; rendering is deferred to async Apex. */
    public static void capture(List<Lead> records) {
        for (Lead applicant : records) {
            if (!isAgreement(applicant)) { continue; }
            NTEAgreementTemplate.Evidence evidence = new NTEAgreementTemplate.Evidence();
            evidence.schemaVersion = 1;
            evidence.application = new Map<String, String>();
            for (String fieldName : NTEAgreementFields.SOURCE_FIELDS) {
                Object value = applicant.get(fieldName);
                evidence.application.put(fieldName, value == null ? '' : String.valueOf(value));
            }
            evidence.clientTime = applicant.Agreement_Client_Time__c;
            evidence.receivedTime = Datetime.now().formatGmt('yyyy-MM-dd\'T\'HH:mm:ss.SSS\'Z\'');
            evidence.version = applicant.Agreement_Version__c;
            evidence.configHash = applicant.Agreement_Config_Hash__c;
            evidence.reference = applicant.Booking_Reference__c;
            evidence.authority = applicant.Agreement_Authority__c;
            evidence.accepted = applicant.Agreement_Accepted__c;
            applicant.Agreement_Snapshot__c = JSON.serialize(evidence);
            applicant.Agreement_Received_At__c = Datetime.now();
            applicant.Agreement_Status__c = 'Received';
            applicant.Agreement_Error__c = null;
            applicant.Agreement_Attempts__c = 0;
            applicant.Agreement_Signed_At__c = null;
            applicant.Agreement_SHA256__c = null;
            applicant.Agreement_PDF_SHA256__c = null;
            applicant.Agreement_Signature_File__c = null;
            applicant.Agreement_PDF_File__c = null;
            applicant.Agreement_Email_Sent_At__c = null;
            applicant.Agreement_Job_Id__c = null;
        }
    }

    /** One queue per trigger batch, with bounded serial processing of its record IDs. */
    public static void enqueue(List<Lead> records) {
        if (!enqueueEnabled) { return; }
        List<Id> ids = new List<Id>();
        for (Lead applicant : records) {
            if (applicant.Agreement_Status__c == 'Received' && isAgreement(applicant)) { ids.add(applicant.Id); }
        }
        if (!ids.isEmpty()) { System.enqueueJob(new NTEAgreementWorker(ids, 'Signature')); }
    }

    /** Prevents edits to captured signing evidence, including through non-UI record updates. */
    public static void protect(List<Lead> records, Map<Id, Lead> previous) {
        if (internalWrite) { return; }
        for (Lead applicant : records) {
            Lead original = previous.get(applicant.Id);
            if (String.isBlank(original.Agreement_Snapshot__c)) { continue; }
            for (String fieldName : NTEAgreementFields.PROTECTED_FIELDS) {
                if (applicant.get(fieldName) != original.get(fieldName)) {
                    applicant.addError('Signing evidence is permanent. Submit a new agreement for revised terms or signatures.');
                    break;
                }
            }
        }
    }

    /** Internal automation DML only; this class has no public web or Lightning entry point. */
    public static void saveProcessing(List<Lead> records) {
        if (records == null || records.isEmpty()) { return; }
        internalWrite = true;
        // Only trusted trigger/worker code uses this boundary. Evidence is deliberately read-only in UI permissions.
        try { update as system records; }
        finally { internalWrite = false; }
    }

    private static Boolean isAgreement(Lead applicant) {
        return applicant.Web_Form_Type__c == 'Partner / Sponsor Application' ||
            String.isNotBlank(applicant.Agreement_Version__c) || String.isNotBlank(applicant.Signature_Vector__c);
    }
}
