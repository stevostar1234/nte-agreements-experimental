/** Processes one Lead at a time across committed signature, PDF and email transactions. */
public inherited sharing class NTEAgreementWorker implements Queueable, Database.AllowsCallouts {
    private List<Id> pending;
    private String stage;
    @TestVisible private NTEAgreementGateway gateway = new NTEAgreementGateway();
    private Boolean shouldChain;
    @TestVisible private static Boolean chainEnabled = true;
    private static final String CSS = '@page{size:A4;margin:18mm 17mm;@bottom-right{content:"Page " counter(page);font-size:8pt;color:#666}}' +
        'body{font-family:sans-serif;font-size:9.5pt;line-height:1.4;color:#26362e}h1{font-size:20pt;line-height:1.2;margin:0 0 18pt}' +
        'h2{font-size:12pt;margin-top:16pt;page-break-after:avoid}h3{font-size:10.5pt;page-break-after:avoid}' +
        'h4{font-size:9.5pt;margin-bottom:5pt;page-break-after:avoid}p{margin:7pt 0}table{border-collapse:collapse;width:100%}' +
        'td{padding:5pt;border-bottom:1px solid #ddd;vertical-align:top}.benefits td:last-child{width:24%}' +
        'tr{page-break-inside:avoid}.signature-block{page-break-inside:avoid}.signature-image{width:300px;height:90px}' +
        '.audit{font-size:8pt;color:#536058;overflow-wrap:break-word}.blank-schedule{border-bottom:1px solid #ccc;min-height:48pt}';

    /** Starts or resumes a bounded list; each stage runs in its own transaction. */
    public NTEAgreementWorker(List<Id> ids, String requestedStage) {
        pending = ids == null ? new List<Id>() : new List<Id>(ids);
        stage = requestedStage;
        shouldChain = chainEnabled;
        if (pending.size() > 200 || !new Set<String>{'Signature','PDF','Email'}.contains(stage)) {
            throw new NTEAgreementTemplate.AgreementException('Invalid agreement work request.');
        }
    }

    /** Queue entry point with a finalizer so uncatchable failures leave a visible record status. */
    public void execute(QueueableContext context) {
        if (pending.isEmpty()) { return; }
        Id leadId = pending[0];
        List<Id> rest = new List<Id>(pending);
        rest.remove(0);
        System.attachFinalizer(new NTEAgreementFinalizer(leadId, stage, rest));
        Lead applicant = loadApplicant(leadId);
        if (applicant == null || applicant.Agreement_Status__c == 'Email Sent' || applicant.Agreement_Status__c == 'Error') {
            if (shouldChain) { queueNext(rest, 'Signature'); }
            return;
        }
        String nextStage;
        try {
            nextStage = processStage(applicant, stage, gateway);
        } catch (NTEAgreementSignature.SignatureException problem) {
            markError(leadId, stage + ': ' + problem.getMessage(), context.getJobId());
        } catch (NTEAgreementTemplate.AgreementException problem) {
            // In the email phase let the transaction roll back, including the tentative sent status.
            if (stage == 'Email') { throw problem; }
            markError(leadId, stage + ': ' + problem.getMessage(), context.getJobId());
        }
        if (shouldChain) {
            if (nextStage == null) { queueNext(rest, 'Signature'); }
            else { queueNext(pending, nextStage); }
        }
    }

    /** Reads only the immutable evidence and processing state needed by the worker. */
    public static Lead loadApplicant(Id recordId) {
        List<Lead> records = [SELECT Id, Agreement_Snapshot__c, Agreement_SHA256__c, Signature_Vector__c,
            Signature_PNG_Base64__c, Agreement_Received_At__c, Agreement_Signed_At__c, Agreement_Status__c,
            Agreement_Signature_File__c, Agreement_PDF_File__c, Agreement_PDF_SHA256__c, Agreement_Attempts__c,
            Agreement_Email_Sent_At__c, Booking_Reference__c FROM Lead WHERE Id = :recordId WITH SYSTEM_MODE LIMIT 1];
        return records.isEmpty() ? null : records[0];
    }

    /** Testable native boundary; production always supplies NTEAgreementGateway. */
    @TestVisible private static String processStage(Lead applicant, String stage, NTEAgreementGateway gateway) {
        if (stage == 'Signature') {
            if (String.isNotBlank(applicant.Agreement_Signature_File__c)) { return 'PDF'; }
            NTEAgreementSignature.validateVector(applicant.Signature_Vector__c);
            Blob png = NTEAgreementSignature.decodePng(applicant.Signature_PNG_Base64__c);
            NTEAgreementTemplate.Evidence evidence = NTEAgreementTemplate.completeEvidence(applicant);
            evidence.vectorHash = NTEAgreementSignature.sha256(Blob.valueOf(applicant.Signature_Vector__c));
            evidence.pngHash = NTEAgreementSignature.sha256(png);
            applicant.Agreement_Snapshot__c = JSON.serialize(evidence);
            if (applicant.Agreement_Snapshot__c.length() > 120000) {
                throw new NTEAgreementTemplate.AgreementException('The agreement evidence exceeds the storage limit.');
            }
            applicant.Agreement_SHA256__c = NTEAgreementSignature.sha256(Blob.valueOf(applicant.Agreement_Snapshot__c));
            applicant.Agreement_Signature_File__c = gateway.createFile(applicant.Id,
                applicant.Booking_Reference__c + ' Signature', 'signature.png', png);
            applicant.Signature_PNG_Base64__c = null;
            applicant.Agreement_Status__c = 'Signature Saved';
            applicant.Agreement_Attempts__c = (applicant.Agreement_Attempts__c ?? 0) + 1;
            applicant.Agreement_Error__c = null;
            NTEAgreementLeadHandler.saveProcessing(new List<Lead>{applicant});
            return 'PDF';
        }
        NTEAgreementTemplate.Evidence evidence = verifyEvidence(applicant);
        if (stage == 'PDF') {
            if (String.isNotBlank(applicant.Agreement_PDF_File__c)) { return 'Email'; }
            verifyFile(applicant.Agreement_Signature_File__c, evidence.pngHash);
            String signature = '<img class="signature-image" alt="Signature" src="/sfc/servlet.shepherd/version/download/' +
                applicant.Agreement_Signature_File__c + '"/>';
            String audit = '<br/><strong>Received:</strong> ' + NTEAgreementTemplate.escape(evidence.receivedTime) +
                '<br/><strong>Evidence SHA-256:</strong> ' + applicant.Agreement_SHA256__c;
            String html = '<html><head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/><style>' + CSS +
                '</style></head><body>' + evidence.html.replace('{{signature}}', signature).replace('{{evidence}}', audit) + '</body></html>';
            Blob pdf = gateway.renderPdf(html);
            validateRenderedPdf(pdf);
            applicant.Agreement_PDF_File__c = gateway.createFile(applicant.Id,
                filename(evidence).replace('.pdf', ''), filename(evidence), pdf);
            applicant.Agreement_PDF_SHA256__c = NTEAgreementSignature.sha256(pdf);
            applicant.Agreement_Status__c = 'PDF Saved';
            applicant.Agreement_Error__c = null;
            NTEAgreementLeadHandler.saveProcessing(new List<Lead>{applicant});
            return 'Email';
        }
        if (stage == 'Email') {
            if (applicant.Agreement_Email_Sent_At__c != null) { return null; }
            Blob pdf = verifyFile(applicant.Agreement_PDF_File__c, applicant.Agreement_PDF_SHA256__c);
            validateRenderedPdf(pdf);
            // Send and status are one transaction. An email failure throws and rolls this update back.
            applicant.Agreement_Status__c = 'Email Sent';
            applicant.Agreement_Email_Sent_At__c = Datetime.now();
            applicant.Agreement_Error__c = null;
            NTEAgreementLeadHandler.saveProcessing(new List<Lead>{applicant});
            gateway.sendAgreement(applicant, evidence, pdf, filename(evidence));
            return null;
        }
        throw new NTEAgreementTemplate.AgreementException('Unknown agreement stage.');
    }

    private static NTEAgreementTemplate.Evidence verifyEvidence(Lead applicant) {
        if (String.isBlank(applicant.Agreement_Snapshot__c) || applicant.Agreement_SHA256__c !=
            NTEAgreementSignature.sha256(Blob.valueOf(applicant.Agreement_Snapshot__c))) {
            throw new NTEAgreementTemplate.AgreementException('Stored agreement evidence failed its integrity check.');
        }
        NTEAgreementTemplate.Evidence evidence = (NTEAgreementTemplate.Evidence)JSON.deserializeStrict(
            applicant.Agreement_Snapshot__c, NTEAgreementTemplate.Evidence.class);
        if (evidence.vectorHash != NTEAgreementSignature.sha256(Blob.valueOf(applicant.Signature_Vector__c))) {
            throw new NTEAgreementTemplate.AgreementException('Stored signature failed its integrity check.');
        }
        return evidence;
    }

    private static Blob verifyFile(String versionId, String expectedHash) {
        if (!Pattern.matches('068[A-Za-z0-9]{12}([A-Za-z0-9]{3})?', versionId ?? '')) {
            throw new NTEAgreementTemplate.AgreementException('A required agreement file is missing.');
        }
        List<ContentVersion> files = [SELECT VersionData FROM ContentVersion WHERE Id = :versionId WITH SYSTEM_MODE LIMIT 1];
        if (files.isEmpty() || NTEAgreementSignature.sha256(files[0].VersionData) != expectedHash) {
            throw new NTEAgreementTemplate.AgreementException('A required agreement file failed its integrity check.');
        }
        return files[0].VersionData;
    }

    private static void validateRenderedPdf(Blob pdf) {
        if (pdf == null || pdf.size() < 500 || pdf.size() > 3000000) {
            throw new NTEAgreementTemplate.AgreementException('The PDF renderer did not return a usable agreement.');
        }
        String hex = EncodingUtil.convertToHex(pdf).toLowerCase();
        if (!hex.startsWith('255044462d') ||
            !(hex.contains('2f53756274797065202f496d616765') || hex.contains('2f537562747970652f496d616765') ||
              hex.contains('2f537562747970650a2f496d616765'))) {
            throw new NTEAgreementTemplate.AgreementException('The PDF renderer did not embed the signature image.');
        }
    }

    private static String filename(NTEAgreementTemplate.Evidence evidence) {
        String organisation = evidence.organisation.replaceAll('[^A-Za-z0-9]+', '-').left(70);
        return evidence.application.get('NTE_Event_Code__c') + '-' + organisation + '-' + evidence.reference + '-Signed-Agreement.pdf';
    }

    /** Records a safe diagnostic with the native AsyncApexJob reference for investigation. */
    public static void markError(Id leadId, String detail, Id jobId) {
        NTEAgreementLeadHandler.saveProcessing(new List<Lead>{new Lead(Id=leadId, Agreement_Status__c='Error',
            Agreement_Error__c=detail.left(3900), Agreement_Job_Id__c=jobId)});
    }

    /** Bounded continuation shared with the failure finalizer. */
    public static void queueNext(List<Id> ids, String nextStage) {
        if (ids != null && !ids.isEmpty() && chainEnabled) { System.enqueueJob(new NTEAgreementWorker(ids, nextStage)); }
    }
}
