# Salesforce metadata inventory

All components below were added to Megistos for this workflow. Existing standard Lead fields are reused. No suitable existing agreement fields were present; the original form's 48 custom mappings therefore also required fields in this org.

## Agreement and signature fields (19)

| API name | Label | Type / limit | Notes |
| --- | --- | --- | --- |
| `Agreement_Accepted__c` | Agreement Accepted | Checkbox |  |
| `Agreement_Attempts__c` | Agreement Processing Attempts | Number |  |
| `Agreement_Authority__c` | Authority Confirmed | Checkbox |  |
| `Agreement_Client_Time__c` | Browser Signing Time | Text, 30 characters | Optional untrusted clock claim; not a processing gate |
| `Agreement_Config_Hash__c` | Agreement Configuration Hash | Text, 64 characters |  |
| `Agreement_Email_Sent_At__c` | Agreement Email Sent At | DateTime |  |
| `Agreement_Error__c` | Agreement Processing Error | LongTextArea, 4000 characters |  |
| `Agreement_Job_Id__c` | Agreement Processing Job | Text, 18 characters |  |
| `Agreement_PDF_File__c` | Agreement PDF File Version | Text, 18 characters | ContentVersion ID |
| `Agreement_PDF_SHA256__c` | Agreement PDF SHA256 | Text, 64 characters |  |
| `Agreement_Received_At__c` | Agreement Received At | DateTime |  |
| `Agreement_SHA256__c` | Agreement Evidence SHA256 | Text, 64 characters |  |
| `Agreement_Signature_File__c` | Signature File Version | Text, 18 characters | ContentVersion ID |
| `Agreement_Signed_At__c` | Signed At | DateTime | Salesforce receipt time |
| `Agreement_Snapshot__c` | Signed Agreement Snapshot | LongTextArea, 131072 characters | Frozen application, HTML and evidence |
| `Agreement_Status__c` | Agreement Status | Picklist |  |
| `Agreement_Version__c` | Agreement Version | Text, 80 characters |  |
| `Signature_PNG_Base64__c` | Signature PNG Transport | LongTextArea, 131072 characters | Temporary; cleared after File creation |
| `Signature_Vector__c` | Signature Vector | LongTextArea, 131072 characters | Permanent versioned vector master |

## Existing form mappings created in Megistos (48)

