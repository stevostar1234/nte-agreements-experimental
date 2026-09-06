# V1 critical review: public form and signed evidence

Reviewed 6 September 2026. Scope: the public form, signature capture/transport, contractual consistency, native Web-to-Lead boundary and consequences of public hosting. No runtime code was edited, no Salesforce records were written and no emails were sent during this review. Review artifacts are synthetic and stay outside the public site.

Priority meanings: **P1** should be resolved or explicitly accepted before a public service accepts real agreements; **P2** should be planned before routine operation at the relevant scale. A priority is not a claim that the live test failed.

The existing successful Gold test remains good evidence for the normal browser path. These findings concern untested alternate paths and routine changes that the successful test does not cover.

## Confirmed defects and trust gaps

### PUB-01 — P1: omitting the form discriminator bypasses sanitisation of server-owned agreement state

**Code:** `force-app/main/default/classes/NTEAgreementLeadHandler.cls:9`, `:24`, `:44`, `:73`; `public/assets/config.js:77`, `:90`, `:97` and its `customFieldIds` mapping. The current viewer reads the stored status and PDF reference directly. The upcoming document viewer should not be assumed to repair the insertion boundary.

**Trigger:** a direct Lead creation / Web-to-Lead submission leaves `Web_Form_Type__c`, `Agreement_Version__c` and `Signature_Vector__c` unset, while supplying server-owned fields such as `Agreement_Status__c`, `Agreement_Snapshot__c`, `Agreement_PDF_File__c`, `Agreement_SHA256__c` and `Agreement_Email_Sent_At__c`.

`capture()` returns early for this record because `isAgreement()` is false. Consequently it never overwrites those server-owned fields with its trusted initial state. `enqueue()` also ignores it. A manufactured `Email Sent` status can therefore remain without the signature/PDF/email lifecycle ever running. An arbitrary existing File reference can be represented as the agreement, subject to the viewing user's actual File permissions; this does **not** by itself grant access to an inaccessible File.

**Evidence and confidence:** confirmed by control-flow inspection and the local discriminator fixture in `artifacts/review-public/results.json`. The fixture evaluates `isAgreement=false` while retaining the supplied `Email Sent` state. The field IDs are public, as normal for Web-to-Lead. The successful normal test already demonstrates that Web-to-Lead can populate fields that the UI permission set makes read-only. No malicious POST was sent, so end-to-end acceptance of every spoofed field remains a controlled regression test to run, not a claimed observation.

**Impact:** agreement state displayed to staff is no longer guaranteed to originate from the processing pipeline. The vulnerability is not prevented by hiding inputs, client validation or the unique booking reference, because none of the discriminator fields is required for an ordinary Lead.

**Smallest fix:** sanitise/reject externally supplied server-owned processing fields on **all** Lead inserts, before the agreement-detection early return; only the internal pipeline may establish a processed state. Define the client input allowlist separately from generated state. Test an insert with no discriminator and forged snapshot/status/File IDs, plus an ordinary unrelated Lead. Verify the document viewer checks that a stored PDF belongs to this Lead before using the reference.

### PUB-02 — P1 when a package fee changes: the documented configuration change produces a form that cannot complete

**Code:** `scripts/build-local.mjs:10`, `:27`; `public/partner-sponsor-application.html:73`; `public/assets/forms.js:326`, `:338`; `public/assets/agreement.js:17`; `force-app/main/default/classes/NTEAgreementTemplate.cls:97`.

**Trigger / reproduced steps:** in an isolated copy, change Gold's fee in `config/agreement.json` from £15,000 to £16,000, then run the **actual** `scripts/build-local.mjs`. The build succeeds. The agreement preview uses the new configuration fee, while the generated checkbox still contains the original `data-package-price="15000"` and original visible price. Running the actual `forms.js` pricing utility produces £15,000 for the posted total. Apex expects £16,000 and rejects the application in the Signature stage.

**Evidence and confidence:** confirmed reproduction, `artifacts/review-public/results.json` → `priceChange`. The script and isolated build are retained under `artifacts/review-public/`. The live configuration was not changed. Current package prices happen to match, which is why the current Gold test passes.

**Impact:** a normal, documented maintenance action stops every submission containing the changed package. It also presents two conflicting fees before submission. Adding/removing/renaming a package similarly needs coordination with the frozen HTML and Salesforce picklist; it is not currently driven only by `agreement.json`.

**Smallest fix:** derive package options, their displayed prices and the submitted totals from the same package configuration as the agreement preview/server validator. At minimum fail the build if HTML options/prices differ, rather than shipping a broken form. Add a regression that changes a fee and verifies the generated form's visible price, hidden total and configured server fee are equal. The platform review separately covers hardcoded test fixtures that impede configuration updates.

