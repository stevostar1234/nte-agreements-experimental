import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const publicRoot = path.join(root, 'public');
const experiment = '/experiments/delivery-partners/';
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); }
catch {
  const bundled = process.env.NTE_BROWSER_NODE_MODULES || path.join(process.env.USERPROFILE || '', '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules');
  try { playwright = require(path.join(bundled, 'playwright')); } catch {}
}

test('delivery experiment is isolated, keeps the latest package catalogue and has no submission transport', () => {
  const html = fs.readFileSync(path.join(publicRoot, experiment, 'partner-sponsor-application.html'), 'utf8');
  const forms = fs.readFileSync(path.join(publicRoot, experiment, 'assets/forms.js'), 'utf8');
  const config = fs.readFileSync(path.join(publicRoot, experiment, 'assets/config.js'), 'utf8');
  assert.match(html, /form-action 'none'/);
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /type="submit" disabled/);
  assert.equal((html.match(/data-package-price=/g) || []).length, 11);
  assert.match(html, /value="Headline Partner" data-package-price="20000"/);
  assert.match(html, /value="Auditorium Sponsor" data-package-price="6000"/);
  assert.doesNotMatch(html, /data-signature-pad|email-preview-panel|<input[^>]+value="Delivery Partner"/);
  assert.doesNotMatch(forms, /submitToSalesforce|postForm|XMLHttpRequest|fetch\(/);
  assert.doesNotMatch(config, /00D[A-Za-z0-9]{12}|00N[A-Za-z0-9]{12}|salesforce\.com|sharepoint\.com/);
  assert.match(forms, /window\.NTEPartnerReview\.show\(form, grouped\)/);
  assert.equal(fs.readFileSync(path.join(publicRoot, experiment, 'assets/styles.css'), 'utf8'),
    fs.readFileSync(path.join(root, 'reference/delivery-partners-20261009/styles.css'), 'utf8'));
});

