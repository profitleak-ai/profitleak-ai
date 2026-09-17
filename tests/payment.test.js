/* =============================================================
   ProfitLeak AI — on-site checkout license tests (v1.10)
   PL-… keys are HMAC keys issued by the Netlify endpoint.
   1) Unit: PL- keys go to the SITE endpoint (never Gumroad),
      valid keys activate Pro, invalid keys fail with a reason,
      Gumroad-format keys still use the Gumroad flow.
   2) App journey (jsdom, deployment artifact): pasting a PL- key
      on the pricing page activates Pro.
   Network calls are mocked — no real requests.
   ============================================================= */
'use strict';

let jsdom;
try { jsdom = require('jsdom'); } catch (e) {
  console.log('  ! jsdom is not installed — payment test skipped.');
  process.exit(0);
}

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const License = require('../js/license.js');
const { JSDOM, VirtualConsole } = jsdom;

const ROOT = path.join(__dirname, '..');
const STANDALONE = fs.readFileSync(path.join(ROOT, 'ProfitLeak-AI.html'), 'utf-8');
const tick = ms => new Promise(r => setTimeout(r, ms || 70));

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  \u2713 ' + name); }
  catch (e) { failed++; console.error('  \u2717 ' + name + ' \u2014 ' + e.message); process.exitCode = 1; }
}
async function atest(name, fn) {
  try { await fn(); passed++; console.log('  \u2713 ' + name); }
  catch (e) { failed++; console.error('  \u2717 ' + name + ' \u2014 ' + e.message); process.exitCode = 1; }
}

const SITE_KEY = 'PL-A2C4-E5G7-K9PM-XXXXXX'; /* tag check is mocked server-side */
const realFetch = globalThis.fetch;

