# Experimental release verification

Checked 6–7 September 2026. All Salesforce deployment and live record checks targeted the verified **Megistos** org only. This public summary excludes actual contact addresses, record IDs, signature images and inbox attachments; raw evidence remains in the private working folder.

## Executed checks

| Check | Observed result |
| --- | --- |
| Salesforce validation then deployment | Successful; 33 Apex tests passed, zero failures |
| Runtime Apex coverage | 371/394 measured locations covered, approximately 94.2%; coverage is not completeness |
| Clean-source local tests | 12 passed, zero failures |
| Clean-source build | Agreement, form/mapping, email and metadata inventory generated successfully |
| Agreement bundle | Browser and Salesforce bundle hash remained `15412ad2ea3f687d53135501e6793d1db3124270d9de75759da4f70ba222dd0b` |
| Original implementation test | Real Gold Web-to-Lead submission; vector retained, temporary PNG Base64 cleared, PNG/PDF Files created, received attachment matched the saved PDF |
| Published-site test | Fresh synthetic Gold application entered and signed using real browser input on the new HTTPS GitHub Pages URL |
| Published-site completion | New Megistos Lead reached Email Sent with no processing error |
| Branded email receipt | Received in the intended main contact inbox; PDF attachment present; email left in Inbox |
| Actual email content | NTE navy/cyan/logo template; correct frozen organisation, Gold package, £15,000 fee, signatory, London signing time, version and reference; plain-text alternative; no unmerged template tokens |
| Special characters | Apostrophe, ampersand and angle brackets escaped in HTML and rendered as applicant text in the saved document |
| Received attachment | 16,048 bytes, five pages; SHA-256 matched the saved Salesforce PDF hash |
| PDF visual check | Correct Gold benefit schedule and visible synthetic signature on the final page |
| Lightning replacement | New Lead displayed the actual five-page PDF inside the component; standalone vector/details panel removed |
| PDF controls | Native page selector/toolbar available; separate-window page selection reached the signature page; Open PDF accesses the pinned executed version |
| Email responsive preview | Desktop and 390-pixel browser layout checked; details stack without horizontal overflow |
| GitHub Pages | Standard Pages build/deployment completed successfully from public-only gh-pages branch |
| Source publication review | Independent allowlist review found no private evidence, inbox addresses, live record/File IDs, authentication material, other-org routing or unrelated org metadata in the export |
| Original source | Original local form hash unchanged; no changes made to the original GitHub repository |

The native PDF toolbar's desktop download/print controls are visible. Automated testing did not verify an operating-system print dialog or the final destination of a browser-toolbar save. The received PDF was independently downloaded and its bytes verified. Physical mobile/stylus hardware, browser policies that suppress embedded PDFs and restricted-user download behavior remain acceptance checks.

## Deployment changes in this follow-up

- Updated `NTEAgreementGateway` to merge the branded HTML email from frozen evidence.
- Added `NTEAgreementEmail` Static Resource and its local builder/template/preview.
- Added `NTEAgreementPresentationTest` with two branding/escaping tests.
- Replaced the existing `nteAgreementViewer` display with the exact saved PDF, native toolbar, Open PDF and Refresh; retained failure/retry behavior.
- Megistos `.pdf` behavior: **Hybrid → Execute in Browser**. This applies org-wide to PDF navigation. Other file types were unchanged.
- Added the experimental repository, public-only site branch, repeatable publishing helper, issue register and technical walkthrough.
- No new Lead fields were required for this follow-up. The full implementation still has 67 custom Lead fields and 90 portable components; see [METADATA.md](METADATA.md).

## Limits of these results

The three critical reviews found material cases that the passing tests do not cover. They remain open in [V1-ISSUES.md](V1-ISSUES.md), including forged generated state, independent signature payloads, no server-side bot gate, fee/configuration drift, async enqueue limits and failure isolation.

The dev email arrived in Inbox, but its received headers reported SPF pass and **DMARC fail** for the current user-based sender. This is concrete evidence that customer sender/domain authentication still needs configuration; one delivered test is not proof of general deliverability. Configure a client-controlled verified organisation-wide sender and aligned domain authentication before client use.

No hostile POST, quota exhaustion, destructive failure race, bulk asynchronous import or production deployment was performed. Static-analysis moderate/low convention findings were not treated as functional defects. This release supports the requested team experiment and review; it is not certified for accepting real customer agreements.

## Hosting choice

The available GitHub credential permits repository/Pages publication but lacks the scope to create custom workflow files. Standard Pages branch publishing was configured using existing access. `gh-pages` contains only `public/`, while `main` contains the reviewed source. The inactive example at `docs/pages-workflow.example.yml` is an optional future automation alternative, not an installed workflow.

For updates, commit the reviewed build outputs on main, push main, then run `scripts/publish-site.ps1` from a clean checkout with Node/npm and Git available. The helper tests/builds, checks for generated drift and publishes the public subtree without a force push. It never deploys Salesforce or changes the original NTE repository.
