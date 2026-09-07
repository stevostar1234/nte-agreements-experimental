# V1 functional review — decision history and current status

## Update: 7 September 2026

The original findings below are retained for traceability. The subsequent [document/email edge-case audit](DELIVERY-EDGE-CASE-AUDIT.md) is the current review entry point; it records new reproducible browser, PDF-rendering and recovery findings with proposed fixes and downstream consequences.

- **Resolved:** PUB-05 browser-clock rejection. Salesforce receipt time now supplies signing time; skewed, absent and malformed browser clocks passed the workflow. False signature contour rejection, silent capture truncation and an actual Web-to-Lead request-size limit were also fixed; see [the signature report](SIGNATURE-BOUNDARIES.md).
- **User decisions recorded:** PUB-02/PLAT-01 remain developer-coordinated annual maintenance; PUB-03 remains independent PNG/vector acceptance with the converter tested; PUB-04 retains a honeypot without CAPTCHA; PUB-06 uses closed-form annual releases and manual exceptional handling. These choices do not create automatic recovery from other failures.
- **PUB-01 remains for review:** a manufactured processed Lead can skip the processor entirely. Its effect can be **no PDF and no email ever**, not simply a temporarily misleading status. Normal discriminator-bearing form submissions undergo initialization.
- **PUB-07/native acknowledgment remains accepted:** a redirect is not a confirmed Lead receipt, and native email acceptance is not proof of inbox delivery. The current trial's reported 15/day email allowance is a separate, tangible delivery constraint.
- **ASYNC-01/02/03 remain conditional review items:** independent normal submissions use separate three-job chains. The current audit distinguishes that path from bulk imports, other automation, cancelled jobs and deleted Files.

Broader audit fixes have deliberately not been applied pending the user's review. Read the dated sections as historical evidence where their original proposed decision differs from these later instructions.

## Original review

Reviewed 6–7 September 2026 by three independent agents covering public submission/evidence, asynchronous processing, and Salesforce access/portability. This register deliberately excludes cosmetic wording and style findings. It records the implementation as reviewed; the issues below have **not** been silently fixed or accepted on the client's behalf.

The normal Gold application has completed the real Web-to-Lead → signature File → native PDF → saved File → received email journey. That proves the normal path, not every hostile input, bulk transaction, configuration change or browser. Passing tests and high line coverage do not establish those properties.

**Use this release for the requested experimental team evaluation with synthetic applicant/company details and an inbox you control. Decide the P1 items before accepting real client agreements or promoting the system to an unrestricted service.** The published form really submits to Megistos and sends email; it is not a simulated form. GitHub Pages has no team access gate.

## Decision register

P1 = material correctness, integrity or operational exposure. P2 = important maintenance/scale case. “Confirmed” below can mean a reproducible source/code path; it does not imply a hostile live submission was sent. Each linked review states the evidence and its limits.

