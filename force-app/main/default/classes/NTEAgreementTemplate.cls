/** Renders controlled HTML from the versioned, locally maintained agreement resource. */
public inherited sharing class NTEAgreementTemplate {
    public class AgreementException extends Exception {}
    public class EventDetails { public String code, name, eventDate, venue, organiser, noticeEmail, paperworkDeadline; }
    public class BenefitGroup { public String heading; public List<List<String>> items; }
    public class PackageDetails { public String name; public Decimal fee; public List<BenefitGroup> benefits; }
    public class Configuration {
        public Integer schemaVersion;
        public String version, resourceName, taxText, paymentText;
        public EventDetails event;
        public List<PackageDetails> packages;
    }
    public class Bundle { public Configuration config; public String template; }
    public class Evidence {
        public Integer schemaVersion;
        public Map<String, String> application;
        public String clientTime, receivedTime, signedTime, version, configHash, reference;
        public String html, vectorHash, pngHash, packageSummary, organisation, signatory, email;
        public Decimal totalFee;
        public Boolean authority, accepted;
    }
    private static Bundle cachedBundle;
    private static String cachedHash;

    /** Resolves the deployed version. A changed resource never silently replaces signed terms. */
    public static Bundle getBundle() {
        if (cachedBundle == null) {
            List<StaticResource> resources = [SELECT Body FROM StaticResource WHERE Name = 'NTEAgreementBundleV1' WITH SYSTEM_MODE LIMIT 1];
            if (resources.isEmpty()) { throw new AgreementException('Agreement configuration is unavailable.'); }
            cachedHash = NTEAgreementSignature.sha256(resources[0].Body);
            cachedBundle = (Bundle)JSON.deserializeStrict(resources[0].Body.toString(), Bundle.class);
            if (cachedBundle.config.schemaVersion != 1) { throw new AgreementException('Agreement configuration version is unsupported.'); }
        }
        return cachedBundle;
    }

    /** Hash of the exact resource also distributed with the public form. */
    public static String getConfigHash() { getBundle(); return cachedHash; }

    /** Validates submitted selections, recalculates the fee and freezes the displayed agreement. */
    public static Evidence completeEvidence(Lead applicant) {
        Evidence evidence = (Evidence)JSON.deserializeStrict(applicant.Agreement_Snapshot__c, Evidence.class);
        Bundle bundle = getBundle();
        Configuration config = bundle.config;
        if (evidence.schemaVersion != 1 || evidence.version != config.version || evidence.configHash != getConfigHash() ||
            evidence.application.get('NTE_Event_Code__c') != config.event.code) {
            throw new AgreementException('The agreement version has changed. A new form submission is required.');
        }
        if (evidence.authority != true || evidence.accepted != true || evidence.application.get('Terms_and_Conditions__c') != 'true') {
            throw new AgreementException('Authority and agreement acceptance are required.');
        }
        evidence.organisation = requiredValue(evidence, 'Invoiced_Company__c');
        evidence.signatory = requiredValue(evidence, 'Declaration_Name__c');
        evidence.email = requiredValue(evidence, 'Email');
        requiredValue(evidence, 'Company');
        requiredValue(evidence, 'Invoice_Address__c');
        if (!Pattern.matches('[^\\s@<>]+@[^\\s@<>]+\\.[^\\s@<>]+', evidence.email)) {
            throw new AgreementException('The applicant email address is invalid.');
        }
        if (!Pattern.matches('NTE-[0-9]{13}-[A-Z2-9]{8}', evidence.reference ?? '')) {
            throw new AgreementException('The application reference is invalid.');
        }
        if (!Pattern.matches('\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z', evidence.clientTime ?? '')) {
            throw new AgreementException('The signing timestamp is invalid.');
        }
        Datetime signedAt = Datetime.valueOfGmt(evidence.clientTime.substring(0, 19).replace('T', ' '));
        Datetime receivedAt = applicant.Agreement_Received_At__c;
        if (signedAt > receivedAt.addMinutes(10) || signedAt < receivedAt.addDays(-1)) {
            throw new AgreementException('The signing timestamp is outside the permitted submission window.');
        }
        applicant.Agreement_Signed_At__c = signedAt;
        evidence.signedTime = signedAt.format('d MMMM yyyy, HH:mm:ss z', 'Europe/London');
        Set<String> selected = new Set<String>(requiredValue(evidence, 'Sponsor_Package__c').split(';'));
        List<String> names = new List<String>();
        String schedule = '';
        Decimal total = 0;
        for (PackageDetails pack : config.packages) {
            if (!selected.contains(pack.name)) { continue; }
            selected.remove(pack.name);
            names.add(pack.name);
            total += pack.fee;
            schedule += '<div class="package"><h3>' + escape(pack.name) + ' — ' + money(pack.fee) + '</h3>';
            if (pack.benefits == null || pack.benefits.isEmpty()) {
                schedule += '<p><strong>Benefits</strong></p><div class="blank-schedule">&#160;<br/>&#160;<br/>&#160;</div>';
            } else {
                for (BenefitGroup groupItem : pack.benefits) {
                    schedule += '<h4>' + escape(groupItem.heading) + '</h4><table class="benefits">';
                    for (List<String> item : groupItem.items) {
                        schedule += '<tr><td>' + escape(item[0]) + '</td><td>' + escape(item[1]) + '</td></tr>';
                    }
                    schedule += '</table>';
                }
            }
            schedule += '</div>';
        }
        if (!selected.isEmpty() || names.isEmpty()) { throw new AgreementException('The selected package is not available.'); }
        if (Decimal.valueOf(requiredValue(evidence, 'Sponsor_Package_Total__c')) != total ||
            Decimal.valueOf(requiredValue(evidence, 'Listed_Price_Total__c')) != total) {
            throw new AgreementException('The submitted fee does not match the selected packages.');
        }
        evidence.totalFee = total;
        evidence.packageSummary = String.join(names, ', ');
        Map<String, String> values = new Map<String, String>{
            'eventName' => config.event.name, 'packageTitle' => names.size() == 1 ? names[0] : 'Partner and Sponsor',
            'organiser' => config.event.organiser, 'organisation' => evidence.organisation,
            'address' => requiredValue(evidence, 'Invoice_Address__c'), 'eventCode' => config.event.code,
            'eventDate' => displayDate(config.event.eventDate), 'venue' => config.event.venue, 'signatory' => evidence.signatory,
            'email' => evidence.email, 'noticeEmail' => config.event.noticeEmail, 'fee' => money(total),
            'taxText' => config.taxText, 'paymentText' => config.paymentText, 'version' => evidence.version,
            'reference' => evidence.reference, 'signedAt' => evidence.signedTime
        };
        String html = bundle.template;
        for (String key : values.keySet()) { html = html.replace('{{' + key + '}}', escape(values.get(key)).replace('\n', '<br/>')); }
        html = html.replace('{{packages}}', schedule);
        html = html.replace('{{deadline}}', String.isBlank(config.event.paperworkDeadline) ? '' :
            '<p>Paperwork and payment (or a purchase order number) are required by ' + escape(displayDate(config.event.paperworkDeadline)) + '.</p>');
        // These two controlled placeholders are replaced only by the server when the file exists.
        evidence.html = html;
        return evidence;
    }

    private static String requiredValue(Evidence evidence, String key) {
        String value = evidence.application.get(key);
        if (String.isBlank(value)) { throw new AgreementException('A required agreement field is missing: ' + key + '.'); }
        return value.trim();
    }

    /** Escapes all applicant-provided values before HTML or PDF interpolation. */
    public static String escape(String value) {
        return (value ?? '').replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
            .replace('"', '&quot;').replace('\'', '&#39;').replace('{', '&#123;').replace('}', '&#125;');
    }

    /** Formats a known GBP amount independently of the running user's currency locale. */
    public static String money(Decimal amount) {
        String raw = String.valueOf(amount.setScale(2));
        List<String> parts = raw.split('\\.');
        String whole = parts[0], grouped = '';
        while (whole.length() > 3) { grouped = ',' + whole.right(3) + grouped; whole = whole.left(whole.length() - 3); }
        return '£' + whole + grouped + '.' + (parts.size() == 2 ? parts[1] : '00');
    }

    private static String displayDate(String value) {
        Date dateValue = Date.valueOf(value);
        return Datetime.newInstanceGmt(dateValue.year(), dateValue.month(), dateValue.day(), 12, 0, 0).format('d MMMM yyyy', 'Europe/London');
    }
}
