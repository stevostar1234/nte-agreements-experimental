# V2 document and email lifecycle audit

Reviewed 7 September 2026 after the permissive-signature and Salesforce-receipt-time changes. This is a review for prioritisation, **not an implementation of the proposed fixes**. No runtime code, Salesforce metadata, records, Files, jobs, email or org settings were changed by this reviewer. Private local audit models and aggregate read-only queries were used.

The normal workflow remains supported by real successful submissions. At the read-only observation around 09:37 UTC, the preceding three-day window contained five agreement Leads at `Email Sent` and fifteen completed `NTEAgreementWorker` Queueable jobs, with no other status in that query. The parent task separately verified real dot and complex-signature submissions. Aggregate counts alone do not establish inbox delivery or document contents.

## Most relevant conclusions

| Item | What can actually happen | Ordinary one-form relevance | Evidence and priority |
| --- | --- | --- | --- |
| DLV-01 | The trial's email allowance runs out; the PDF is saved but the email needs a later manual retry | Yes, if enough people test the form | Actual API reports `SingleEmail` maximum 15, remaining 13 at observation. P1 operational concern for team testing; exhaustion was not induced |
| DLV-02 | An unstarted/cancelled job or failed error update leaves an intermediate status that the Retry action refuses | Yes, after the specified interruption | Confirmed source and local control-flow model. P2 recovery defect; no current stuck Lead observed |
| DLV-03 | Deleting a required File makes Retry repeatedly select the same impossible stage | Yes, after a File is deleted | Confirmed stage-selection and File-check logic. P2 maintenance/recovery defect; no Files were deleted |
| ASYNC-01 | More than one child enqueue in an asynchronous transaction rolls back its work | Usually imports or integration with additional automation; not the isolated successful form | Existing V1 P1 conditional defect remains; local model and documented platform limit |
| ASYNC-02 | A finalizer cannot record its first Lead's failure and never dispatches the remaining Leads | Batch spillover needs multiple IDs; one-record diagnostic/recovery failure is DLV-02 | Existing V1 P1 conditional defect remains; source and local model |
| ASYNC-03 | A multi-record chain exceeds the default Developer/Trial five-job depth | No for independent three-job one-Lead submissions | Existing V1 P2 conditional defect remains; current Megistos multi-record manifestation not tested |

Lead conversion, concurrent duplicate workers and mailbox rejection are discussed below with their explicit qualifications. They are not presented as newly demonstrated failures of ordinary submissions.

## DLV-01 — the current trial has a small reported email allowance and no automatic deferred retry

**Location:** `NTEAgreementGateway.sendAgreement()` uses `setToAddresses()` and `Messaging.sendEmail()`. `NTEAgreementWorker.processStage()` updates sent status in the same Email transaction and throws on a failed send. `NTEAgreementFinalizer.execute()` records an error; it does not retry the current Lead automatically. `NTEAgreementController.retryAgreement()` provides the manual retry path.

The exact Megistos org ID was checked before querying its limits. The API returned:

| Allocation | Maximum | Remaining at observation |
| --- | ---: | ---: |
| SingleEmail | 15 | 13 |
| DailyAsyncApexExecutions | 250,000 | 249,984 |
| DataStorageMB | 10,280 | 10,278 |
| FileStorageMB | 12,800 | 12,798 |

These are observed API values, not a promise that every Salesforce trial has the same settings. They change with other work. An email sent to the same address again still consumes recipient capacity; an unpaid application has already consumed processing and email resources before any payment decision. No CAPTCHA remains an accepted user decision and is not reopened by this observation.

**PDF effect:** a native-email quota error occurs after the PDF stage has committed, so the existing signed PDF should remain available. **Email effect:** Salesforce will not accept the new email while its applicable send allowance is exhausted. The failed Email transaction rolls back the tentative sent timestamp/status; the finalizer records `Error` if its update succeeds. After reset, the normal operator Retry action resumes Email and reuses the saved PDF. There is no automatic next-day retry or proactive capacity warning in this project.