### PUB-03 — P1 for evidence integrity: individually valid vector and PNG can describe different signatures

**Code:** `public/assets/signature-pad.js:88` onward; `force-app/main/default/classes/NTEAgreementSignature.cls:62`; `force-app/main/default/classes/NTEAgreementWorker.cls:67`, `:70`, `:89`, `:149`.

The supplied browser correctly paints the PNG from the same paths it serialises. The server, however, validates the two inputs separately and hashes both supplied inputs. It never proves that the PNG depicts the authoritative vector. The PNG validator checks size, header/trailer, dimensions and format, but neither visible ink nor equality to the vector. The PDF validator checks for an image object, not for a visibly correct signature.

**Reproduction:** `artifacts/review-public/transparent-signature.png` is a valid 600 × 180 transparent RGBA PNG, 499 bytes long, containing **zero non-transparent pixels**. It passes every predicate currently enforced by `decodePng()`. It can be paired with the existing valid numeric vector fixture, which the actual client geometry validator accepts. Changing the PNG to a different visible signature produces the same class of mismatch.

**Evidence and confidence:** confirmed validation gap and offline predicate reproduction in `results.json` → `transparentPng`. The PNG was not submitted to Salesforce and a native PDF was not generated from it during this review. Whether the native renderer retains a fully transparent image object is explicitly unverified; even if it optimises that image away, a different visible PNG remains undetected by the design.

**Impact:** the final agreement can contain a different signature from the permanent vector master. Hashes preserve that contradiction; they do not establish equivalence. This is separate from the expected absence of identity verification in a public drawn-signature workflow.

**Smallest honest resolution:** decide which representation is authoritative during execution. Fully closing this gap requires deriving the PDF image from the validated vector in a trusted renderer, or an explicit verification step before execution. A server-side visible-ink check would reject the blank example but would not prove equivalence; comparing the two representation hashes is also not a valid fix. If the public dual-payload design is retained, accept and document this trust limit and avoid presenting it as independently verified signature evidence. Add altered-PNG/blank-PNG tests, not only tests of the genuine client export path.

### PUB-04 — P1 before unrestricted public hosting: the outbound-email workflow has no server-enforced bot gate

**Code / configuration:** `public/assets/forms.js:603`, `:630`, `:645`; `org-baseline/settings/WebToX.settings-meta.xml:6` records `webToLeadSpamFilter=false`. `public/` contains no native reCAPTCHA token/widget handling.

The honeypot is checked only in JavaScript. It is neither posted to Salesforce nor validated there. A direct POST can omit it. The public configuration includes the org ID, field IDs, agreement version/hash and package catalogue; these are normal public identifiers, not secrets or authorization tokens. An automated caller can submit valid-shaped applications using fresh references and arbitrary recipient addresses, causing Lead/File creation, queueable execution and email sends.

**Evidence and confidence:** confirmed absence of a server-side gate in the reviewed public code and captured org configuration. This is a design/operational security gap, **not** a claim that abuse occurred or a load test was performed. The org setting should be rechecked if it has changed since the baseline capture.

**Impact:** exhaustion of Web-to-Lead/email/storage quotas, delayed legitimate agreements and damage to sender reputation. A honeypot or site-origin JavaScript check cannot prevent direct Web-to-Lead requests. Public GitHub Pages publication makes this more important than loopback-only testing.

**Smallest fix:** configure Salesforce's native Web-to-Lead reCAPTCHA **v2** for the published domain and include the generated token fields in the actual hidden POST form; merely adding a widget to the visible form will not make `submitToSalesforce()` forward it. Verify missing/invalid tokens are rejected and a real completed challenge still creates a Lead. Continue monitoring quotas and failures because CAPTCHA cannot promise zero abuse or zero service outages.

