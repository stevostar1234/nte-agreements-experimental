# V1 review — Salesforce platform, access and portability

Review date: 6 September 2026. Scope: the local source in `agreement-local`, its existing verification artifacts, File access, the record component, permissions, Lead lifecycle and deployment portability. No org data, runtime code, browser state or email was changed by this reviewer. The document viewer replacement received the focused source review recorded below.

This is a focused review of consequential defects, not a certification that all future Salesforce or browser operations will succeed. Findings distinguish demonstrated source behavior from untested platform conditions.

## Confirmed finding

### PLAT-01 — P2: annual event or price configuration changes break the deployment test suite

- **Locations:** `force-app/main/default/classes/NTEAgreementTestDataFactory.cls:13`, `scripts/build-tests.mjs:16`, `force-app/main/default/classes/NTEAgreementWorkflowTest.cls:36`, `force-app/main/default/classes/NTEAgreementWorkflowTest.cls:70`, `force-app/main/default/classes/NTEAgreementTemplate.cls:45`, `scripts/deploy-megistos.ps1:19`.
- **Scenario:** change `config/agreement.json` to `event.code = NTE2028`, or change Gold's fee from £15,000 to £16,000, then rebuild and deploy with the provided helper.
- **Impact:** the browser/resource configuration can be rebuilt, but the required Apex suite still constructs NTE2027 applications at £15,000. The correct server version/price checks reject these fixtures; tests such as `fullLifecyclePreservesFilesAndFrozenRecipient` fail and block deployment. Regenerating the fixtures does not resolve this, because their generator contains the same literals. The multiple-package and bulk snapshot assertions also contain event/fee literals.
- **Evidence and confidence:** **confirmed, high confidence by source inspection.** The fixture sets `NTE_Event_Code__c='NTE2027'`, `Sponsor_Package_Total__c=15000` and `Listed_Price_Total__c=15000`. `completeEvidence` requires the event to equal the active configuration and the submitted totals to equal configured prices. The deploy helper always runs the three named test classes. No live configuration was changed or deployment attempted for this review.
- **Coverage gap:** the existing suite tests only the shipped event/pricing configuration, not a second valid configured event or fee catalogue.
- **Minimal fix:** construct ordinary happy-path fixture event/package values from the active configuration, and keep price-tamper and stale-event tests deliberately explicit. Use a stable isolated test bundle for assertions that need exact values. Update the fixture generator as well as the generated class. This is related to, but distinct from, the public review's runtime price-drift issue: that issue affects applicant submissions, while this one prevents the corrected configuration being deployed through the supplied test gate.

## Validation gaps and lifecycle limitations — not counted as confirmed defects

### Ordinary-user access has not been proved by the existing tests

`NTEAgreementOperationsTest.cls:7` creates both its operator and viewer with `UserInfo.getProfileId()`, which was the deploying administrator's profile in the recorded Megistos deployment. Its permission-denial test demonstrates the custom permission check, but does not establish File access or least-privilege behavior for an ordinary Lead owner, a read-only shared Lead, an unshared Lead, or a Viewer with no operator permission. The live record-viewer evidence also used the administrator.

The source correctly uses Lightning Data Service for display and a user-mode query plus the custom permission for retry. No unauthorized read was demonstrated. Before treating ordinary-user access as accepted, test with a non-administrator profile: owner and read-only shared record, unshared record, Viewer, Operator, and a File whose link has been removed. For the new viewer, include both embedded viewing and download. If retries are intended to require record **edit** access rather than merely record **read** access plus the custom permission, add that explicit policy check: `NTEAgreementController.cls:9` currently checks a readable record and object-level update permission, then performs a system-mode processing update. The original scope describes operations on accessible Leads, so this is a policy decision rather than a reported bypass.

### Lead conversion needs an explicit long-term agreement location

The viewer targets only Lead records (`nteAgreementViewer.js-meta.xml:2`), and its field imports and processing state are Lead-specific. There is no custom agreement object or conversion mapping in the package. Salesforce normally attaches existing Lead Files to the resulting account/contact/opportunity, so **this is not a claim that conversion deletes the signed PDF**. However, ordinary users no longer have the same searchable Lead/evidence/retry experience after conversion. The client needs to decide where authoritative agreement evidence and operations will live after qualification. A durable agreement record related to the Lead and converted records is one option; documented Lead retention and a conversion rule is a smaller option.