test('delivery and paid journeys work in a real browser without transmitting data', {skip: !playwright, timeout: 120000}, async t => {
  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = path.resolve(publicRoot, '.' + pathname + (pathname.endsWith('/') ? 'index.html' : ''));
    if (!file.startsWith(publicRoot + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      response.writeHead(404); response.end(); return;
    }
    const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png'};
    response.writeHead(200, {'Content-Type': mime[path.extname(file)] || 'application/octet-stream'});
    fs.createReadStream(file).pipe(response);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port + experiment;
  const browser = await playwright.chromium.launch({headless: true, channel: process.env.NTE_BROWSER_CHANNEL || (process.platform === 'win32' ? 'chrome' : undefined)}).catch(error => { server.close(); throw error; });
  const artifacts = path.join(root, 'artifacts/delivery-review');
  fs.mkdirSync(artifacts, {recursive: true});
  const cases = [];
  const context = await browser.newContext({viewport: {width: 1366, height: 1000}});
  const page = await context.newPage();
  const errors = [], posts = [], dataRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (request.method() === 'POST') posts.push(request.url());
    if (['fetch','xhr','beacon'].includes(request.resourceType())) dataRequests.push(request.url());
  });
  async function open(query = '') {
    await page.goto(base + 'partner-sponsor-application.html' + query);
    await page.waitForFunction(() => !!window.NTEFormUtils && !document.querySelector('[data-loading]').hidden === false);
  }
  async function fillCommon({separateContact = false, accessibility = false} = {}) {
    const values = {
      '#partner-company': 'Example & Sons <Review> Ltd', '#partner-first-name': 'Alex',
      '#partner-last-name': 'O’Example', '#partner-title': 'Coordinator',
      '#partner-email': 'alex@example.com', '#partner-phone': '07700 900123',
      '#partner-equipment': 'None', '#partner-planned-count': '3',
      '#partner-extra-notes': '<img src=x onerror=alert(1)> stays plain text',
      '#partner-declaration-name': 'Alex O’Example'
    };
    for (const [selector, value] of Object.entries(values)) await page.locator(selector).fill(value);
    const selects = {
      '#partner-day-contact-same': separateContact ? 'No' : 'Yes', '#partner-sunday': 'Yes',
      '#partner-power': 'No', '#partner-heavy-vehicle': 'Not known yet',
      '#partner-accessibility': accessibility ? 'Yes' : 'No'
    };
    for (const [selector, value] of Object.entries(selects)) await page.locator(selector).selectOption(value);
    await page.locator('#partner-terms').check();
  }
  async function capturePayload() {
    await page.evaluate(() => {
      const original = window.NTEPartnerReview;
      window.NTEPartnerReview = Object.freeze({...original, show(form, grouped) {
        window.__reviewPayload = grouped;
        original.show(form, grouped);
      }});
    });
  }
  async function checkNoOverflow() {
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
  }
  async function caseRun(name, fn) {
    await t.test(name, fn);
    cases.push(name);
  }

  try {
    await caseRun('public route uses all eleven current packages and shows no delivery option', async () => {
      await open();
      assert.equal(await page.locator('[data-package-price]').count(), 11);
      assert.equal(await page.locator('[data-billing-section]').isVisible(), true);
      assert.doesNotMatch(await page.locator('form').innerText(), /Delivery partner|Delivery Partner/);
      await checkNoOverflow();
      await page.screenshot({path: path.join(artifacts, 'public-desktop.png'), fullPage: true});
    });
    await caseRun('paid application enforces a selected package and conditional finance fields', async () => {
      await fillCommon();
      await page.getByRole('button', {name: 'Review application', exact: true}).click();
      assert.match(await page.locator('[data-form-status]').innerText(), /select at least one package/i);
      await page.locator('[value="Headline Partner"]').check();
      await page.locator('[value="Auditorium Sponsor"]').check();
      assert.match(await page.locator('[data-package-total]').innerText(), /£31,200\.00 including VAT/);
      await page.locator('#partner-quote').selectOption('No');
      await page.locator('#partner-po').selectOption('Yes');
      await page.locator('#partner-supplier-agreement').selectOption('No');
      await page.locator('#partner-invoice-company').fill('Example Legal Ltd');
      await page.locator('#partner-invoice-address').fill('1 Example Street, London, SW1A 1AA');
      await page.locator('#partner-invoice-person').fill('Taylor Example');
      await page.locator('#partner-invoice-email').fill('finance@example.com');
      await page.locator('#partner-invoice-phone').fill('07700 900456');
      await page.locator('#partner-invoice-additional-required').selectOption('No');
      await page.getByRole('button', {name: 'Review application', exact: true}).click();
      assert.equal(await page.locator('[data-application-review]').isVisible(), false);
      assert.equal(await page.locator('#partner-po-number').evaluate(node => node.required), true);
      await page.locator('#partner-po-number').fill('EXAMPLE-PO-1');
      await capturePayload();
      await page.getByRole('button', {name: 'Review application', exact: true}).click();
      assert.equal(await page.locator('[data-application-review]').isVisible(), true);
      const payload = await page.evaluate(() => window.__reviewPayload);
      assert.deepEqual(payload.Sponsor_Package__c, ['Headline Partner', 'Auditorium Sponsor']);
      assert.deepEqual(payload.Listed_Price_Total__c, ['26000']);
      assert.deepEqual(payload.Invoice_Required__c, ['Yes']);
      assert.deepEqual(payload.Invoice_Requested__c, ['Yes']);
      assert.deepEqual(payload.Payment_Method__c, ['Manual']);
      assert.match(await page.locator('[data-review-summary]').innerText(), /£31,200\.00/);
      assert.equal(await page.locator('[data-review-summary] img').count(), 0);
      assert.equal(new URL(page.url()).search, '');
      await page.getByRole('button', {name: 'Edit details'}).click();
      assert.equal(await page.locator('#partner-invoice-company').inputValue(), 'Example Legal Ltd');
    });
    await caseRun('delivery route removes packages, prices and billing, and keeps numbering consecutive', async () => {
      await open('?partner=delivery');
      assert.equal(await page.locator('.hero h1').innerText(), 'Delivery partner application');
      assert.equal(await page.locator('[data-package-section], [data-billing-section], [data-package-price]').count(), 0);
      assert.deepEqual(await page.locator('.section-number').allTextContents(), ['1','2','3']);
      assert.doesNotMatch(await page.locator('form').innerText(), /£|VAT|quotation|invoice|billing/i);
      assert.equal(await page.locator('[data-sf-field="Sponsor_Package__c"]').inputValue(), 'Delivery Partner');
      await page.evaluate(() => window.dispatchEvent(new Event('pageshow')));
      assert.equal(await page.locator('[data-sf-field="Invoice_Requested__c"]').inputValue(), 'No');
      await checkNoOverflow();
      await page.screenshot({path: path.join(artifacts, 'delivery-desktop.png'), fullPage: true});
    });
    await caseRun('delivery required details, separate contact and accessibility rules remain enforced', async () => {
      await fillCommon({separateContact:true, accessibility:true});
      await page.getByRole('button', {name: 'Review application', exact: true}).click();
      assert.equal(await page.locator('[data-application-review]').isVisible(), false);
      for (const [selector, value] of Object.entries({
        '#partner-day-first-name':'Sam', '#partner-day-last-name':'Example', '#partner-day-title':'Event lead',
        '#partner-day-email':'sam@example.com', '#partner-day-mobile':'07700 900789',
        '#partner-accessibility-details':'Step-free access'
      })) await page.locator(selector).fill(value);
      await capturePayload();
      await page.getByRole('button', {name: 'Review application', exact: true}).click();
      assert.equal(await page.locator('[data-application-review]').isVisible(), true);
      const payload = await page.evaluate(() => window.__reviewPayload);
      assert.deepEqual(payload.Web_Form_Type__c, ['Partner / Sponsor Application']);
      assert.deepEqual(payload.Sponsor_Package__c, ['Delivery Partner']);
      assert.deepEqual(payload.Invoice_Required__c, ['No']);
      assert.deepEqual(payload.Invoice_Requested__c, ['No']);
      assert.deepEqual(payload.Listed_Price_Total__c, ['0']);
      assert.deepEqual(payload.Event_Contact_Name__c, ['Sam Example']);
      assert.deepEqual(payload.Event_Contact_Email__c, ['sam@example.com']);
      assert.deepEqual(payload.Stand_Special_Requirements__c, ['Step-free access']);
      assert.equal(Object.keys(payload).some(key => /^Invoiced_|^Invoice_Address|^Invoice_Contact|^Invoice_Additional|^Quote_|^Purchase_Order|^Payment_Method|^Supplier_Agreement/.test(key)), false);
      assert.doesNotMatch(await page.locator('[data-review-summary]').innerText(), /invoice|£|VAT/i);
      assert.equal(await page.locator('[data-review-summary] img').count(), 0);
      await page.screenshot({path: path.join(artifacts, 'delivery-summary.png'), fullPage: true});
      await page.getByRole('button', {name: 'Edit details'}).click();
      await page.locator('#partner-day-contact-same').selectOption('Yes');
      await page.locator('#partner-accessibility').selectOption('No');
      await page.getByRole('button', {name: 'Review application', exact: true}).click();
      const edited = await page.evaluate(() => window.__reviewPayload);
      assert.deepEqual(edited.Event_Contact_Name__c, ['Alex O’Example']);
      assert.equal(edited.Stand_Special_Requirements__c, undefined);
      assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
    });
    await caseRun('unknown and duplicate routing values fail closed without reflecting input', async () => {
      for (const query of ['?partner=', '?partner=paid', '?partner=Delivery', '?partner=delivery&partner=delivery', '?partner=%3Cimg%20src=x%3E']) {
        await open(query);
        assert.equal(await page.locator('form').isVisible(), false);
        assert.equal(await page.locator('[data-link-error]').isVisible(), true);
      }
      await open('?utm_source=review&partner=delivery&company=Ignored');
      assert.equal(await page.locator('#partner-company').inputValue(), '');
      assert.equal(await page.locator('form').isVisible(), true);
    });
    await caseRun('both journeys and review hub fit small screens', async () => {
      for (const width of [320, 390, 768]) {
        await page.setViewportSize({width,height:844});
        for (const query of ['', '?partner=delivery']) {
          await open(query); await checkNoOverflow();
          if (width === 390) await page.screenshot({path:path.join(artifacts, query ? 'delivery-mobile.png' : 'public-mobile.png'),fullPage:true});
        }
        await page.goto(base); await checkNoOverflow();
        if (width === 390) await page.screenshot({path:path.join(artifacts, 'hub-mobile.png'),fullPage:true});
      }
      await page.setViewportSize({width:1366,height:1000});
      await page.goto(base);
      await page.screenshot({path:path.join(artifacts, 'hub-desktop.png'),fullPage:true});
    });
    await caseRun('script failure and disabled JavaScript cannot expose or submit a partial form', async () => {
      const failed = await context.newPage();
      await failed.route('**/assets/forms.js*', route => route.abort());
      await failed.goto(base + 'partner-sponsor-application.html?partner=delivery');
      assert.equal(await failed.locator('form').isVisible(), false);
      assert.equal(await failed.locator('[type="submit"]').isDisabled(), true);
      await failed.close();
      const noJS = await browser.newContext({javaScriptEnabled:false});
      const pageNoJS = await noJS.newPage();
      await pageNoJS.goto(base + 'partner-sponsor-application.html?partner=delivery');
      assert.equal(await pageNoJS.locator('form').isVisible(), false);
      assert.match(await pageNoJS.locator('noscript').innerText(), /enable JavaScript/);
      await noJS.close();
    });
    assert.deepEqual(errors, []);
    assert.deepEqual(posts, []);
    assert.deepEqual(dataRequests, []);
    fs.writeFileSync(path.join(artifacts, 'browser-results.json'), JSON.stringify({cases, runtimeErrors:errors, postRequests:posts, dataRequests}, null, 2));
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});
