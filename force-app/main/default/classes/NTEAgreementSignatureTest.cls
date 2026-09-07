@IsTest
private with sharing class NTEAgreementSignatureTest {
    @IsTest static void validMultipleContours() {
        String raw=NTEAgreementTestDataFactory.VECTOR;
        NTEAgreementSignature.Vector vector=NTEAgreementSignature.validateVector(raw);
        vector.paths.add(vector.paths[0]);
        Test.startTest();
        NTEAgreementSignature.Vector result=NTEAgreementSignature.validateVector(JSON.serialize(vector));
        Blob png=NTEAgreementSignature.decodePng(NTEAgreementTestDataFactory.PNG);
        Test.stopTest();
        Assert.areEqual(2,result.paths.size(),'Every disconnected stroke must survive.');
        Assert.areEqual(1125,png.size(),'The PNG must decode without truncation.');
    }
    @IsTest static void missingVector() {rejectVector(null);}
    @IsTest static void markupIsRejected() {rejectVector('{"version":1,"width":600,"height":180,"paths":["<script>alert(1)</script>"]}');}
    @IsTest static void outOfBoundsIsRejected() {rejectVector(NTEAgreementTestDataFactory.VECTOR.replace('40 100','999 999'));}
    @IsTest static void smallMarkIsAccepted() {
        String raw='{"version":1,"width":600,"height":180,"paths":["M 10 10 L 11 11 L 12 12 Z"]}';
        Test.startTest();NTEAgreementSignature.Vector actual=NTEAgreementSignature.validateVector(raw);Test.stopTest();
        Assert.areEqual('M 10 10 L 11 11 L 12 12 Z',actual.paths[0],'Mark size is the signatory\'s choice.');
    }
    @IsTest static void extraJsonPropertyIsRejected() {rejectVector(NTEAgreementTestDataFactory.VECTOR.replace('"version":1','"url":"https://example.invalid","version":1'));}
    @IsTest static void hugePayloadIsRejected() {rejectVector('x'.repeat(131073));}
    @IsTest static void manyStrokesAreAccepted() {
        NTEAgreementSignature.Vector vector=NTEAgreementSignature.validateVector(NTEAgreementTestDataFactory.VECTOR);
        String path=vector.paths[0];for(Integer i=0;i<249;i++)vector.paths.add(path);
        Test.startTest();NTEAgreementSignature.Vector actual=NTEAgreementSignature.validateVector(JSON.serialize(vector));Test.stopTest();
        Assert.areEqual(250,actual.paths.size(),'Disconnected strokes must survive within the field capacity.');
    }
    @IsTest static void invalidPngIsRejected() {
        Test.startTest();try{NTEAgreementSignature.decodePng('c2NyaXB0');Assert.fail('Must reject non-PNG bytes.');}
        catch(NTEAgreementSignature.SignatureException expected){Assert.isTrue(expected.getMessage().contains('PNG'),'Explain the rejected representation.');}Test.stopTest();
    }
    @IsTest static void unsupportedPngDimensionsAreRejected() {
        String hex=EncodingUtil.convertToHex(EncodingUtil.base64Decode(NTEAgreementTestDataFactory.PNG));
        String oversized=hex.substring(0,32)+'00001000'+hex.substring(40);
        Test.startTest();try{NTEAgreementSignature.decodePng(EncodingUtil.base64Encode(EncodingUtil.convertFromHex(oversized)));Assert.fail('Must reject oversized PNG dimensions.');}
        catch(NTEAgreementSignature.SignatureException expected){Assert.isTrue(expected.getMessage().contains('dimensions'),'Explain dimension failure.');}Test.stopTest();
    }
    private static void rejectVector(String value) {
        Test.startTest();try{NTEAgreementSignature.validateVector(value);Assert.fail('The malformed signature must be rejected.');}
        catch(NTEAgreementSignature.SignatureException expected){Assert.isNotNull(expected.getMessage(),'A specific error is required.');}Test.stopTest();
    }
}
