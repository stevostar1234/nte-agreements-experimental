# V1 async processing review

Reviewed 6 September 2026. Scope: the Lead trigger, asynchronous processing, native Files/PDF/email boundaries, retry and finalizer behavior. This is an issue inventory for prioritization, not a change request or a claim that the demonstrated single-form submission failed. No runtime code, org data, metadata, email, or org configuration was changed by this reviewer.

## Findings to prioritize

| ID | Priority | Substantial defect | Affected condition |
| --- | --- | --- | --- |
| ASYNC-01 | P1 | Trigger enqueues exceed the asynchronous transaction limit and roll back the submission transaction | More than one signed-Lead trigger invocation in a Queueable/Batch transaction, including an insert exceeding 200 records |
| ASYNC-02 | P1 | Failure to write one Lead's error prevents every remaining Lead in its chain from continuing | A failed worker's Lead is deleted or cannot be updated when the finalizer runs |
| ASYNC-03 | P2 | A two-Lead chain already exceeds the documented default Developer/Trial chain depth | A target using the default five-job depth; single-form chains are only three jobs |

There is no confirmed P0 finding. Priorities reflect the effect when the stated condition occurs. ASYNC-01 and ASYNC-02 matter particularly before integrating this into an org with imports, existing automation, or bulk reprocessing. None was induced in Megistos during this read-only review.

## ASYNC-01 — P1: trigger-level queuing can roll back an entire asynchronous insert

**Locations:** `force-app/main/default/classes/NTEAgreementLeadHandler.cls:40` and `:46`; the misleadingly reassuring bulk coverage is at `NTEAgreementWorkflowTest.cls:32`, with automatic queuing disabled at `NTEAgreementTestDataFactory.cls:8`.

**Trigger / reproducible case:** Run a Queueable or Batch execute transaction that inserts 201 valid signed Leads in one DML operation, with the production trigger enabled. The trigger receives a 200-record chunk and a one-record chunk. Both chunks unconditionally call `System.enqueueJob`. The same problem occurs with two separate signed-Lead inserts in one asynchronous transaction, or one insert after another automation has used that transaction's enqueue allowance.

