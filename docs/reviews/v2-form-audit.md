# V2 form edge-case audit

Reviewed on 7 September 2026. Findings are for prioritisation; this audit did not change production code, submit Salesforce records, or send email.

## Scope and method

The audit executes the generated `public/assets/forms.js` and `public/assets/agreement.js` against the generated application HTML in a bounded local DOM harness. The signature renderer is replaced with a deterministic synthetic signature so the tests isolate form preparation, field mapping and submission decisions. The real signature capture, Canvas rasterisation, exact Web-to-Lead request ceiling and Salesforce PDF/email lifecycle are tested separately in the release work.

The harness records constructed native POST fields instead of making a network request. Its native input validity checks approximate required fields, email, number and date constraints; it is not a substitute for browser compatibility testing, real autofill, browser navigation or native PDF font testing.

Reproduce from the repository root:

```powershell
node tests/audit/v2-form-audit.mjs
```

This runs 23 case groups, including all 16,383 nonempty combinations of the 14 current packages. Full synthetic results are written to the ignored local file `artifacts/v2-form-audit-results.json`. The harness and reproducible cases are [v2-form-harness.mjs](../../tests/audit/v2-form-harness.mjs) and [v2-form-audit.mjs](../../tests/audit/v2-form-audit.mjs).

## Findings left open

### FORM-01 — P2: optional browser storage can prevent an otherwise valid agreement submission

**Status:** confirmed by executing the actual preparation code with storage writes denied.

**Trigger:** a privacy policy, browser setting or storage failure makes `sessionStorage.setItem` throw. The application fields, consent and signature are otherwise valid.