Salesforce documents daily Apex/API email allowances, counting duplicate recipients and the need to resend quota failures after the GMT reset in [SINGLE_EMAIL_LIMIT_EXCEEDED and monitoring](https://help.salesforce.com/s/articleView?id=000382440&language=en_US&type=1). Its [rate-limit module](https://trailhead.salesforce.com/content/learn/modules/app-development-without-limits/app-development-without-limits-rate) explains that the REST limits resource reports actual maximum and remaining allocations. No exhaustion test was performed.

**Smallest operational response:** plan controlled team-test volume and inspect `SingleEmail` before a demonstration; assign someone to retry Email errors after the limit resets. **Optional code change:** record a structured retryable failure category and next-attempt time, with one bounded scheduled dispatcher. A tight self-chaining retry would waste asynchronous quota and cannot wait until the next day. A dispatcher also needs the ownership/reconciliation safeguards in DLV-02; do not add automatic replay before those are designed.

## DLV-02 — some unfinished agreements cannot be recovered through the supplied Retry action

**Locations:** finalizer attachment is inside `NTEAgreementWorker.execute()`; `loadApplicant()` has no job-ownership state; `Agreement_Job_Id__c` is populated only on error; `NTEAgreementController.retryAgreement()` requires `Agreement_Status__c == 'Error'` and no sent timestamp. The repository has no scheduled pending-work reconciler.

Concrete cases:

1. A queued job is cancelled before its `execute()` method begins. It has not reached `attachFinalizer()`, so this code cannot write an error for it. A previously saved Lead remains `Received`, `Signature Saved` or `PDF Saved`.
2. A worker transaction fails and its finalizer's Lead update is also rejected, for example by a persistent record-validation/update restriction. The last successfully committed intermediate status remains. This is the single-record consequence of ASYNC-02.
3. A queued Lead is deleted or merged away before execution. `loadApplicant()` returns no record and `execute()` returns without processing it. If it is subsequently restored, there is no `after undelete` handling to restart its prior work.

The local model confirms the Retry predicate returns false for all three intermediate statuses. The cancellation/deletion events were not induced in Megistos. The finding is the absence of a supported recovery route once the stated event occurs, not a claim that queue jobs disappear spontaneously.

**PDF and email effect:** a stopped Signature/PDF job leaves no completed PDF and no email. A stopped Email job leaves the PDF available but sends no email. Merely waiting longer or using Refresh does not enqueue work. The record can remain visibly "preparing" indefinitely.

**Smallest fix:** persist the current queued job ID, attempt identity and last-progress time, and add an operator "Resume stalled processing" action. Before resuming, verify that the old job is no longer queued/running and that the Lead has no completed send. Choose the next stage from verified stored artifacts. A scheduled checker could flag or resume the same bounded set later. Salesforce describes the job ID returned by `System.enqueueJob()` and querying `AsyncApexJob` in its [Queueable module](https://trailhead.salesforce.com/content/learn/modules/asynchronous_apex/async_apex_queueable).

**Downstream consequences:** allowing Retry for every non-sent state without checking ownership can create competing workers and duplicate email; simply changing the status filter is unsafe. Auto-recovery needs to distinguish transient platform problems from permanently invalid input, and must not revise the signed evidence.

## DLV-03 — a missing File cannot be repaired by repeatedly pressing Retry

**Locations:** `NTEAgreementController.retryAgreement()` chooses Email when the PDF ID text is nonblank, otherwise PDF when the PNG ID is nonblank. It does not check whether those versions exist. `NTEAgreementWorker.verifyFile()` rejects a missing or changed version. `processStage()` skips an earlier stage when its saved ID is nonblank.

| Deletion timing | PDF effect | Email effect | Current Retry behaviour |
| --- | --- | --- | --- |
| PNG deleted after Signature stage, before PDF generation | No PDF can be generated from the missing PNG | No email | Repeats PDF stage and rejects the same missing PNG ID |
| PDF deleted after PDF stage, before Email stage | The previously generated PDF is no longer available through that reference | No email | Repeats Email stage and rejects the same missing PDF ID |
| PDF deleted after Email Sent | The Lightning document route becomes unavailable | An already delivered inbox attachment remains independent | Retry is refused because the agreement was already sent |

This is a conditional maintenance defect. A normal browser submission does not delete its Files. No deletion was performed during the review. File visibility and deletion permissions still apply; the form has no public deletion endpoint.

**Smallest response:** protect agreement Files from routine cleanup and document restoration from backup/Recycle Bin. The original PNG can be restored when its original File is recoverable. Where the PDF alone is missing, a repair action can validate the frozen HTML, existing signature File and evidence hashes, then create a replacement PDF with an explicit restoration audit. It must not silently replace the exact previously sent PDF/hash with an unlabelled regenerated version.

**Downstream consequences:** the PNG transport is intentionally cleared after File creation. The vector remains, but this project contains no trusted Salesforce-side vector-to-PNG renderer. Permanent PNG loss therefore needs a defined restoration mechanism or a new applicant submission. Changing Retry to clear missing IDs would not by itself solve that case.

## What the V1 asynchronous findings mean in the actual single-form workflow

### ASYNC-01: enqueue limits and integration with other automation

An isolated Web-to-Lead creation enqueues one Signature job, and each worker normally enqueues one child. That successful path does not exceed the per-transaction enqueue count.

The existing P1 reproduction is an asynchronous insert of 201 valid agreements: two trigger chunks each enqueue, although an asynchronous transaction can add only one child job. Two separate signed-Lead inserts inside the same asynchronous transaction have the same effect. The `bulk251SubmissionsAreCaptured` test continues to disable automatic queuing in its factory and therefore does not prove this path.

A **single** form can meet the same platform conflict after sandbox integration if another Lead or File automation enqueues a child during this worker's transaction, before the worker queues its next stage. The second enqueue rolls back that transaction. This interaction has not been demonstrated in current Megistos; the observed successful jobs are counterevidence to an always-present collision. The read-only trigger listing found the agreement trigger and one existing Lead trigger; this review did not assume that the other trigger enqueues anything.

Salesforce explicitly warns about trigger-level Queueable dispatch in its [record-triggered automation guide](https://architect.salesforce.com/docs/architect/decision-guides/guide/record-triggered). The remedy remains transaction-level coordination plus durable pending work, not silently dropping a second enqueue. Review client Lead/File automation before promotion.

### ASYNC-02: finalizer logging must not block unrelated work

`NTEAgreementFinalizer.execute()` calls `markError()` before `queueNext(remaining)`. A thrown error update makes the continuation unreachable. With one ID there are no other records to abandon, but the current Lead can still be unrecoverable through the UI as DLV-02 explains. With a multi-record chain, all remaining IDs can be abandoned as well.

A safe fix isolates error-record failure from continuation and retains a diagnostic independently. A `finally` block alone does not help if a rethrown exception rolls back the continuation enqueue. This separation is possible because [transaction finalizers run in a separate transaction](https://developer.salesforce.com/blogs/2020/01/learn-moar-in-spring-20-introducing-transaction-finalizers).

### ASYNC-03: independent form submissions do not accumulate a shared depth

One ordinary submission uses three chained jobs: Signature, PDF, Email. Two people submitting separate forms normally create two separate three-job chains. They do not automatically become one six-job chain.

A worker explicitly passed two Lead IDs attempts six jobs in one chain. Under the documented default Developer/Trial maximum of five, the second PDF stage attempts to enqueue job six and fails, rolling back that stage. The successful independent submissions do not test the target's effective multi-record depth. Salesforce documents both the default and configurable override in the [Queueable module](https://trailhead.salesforce.com/content/learn/modules/asynchronous_apex/async_apex_queueable).

Before bulk import or backfill is supported, set an intentional bounded chain depth or use a dispatcher that does not accumulate three jobs per record in one chain. Test the exact target behaviour. No new framework is required for the demonstrated one-record path.

## Lead conversion, merging and record lifetime

The runtime is Lead-specific: it neither queries `IsConverted` / `ConvertedContactId` nor switches its email activity target after conversion. A conversion between the asynchronous stages can therefore meet converted-Lead update or activity restrictions. Whether every stage fails depends on the running user's permissions and org configuration; **this review did not perform a conversion and does not classify a current-org conversion failure as confirmed**.

Salesforce documents [converted-Lead update errors](https://help.salesforce.com/s/articleView?id=000384333&language=en_US&type=1), and separately permits users with [View and Edit Converted Leads](https://help.salesforce.com/s/articleView?id=sf.leads_view_edit_converted.htm&language=en_US&type=5) to edit them. These qualifications matter: do not claim all converted Leads are unconditionally uneditable.

Files already attached before conversion are carried to resulting Account/Contact/Opportunity records according to [conversion considerations](https://help.salesforce.com/s/articleView?id=sf.leads_notes.htm&language=en_US&type=5). The custom evidence fields and this Lead-specific LWC are not thereby implemented on those objects. Files created after conversion also need explicit verification; do not assume they have already been copied to the destinations.

**Least complicated initial policy:** finish agreement delivery before staff convert or merge the Lead. If earlier conversion is a genuine client requirement, test both early conversion and an Email retry after conversion, decide where evidence is retained, and deliberately target the appropriate resulting Contact/Account. Merely skipping converted Leads would stop sending their agreements.

## Delivery acceptance, sender identity and duplicate work

The gateway sends the frozen submitted recipient, even if staff later edit the Lead's current Email. This is intentional and covered by tests. A mistyped but syntactically valid address can still bounce or reach the wrong recipient. Native `sendEmail` acceptance is not an inbox-delivery guarantee; that accepted PUB-07 limitation remains. There is no audited resend-to-corrected-address action, and a sent agreement cannot be retried through the existing controller. Any future resend needs explicit recipient verification and an audit trail without rewriting the signed submission.

The gateway does not select an Org-Wide Email Address; its display name changes branding, not email-domain authentication. One Org-Wide Email Address exists in Megistos, but this review did not inspect its address or eligibility and does not recommend silently selecting it. The earlier real branded-email verification recorded SPF pass and DMARC fail while still arriving in the inbox. A client rollout needs an appropriate verified sending identity and domain authentication; this is not solved by the HTML template. Current mailbox headers were not re-read by this reviewer.

Sequential repeated stages are idempotent, and the Retry controller locks its record. Workers themselves do not claim or lock a Lead when loading it. A local interleaving model shows two externally scheduled workers can both read an unsent record and send twice. **No route producing that duplicate work was found in the current ordinary one-POST path.** Treat it as a prerequisite to adding automatic recovery/backfill, not as a claim that current ordinary submissions randomly send duplicate emails. A correct repair should use an attempt/job ownership token and an atomic send-stage guard, and respect callout/transaction constraints during PDF rendering.

## Accepted maximum-text evidence fits the deployed snapshot limits

The independent form audit supplied two synthetic applications that its actual generated form logic accepted. The parent ran read-only probes against the deployed `NTEAgreementTemplate.completeEvidence()` in Megistos, with all 54 application values checked against their original fixture SHA-256 hashes. This tests real Apex serialization and HTML generation, rather than estimating JavaScript and Apex escaping to be identical.

| Accepted synthetic input | Initial snapshot | Completed snapshot | HTML | Remaining below 120,000-character worker ceiling | Apex CPU | Reported heap |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Every enabled text/tel/textarea at its configured maximum; 32,768 ASCII invoice-note characters | 39,777 | 55,259 | 14,874 | 64,741 | 30 ms | 154,945 bytes |
| Maximum quote-heavy text, with invoice notes reduced to 23,768 quotes to fit the complete form request budget | 59,463 | 84,465 | 23,994 | 35,535 | 42 ms | 165,751 bytes |

Both cases also fit the actual 131,072-character snapshot field. The probes reported **zero DML statements, zero email invocations and zero queued jobs**. They used the deployed agreement resource and included the two 64-character signature hashes in the completed snapshot, but did not save a Lead, generate a PDF or send email. The separate form harness measured these requests at 40,269 and 88,641 encoded bytes with its synthetic signature fixture; a larger signature still has to pass the complete request budget.

No snapshot-storage or CPU failure was found for these accepted maximum-text cases. This is bounded evidence, not a claim about every arbitrary control-character payload, future agreement template or larger configuration. The parent's actual PDF rendering tests are reported separately in the [consolidated delivery audit](../DELIVERY-EDGE-CASE-AUDIT.md); successful snapshot generation alone does not prove glyph coverage or page layout.

## Safe follow-up tests before implementing fixes

These tests were not run remotely in this review. Prefer isolated Apex tests with synthetic data and mocked PDF/email boundaries; deployment and execution remain the parent task's responsibility.

1. **Finalizer continuation:** create two synthetic agreement Leads, delete only the first inside a test transaction, invoke the finalizer with a failure context and the second ID as remaining work, and assert that the second is still dispatched. Current source throws during error recording instead. Tests roll their data back; no real mailbox is involved.
2. **Missing File recovery:** save a synthetic signature/PDF through the test gateway, delete each ContentDocument in a separate test case, and exercise Retry's stage choice and verification. Require an explicit repair or restoration outcome; repeated identical failure is not recovery.
3. **Async enqueue collision:** insert 201 agreements inside a test Queueable, and separately insert one agreement after another child was already enqueued. Test automatic trigger queuing, rather than leaving the factory's enqueue-disable flag set. Assert that work is durably retained rather than rolled back or skipped.
4. **Actual multi-record depth:** a bounded live two-Lead chain, if needed, should use only synthetic agreements and a user-controlled inbox, and spend at most two real recipient sends. Check the org's available allowance first. The isolated unit-test execution context must not be mistaken for the production queue's effective default depth.
5. **Conversion timing:** use fresh synthetic records in rollback-based test methods; convert before Signature, between Signature/PDF, and between PDF/Email. Test as the actual automation user and a normal Operator. Assert File locations, error visibility and Email activity targets independently. A test method's email mock does not prove native activity targeting, so one specifically bounded native follow-up may be required if early conversion is chosen.
6. **Stalled recovery/concurrency:** after a repair is designed, test two simultaneous resume requests, a resume racing a still-active original worker, a cancelled unstarted job and a permanent invalid-input error. Require one logical execution, preserved evidence and a visible terminal outcome.

Do not exhaust daily quotas, alter org-wide deliverability, delete real agreement Files or send to uncontrolled recipients to test these cases.

## Audit evidence and scope

- Private local models: `artifacts/v2-async-delivery/control-flow-model.mjs` and `control-flow-results.json`. Fourteen source-coupled scenarios/assertions passed. They model control-flow consequences; they are **not Apex or browser executions**. The results include SHA-256 hashes of the five reviewed runtime classes.
- Private read-only observation: `artifacts/v2-async-delivery/read-only-observation.json`. Queries were explicitly pinned to Megistos after checking its exact org ID. Only aggregate statuses, selected field lengths, trigger names and relevant allocation values were retained.
- Private maximum-text probes: `artifacts/v2-async-delivery/build-snapshot-probe.mjs`, `maximum-snapshot-probe.apex` and `quote-snapshot-probe.apex`, with the parent's saved execution results in the same directory. Both compact probes passed against deployed Apex. The initial literal-heavy versions exceeded anonymous Apex script size and failed compilation before execution; replacing repeated literals with exact, hash-checked `repeat()` expressions resolved that audit-harness issue. It was not an application failure.
- Actual field describe confirms `Sponsor_Package__c` aggregate length **4,099**, despite a generic source configuration value of 255. Selecting all fourteen packages is **not** reported as an overflow defect; the parent task also supplied a successful real submission for that case.
- Local Salesforce Code Analyzer: `artifacts/v2-async-delivery/code-analyzer-20260907-0940.json`. Final scan succeeded: **0 critical, 0 high, 8 moderate, 22 low** across the five reviewed classes. Moderate/low results concern complexity, parameter counts and ApexDoc; they are not promoted into functional defects. Required bundled `parse-results.js` and `query-results.js` scripts were used. An initial report write failed because its directory did not yet exist; the directory was created and the scan rerun successfully.
- No new Apex tests were deployed or executed by this reviewer. The parent reported 47 passing tests for the signature/time release. Existing mocked stage/finalizer tests establish useful isolated behaviour, but do not close the specific integration, lifetime and recovery scenarios above.
- The accepted independent PNG/vector trust model, no-CAPTCHA choice and developer-coordinated annual configuration releases remain unchanged. No new runtime fix is authorised by this audit file alone.
