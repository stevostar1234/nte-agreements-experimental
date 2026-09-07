/** Regression coverage for permissive marks, full field capacity and untrusted device clocks. */
@IsTest
private with sharing class NTEAgreementAcceptanceTest {
    private static String vectorWithPath(String path) {
        return JSON.serialize(new Map<String,Object>{'version'=>1,'width'=>600,'height'=>180,'paths'=>new List<String>{path}});
    }
    @IsTest static void longContinuousStrokeIsAccepted() {
        String path='M 1 1 '+'Q 1 1 2 2 '.repeat(6000)+'Z';
        Test.startTest();NTEAgreementSignature.Vector result=NTEAgreementSignature.validateVector(vectorWithPath(path));Test.stopTest();
        Assert.areEqual(path,result.paths[0],'Long continuous handwriting must remain intact.');
    }
    @IsTest static void maximumFieldVectorIsAccepted() {
        String raw=vectorWithPath('M 0 0 '+'Q 0 0 0 0 '.repeat(13100)+'Z');
        raw=raw.rightPad(131072,' ');
        Test.startTest();System.enqueueJob(new CapacityProbe(raw));Test.stopTest();
        Assert.areEqual(131072,raw.length(),'Exercise the exact storage ceiling, including JSON whitespace.');
    }
    @IsTest static void manySmallContoursAreAccepted() {
        NTEAgreementSignature.Vector vector=new NTEAgreementSignature.Vector();
        vector.version=1;vector.width=600;vector.height=180;vector.paths=new List<String>();
        for(Integer index=0;index<6000;index++){vector.paths.add('M 0 0 L 1 1 Z');}
        Test.startTest();System.enqueueJob(new CapacityProbe(JSON.serialize(vector)));Test.stopTest();
        Assert.areEqual(6000,vector.paths.size(),'Tiny independent marks must not encounter an arbitrary stroke count.');
    }
    @IsTest static void nullJsonIsControlledError() {rejectVector('null');}
    @IsTest static void emptyDrawingCommandIsControlledError() {rejectVector(vectorWithPath('M 1 1 Z'));}
    @IsTest static void trailingCommandIsControlledError() {rejectVector(vectorWithPath('M 1 1 Q 1 1 2 Z'));}
    @IsTest static void fullSizePngTransportUsesNoLargeRegex() {
        // Structural envelope stress; real encoded image fixtures and native rendering are tested separately.
        String fixtureHex=EncodingUtil.convertToHex(EncodingUtil.base64Decode(NTEAgreementTestDataFactory.PNG));
        Integer extraBytes=98304-fixtureHex.length()/2;
        Blob envelope=EncodingUtil.convertFromHex(fixtureHex.left(fixtureHex.length()-24)+'00'.repeat(extraBytes)+fixtureHex.right(24));
        String encoded=EncodingUtil.base64Encode(envelope);
        Test.startTest();Blob actual=NTEAgreementSignature.decodePng(encoded);Test.stopTest();
        Assert.areEqual(131072,encoded.length(),'Test the exact Base64 field ceiling.');
        Assert.areEqual(98304,actual.size(),'Decode the full permitted transport without truncation.');
    }
    @IsTest static void overLimitPngIsControlledError() {
        Test.startTest();try{NTEAgreementSignature.decodePng('A'.repeat(131076));Assert.fail('Reject transport exceeding the field.');}
        catch(NTEAgreementSignature.SignatureException expected){Assert.isTrue(expected.getMessage().contains('PNG'),'Explain the file transport failure.');}Test.stopTest();
    }
    @IsTest static void pastDeviceClockDoesNotRejectConsent() {assertClockAccepted('1900-01-01T00:00:00.000Z',41);}
    @IsTest static void futureDeviceClockDoesNotRejectConsent() {assertClockAccepted('2500-01-01T00:00:00.000Z',42);}
    @IsTest static void missingDeviceClockDoesNotRejectConsent() {assertClockAccepted(null,43);}
    @IsTest static void malformedDeviceClockDoesNotRejectConsent() {assertClockAccepted('not a timestamp',44);}
    @IsTest static void invalidCalendarDeviceClockDoesNotRejectConsent() {assertClockAccepted('2026-99-99T99:99:99.999Z',45);}
    @IsTest static void delayedProcessingUsesReceiptTime() {
        Lead record=NTEAgreementTestDataFactory.insertApplicant(46);
        Datetime trustedReceipt=Datetime.newInstanceGmt(2020,1,2,3,4,5);
        record.Agreement_Received_At__c=trustedReceipt;
        Test.startTest();NTEAgreementTemplate.Evidence result=NTEAgreementTemplate.completeEvidence(record);Test.stopTest();
        Assert.areEqual(trustedReceipt,record.Agreement_Signed_At__c,'Processing delays do not move the captured receipt time.');
        Assert.areEqual(trustedReceipt.format('d MMMM yyyy, HH:mm:ss z','Europe/London'),result.signedTime,'The document must show the trusted time.');
    }
    private static void assertClockAccepted(String clientTime,Integer numberValue) {
        Lead record=NTEAgreementTestDataFactory.applicant(numberValue);record.Agreement_Client_Time__c=clientTime;
        insert as system record;record=NTEAgreementWorker.loadApplicant(record.Id);
        NTEAgreementTestDataFactory.Gateway gateway=new NTEAgreementTestDataFactory.Gateway();
        Test.startTest();
        NTEAgreementWorker.processStage(record,'Signature',gateway);
        NTEAgreementWorker.processStage(record,'PDF',gateway);
        NTEAgreementWorker.processStage(record,'Email',gateway);
        Test.stopTest();
        NTEAgreementTemplate.Evidence snapshot=(NTEAgreementTemplate.Evidence)JSON.deserialize(record.Agreement_Snapshot__c,NTEAgreementTemplate.Evidence.class);
        Assert.areEqual(record.Agreement_Received_At__c,record.Agreement_Signed_At__c,'Salesforce supplies the authoritative agreement timestamp.');
        Assert.areEqual(clientTime,snapshot.clientTime,'Retain the optional device claim without using it to block processing.');
        Assert.areEqual('Email Sent',record.Agreement_Status__c,'A bad browser clock cannot prevent the lifecycle.');
        Assert.areEqual(1,gateway.sent,'The completed PDF must still reach the email stage.');
    }
    private static void rejectVector(String raw) {
        Test.startTest();try{NTEAgreementSignature.validateVector(raw);Assert.fail('Reject malformed geometry.');}
        catch(NTEAgreementSignature.SignatureException expected){Assert.isNotNull(expected.getMessage(),'Return a controlled format error.');}Test.stopTest();
    }
    private with sharing class CapacityProbe implements Queueable {
        private String raw;
        private CapacityProbe(String value){raw=value;}
        public void execute(QueueableContext context){
            NTEAgreementSignature.Vector result=NTEAgreementSignature.validateVector(raw);
            Assert.isFalse(result.paths.isEmpty(),'The full-capacity payload must parse inside the actual async governor limits.');
        }
    }
}
