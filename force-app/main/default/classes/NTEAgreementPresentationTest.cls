@IsTest
private with sharing class NTEAgreementPresentationTest {
    @IsTest static void brandedEmailShowsFrozenExecutionDetails() {
        Lead applicant=NTEAgreementTestDataFactory.insertApplicant(71);
        NTEAgreementTemplate.Evidence evidence=NTEAgreementTemplate.completeEvidence(applicant);
        Test.startTest();String html=NTEAgreementGateway.renderEmail(evidence);Test.stopTest();
        Assert.isTrue(html.contains('Your signed partnership agreement.'),'Use the signed-agreement heading.');
        Assert.isTrue(html.contains('nte-logo-white.png'),'Include NTE branding.');
        Assert.isTrue(html.contains(NTEAgreementTemplate.escape(evidence.reference)),'Show the signed reference.');
        Assert.isTrue(html.contains(NTEAgreementTemplate.escape(evidence.packageSummary)),'Show the signed packages.');
        Assert.isTrue(html.contains(NTEAgreementTemplate.escape(evidence.signedTime)),'Show the signing time.');
        Assert.isTrue(html.contains(NTEAgreementTemplate.money(evidence.totalFee)),'Show the executed fee.');
        Assert.isFalse(html.contains('Horizon Mobility'),'Do not retain example organisation data.');
        Assert.isFalse(html.contains('expression of interest'),'Do not use the earlier interest-stage message.');
        Assert.isFalse(html.contains('{{'),'Resolve every template merge.');
    }
    @IsTest static void emailEscapesApplicantTextAndNestedMergeTokens() {
        Lead applicant=NTEAgreementTestDataFactory.insertApplicant(72);
        NTEAgreementTemplate.Evidence evidence=NTEAgreementTemplate.completeEvidence(applicant);
        evidence.organisation='A <script> & {{reference}}';evidence.signatory='Jo "O\'Brien"';
        Test.startTest();String html=NTEAgreementGateway.renderEmail(evidence);Test.stopTest();
        Assert.isFalse(html.contains('<script>'),'Never execute applicant markup.');
        Assert.isTrue(html.contains('A &lt;script&gt; &amp; &#123;&#123;reference&#125;&#125;'),'Do not recursively merge applicant text.');
        Assert.isTrue(html.contains('Jo &quot;O&#39;Brien&quot;'),'Escape the legal name.');
    }
}