async function main() {
  License._setStoreConnection('TEST-PRODUCT-ID', 'https://teststore.example/l/profitleak-pro');
  License._reset();

  console.log('\nProfitLeak AI \u2014 on-site checkout (PL-) license tests\n');
  console.log('\u2500\u2500 1. Unit: PL- keys route to the site endpoint \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');

  let calls = [];
  globalThis.fetch = (url, opts) => {
    calls.push({ url: String(url), opts });
    if (String(url).includes('license-verify')) {
      const body = JSON.parse(opts.body);
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(
        body.key === SITE_KEY ? { success: true, product: 'profitleak-pro', email: 'site-checkout' }
                              : { success: false, reason: 'not recognized' }) });
    }
    return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({ success: false }) });
  };

  await atest('PL- key: activates via the site endpoint', async () => {
    const r = await License.activate('  ' + SITE_KEY.toLowerCase() + ' ');
    assert.ok(r.ok, r.reason);
    assert.equal(r.license.key, SITE_KEY);
    assert.equal(r.license.email, 'site-checkout');
  });
  test('PL- key: the Gumroad API was never called', () => {
    assert.ok(calls.length === 1);
    assert.ok(calls[0].url.includes('profitleak.netlify.app/.netlify/functions/license-verify'));
    assert.ok(!calls[0].url.includes('gumroad'));
  });
  calls = [];
  await atest('invalid PL- key: rejected with a clear reason', async () => {
    const r = await License.activate('PL-A2C4-E5G7-K9PM-BADTAG');
    assert.ok(!r.ok);
    assert.ok(r.reason.includes('not recognized'));
  });
  test('still returns to Free after deactivation', () => {
    License.deactivate();
    assert.ok(!License.isActive());
  });

  console.log('\n\u2500\u2500 2. App journey: PL- activation on the pricing page \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');

  const vc = new VirtualConsole();
  const pageErrors = [];
  vc.on('jsdomError', e => {
    const m = String((e && e.message) || e);
    if (!/^Not implemented:/i.test(m)) pageErrors.push(m);
  });

  /* auto-activation (v1.11): the checkout return page writes the license
     straight into localStorage — the app must boot into Pro with no key entry. */
  const domAuto = new JSDOM(STANDALONE, {
    runScripts: 'dangerously', pretendToBeVisual: true,
    url: 'https://profitleak.example/', virtualConsole: vc,
    beforeParse(window) {
      window.fetch = () => Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({ success: false }) });
      window.localStorage.setItem('profitleak.license.v1',
        JSON.stringify({ key: SITE_KEY, email: 'site-checkout', activatedAt: new Date().toISOString() }));
      window.localStorage.setItem('profitleak.trial.v1',
        JSON.stringify({ startedAt: Date.now() - 7200e3, lastActive: Date.now() - 7200e3 }));
    }
  });
  await tick(300);
  const wAuto = domAuto.window, dAuto = wAuto.document;
  wAuto.location.hash = '#/dashboard'; await tick(90);
  test('v1.11 auto-activation: stored PL- license boots straight into Pro (no key entry)', () => {
    assert.ok(dAuto.querySelector('#plan-nav .pro-badge'));
    assert.ok(dAuto.querySelector('#trial-overlay').hidden);
  });
  domAuto.window.close();

  /* v1.26: cross-domain instant activation — returning with ?key= in the URL */
  const domKey = new JSDOM(STANDALONE, {
    runScripts: 'dangerously', pretendToBeVisual: true,
    url: 'https://profitleak.example/?key=' + SITE_KEY.toLowerCase(),
    virtualConsole: vc,
    beforeParse(window) {
      window.fetch = (url) => {
        if (String(url).includes('license-verify')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, product: 'profitleak-pro', email: 'site-checkout' }) });
        }
        return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({ success: false }) });
      };
      window.localStorage.setItem('profitleak.trial.v1',
        JSON.stringify({ startedAt: Date.now() - 7200e3, lastActive: Date.now() - 7200e3 }));
    }
  });
  await tick(400);
  const wKey = domKey.window, dKey = wKey.document;
  test('v1.26 ?key= return: boots straight into Pro, URL cleaned, no pasting', () => {
    assert.ok(dKey.querySelector('#plan-nav .pro-badge'));
    assert.ok(String(wKey.location.search).indexOf('key=') === -1, 'URL cleaned');
  });
  domKey.window.close();

  /* v1.26: checkout-start carries the buyer origin + campaign through PayPal */
  let capturedBody = '';
  const realFetch = global.fetch;
  global.fetch = (u, opts) => {
    capturedBody = String((opts && opts.body) || '');
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ links: [{ rel: 'approve', href: 'https://www.paypal.com/checkoutnow?token=T26' }] }) });
  };
  const checkoutStart = require('/home/user/netlify-functions/checkout-start.js');
  const r302 = await checkoutStart.handler({
    httpMethod: 'GET',
    queryStringParameters: { method: 'paypal', plan: 'yearly', ref: 'tiktok' },
    headers: { referer: 'https://profitleakaii.qd.je/#/pricing' }
  });
  global.fetch = realFetch;
  test('checkout-start carries the buyer origin + campaign through PayPal (v1.26)', () => {
    assert.equal(r302.statusCode, 302);
    assert.ok(r302.headers.Location.includes('paypal.com'));
    assert.ok(capturedBody.includes(encodeURIComponent('https://profitleakaii.qd.je')));
    assert.ok(capturedBody.includes('ref=tiktok'));
  });

  const dom = new JSDOM(STANDALONE, {
    runScripts: 'dangerously', pretendToBeVisual: true,
    url: 'https://profitleak.example/', virtualConsole: vc,
    beforeParse(window) { window.fetch = (url, opts) => {
      if (String(url).includes('license-verify')) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ success: true, email: 'site-checkout' }) });
      }
      return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({ success: false }) });
    }; }
  });
  await tick(300);
  const w = dom.window, d = w.document;
  d.querySelector('#welcome-start').click(); await tick(60);
  w.location.hash = '#/pricing'; await tick(90);

  test('pricing page shows the on-site payment options', () => {
    const links = [...d.querySelectorAll('#pricing-body a[data-pay]')];
    assert.equal(links.length, 2);
    assert.ok(links[0].href.includes('checkout-start?method=paypal&plan=yearly'));
    assert.ok(links[1].href.includes('checkout-start?method=crypto&plan=yearly'));
    assert.ok(d.querySelector('#pricing-body a[href*="method=paypal&plan=monthly"]'), 'monthly option offered');
    assert.ok(!d.querySelector('#pricing-body a[href*="gumroad.com"]'), 'no Gumroad redirect');
  });

  d.getElementById('license-input').value = SITE_KEY;
  d.getElementById('license-activate-btn').click(); await tick(150);
  test('pasting a PL- key on the pricing page activates Pro', () => {
    assert.ok(d.querySelector('#plan-nav .pro-badge'));
    assert.ok(d.querySelector('#pricing-body').textContent.includes('Pro licensed'));
  });
  test('no unexpected page errors in the payment journey', () => {
    if (pageErrors.length) console.error('        page errors: ' + pageErrors.slice(0, 5).join(' | '));
    assert.equal(pageErrors.length, 0);
  });
  dom.window.close();
  globalThis.fetch = realFetch;

  console.log('\n\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');
  console.log('PAYMENT TESTS: ' + passed + ' passed, ' + failed + ' failed');
  console.log('\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');
  if (failed) process.exitCode = 1;
}

main().catch(e => { console.error('PAYMENT FATAL:', e && (e.stack || e)); process.exit(1); });
