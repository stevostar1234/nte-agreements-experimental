# Delivery partner routing experiment

Published review: https://stevostar1234.github.io/nte-agreements-experimental/experiments/delivery-partners/

## Recommendation

Maintain one partner/sponsor HTML form. Use its ordinary URL for paid partners and sponsors, and send the same URL with `?partner=delivery` to delivery partners. The query selects the presentation and prefills the package classification; it is not an invitation credential.

The public application contains only paid package choices. The delivery view removes the package section and billing section, changes the heading and relevant staff/power guidance, and renumbers the remaining sections. Contact details, the alternative on-the-day contact, exhibition information, staff count, accessibility, declaration and privacy acknowledgement are retained.

A public “Are you a delivery partner?” selector would expose the alternative to paying partners, which is the concern this change is intended to solve. A separate form would also work, but duplicates maintenance unless generated from the same template. The review page compares those approaches and provides the two interactive views of the recommended single-form solution.

## Scope and sources

The user expressly chose **client review only, with no Salesforce records or emails**. No Salesforce org was accessed or changed for this experiment. The existing signature capture, Apex, agreement configuration, metadata and original experimental form are unchanged. The main NTE repository was read, not modified.

The form snapshot is from `stevostar1234/nte27-web-to-lead-demo`, main commit `48f850b85ae7643be6657e0045e1c15391e7e944`, inspected on 9 October 2026. It includes the current eleven packages, Headline Partner at £20,000 plus VAT, Auditorium Sponsor at £6,000 plus VAT, and the current billing flow. Source form SHA-256 after LF normalization: `259693592babfb964d3ad84759df88e8bc8e8acc7b81e8be39502e5d8a75d933`.

Kate's 6 October revisions document and 8 October follow-up email describe delivery partners using the same operational process, without invoices, and without a public £0 package. The follow-up explains that vehicle, logo and joining-instruction reminders must include them. The attachment also anticipates a delivery agreement and staff details. Private emails and the original attachment have not been published.

The 6 October covering email asks to disregard the initial partner/sponsor suggestions pending clarification. The current main-repository form is therefore the authority for its paid packages and wording; this experiment does not replay every instruction in that draft document, delete other forms/emails, or invent contractual terms.

## Links

- Review page: `/experiments/delivery-partners/`
- Public application: `/experiments/delivery-partners/partner-sponsor-application.html`
- Delivery application: the same path followed by `?partner=delivery`

Only the exact delivery value is accepted. Duplicate or unknown values show a link error instead of accidentally selecting a different application. Other parameters such as campaign tracking are ignored. Personal details cannot be prefilled from arbitrary URL parameters.

The review hub is for the project team; do not place its delivery link in the production public navigation. A production website would host the one application and its shared assets, without this review hub.

## Proposed Web-to-Lead payload

The review still collects the existing field API names, so a developer can see precisely how the future submission would be classified. No field IDs or endpoints are configured here.

| Field | Paid route | Delivery route |
|---|---|---|
| Web_Form_Type__c | Partner / Sponsor Application | Partner / Sponsor Application |
| Sponsor_Package__c | Selected paid packages | Delivery Partner |
| Sponsor_Package_Total__c | Sum of selected packages, excluding VAT | 0 |
| Listed_Price_Total__c | Current calculated total, excluding VAT | 0 |
| Invoice_Required__c | Yes | No |
| Invoice_Requested__c | Yes | No |
| Payment_Method__c | Manual | Omitted |
| Form_Version__c | partner-routing-review-v1 | delivery-partner-routing-review-v1 |
| Billing, PO, quote and supplier fields | Collected where applicable | Removed and omitted |

The shared form-type value is intentional: delivery partners belong in the same operational partner pipeline. Adding a new form type without checking existing filters could exclude them from the very reminders they need. The proposed Delivery Partner package value must be supported by the destination field and automation before live submission is enabled.

The zero amounts express the proposed no-invoice classification; they must not independently authorize a complimentary booking. The production server must recalculate/enforce fees from trusted package and approval data rather than trust hidden input.