Salesforce documents both the transfer of Files and the changed access to converted Leads in [Convert Qualified Leads](https://help.salesforce.com/s/articleView?id=leads_convert.htm&language=en_US&type=5). No Lead was converted during this review. Async failure propagation if the current Lead becomes unupdatable is covered by the separate async review and is not duplicated here.

### Saved evidence remains subject to ordinary Salesforce File lifecycle

The signed PDF field pins a ContentVersion rather than the latest ContentDocument version, which is the correct behavior for an executed agreement. The worker verifies the saved File hash before emailing it. File owners and sufficiently privileged users can still remove a File or its record link; the Lead trigger does not prevent File deletion. Hashes are integrity evidence, not a write-once retention system. This limitation was already documented and is not a new high-priority defect. The client must define retention/deletion permissions and recovery requirements. Salesforce explains the distinct File and link deletion behavior in [ContentDocument and ContentDocumentLink Trigger Behavior](https://help.salesforce.com/s/articleView?id=000381623&language=en_US&type=1).

## Embedded PDF platform requirements

Salesforce's official [PDF-in-LWC example](https://developer.salesforce.com/blogs/2019/07/display-pdf-files-with-lightning-web-components) uses an iframe with a Salesforce File download URL. Its prerequisite is **File Upload and Download Security → .pdf → Execute in Browser**, an org-wide setting. Current [File Upload and Download Security documentation](https://help.salesforce.com/s/articleView?id=sf.admin_files_type_security.htm&language=en_US&type=0) independently confirms that Download forces saving, Execute in Browser permits inline display, and Hybrid downloads Salesforce Files.

Acceptance should use the exact `Agreement_PDF_File__c` ContentVersion (068 ID), not the latest ContentDocument. Native `filePreview` navigation accepts ContentDocument/ContentHubItem and is a modal in desktop Lightning and a download on mobile; it is not an equivalent exact-version embedded renderer. See [Open Files](https://developer.salesforce.com/docs/platform/lwc/guide/use-open-files.html).

Even with the org setting, a user's browser policy can disable inline PDF rendering. A usable direct file route remains necessary. A separate anchor's `download` attribute should not be assumed to force saving across Salesforce's redirect to its File domain; verify actual button behavior and the native PDF toolbar. No paid or additional PDF library is necessary solely to implement the supported desktop iframe path.

## Publication and deployment review

- The deployment helper checks both the pinned org ID and the actual alias-resolved org ID/name, uses an explicit target, defaults to validation, and excludes the Megistos layout overlay from its core source directory. No wrong-org deployment route was found in this helper.
- The original workspace's `.gitignore` alone is insufficient for publishing the whole folder: it does not exclude `reference/` (client Word document and original other-org form configuration), `org-baseline/` (unrelated org metadata) or the org-specific overlay. This was reported before publication. The parent is preparing a separate allowlisted source export that excludes these and private verification artifacts; this avoids reporting an exposure that has not happened.
- `FirstPublishLocationId` correctly creates the File-to-Lead link. The recorded live links have `Visibility=InternalUsers` and `ShareType=V`. The code does not explicitly set these values, so a destination org's actual defaults need checking before customer deployment; the one-org observation is not proof of every org's external File sharing behavior.

## Coordination

The public review owns the forged agreement-status/PDF-reference discriminator finding and submission/price-validation defects. The async review owns finalizer failure isolation, queue chaining and processing concurrency. Those root causes are not duplicated in this report. No superficial form wording or stylistic findings were included.

## Final embedded-viewer check

The replacement in `nteAgreementViewer.js:12`, `nteAgreementViewer.js:24` and `nteAgreementViewer.html:11` was inspected after implementation. **No new high-priority regression was established by source review.**

- Lightning Data Service reads only the status, processing error and stored PDF version. Previous-record state is cleared on each wire response, including an access error. It introduces no Apex read endpoint or broad system-mode File query.
- The iframe uses a strictly validated 068 ContentVersion ID and `/sfc/servlet.shepherd/version/download/…#view=FitH`. It therefore continues to display the version that was saved and emailed, rather than a subsequently uploaded version of the same ContentDocument.
- The direct link is labelled **Open PDF**, with `target="_blank"` and `rel="noopener"`. Download and print are supplied by the embedded browser PDF toolbar. There is no unsupported cross-origin `download`-attribute promise.
- Error details and the existing permission-gated retry remain available. The change removes the separate vector/details UI without changing or deleting the retained evidence fields, signing workflow or stored Files. It adds no PDF library, public share or external document endpoint.

Actual iframe rendering, toolbar download and the `.pdf → Execute in Browser` setting are being verified separately by the parent in Megistos. This source review does **not** assert those live checks passed. Non-administrator File/iframe access and browsers that disable embedded PDF viewing remain unverified acceptance cases; the administrator's earlier standalone-vector check does not cover them. The inherited forged-record/PDF-association concern remains part of the public review's existing discriminator finding, not a newly introduced iframe regression.
