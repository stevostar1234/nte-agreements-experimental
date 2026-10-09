// This isolated review has no Salesforce endpoint, org ID, field IDs or upload link.
window.NTE_CONFIG = Object.freeze({
  mode: 'review', eventCodeOverride: 'NTE2027', eventCodeTimeZone: 'Europe/London',
  salesforceDateFormat: 'DMY', termsUrl: 'https://www.nationaltransitionevent.com/privacy',
  termsLinkLabel: 'NTE27 Privacy Policy',
  fieldLimits: {
    Booking_Reference__c: 80, NTE_Event_Code__c: 20, Form_Version__c: 80,
    Sponsored_Name__c: 200, Invoiced_Company__c: 200, Invoice_Address__c: 1000,
    Invoiced_Person__c: 200, Invoiced_Email__c: 80, Invoice_Contact_Phone__c: 40,
    Trading_Name__c: 255, Invoice_Additional_Information__c: 32768,
    Purchase_Order_Number__c: 100, Event_Contact_Name__c: 200,
    Event_Contact_Title__c: 128, Event_Contact_Email__c: 80, Event_Contact_Mobile__c: 40,
    Stand_Equipment__c: 1000, Stand_Special_Requirements__c: 1000,
    Stand_Extra_Notes__c: 1000, Declaration_Name__c: 200
  }
});
