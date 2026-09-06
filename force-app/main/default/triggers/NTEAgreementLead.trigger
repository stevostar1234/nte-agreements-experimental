trigger NTEAgreementLead on Lead (before insert, after insert, before update) {
    if (Trigger.isBefore && Trigger.isInsert) { NTEAgreementLeadHandler.capture(Trigger.new); }
    if (Trigger.isAfter && Trigger.isInsert) { NTEAgreementLeadHandler.enqueue(Trigger.new); }
    if (Trigger.isBefore && Trigger.isUpdate) { NTEAgreementLeadHandler.protect(Trigger.new, Trigger.oldMap); }
}