Salesforce supports [hidden Web-to-Lead parameters](https://help.salesforce.com/s/articleView?id=000385544&language=en_US&type=1). A separate generated Web-to-Lead form is not required merely because one HTML page has different presentation modes. Both modes can ultimately post to the same configured endpoint and use the same field mapping.

## What remains before live use

1. Confirm delivery eligibility through the existing team approval process or a verified invitation record. A URL flag and hidden field can be changed or forwarded. They solve public presentation, not authorization. An opaque public code alone would not fix that.
2. Support Delivery Partner in the destination package/classification and carry it through Lead conversion into the record used for booking and reminders. Preserve the event code, booking reference and operational contacts.
3. After staff approval, explicitly set the no-invoice state and exclude delivery partners from quote, invoice, Stripe and overdue-payment automation. Do not treat the absence of payment as a reason to withhold their operational confirmation.
4. Keep them included in applicable logo, vehicle, staff and joining-instruction reminders. Review both positive “partner” filters and any filters that currently require “Paid”, an invoice or a payment date.
5. Use the appropriate delivery acknowledgement/confirmation and agreement wording. Those email automations and a delivery-specific agreement are not implemented by this browser experiment. The existing September signature workflow has its own package catalogue and must not be pointed at these newer packages/prices without a coordinated change.
6. Confirm whether the delivery agreement needs a separate legal organisation name/address when the marketing name differs. This view removes the billing section, including its legal invoice-name field; it currently retains the marketing organisation name and applicant's declaration name.
7. Review the final terms. This snapshot links to the current NTE27 Privacy Policy, as the latest main form does. A privacy acknowledgement is not a substitute for delivery-specific contract terms.
8. Verify the client's CMS preserves query parameters, script order and assets. Test both direct links after hosting. Keep the delivery link out of public navigation/search listings as a communication choice, while recognizing that it cannot be secret on a public site.

No production org, client sandbox, new Flow, invoice automation or operational email was deployed or exercised.

## Review safety and behavior

The review build removes native Salesforce submission code. Its configuration has no org ID, Web-to-Lead URL, custom-field IDs, return URL or upload-folder link. A Content Security Policy blocks form submission and script network connections. The form stays hidden and its review button disabled until every required script initializes. JavaScript-disabled and failed-script states cannot submit a partial form.

The button validates the application using the current main form's rules and shows an in-memory summary. It does not create a booking or claim receipt. Editing preserves the current values. No applicant details are written to local/session storage, a URL, Salesforce or email. User-supplied text is rendered using textContent, including strings that resemble HTML.

The site still loads the main form's Google font stylesheet. Ordinary page/font requests are not application submissions. The review is publicly reachable on GitHub Pages and should be used with example details.

## Code and reproduction

- Pinned source: `reference/delivery-partners-20261009/` (form, form logic, styles and logo).
- Builder: `scripts/build-delivery-experiment.mjs`; startup/review markup in `scripts/delivery-review-shell.html`.
- Published app and review hub: `public/experiments/delivery-partners/`.
- Small route/review module: `assets/review.js`; safe config and supplementary styles beside it.
- Tests: `tests/delivery-experiment.test.mjs`.

Run `npm run build` and `npm test`. The browser test uses an installed Playwright module, falling back to Codex's bundled modules; set `NTE_BROWSER_NODE_MODULES` if needed. It uses installed Chrome on Windows, or Playwright Chromium elsewhere; `NTE_BROWSER_CHANNEL` can override the browser channel. Without Playwright the browser test reports a skip; do not count a skipped browser run as release verification.

The builder is based on a pinned snapshot and asserts expected insertion points. Refreshing the upstream snapshot is deliberate, followed by both build and browser verification. It does not silently fetch changed pricing during a build.

## Verification on 9 October 2026

Nine new checks passed, including seven browser scenario groups plus their enclosing browser test and a static transport/catalogue check. The browser exercised:

- Both routes, exact current package count/prices, and £26,000 net → £31,200 including VAT for Headline plus Auditorium.
- Required package selection and purchase-order details on the paid route.
- Delivery without any package selector, billing fields, invoice requirements or visible price.
- Alternate on-the-day contact, accessibility details, and their omission after those branches are switched off.
- Correct delivery classification, zero totals, both invoice flags set to No, and omission of billing/payment fields.
- Edit and re-review, special characters and HTML-like text rendered literally.
- Unknown/duplicate routing parameters, ignored personal-prefill parameters, and benign tracking parameters.
- 320, 390, 768 and 1366-pixel layouts, plus desktop/mobile screenshots.
- Missing form script and disabled JavaScript with no active form.
- Zero application POST, fetch or XHR requests, no page JavaScript errors, and no application data in browser storage.

Screenshots and raw test reports remain under ignored local `artifacts/delivery-review/`. This validates the form experiment, not future Salesforce integration or email delivery.

The full repository run passed 84 checks with zero failures. Six pre-existing optional native-Canvas signature tests were skipped because that optional module was not configured in this runtime; none of the nine new delivery-experiment checks was skipped. The existing signature implementation and agreement bundle hash were unchanged by the build.
