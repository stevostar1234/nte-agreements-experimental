/** Leaves an actionable Lead status if a transaction aborts, then continues the remaining batch. */
public inherited sharing class NTEAgreementFinalizer implements Finalizer {
    private Id leadId;
    private String stage;
    private List<Id> remaining;
    /** Captures only IDs and stage metadata, without copying applicant payloads into queued jobs. */
    public NTEAgreementFinalizer(Id recordId, String currentStage, List<Id> rest) {
        leadId=recordId; stage=currentStage; remaining=rest;
    }
    /** Executes in a new transaction after an aborted worker transaction. */
    public void execute(FinalizerContext context) {
        if (context.getResult() == ParentJobResult.SUCCESS) { return; }
        Exception problem = context.getException();
        String detail = stage + ': ' + (problem == null ? 'Transaction failed.' :
            problem.getTypeName() + ' at line ' + problem.getLineNumber() + '.');
        if (problem instanceof NTEAgreementTemplate.AgreementException) { detail = stage + ': ' + problem.getMessage(); }
        NTEAgreementWorker.markError(leadId, detail, context.getAsyncApexJobId());
        NTEAgreementWorker.queueNext(remaining, 'Signature');
    }
}