**Evidence:** [agreement.js](../../public/assets/agreement.js#L61) writes the confirmation-page reference to session storage after preparing the signature, without catching storage exceptions. The outer form handler catches the error and returns before constructing the native POST. The controlled case produced zero POSTs and the status `Storage access blocked`; signature fields were already populated. The same inputs with available storage produced one POST.

**Workflow effect:** no Lead, agreement PDF or confirmation email is created. Retrying in the same blocked-storage browser repeats the failure. The reference already exists in the submitted Lead fields; browser storage is only needed to display it on the thank-you page.

**Smallest fix:** make reference persistence best effort with `try/catch`, and guard the thank-you page's `getItem` too. Continue submitting if storage is unavailable. An optional reference in the return URL can preserve the on-screen reference, but is not needed to remove the blocker.

**Downstream impact:** the agreement workflow becomes independent of optional browser storage. The thank-you page may omit its reference when storage is denied unless a URL fallback is added. This does not require Salesforce metadata changes.

### FORM-02 — P2: a native submission exception leaves the form locked with no recovery

**Status:** confirmed with an injected failure at the native `postForm.submit()` boundary; no real browser/network failure was induced.

**Trigger:** native submission throws after the form has entered its submitting state.

**Evidence:** [forms.js](../../public/assets/forms.js#L713) sets `data-submitting="true"`, marks the form busy and disables submit buttons, then calls `submitToSalesforce` outside a recovery block. [The native call](../../public/assets/forms.js#L642) has no catch. The audit made that call throw: zero POSTs were recorded, the submit button remained disabled and a subsequent submit event returned immediately at the duplicate-submit guard.

**Workflow effect:** that attempt cannot reach Salesforce and the user cannot retry from the existing form state. A related browser-history concern is that a restored page can retain the submitting flag; actual back/forward-cache behavior still needs a browser test.

**Smallest fix:** catch synchronous submission failures, restore button text/enabled state and clear the busy/submitting flags while preserving the application. Keep the reference for an explicit retry. Test browser history restoration separately before deciding whether to reuse the reference or start a new application.

**Downstream impact:** recovery becomes possible without silently retrying or creating another agreement. This does not solve every blocked navigation, connection failure or unknown server outcome; native Web-to-Lead provides no reliable browser-side processing acknowledgement.

### FORM-03 — P2: failure to load the core form script permits the HTML form's default navigation

**Status:** confirmed missing-script state and HTML configuration; the resulting browser navigation was not exercised in this local harness.

**Trigger:** `assets/forms.js` is unavailable while JavaScript remains enabled, for example after an asset load failure or a partial site release.

**Evidence:** the generated [main form](../../public/partner-sponsor-application.html#L17) has neither `method` nor `action`, and its [submit button](../../public/partner-sponsor-application.html#L149) starts enabled. Application controls have `data-sf-field` attributes but no native submission names. Omitting only `forms.js` left zero submit listeners and zero named application inputs. The browser's default action is therefore a GET to the current URL, rather than Web-to-Lead. The existing `<noscript>` notice does not cover a failed external script while JavaScript is enabled.

**Workflow effect:** a user can complete the page and press Submit without creating a Lead. Default navigation can discard the application they entered. In contrast, missing only `agreement.js` or its agreement bundle was handled by the loaded core form script: submission stopped with a reload message and no POST.

**Smallest fix:** start the submit button disabled in generated HTML and enable it only when the form utilities and agreement/signature module have both completed initialisation. Provide a load-failure/reload path. Test the generated output and its builder together.

**Downstream impact:** asset failures become visible before an application can be submitted through an unintended path. No Salesforce or external service is required.

## Conditional risks and limits, not confirmed ordinary-input defects

- **Programmatic changes without events:** changing a field's `.value` after signing, without dispatching `input` or `change`, allows the final POST to use the new value while the preview and signature remain associated with the prior details. This was reproduced with direct property assignment. Silent native autofill was not reproduced in a real browser. A final fingerprint comparison in `prepare()` would protect integrations that change fields programmatically. This is not presented as a proven browser-autofill defect or an identity-verification feature.
- **Large text versus total request capacity:** 32,768 CJK characters fit the invoice-notes field's character allowance but created a 296,524-byte encoded request. The new 92,160-byte form budget correctly blocked it. Undoing signature marks cannot rescue a form whose other fields already exceed the request limit; a separate application-size diagnostic would make this boundary easier to recover from. This is a transport limit, not an arbitrary signature-size rejection.
- **Unicode PDF coverage:** Unicode, emoji and HTML-sensitive values survive the client mapping and are escaped in the preview. This audit does not establish native PDF glyph coverage for every script or emoji. Native renderer/font checks belong to the Salesforce review.
- **Browser features:** the workflow needs modern JavaScript, Pointer Events, Canvas/Path2D, international date formatting and URLSearchParams. This harness does not certify unsupported/older browsers or browser-specific autofill, privacy-extension, CSP or history behavior.
- **Payment, package schedules and delivery:** the form captures the payment preference; it does not collect a Stripe payment or prove that payment happened. Missing non-Gold benefits, email delivery/authentication and the native Web-to-Lead acknowledgement limit remain the previously documented configuration/platform considerations.

## Practical test matrix

| Class | Inputs / condition | Result and practical limit |
|---|---|---|
| Baseline mapping | Normal main and separate finance contact; Gold; all required fields | One synthetic native POST, 60 submitted entries, 2,747 encoded bytes with the small signature fixture. Main email remains `email`; finance email maps to its own custom field. |
| Name lengths | First name 40, surname 80; main/day contact copy paths | Combined names are 121 characters, within both 200-character destination fields. No name-combination overflow found. |
| Alternate contact | No, blank details; then complete; then return to Yes | Visible details become required; hidden fields become disabled; mapped contact returns to the main contact. |
| Conditional fields | Accessibility, purchase-order details and invoice notes: Yes → blank → filled → No | Blank visible details are blocked; hidden retained text is omitted from the POST. |
| Package prices | All 16,383 nonempty subsets of current package options | HTML prices and agreement configuration totals match for every subset. All 14 total £107,000. |
| All 14 packages | Full 261-character joined multiselect value | Pass. An initial suspected 255-character overflow was **withdrawn**: the Salesforce field is a multiselect, not a 255-character text destination. The parent task separately confirmed a native all-14 submission reached PDF creation and Email Sent. |
| Text maximums | Every enabled text/tel/textarea at its configured maximum; 32,768 ASCII invoice-note characters | Client preparation passes at 40,269 encoded bytes; preview HTML is 14,926 characters. These are client measurements, not an assertion of the final Apex snapshot size. |
| Escaping amplification | Maximum quote-heavy text, with invoice notes reduced to 23,768 quotes to remain transportable | Client preparation passes at 88,641 encoded bytes; preview HTML is 24,046 characters. Full synthetic input was shared with the server reviewer for snapshot checks. |
| Unicode / markup | Apostrophe, ampersand, angle brackets, CJK, emoji and `{{signature}}` | Posted text remains intact; preview escapes markup and nested merge tokens. PDF font coverage is separate. |
| Required text | Spaces-only organisation, then corrected | Blank text is blocked; correcting it clears the validation state and permits submission. |
| Agreement changes | Edit legal organisation after drawing | Signature and all three consent checkboxes are cleared. Changing consent alone keeps the drawn mark. |
| Dates | 1900-01-01, 2026-09-07, 2100-12-31 | Client accepts and converts each to DMY transport; no declaration min/max is configured. Native date/clock coverage is recorded separately. |
| Repeated clicks | Two submit events after successful preparation | Exactly one native POST is constructed; the duplicate-submit guard works. |
| Storage denied | Otherwise valid form; session storage throws | Confirmed FORM-01: no POST. |
| Submission exception | Otherwise valid form; native submit boundary throws | Confirmed FORM-02: no POST, locked button and duplicate guard prevent retry. |
| Missing agreement asset | Agreement module or bundle unavailable, core form script loaded | Form stops with a reload message; no POST. |
| Missing core asset | `forms.js` unavailable | FORM-03: no submit handler; enabled HTML form retains default GET behavior. |
| Above total capacity | 32,768 CJK invoice-note characters | Intentional refusal: complete encoded request is over the measured transport budget, irrespective of signature complexity. |

## Handoff

Only audit files and synthetic local results were created during this review. FORM-01, FORM-02 and FORM-03 are still open for the team's decision. Their suggested fixes should be tested against both normal submissions and the relevant injected failure, and made in the generating source as well as the generated form assets where applicable.