| ID | Priority | Problem and consequence | Evidence | Proposed decision |
| --- | --- | --- | --- | --- |
| [PUB-01](reviews/v1-public-review.md#pub-01--p1-omitting-the-form-discriminator-bypasses-sanitisation-of-server-owned-agreement-state) | P1 | A Lead insert with no agreement discriminator bypasses initialisation of server-owned status/snapshot/File fields. A caller can supply a manufactured processed state. Existing File permissions still apply. | Confirmed control flow and offline fixture; hostile Web-to-Lead acceptance not tested. | Sanitise or reject generated fields on **all** inserts before early return; separate client inputs from generated state; check PDF-to-record association. |
| [PUB-02](reviews/v1-public-review.md#pub-02--p1-when-a-package-fee-changes-the-documented-configuration-change-produces-a-form-that-cannot-complete) | P1 on fee change | Changing a configured package fee leaves the form checkbox/posted total at the original price while preview/server use the new one. Legitimate applications then fail. | Reproduced using the actual builder/pricing code in an isolated copy. Current shipped prices match. | Generate all package prices/options from one configuration, or fail builds on drift. Add changed-fee regression. |
| [PUB-03](reviews/v1-public-review.md#pub-03--p1-for-evidence-integrity-individually-valid-vector-and-png-can-describe-different-signatures) | P1 | Server validates vector and PNG independently. An altered PNG can depict a different signature from the permanent vector. Hashing both does not prove they agree. | Confirmed validation gap; valid transparent PNG passes current predicates. No hostile native PDF generated. | Decide the authoritative execution representation. Trusted rasterisation of the validated vector or a verification step is needed to close this fully; checking only for ink is insufficient. |
| [PUB-04](reviews/v1-public-review.md#pub-04--p1-before-unrestricted-public-hosting-the-outbound-email-workflow-has-no-server-enforced-bot-gate) | P1 before unrestricted service | No server-enforced CAPTCHA. A direct POST bypasses the JavaScript honeypot and can consume Lead, email, async and File quotas using arbitrary recipients. | Code and captured Megistos setting; no abuse/load test performed. | Configure Salesforce native Web-to-Lead reCAPTCHA v2 for the published host; forward its challenge fields in the actual POST and test rejection/acceptance. |
| [ASYNC-01](reviews/v1-async-review.md) | P1 for async imports | Trigger enqueues once per trigger chunk. Multiple chunks/DML operations inside a Queueable/Batch transaction can attempt a second child job and roll back the parent transaction. | Confirmed source/platform limit. Current 251-record test disables enqueue. | Use a dispatcher compatible with the one-child async limit. Test actual multi-chunk asynchronous inserts. |
| [ASYNC-02](reviews/v1-async-review.md) | P1 for batch recovery | Finalizer writes the failed Lead before advancing the remaining queue. If that write fails, remaining agreements in that chain can be stranded. Retry only accepts Error records. | Confirmed control flow; deleted/unupdatable-Lead race not deliberately induced in Megistos. | Isolate error-record persistence from continuation and add a controlled recovery path for stranded work. Test two records with the first no longer updatable. |
| [ASYNC-03](reviews/v1-async-review.md) | P2, target-dependent | Two agreements need six chained jobs. Default Developer/Trial chain depth is five, and this implementation supplies no depth override. | Confirmed conditional incompatibility; Megistos's effective multi-record chain depth has not been measured. | Set/verify a bounded supported depth or dispatch without one long chain. Test the target with two actual agreements. |
| [PLAT-01](reviews/v1-platform-review.md#plat-01--p2-annual-event-or-price-configuration-changes-break-the-deployment-test-suite) | P2 | Test fixtures/generator hardcode NTE2027 and fees. A valid annual configuration change can fail the required deployment tests. | Confirmed source dependencies; no live terms changed for the review. | Derive valid fixtures from configuration, retaining deliberate invalid fixtures for rejection tests. |
| [PUB-05](reviews/v1-public-review.md#pub-05--p2-overflow-queuing-and-device-clock-errors-can-invalidate-an-otherwise-valid-signed-submission) | P2 | Browser time more than 10 minutes ahead or over a day behind Salesforce insert time is rejected. Device skew or Web-to-Lead overflow delays can trigger this. | Conditional code behavior and documented platform queuing; no quota exhaustion induced. | Separate browser signing claims from trusted receipt time and agree a skew/backlog policy. |
| [PUB-06](reviews/v1-public-review.md#pub-06--p2-during-termsconfiguration-releases-only-one-active-bundle-is-accepted) | P2 | One active agreement bundle means a release can invalidate open forms and not-yet-completed evidence. | Confirmed version/hash checks. Completed agreements retain their snapshot. | Accept a coordinated drain/reload deployment window, or introduce immutable overlapping versions with an explicit validity policy. |

## Acceptance gaps, not additional confirmed defects

- Test a real non-administrator: Lead owner, shared read-only record, unshared record, Viewer, Operator, and removed File link. Existing Apex user fixtures inherit the deploying administrator profile. LDS/user-mode code is present, but an administrator's successful screen is not an ordinary-user access test.
- Physical touch/stylus devices remain an acceptance gap. The September 7 follow-up added real native PNG stress testing and bounded real Web-to-Lead capacity/lifecycle tests; see the newer report rather than the original stub-only scope.
- Native desktop PDF display has a Salesforce-supported iframe path. Browser policies/mobile PDF handling can differ; retain **Open PDF** as a fallback. The exact saved ContentVersion is pinned.
- Decide where evidence and operations live after Lead conversion. Files can transfer, but this LWC and processing fields remain Lead-specific.
- Decide retention, File deletion, backup and recovery. Hashes are not a write-once archive or a cryptographic signing certificate.
- Decide whether retry requires record edit access or readable-record access plus the Operator custom permission. The current implementation follows the latter policy with an object-level edit check.
- A future tool that concurrently queues the same Lead needs a claim/locking strategy and duplicate-send tests. No duplicate path was established for one normal Web-to-Lead POST.

## Unavoidable platform constraints

Web-to-Lead redirects do not provide authenticated confirmation of Lead creation or later email delivery. Salesforce acceptance of an email does not guarantee an inbox rather than Spam, quarantine or rejection. Org quotas, storage exhaustion, aborted jobs and platform outages remain possible. They require monitoring and recovery ownership; removing visible errors would hide failures rather than prevent them.

The current implementation exposes useful status/errors and a permission-gated retry for failed, unsent agreements. It does not install recurring monitoring or an automatic retry/reconciliation service. A PDF failure cannot legitimately reach the normal success-email stage; the spoofed-state insertion issue above concerns a separate trust boundary.

The fresh branded test reached Inbox, but its received headers reported SPF pass and DMARC fail for the current user-based sender. Configure a client-controlled organisation-wide sender and aligned domain authentication before real delivery; the successful test does not establish general deliverability.

## Client decisions outside code

Only Gold's benefits were supplied. Other selected package schedules and the paperwork deadline are intentionally blank. Prices are supplied values, not an approved future event catalogue. The Word template says no VAT; the source form said prices exclude VAT. The build follows the Word template, pending client confirmation. Terms are year-neutral but current event configuration/logistics still describe NTE2027 on 1 March 2027.

Identity/email ownership verification, organiser countersigning, invoicing, payments, signing links/reminders, agreement amendments and revocation are not implemented. “Signed” describes the captured electronic declaration, not certified identity or legal suitability for every agreement.

## Review evidence

- [Public form and evidence review](reviews/v1-public-review.md)
- [Async and email review](reviews/v1-async-review.md)
- [Salesforce access, viewer and portability review](reviews/v1-platform-review.md)

The email and embedded-viewer changes received focused second reviews; no new substantial regression was confirmed. Analyzer findings of moderate/low severity were primarily documentation/complexity conventions and were not promoted into this functional register. Private raw reports, local reproduction clones, actual signatures and inbox attachments are retained in the working folder and deliberately excluded from GitHub.

Recommended first discussion: PUB-01 and PUB-04 for submission exposure; PUB-03 for the evidence trust model; PUB-02/PLAT-01 for reusable event configuration; then ASYNC-01/02/03 for import and recovery behavior. No priority in this file authorises a production rollout or accepts a risk on behalf of the client.
