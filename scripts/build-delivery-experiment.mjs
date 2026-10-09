import fs from 'node:fs';
import {createHash} from 'node:crypto';

const root = new URL('../', import.meta.url);
const source = 'reference/delivery-partners-20261009/';
const output = 'public/experiments/delivery-partners/';
const read = path => fs.readFileSync(new URL(path, root), 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
const write = (path, text) => {
  const url = new URL(path, root);
  fs.mkdirSync(new URL('.', url), {recursive: true});
  fs.writeFileSync(url, text);
};
function replaceOnce(text, before, after) {
  if (text.split(before).length !== 2) throw new Error('Upstream structure changed: ' + before.slice(0, 90));
  return text.replace(before, after);
}

let html = read(source + 'partner-sponsor-application.html');
html = replaceOnce(html, '<title>NTE27 Partner / Sponsor Application</title>', [
  '<title>NTE27 Partner / Sponsor Application</title>',
  '<meta name="robots" content="noindex, nofollow">',
  '<meta name="referrer" content="no-referrer">',
  '<meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\'; style-src \'self\' \'unsafe-inline\' https://fonts.googleapis.com; font-src \'self\' https://fonts.gstatic.com; img-src \'self\' data:; connect-src \'none\'; form-action \'none\'; object-src \'none\'; base-uri \'none\'">',
  '<link rel="stylesheet" href="assets/review.css?v=20261009-1">'
].join('\n  '));
html = html.replace(/<form class="main-column"[^>]*>/, '<form class="main-column" data-web-to-lead data-lead-source="Customer Event" data-use-default-rule="0" aria-label="Partner application" hidden>');
html = replaceOnce(html, 'partner-sponsor-application-v13', 'partner-routing-review-v1');
html = replaceOnce(html, '<section class="card">\n        <h2 id="partner-packages-heading">', '<section class="card" data-package-section>\n        <h2 id="partner-packages-heading">');
html = replaceOnce(html, '<section class="card">\n        <h2><span class="section-number">4</span>Billing details', '<section class="card" data-billing-section>\n        <h2><span class="section-number">4</span>Billing details');
html = replaceOnce(html, '<main class="page-shell">', '<main class="page-shell">\n' + read('scripts/delivery-review-shell.html'));
html = html.replace(/\s*<section class="email-preview-panel"[\s\S]*?<\/section>/, '');
html = replaceOnce(html, '<button class="button" type="submit">Submit partner / sponsor application</button>', '<button class="button" type="submit" disabled>Review application</button>');
html = html.replace(/<script src="assets\/config\.js[^<]*<\/script><script src="assets\/forms\.js[^<]*<\/script>/,
  '<script src="assets/config.js?v=20261009-1"></script><script src="assets/review.js?v=20261009-1"></script><script src="assets/forms.js?v=20261009-1"></script><script src="assets/ready.js?v=20261009-1"></script>');
write(output + 'partner-sponsor-application.html', html);

let forms = read(source + 'forms.js');
const transportStart = forms.indexOf('  function submitToSalesforce(form, grouped) {');
const transportEnd = forms.indexOf('  function syncFormState(form) {', transportStart);
if (transportStart < 0 || transportEnd < 0) throw new Error('Upstream transport not found.');
forms = forms.slice(0, transportStart) + forms.slice(transportEnd);
const submitStart = forms.indexOf('        var missing = missingFieldIds(grouped);');
const submitEnd = forms.indexOf('      });\n      function changed()', submitStart);
if (submitStart < 0 || submitEnd < 0) throw new Error('Upstream submission handler not found.');
forms = forms.slice(0, submitStart) + '        window.NTEPartnerReview.show(form, grouped);\n' + forms.slice(submitEnd);
forms = replaceOnce(forms, '    if (logoField) logoField.value = config.logoFileRequestUrl || "";',
  '    if (logoField) logoField.value = config.logoFileRequestUrl || "";\n    window.NTEPartnerReview.applyRoute(form);');
if (/postForm\.submit|submitToSalesforce\(|fetch\(|XMLHttpRequest/.test(forms)) throw new Error('Network submission remains in review code.');
write(output + 'assets/forms.js', forms);
for (const name of ['styles.css', 'nte-logo-white.png']) {
  fs.copyFileSync(new URL(source + name, root), new URL(output + 'assets/' + name, root));
}
write(output + 'assets/ready.js', 'if (window.NTEFormUtils && window.NTEPartnerReview) window.NTEPartnerReview.ready();\n');
console.log(JSON.stringify({experiment: output, sourceCommit: '48f850b85ae7643be6657e0045e1c15391e7e944',
  sourceFormSha256: createHash('sha256').update(read(source + 'partner-sponsor-application.html')).digest('hex'),
  transport: 'browser review only'}));
