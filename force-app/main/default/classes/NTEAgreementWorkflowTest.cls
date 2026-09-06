@IsTest
private with sharing class NTEAgreementWorkflowTest {
    @IsTest static void fullLifecyclePreservesFilesAndFrozenRecipient() {
        Lead applicant=NTEAgreementTestDataFactory.insertApplicant(2);
        update as system new Lead(Id=applicant.Id,Email='changed@example.invalid',Company='Updated CRM company');
        NTEAgreementTestDataFactory.Gateway gateway=new NTEAgreementTestDataFactory.Gateway();
        Test.startTest();
        Assert.areEqual('PDF',NTEAgreementWorker.processStage(applicant,'Signature',gateway),'Save the signature first.');
        Assert.areEqual('Email',NTEAgreementWorker.processStage(applicant,'PDF',gateway),'Save the PDF before email.');
        Assert.areEqual(null,NTEAgreementWorker.processStage(applicant,'Email',gateway),'Email completes the workflow.');
        Test.stopTest();
        Lead actual=NTEAgreementWorker.loadApplicant(applicant.Id);
        Assert.areEqual('Email Sent',actual.Agreement_Status__c,'Successful processing must be recorded.');
        Assert.areEqual(null,actual.Signature_PNG_Base64__c,'Remove temporary Base64 after saving the File.');
        Assert.areEqual(NTEAgreementTestDataFactory.VECTOR,actual.Signature_Vector__c,'Keep the vector master unchanged.');
        Assert.areEqual(1,gateway.sent,'Send exactly once.');
        Assert.areEqual('nte-test-2@example.invalid',gateway.deliveredTo,'Use the submitted email, not an edited Lead email.');
        Assert.areEqual(2,[SELECT COUNT() FROM ContentDocumentLink WHERE LinkedEntityId=:applicant.Id WITH SYSTEM_MODE],'Both Files must link to the Lead.');
        Assert.isTrue(gateway.renderedHtml.contains('/sfc/servlet.shepherd/version/download/'),'Reference the committed private PNG.');
        Assert.isTrue(gateway.renderedHtml.contains('Evidence SHA-256'),'The PDF must identify its evidence.');
    }
    @IsTest static void repeatedStagesDoNotDuplicateFilesOrEmail() {
        Lead applicant=NTEAgreementTestDataFactory.insertApplicant(3);NTEAgreementTestDataFactory.Gateway gateway=new NTEAgreementTestDataFactory.Gateway();
        Test.startTest();
        NTEAgreementWorker.processStage(applicant,'Signature',gateway);NTEAgreementWorker.processStage(applicant,'Signature',gateway);
        NTEAgreementWorker.processStage(applicant,'PDF',gateway);NTEAgreementWorker.processStage(applicant,'PDF',gateway);
        NTEAgreementWorker.processStage(applicant,'Email',gateway);NTEAgreementWorker.processStage(applicant,'Email',gateway);
        Test.stopTest();
        Assert.areEqual(2,[SELECT COUNT() FROM ContentDocumentLink WHERE LinkedEntityId=:applicant.Id WITH SYSTEM_MODE],'Retries reuse saved files.');
        Assert.areEqual(1,gateway.sent,'Retries must not resend a sent agreement.');
    }
    @IsTest static void bulk251SubmissionsAreCaptured() {
        List<Lead> applicants=NTEAgreementTestDataFactory.applicants(251);
        Test.startTest();insert as system applicants;Test.stopTest();
        Assert.areEqual(251,[SELECT COUNT() FROM Lead WHERE Agreement_Status__c='Received' WITH SYSTEM_MODE],'Capture both trigger batches.');
        for(Lead applicant:[SELECT Agreement_Snapshot__c FROM Lead WHERE Agreement_Status__c='Received' WITH SYSTEM_MODE])Assert.isTrue(applicant.Agreement_Snapshot__c.contains('NTE2027'),'Capture event context for every submission.');
    }
    @IsTest static void evidenceCannotBeEdited() {
        Lead applicant=NTEAgreementTestDataFactory.insertApplicant(4);
        Test.startTest();try{update as system new Lead(Id=applicant.Id,Signature_Vector__c='replacement');Assert.fail('Evidence must be immutable.');}
        catch(DmlException expected){Assert.isTrue(expected.getMessage().contains('Signing evidence is permanent'),'Explain how to correct a signed agreement.');}Test.stopTest();
    }
    @IsTest static void malformedSignatureLeavesVisibleError() {
        Lead record=NTEAgreementTestDataFactory.applicant(5);record.Signature_Vector__c='invalid';insert as system record;
        Test.startTest();System.enqueueJob(new NTEAgreementWorker(new List<Id>{record.Id},'Signature'));Test.stopTest();
        Lead actual=[SELECT Agreement_Status__c,Agreement_Error__c FROM Lead WHERE Id=:record.Id WITH SYSTEM_MODE];
        Assert.areEqual('Error',actual.Agreement_Status__c,'Never silently drop a malformed signature.');
        Assert.isTrue(actual.Agreement_Error__c.startsWith('Signature:'),'Identify the failed stage.');
        Assert.areEqual(0,[SELECT COUNT() FROM ContentDocumentLink WHERE LinkedEntityId=:record.Id WITH SYSTEM_MODE],'Malformed signatures create no Files.');
    }
    @IsTest static void fileFailureLeavesVisibleError() {
        Lead applicant=NTEAgreementTestDataFactory.insertApplicant(6);
        NTEAgreementWorker worker=new NTEAgreementWorker(new List<Id>{applicant.Id},'Signature');
        NTEAgreementTestDataFactory.Gateway gateway=new NTEAgreementTestDataFactory.Gateway();gateway.failFile=true;worker.gateway=gateway;
        Test.startTest();System.enqueueJob(worker);Test.stopTest();
        Assert.areEqual('Error',[SELECT Agreement_Status__c FROM Lead WHERE Id=:applicant.Id WITH SYSTEM_MODE].Agreement_Status__c,'File creation failures must be visible.');
    }
    @IsTest static void pdfFailureCannotSendEmail() {
        Lead applicant=NTEAgreementTestDataFactory.insertApplicant(7);NTEAgreementTestDataFactory.Gateway gateway=new NTEAgreementTestDataFactory.Gateway();
        NTEAgreementWorker.processStage(applicant,'Signature',gateway);gateway.failPdf=true;
        NTEAgreementWorker worker=new NTEAgreementWorker(new List<Id>{applicant.Id},'PDF');worker.gateway=gateway;
        Test.startTest();System.enqueueJob(worker);Test.stopTest();
        Lead actual=NTEAgreementWorker.loadApplicant(applicant.Id);
        Assert.areEqual('Error',actual.Agreement_Status__c,'PDF failure must be visible.');
        Assert.areEqual(null,actual.Agreement_PDF_File__c,'Do not invent a PDF reference.');
        Assert.areEqual(null,actual.Agreement_Email_Sent_At__c,'Never claim an email was sent on PDF failure.');
    }
    @IsTest static void htmlEscapesAndMultiplePackages() {
        Lead record=NTEAgreementTestDataFactory.applicant(8);record.Invoiced_Company__c='O\'Brien & <script>bad</script> {{signature}}';
        record.Sponsor_Package__c='Gold Partner;Zone Sponsor';record.Sponsor_Package_Total__c=20000;record.Listed_Price_Total__c=20000;insert as system record;
        Test.startTest();NTEAgreementTemplate.Evidence evidence=NTEAgreementTemplate.completeEvidence(NTEAgreementWorker.loadApplicant(record.Id));Test.stopTest();
        Assert.areEqual(20000,evidence.totalFee,'Server pricing must sum all selected packages.');
        Assert.isFalse(evidence.html.contains('<script>'),'Applicant markup must be escaped.');
        Assert.isTrue(evidence.html.contains('&lt;script&gt;'),'Preserve the literal submitted text.');
        Assert.isTrue(evidence.html.contains('&#123;&#123;signature&#125;&#125;'),'Applicant text cannot become a template token.');
        Assert.isTrue(evidence.html.contains('Zone Sponsor'),'Render the correct additional package name.');
    }
    @IsTest static void tamperedPriceIsRejected() {
        Lead record=NTEAgreementTestDataFactory.applicant(9);record.Sponsor_Package_Total__c=1;insert as system record;
        Test.startTest();try{NTEAgreementTemplate.completeEvidence(NTEAgreementWorker.loadApplicant(record.Id));Assert.fail('Client prices are not authoritative.');}
        catch(NTEAgreementTemplate.AgreementException expected){Assert.isTrue(expected.getMessage().contains('fee'),'Explain the fee mismatch.');}Test.stopTest();
    }
    @IsTest static void oldConfigurationCannotSignNewTerms() {
        Lead record=NTEAgreementTestDataFactory.applicant(22);record.Agreement_Config_Hash__c='bad';insert as system record;
        Test.startTest();try{NTEAgreementTemplate.completeEvidence(NTEAgreementWorker.loadApplicant(record.Id));Assert.fail('Stale forms must fail closed.');}
        catch(NTEAgreementTemplate.AgreementException expected){Assert.isTrue(expected.getMessage().contains('version'),'Require renewed agreement acceptance.');}Test.stopTest();
    }
    @IsTest static void missingAuthorityIsRejected() {
        Lead record=NTEAgreementTestDataFactory.applicant(23);record.Agreement_Authority__c=false;insert as system record;
        Test.startTest();try{NTEAgreementTemplate.completeEvidence(NTEAgreementWorker.loadApplicant(record.Id));Assert.fail('Authority is mandatory.');}
        catch(NTEAgreementTemplate.AgreementException expected){Assert.isTrue(expected.getMessage().contains('Authority'),'Explain the missing confirmation.');}Test.stopTest();
    }
    @IsTest static void duplicateReferenceIsRejected() {
        Lead first=NTEAgreementTestDataFactory.applicant(24);insert as system first;
        Lead duplicate=NTEAgreementTestDataFactory.applicant(24);
        Test.startTest();Database.SaveResult result=Database.insert(duplicate,false,AccessLevel.SYSTEM_MODE);Test.stopTest();
        Assert.isFalse(result.isSuccess(),'A repeated browser submission must not create duplicate agreements.');
        Assert.areEqual(StatusCode.DUPLICATE_VALUE,result.getErrors()[0].getStatusCode(),'Enforce reference uniqueness in the database.');
    }
    @IsTest static void unrelatedLeadsStayUnchanged() {
        Lead unrelated=new Lead(LastName='Ordinary Lead',Company='Ordinary Company');
        Test.startTest();insert as system unrelated;Test.stopTest();
        Assert.areEqual(null,unrelated.Agreement_Status__c,'Do not run this workflow for unrelated Leads.');
    }
}