**Evidence and impact:** There is no context check, enqueue-budget check, transaction-scoped coordinator, or durable pending-work fallback around line 46. Salesforce permits only one child Queueable in an asynchronous transaction. The second call therefore causes a governor-limit exception, rolling back that transaction, including the Leads and previously enqueued work. No agreement worker has started, so its finalizer cannot record the lost submission. This is a confirmed source-level conflict with a documented platform limit, not an org-load guess. Salesforce specifically identifies this trigger pattern and failure mode in its [record-triggered automation guide](https://architect.salesforce.com/docs/architect/decision-guides/guide/record-triggered).

**Why current tests miss it:** `bulk251SubmissionsAreCaptured` constructs records through a factory that sets `NTEAgreementLeadHandler.enqueueEnabled=false`. Its assertions prove only snapshot capture and insert chunking; they never exercise production queuing. The real acceptance test submitted one form, which uses one trigger enqueue.

**Smallest sound fix:** Coordinate dispatch at the transaction level and retain undispatched work durably when the queue allowance is exhausted. A narrowly scoped dispatcher that queries pending signed Leads, plus a recovery entry point, is one option. Merely skipping the second enqueue silently loses the second chunk and is not a fix. Add tests for two DML calls in an asynchronous context, a 201-record asynchronous insert, and an already-consumed child-job allowance.

**Confidence:** High for the defect and platform behavior. No fresh org reproduction was run because this review was explicitly limited to read-only/local work.

## ASYNC-02 — P1: one unwriteable error record abandons the rest of its batch

**Locations:** `force-app/main/default/classes/NTEAgreementFinalizer.cls:17`–`:18`; `NTEAgreementWorker.cls:163`–`:165`; `NTEAgreementLeadHandler.cls:69`; recovery restriction at `NTEAgreementController.cls:12`.

**Trigger / reproducible case:** A worker for the first Lead fails. Before its separate finalizer transaction executes, that Lead is deleted, or its updates are blocked by a validation rule/record lock. The finalizer calls `markError` for this Lead before it attempts `queueNext(remaining, 'Signature')`.

A deterministic regression test can create two synthetic Leads, retain their IDs, delete the first, and invoke the finalizer with an `UNHANDLED_EXCEPTION` test context and the second ID in `remaining`. The error-update DML throws on the deleted ID; no continuation job is enqueued. This directly reproduces the finalizer's failure condition without requiring a timing race.

**Evidence and impact:** `markError` performs all-or-nothing DML and propagates its exception. There is no catch around it in the finalizer. Consequently line 18 is unreachable when line 17 fails, and the remaining IDs exist only in the abandoned job payload. Up to 199 otherwise valid agreements can remain `Received` or intermediate indefinitely. Their status is not `Error`, so the public retry controller also refuses them. The README recognizes that a finalizer can fail, but this is an avoidable cross-record failure propagation defect. Salesforce confirms that a finalizer is a separate transaction and still has normal execution limits; it does not automatically continue code after failed error logging. See the [transaction finalizer explanation](https://developer.salesforce.com/blogs/2020/01/learn-moar-in-spring-20-introducing-transaction-finalizers).

**Why current tests miss it:** Finalizer tests use an existing, updateable Lead and an empty `remaining` list. The tests prove error text/status for the current Lead, but never assert continued processing of a second Lead when recording the first error fails.

**Smallest sound fix:** Isolate failure reporting from continuation. Catch error-record DML failures, retain an independent operational diagnostic, and still enqueue the remaining work without rethrowing a transaction-aborting exception. Add a controlled recovery path for pending records whose jobs were cancelled or whose finalizer failed. A `finally` alone is insufficient if the exception is still rethrown and rolls back the enqueue. Add the deleted-record regression and a two-record test asserting that the second agreement completes.

**Confidence:** High. The failing DML and unreachable continuation follow directly from the source. The production race was not deliberately induced.

## ASYNC-03 — P2: bulk chains do not account for the trial/developer depth limit

**Locations:** `force-app/main/default/classes/NTEAgreementWorker.cls:48`–`:50`, `:169`–`:170`; initial enqueue at `NTEAgreementLeadHandler.cls:46`.

**Trigger / reproducible case:** Enqueue one worker with two valid Lead IDs in a Developer/Trial org using the documented default maximum stack depth of five:

| Depth | Work |
| --- | --- |
| 1 | First Lead: signature |
| 2 | First Lead: PDF |
| 3 | First Lead: email |
| 4 | Second Lead: signature |
| 5 | Second Lead: PDF |
| 6, attempted | Second Lead: email — exceeds default depth |

**Evidence and impact:** The worker deliberately retains all pending IDs across its three stages, then chains the next Lead. It accepts 200 IDs, which can require 600 jobs in the same chain. Every enqueue uses the default overload; none supplies `AsyncOptions.MaximumQueueableStackDepth` or checks the remaining depth. At the second PDF job, attempting the sixth enqueue throws, rolling back that job's PDF/status work; the second agreement does not complete normally. Salesforce documents both the five-job Developer/Trial default and the explicit depth override in its [Queueable module](https://trailhead.salesforce.com/content/learn/modules/asynchronous_apex/async_apex_queueable).

**Current-org qualification:** The project README records Megistos as an Enterprise Edition trial. The supplied artifacts prove one successful three-stage submission, not a two-record production chain or the org's effective chain-depth setting. The code is confirmed incompatible with the documented default; this review does **not** claim to have observed an actual stack-depth error in Megistos. The effect on subsequent jobs launched by a failure finalizer should also be measured rather than assumed.

**Why current tests miss it:** The 251-record test disables the trigger's enqueue. Lifecycle tests invoke private stage logic synchronously with a mock PDF/email gateway. The live test has one record and therefore stays under five jobs.

**Smallest sound fix:** Set an intentional, bounded initial chain depth for the maximum supported batch using the current `AsyncOptions` API, or dispatch records without accumulating one 600-job chain. Verify the exact behavior in the intended target org and add a real two-record chained test; do not present snapshot-only bulk coverage as bulk lifecycle coverage.

**Confidence:** High for the conditional code/platform incompatibility; current Megistos manifestation remains unverified.

## Risks and limits that are not additional confirmed defects

- **Duplicate work / concurrency:** Sequential repeated stages are tested and idempotent. Worker loads do not lock or claim a Lead, so a future repair/backfill tool that deliberately enqueues the same Lead concurrently needs a concurrency test and job ownership/locking strategy. I did not find a reachable duplicate enqueue for the same Lead in the demonstrated one-POST flow, and therefore did not classify ordinary duplicate email delivery as a confirmed defect.
- **Large-PDF heap:** `validateRenderedPdf` permits a 3 MB PDF and makes a whole-document hex string plus a lowercase copy. This deserves a size-bound heap test if the controlled PDF template grows substantially. The verified PDF is only 15,925 bytes, and no allowed current input was shown to produce a sufficiently large PDF, so a heap failure is not claimed as confirmed.
- **Email delivery and shared limits:** Salesforce accepting a send does not prove mailbox delivery. Daily email/async limits, recipient filtering, storage exhaustion and platform outages cannot be eliminated by code. The existing live test additionally verifies receipt and identical attachment bytes; the new email design still needs the parent's current end-to-end check.
- **Aborted jobs:** A job cancelled before execution does not reach the worker's finalizer. There is no automatic pending-work reconciler. This is an explicit operational limitation; ASYNC-02 identifies the additional avoidable batch impact when a finalizer itself cannot log an error.

## Review method and validation

- Applied the `platform-apex-generate` review guardrails. Authoring, new Apex tests and deployment phases were not applicable: this assignment forbids runtime edits and org access.
- Inspected all runtime classes, the trigger, the three existing test classes/factory, the README, `artifacts/workflow-deploy.json` and `artifacts/handoff-verification.json`.
- **Analyzer:** Executed `sf code-analyzer run --target force-app/main/default/classes --output-file artifacts/review-async/code-analyzer.json` locally. Actual terminal summary:

```text
Found 129 violation(s) across 11 file(s):
    49 Moderate severity violation(s) found.
    80 Low severity violation(s) found.
```

  JSON counts are `sev1=0`, `sev2=0`, `sev3=49`, `sev4=80`, `sev5=0`. The reported rules concern documentation, complexity and test/style conventions. They are not promoted into this critical issue list. Static analysis does not prove the asynchronous control flow correct.
- **Testing:** Existing deployment evidence reports 31 passing Apex tests and 367/390 runtime lines covered. No new org tests were run under this read-only scope. Local structural/control-flow probes are stored separately under `artifacts/review-async/`; they are not Apex executions and cannot replace the proposed org regression tests.
- **Deploy:** None. Runtime fixes are intentionally left for the user's prioritization.

## Addendum — branded email regression review

Reviewed the subsequent changes to `NTEAgreementGateway.cls`, `NTEAgreementPresentationTest.cls`, `config/branded-email-template.html`, `scripts/build-email.mjs` and the generated `NTEAgreementEmail` Static Resource. **No new P0/P1 or meaningful P2 regression was confirmed.** ASYNC-01 through ASYNC-03 remain unchanged; the trigger, worker and finalizer were not changed by this email work.

- `NTEAgreementGateway.cls:45` reads a fixed, locally maintained resource name. Its nine merge values come from frozen evidence, including the event code; it does not read current mutable Lead contact/package values or accept a caller-supplied URL/template name.
- Every merge passes through `NTEAgreementTemplate.escape`, including escaping braces. Applicant text cannot inject markup or become a second template token. All current tokens occur in text content. The new tests exercise HTML metacharacters and nested-token text.
- The recipient remains `evidence.email`. The saved PDF Blob, MIME type, attachment filename and send-result exception path are unchanged. A missing resource throws before sending; in the production worker that aborts the email transaction, rolling back its tentative sent status. The existing finalizer caveat is ASYNC-02, not a new email-template regression.
- The generated email resource and editable template have identical SHA-256 `1287124deef0f736dc817e82d52ef726064d25a229e9261a48c2202014cf37c7`. The two new presentation tests are included in the local deployment helper's specified test list.
- The externally hosted logo is decorative. Blocking external images does not remove the agreement details or attached PDF. Inbox placement and actual rendering still require the parent's live email check; no actual email was sent by this reviewer.

Applied `dx-code-analyzer-run` for the focused scan and used its bundled `parse-results.js` and `query-results.js` scripts to inspect results. Exact scan command, run from the project directory:

```powershell
sf code-analyzer run --rule-selector Recommended --target 'force-app/main/default/classes/NTEAgreementGateway.cls,force-app/main/default/classes/NTEAgreementPresentationTest.cls' --output-file 'artifacts/review-async/code-analyzer-email-20260906-234806.json' --include-fixes 2>&1 | Tee-Object -FilePath 'artifacts/review-async/code-analyzer-email-20260906-234806.log'
```

The scan succeeded. **Critical: 0; high: 0; moderate: 2; low: 9.** The moderate findings are the existing four-parameter Gateway methods; the low findings concern ApexDoc and test `runAs` conventions. No autofixes were applied. The CLI accepted the comma-separated targets but recommends repeated `--target` flags for future runs.

```powershell
node '<skills-root>/dx-code-analyzer-run/scripts/parse-results.js' 'artifacts/review-async/code-analyzer-email-20260906-234806.json'
node '<skills-root>/dx-code-analyzer-run/scripts/query-results.js' 'artifacts/review-async/code-analyzer-email-20260906-234806.json' --severity 1,2 --summary
```

No runtime code changes, org tests, deployments, real emails or data operations were performed by this reviewer. The parent task owns the deployment and current end-to-end verification.
