@IsTest
private with sharing class NTEAgreementOperationsTest {
    @TestSetup static void users() {
        List<User> users=new List<User>();
        for(String role:new List<String>{'operator','viewer'})users.add(new User(Alias='nte'+role.left(4),LastName='NTE '+role,
            Username='nte.'+role+'.'+UserInfo.getOrganizationId()+'.'+Datetime.now().getTime()+'@example.invalid',
            Email='nte.'+role+'@example.invalid',ProfileId=UserInfo.getProfileId(),TimeZoneSidKey='Europe/London',
            LocaleSidKey='en_GB',EmailEncodingKey='UTF-8',LanguageLocaleKey='en_US'));
        insert as system users;
        Id permissionId=[SELECT Id FROM PermissionSet WHERE Name='NTE_Agreement_Operator' WITH SYSTEM_MODE LIMIT 1].Id;
        insert as system new PermissionSetAssignment(AssigneeId=users[0].Id,PermissionSetId=permissionId);
    }
    private static User operatorUser(){return [SELECT Id FROM User WHERE LastName='NTE operator' WITH SYSTEM_MODE LIMIT 1];}
    @IsTest static void retryRequiresSpecificPermission() {
        User viewer=[SELECT Id FROM User WHERE LastName='NTE viewer' WITH SYSTEM_MODE LIMIT 1];
        System.runAs(viewer) {
            Test.startTest();
            try {NTEAgreementController.retryAgreement(null);Assert.fail('Viewer must not retry agreements.');}
            catch(AuraHandledException expected){Assert.isNotNull(expected,'Return a permission error.');}
            Test.stopTest();
        }
    }
    @IsTest static void operatorCanRetryFailedSignature() {
        System.runAs(operatorUser()) {
            Lead record=NTEAgreementTestDataFactory.applicant(25);record.Signature_Vector__c='invalid';insert as system record;
            NTEAgreementWorker.markError(record.Id,'Signature: synthetic failure',null);
            Test.startTest();NTEAgreementController.retryAgreement(record.Id);
            Assert.areEqual('Received',NTEAgreementWorker.loadApplicant(record.Id).Agreement_Status__c,'Reset the processing state.');
            Assert.areEqual(1,Limits.getQueueableJobs(),'Enqueue one retry.');
            Test.stopTest();
            Assert.areEqual('Error',NTEAgreementWorker.loadApplicant(record.Id).Agreement_Status__c,'Invalid payload remains an actionable failure.');
        }
    }
    @IsTest static void operatorCannotRetryAnUnfailedAgreement() {
        System.runAs(operatorUser()) {
            Lead record=NTEAgreementTestDataFactory.insertApplicant(26);
            Test.startTest();
            try {NTEAgreementController.retryAgreement(record.Id);Assert.fail('Only failed agreements can be retried.');}
            catch(AuraHandledException expected){Assert.areEqual(0,Limits.getQueueableJobs(),'Do not enqueue an invalid retry.');}
            Test.stopTest();
        }
    }
    @IsTest static void nativeEmailUsesSalesforceMessaging() {
        Lead applicant=NTEAgreementTestDataFactory.insertApplicant(27);
        NTEAgreementTemplate.Evidence evidence=NTEAgreementTemplate.completeEvidence(applicant);
        Test.startTest();
        new NTEAgreementGateway().sendAgreement(applicant,evidence,NTEAgreementTestDataFactory.pdf(),'agreement.pdf');
        Assert.areEqual(1,Limits.getEmailInvocations(),'Use native email with the attachment.');
        Test.stopTest();
    }
    @IsTest static void nativeEmailReportsRejectedAddress() {
        Lead applicant=NTEAgreementTestDataFactory.insertApplicant(28);
        NTEAgreementTemplate.Evidence evidence=NTEAgreementTemplate.completeEvidence(applicant);evidence.email='invalid';
        Test.startTest();
        try {new NTEAgreementGateway().sendAgreement(applicant,evidence,NTEAgreementTestDataFactory.pdf(),'agreement.pdf');Assert.fail('Invalid addresses must fail.');}
        catch(NTEAgreementTemplate.AgreementException expected){Assert.isTrue(expected.getMessage().contains('not accepted'),'Report rejected delivery.');}
        Test.stopTest();
    }
    @IsTest static void finalizerKeepsFailedEmailUnsent() {
        Lead applicant=NTEAgreementTestDataFactory.insertApplicant(29);
        NTEAgreementTestDataFactory.Gateway gateway=new NTEAgreementTestDataFactory.Gateway();
        NTEAgreementWorker.processStage(applicant,'Signature',gateway);NTEAgreementWorker.processStage(applicant,'PDF',gateway);
        gateway.failEmail=true;
        Test.startTest();Savepoint beforeEmail=Database.setSavepoint();
        try {NTEAgreementWorker.processStage(applicant,'Email',gateway);Assert.fail('Failed send must throw to abort the worker transaction.');}
        catch(NTEAgreementTemplate.AgreementException expected){Database.rollback(beforeEmail);}
        new NTEAgreementFinalizer(applicant.Id,'Email',new List<Id>()).execute(new ResultContext(ParentJobResult.UNHANDLED_EXCEPTION,
            new NTEAgreementTemplate.AgreementException('Synthetic email failure.')));
        Test.stopTest();
        Lead actual=NTEAgreementWorker.loadApplicant(applicant.Id);
        Assert.areEqual('Error',actual.Agreement_Status__c,'Record the failed stage after rollback.');
        Assert.isNull(actual.Agreement_Email_Sent_At__c,'Never claim failed email was sent.');
        Assert.isNotNull(actual.Agreement_PDF_File__c,'Keep the saved PDF for retry.');
    }
    @IsTest static void finalizerDoesNotOverwriteSuccess() {
        Lead applicant=NTEAgreementTestDataFactory.insertApplicant(32);
        Test.startTest();new NTEAgreementFinalizer(applicant.Id,'Signature',new List<Id>()).execute(new ResultContext(ParentJobResult.SUCCESS,null));Test.stopTest();
        Assert.areEqual('Received',NTEAgreementWorker.loadApplicant(applicant.Id).Agreement_Status__c,'Leave successful transactions alone.');
    }
    @IsTest static void finalizerRedactsUnexpectedExceptionText() {
        Lead applicant=NTEAgreementTestDataFactory.insertApplicant(33);
        Test.startTest();new NTEAgreementFinalizer(applicant.Id,'PDF',new List<Id>()).execute(new ResultContext(ParentJobResult.UNHANDLED_EXCEPTION,
            new System.AsyncException('sensitive applicant content')));Test.stopTest();
        String error=[SELECT Agreement_Error__c FROM Lead WHERE Id=:applicant.Id WITH SYSTEM_MODE].Agreement_Error__c;
        Assert.isTrue(error.contains('AsyncException'),'Keep diagnostic exception type.');
        Assert.isFalse(error.contains('sensitive applicant content'),'Do not copy arbitrary exception content into UI.');
    }
    private class ResultContext implements FinalizerContext {
        private ParentJobResult resultValue;private Exception errorValue;
        ResultContext(ParentJobResult result,Exception error){resultValue=result;errorValue=error;}
        public Id getAsyncApexJobId(){return null;}
        public String getRequestId(){return 'synthetic-test';}
        public ParentJobResult getResult(){return resultValue;}
        public Exception getException(){return errorValue;}
    }
}