Salesforce documents [native Web-to-Lead reCAPTCHA setup](https://help.salesforce.com/s/articleView?id=sales.setting_up_web-to-lead.htm&language=en_US) and [v2 as the supported version](https://help.salesforce.com/s/articleView?id=000394922&language=en_US&type=1).

## Platform and operational constraints requiring explicit decisions

### PUB-05 — P2: overflow queuing and device clock errors can invalidate an otherwise valid signed submission

**Code:** `force-app/main/default/classes/NTEAgreementTemplate.cls:66`; `NTEAgreementLeadHandler.cls:25`; `public/assets/agreement.js:52`.

The signed time comes from the applicant's clock. It must be no more than ten minutes ahead of the Lead-insert time and no more than one day behind it. Salesforce can queue Web-to-Lead requests after the daily quota is exhausted and create the Lead only after limits reset. A backlog holding a request for more than a day therefore fails the signing-window check even if the signature was valid at the original submission. A device more than ten minutes ahead fails without any backlog.

**Evidence:** confirmed conditional code behavior; no live overflow or clock-skew submission was attempted. Salesforce documents [the 500-per-day quota and overflow queue](https://help.salesforce.com/s/articleView?id=sales.faq_leads_how_many_leads.htm&language=en_US&type=5), and specifically confirms that [queued Leads get the eventual creation time rather than original web submission time](https://help.salesforce.com/s/articleView?id=000382807&language=en_US&type=1). There is no observed capacity failure in the normal test.

**Decision / smallest fix:** separate the untrusted browser-reported signing time from trusted Salesforce receipt/creation time and decide how to handle an implausible client clock. Preserve both, but do not treat Salesforce's own queue delay as proof of an invalid signature. Verify quota and clock-skew handling with controlled fixtures. Increasing a quota alone does not resolve client-clock dependence.

### PUB-06 — P2 during terms/configuration releases: only one active bundle is accepted

**Code:** `NTEAgreementTemplate.cls:28`, `:45`.

Changing the active static resource invalidates forms already open with the earlier bundle, and can invalidate a previously inserted `Received` Lead whose Signature job has not yet frozen the full HTML. Retry cannot resolve a mismatched hash; a new signature is required. This correctly avoids silently substituting different terms, but it is a version-transition limitation rather than complete multi-version execution support. Salesforce and GitHub deployment are separate operations and cannot be assumed atomic.

The current README acknowledges draining pending work and requiring reloads. If that interruption is unacceptable, keep immutable versioned resources and select an allowed resource by the submitted version/hash, with an explicit validity policy. Regression-test an old form submitting after a new release and an old queued Lead completing after that release. Already completed frozen agreements are preserved correctly.

### PUB-07 — native Web-to-Lead cannot provide a guaranteed synchronous receipt or inbox-delivery result

**Code:** `public/assets/forms.js:624`; `public/thank-you.html:1`.

The browser performs a navigation POST and receives a return-page redirect. It does not get an authenticated Lead ID or a structured processing result. Duplicate rules, validation failures, native service failures and quota behavior can prevent or delay creation independently of the local confirmation. The current confirmation appropriately says the application was submitted and email follows processing; it does not falsely certify delivery.

This is an architectural constraint of retaining native Web-to-Lead, not a newly discovered UI defect. Keep operational ownership for missing emails and pending/error records, retain the reference and monitor failures. The unique reference protects repeated identical POSTs from creating duplicate agreements; it does not deduplicate independently completed new forms with new references. No implementation can guarantee that a recipient mailbox accepts or displays every email.

## Verification gaps worth filling before real use

- The saved live test proves one real Gold browser submission and PDF/email lifecycle. The 12 local signature tests use a DOM/Canvas stub; they do not prove large PNG transport, device rendering or native browser Form POST behavior on physical touch/stylus hardware.
- No hostile direct Web-to-Lead submissions, forged state, altered PNG, invalid reCAPTCHA or quota load were sent in this review. Those tests require controlled fixtures and clear mailbox/record cleanup boundaries.
- Test realistic maximum signatures and form lengths through the actual Web-to-Lead endpoint. The code bounds each signature representation at 28,000 characters; this is an application bound, not evidence that every maximum-size combination survives the native endpoint unchanged. I did not find an authoritative primary source establishing a total POST-byte limit and therefore do not assert one.
- Add generated-public-form/config/server-fixture consistency tests. Current geometry tests and the happy-path deployment do not catch the reproduced fee drift.
- Repository publication sanitisation is covered by the separate platform review. Publishing `public/` as the site does not automatically sanitise the source repository; use an explicit export allowlist for unrelated metadata, source documents and test evidence.

## Reproduction artifacts

`artifacts/review-public/reproduce.mjs` runs the real form-build script in an isolated directory, executes the current pricing utility, constructs a valid transparent PNG, exercises the actual vector parser and records the discriminator predicate outcome. It writes only under `artifacts/review-public/` and never contacts Salesforce.

Run from the project root with Node:

```text
node artifacts/review-public/reproduce.mjs
```

Results: `artifacts/review-public/results.json`. Runtime source hashes are included so the observations can be tied to the reviewed implementation. Do not publish the synthetic clone as a second live form or mistake it for the deployed configuration.