| API name | Label | Type / limit | Notes |
| --- | --- | --- | --- |
| `Additional_Staff_Count__c` | Additional Staff Count | Number |  |
| `Additional_Staff_Required__c` | Additional Staff Required | Text, 255 characters |  |
| `Additional_Staff_Total__c` | Additional Staff Total | Currency |  |
| `Additional_Staff_Unit_Price__c` | Additional Staff Unit Price | Currency |  |
| `Booking_Reference__c` | Booking Reference | Text, 80 characters | Unique, case-insensitive external reference |
| `Declaration_Date__c` | Declaration Date | Date |  |
| `Declaration_Name__c` | Declaration Name | Text, 200 characters |  |
| `Event_Contact_Email__c` | Event Contact Email | Email, 80 characters |  |
| `Event_Contact_Mobile__c` | Event Contact Mobile | Phone, 40 characters |  |
| `Event_Contact_Name__c` | Event Contact Name | Text, 200 characters |  |
| `Event_Contact_Title__c` | Event Contact Title | Text, 128 characters |  |
| `Exhibitor_Hall_Schedule__c` | Exhibitor Hall Schedule | Text, 255 characters |  |
| `Exhibitor_Space_Price__c` | Exhibitor Space Price | Currency |  |
| `Form_Version__c` | Form Version | Text, 80 characters |  |
| `Has_Special_Requirements__c` | Has Special Requirements | Text, 255 characters |  |
| `Heavy_Vehicle_Required__c` | Heavy Vehicle Required | Text, 255 characters |  |
| `Included_Staff_Count__c` | Included Staff Count | Number |  |
| `Invoice_Additional_Information__c` | Invoice Additional Information | LongTextArea, 32768 characters |  |
| `Invoice_Address__c` | Invoice Address | LongTextArea, 1024 characters |  |
| `Invoice_Contact_Phone__c` | Invoice Contact Phone | Phone, 40 characters |  |
| `Invoice_Required__c` | Invoice Required | Text, 255 characters |  |
| `Invoiced_Company__c` | Invoiced Company | Text, 200 characters |  |
| `Invoiced_Email__c` | Invoiced Email | Email, 80 characters |  |
| `Invoiced_Person__c` | Invoiced Person | Text, 200 characters |  |
| `Listed_Price_Total__c` | Listed Price Total | Currency |  |
| `Logo_Upload_URL__c` | Logo Upload URL | Text, 255 characters |  |
| `NTE_Event_Code__c` | NTE Event Code | Text, 20 characters |  |
| `Payment_Method__c` | Payment Method | Text, 255 characters |  |
| `Planned_Exhibitor_Count__c` | Planned Exhibitor Count | Number |  |
| `Power_Socket_Total__c` | Power Socket Total | Currency |  |
| `Power_Socket_Unit_Price__c` | Power Socket Unit Price | Currency |  |
| `Pricing_Status__c` | Pricing Status | Text, 255 characters |  |
| `Pricing_Version__c` | Pricing Version | Text, 255 characters |  |
| `Purchase_Order__c` | Purchase Order | Text, 255 characters |  |
| `Purchase_Order_Number__c` | Purchase Order Number | Text, 100 characters |  |
| `Quote_Required_for_PO__c` | Quote Required for PO | Text, 255 characters |  |
| `Sponsor_Package__c` | Sponsor Package | MultiselectPicklist |  |
| `Sponsor_Package_Total__c` | Sponsor Package Total | Currency |  |
| `Sponsored_Name__c` | Sponsored Name | Text, 200 characters |  |
| `Stand_Equipment__c` | Stand Equipment | LongTextArea, 1024 characters |  |
| `Stand_Extra_Notes__c` | Stand Extra Notes | LongTextArea, 1024 characters |  |
| `Stand_Power__c` | Stand Power | Text, 255 characters |  |
| `Stand_Special_Requirements__c` | Stand Special Requirements | LongTextArea, 1024 characters |  |
| `Supplier_Agreement_Required__c` | Supplier Agreement Required | Text, 255 characters |  |
| `Terms_and_Conditions__c` | Terms and Conditions | Checkbox |  |
| `Total_Staff_Count__c` | Total Staff Count | Number |  |
| `Trading_Name__c` | Trading Name | Text, 255 characters |  |
| `Web_Form_Type__c` | Web Form Type | Text, 255 characters |  |

## Standard Lead fields reused

Company, FirstName, LastName, Title, Email and Phone retain their existing meanings. The signed organisation comes from Invoiced_Company__c, the signatory from Declaration_Name__c and delivery from the frozen main contact Email.

## Other component API names

| Metadata type | Components |
| --- | --- |
| ApexClass | `NTEAgreementAcceptanceTest`, `NTEAgreementController`, `NTEAgreementFields`, `NTEAgreementFinalizer`, `NTEAgreementGateway`, `NTEAgreementLeadHandler`, `NTEAgreementOperationsTest`, `NTEAgreementPresentationTest`, `NTEAgreementSignature`, `NTEAgreementSignatureTest`, `NTEAgreementTemplate`, `NTEAgreementTestDataFactory`, `NTEAgreementWorker`, `NTEAgreementWorkflowTest` |
| ApexTrigger | `NTEAgreementLead` |
| LightningComponentBundle | `nteAgreementViewer`, `nteSignatureGeometry` |
| PermissionSet | `NTE_Agreement_Operator`, `NTE_Agreement_Viewer` |
| CustomPermission | `NTE_Agreement_Operate` |
| StaticResource | `NTEAgreementBundleV1`, `NTEAgreementEmail` |
| FlexiPage | `NTE_Agreement_Record` |
| CustomApplication | `NTE_Agreements` |

**Portable package total: 91 components.**

## Existing metadata changed

`Lead-Lead Layout` gained only the Files related list (`RelatedFileList`). The applied Megistos-specific overlay and its baseline are retained privately outside this repository because they contain unrelated Megistos managed-package references. Merge Files into a future target layout rather than deploying this overlay there.

## Evidence and permissions

The trigger protects the agreement fields and the booking reference, legal name and declaration date once evidence exists. Normal Lead contact/business fields remain editable, but those edits do not rewrite the frozen signed document. Viewer/Operator access is limited by existing record access. Retry additionally requires `NTE_Agreement_Operate`. Neither permission set grants View All, Modify All or deletion rights.

The approved Megistos test user received `NTE_Agreement_Operator`. No profile-wide permissions or guest Apex access were added.
