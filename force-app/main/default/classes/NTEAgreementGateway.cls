/** Small native platform boundary for PDF generation, Files and transactional email. */
public virtual inherited sharing class NTEAgreementGateway {
    /** Saves a new version as a private Salesforce File linked to the Lead. */
    public virtual Id createFile(Id leadId, String title, String filename, Blob content) {
        ContentVersion file = new ContentVersion(Title=title, PathOnClient=filename,
            VersionData=content, FirstPublishLocationId=leadId);
        // Native automation owns the File lifecycle; no public Apex endpoint exposes this operation.
        insert as system file;
        return file.Id;
    }

    /** Uses Salesforce's native renderer, with no external PDF call. */
    public virtual Blob renderPdf(String html) { return Blob.toPdf(html); }

    /** Delivers the exact saved PDF to the email in the immutable submission snapshot. */
    public virtual void sendAgreement(Lead applicant, NTEAgreementTemplate.Evidence evidence, Blob pdf, String filename) {
        Messaging.SingleEmailMessage message = new Messaging.SingleEmailMessage();
        message.setTargetObjectId(applicant.Id);
        message.setTreatTargetObjectAsRecipient(false);
        message.setToAddresses(new List<String>{evidence.email});
        message.setSaveAsActivity(true);
        message.setUseSignature(false);
        message.setSenderDisplayName('National Transition Event');
        message.setSubject('Your signed NTE agreement — ' + evidence.reference);
        String plain = 'Thank you for your partnership application. Your signed agreement is attached for your records.\n\n' +
            'Organisation: ' + evidence.organisation + '\nPackages: ' + evidence.packageSummary +
            '\nSponsorship fee: ' + NTEAgreementTemplate.money(evidence.totalFee) +
            '\nSignatory: ' + evidence.signatory + '\nSigned: ' + evidence.signedTime +
            '\nAgreement version: ' + evidence.version + '\nReference: ' + evidence.reference;
        message.setPlainTextBody(plain);
        message.setHtmlBody(renderEmail(evidence));
        Messaging.EmailFileAttachment attachment = new Messaging.EmailFileAttachment();
        attachment.setContentType('application/pdf');
        attachment.setFileName(filename);
        attachment.setBody(pdf);
        message.setFileAttachments(new List<Messaging.EmailFileAttachment>{attachment});
        List<Messaging.SendEmailResult> results = Messaging.sendEmail(new List<Messaging.SingleEmailMessage>{message}, false);
        if (!results[0].isSuccess()) {
            throw new NTEAgreementTemplate.AgreementException('Email delivery was not accepted by Salesforce: ' +
                String.valueOf(results[0].getErrors()[0].getStatusCode()) + '.');
        }
    }

    /** Merges only escaped, frozen agreement values into the locally owned NTE email template. */
    @TestVisible private static String renderEmail(NTEAgreementTemplate.Evidence evidence) {
        List<StaticResource> templates = [SELECT Body FROM StaticResource
            WHERE Name = 'NTEAgreementEmail' WITH SYSTEM_MODE LIMIT 1];
        if (templates.isEmpty()) { throw new NTEAgreementTemplate.AgreementException('The confirmation email template is unavailable.'); }
        String html = templates[0].Body.toString();
        Map<String,String> values = new Map<String,String>{
            'organisation'=>evidence.organisation, 'packages'=>evidence.packageSummary,
            'fee'=>NTEAgreementTemplate.money(evidence.totalFee), 'signatory'=>evidence.signatory,
            'signedAt'=>evidence.signedTime, 'version'=>evidence.version, 'reference'=>evidence.reference,
            'email'=>evidence.email, 'eventCode'=>evidence.application.get('NTE_Event_Code__c')
        };
        for (String key : values.keySet()) { html = html.replace('{{'+key+'}}', NTEAgreementTemplate.escape(values.get(key))); }
        return html;
    }
}
