# NTE agreements — experimental

The supplied NTE partner/sponsor form, electronic signature capture, Salesforce-native PDF workflow and branded confirmation email. The working target is **Megistos only**. This repository is separate from the original NTE demo repository.

- [Open the application form](https://stevostar1234.github.io/nte-agreements-experimental/partner-sponsor-application.html)
- [View the branded email example](https://stevostar1234.github.io/nte-agreements-experimental/email-preview.html)
- [Technical walkthrough and presentation guide](docs/TECHNICAL-WALKTHROUGH.md)
- [V1 functional issues — decisions pending](docs/V1-ISSUES.md)
- [Exact metadata and field inventory](docs/METADATA.md)
- [Verification results and test limits](docs/RELEASE-VERIFICATION.md)

## Team evaluation

Use synthetic applicant/company details and an email inbox you control. **The form really creates a Lead in Megistos and emails a signed PDF.** The GitHub Pages site is public, without a team access gate. This experiment is not approved for real client agreements: the V1 issue register includes material submission-integrity, bot-control, configuration and async-recovery decisions.

Choose Gold Partner to see the complete supplied benefits. Other packages retain their supplied fees and intentionally blank benefit schedules. General wording is year-neutral; current event configuration is NTE2027, 1 March 2027. Confirm the VAT conflict and complete contractual schedules before client use.

1. Complete the form with your receiving email in the **main contact** field.
2. Read the agreement, enter the legal name, confirm the declarations and draw a signature.
3. Submit once and retain the reference on the return page.
4. In Megistos open **NTE Agreements → Leads**, then the new Lead. Refresh the agreement card until its PDF is ready.
5. Browse the embedded PDF and use its native toolbar to download/print. **Open PDF** provides a separate-window fallback. The Files related list contains the PNG and executed PDF.
6. Check your inbox and Spam folder for **Your signed NTE agreement — [reference]**. Open the attached PDF.

The return page acknowledges submission rather than guaranteeing Lead creation. `Email Sent` means Salesforce accepted delivery; inbox filtering remains outside the workflow. Team members need an appropriate Megistos login and record/File access to view Salesforce records. No user account is needed to submit the form.

## Architecture

Static form + locally bundled perfect-freehand → vector/PNG text via native Web-to-Lead → Lead capture trigger → three Queueable transactions (signature File, native `Blob.toPdf` and PDF File, native email with the saved attachment) → document-focused Lightning component.

There is no external application server, Experience Cloud API, paid DocGen/e-signature product, external PDF API or third-party email service. GitHub Pages hosts static files only. Hashes identify retained evidence and Files; they do not establish identity or independently prove that a submitted PNG matches its vector.

## Build and local preview

Node/npm and Python 3 are sufficient for local development; no npm dependency download is needed for the vendored library.

```sh
npm test
npm run build
python -m http.server 8765 --bind 127.0.0.1 --directory public
```

Open http://127.0.0.1:8765/partner-sponsor-application.html. Windows also has `scripts/start-form.ps1`.

`config/agreement.json` and the extracted reference terms feed `build-agreement.mjs`. `build-local.mjs` integrates the source form and verified Megistos field mappings. `config/branded-email-template.html` feeds a separate email Static Resource and synthetic email preview. Generated metadata and website assets are committed. Refer to PUB-02/PLAT-01 before changing event/package configuration; not every inherited form/test literal is yet configuration-driven.

## Salesforce deployment

Salesforce CLI authentication is local and is never committed or used by GitHub Actions. Authenticate the intended Megistos user separately, using alias `missioncommunity-safe`.

```powershell
./scripts/deploy-megistos.ps1 -Mode Check
./scripts/deploy-megistos.ps1 -Mode Validate
./scripts/deploy-megistos.ps1 -Mode Deploy
```

The helper checks the exact approved Megistos org ID and name, defaults to validation, uses an explicit target and runs four Apex test classes. It does not assign permissions, deploy unrelated layout metadata or change another org/default org.

The portable core contains 90 components including 67 Lead fields, 8 runtime Apex classes, 4 test classes plus their factory, the trigger, two LWC bundles, two permission sets, a custom permission, two Static Resources, an app and a record page. Exact names are in the inventory.

Existing Megistos setup: the approved test user has the Operator permission; the NTE app has its Lead page; the Lead layout has Files. PDF display is set to **Execute in Browser** for `.pdf` (an org-wide PDF behavior setting). Other file types were not changed. Ordinary-user access and other browsers still need the acceptance checks in the issue register.

## Hosting and promotion

GitHub Pages serves the `gh-pages` branch, containing only the reviewed `public/` subtree. Run `scripts/publish-site.ps1` from clean, committed `main` to test/build and publish that subtree. Main-branch changes alone do not republish the site. This process never deploys Salesforce. A terms/configuration release requires a coordinated matching Salesforce deployment; otherwise version/hash validation will reject stale combinations.

Public org/field IDs in the form are normal Web-to-Lead routing identifiers, not credentials. Actual signatures, inbox attachments, raw org metadata, authentication files and original Word files are excluded by an explicit source-export allowlist and ignore rules. Only necessary sanitised build inputs remain under `reference/`.

Before a client sandbox/production rollout, resolve the functional review, reconcile destination fields/automation, complete the contract, configure native CAPTCHA and an authenticated client sender, test least-privilege File access/device behavior and agree monitoring/retention/conversion. Use a separate reviewed target configuration rather than removing Megistos's guard casually. No other org has been deployed to by this project.

Megistos is an Enterprise Edition trial with recorded expiry 2 May 2027. Keep the source and retained evidence independently of the trial. Licence/branding details are in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
