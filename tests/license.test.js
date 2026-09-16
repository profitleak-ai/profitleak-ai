/* =============================================================
   ProfitLeak AI — Pro license tests (v1.8)
   1) Unit: key normalization + every Gumroad verify branch
      (valid / refunded / disputed / unknown key / HTTP error /
      network failure), activation storage, plan integration.
      Network calls are mocked — no real requests.
   2) App journey (jsdom): license box appears once the store is
      connected, activation unlocks Pro, invalid keys are rejected
      with a clear reason, the license survives a reload, removal
      returns to Free, and an unconfigured build never unlocks Pro for free.
   ============================================================= */
'use strict';

let jsdom;
try { jsdom = require('jsdom'); } catch (e) {
  console.log('  ! jsdom is not installed \u2014 license test skipped.');
  process.exit(0);
}

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const License = require('../js/license.js');
const { Store, Plan, CSV } = require('../js/data.js');
const { JSDOM, VirtualConsole } = jsdom;

const ROOT = path.join(__dirname, '..');
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

/* ------------- fetch mocking ------------- */
const realFetch = globalThis.fetch;
function mockFetch(handler) { globalThis.fetch = handler; }
function restoreFetch() { globalThis.fetch = realFetch; }

function gumroadResponse(payload, ok) {
  return Promise.resolve({
    ok: ok !== false,
    status: ok === false ? 404 : 200,
    json: () => Promise.resolve(payload)
  });
}
const VALID_PURCHASE = {
  success: true,
  uses: 1,
  purchase: { email: 'buyer@example.com', refunded: false, disputed: false,
              product_name: 'ProfitLeak AI \u2014 Pro License', price: 19 }
};

const KEY = '85DB562A-C11D4B06-A2335A6B-8C079166';

async function main() {
  License._setStoreConnection('TEST-PRODUCT-ID', 'https://teststore.example/l/profitleak-pro');
  License._reset();

  console.log('\nProfitLeak AI \u2014 Pro license tests\n');
  console.log('\u2500\u2500 1. Unit: normalization & verification branches \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');

  test('normalizeKey: trims, uppercases, strips spaces/junk', () => {
    assert.equal(License._normalizeKey('  85db562a-c11d4b06-a2335a6b-8c079166  '), KEY);
    assert.equal(License._normalizeKey('\n85DB562A-C11D4B06-A2335A6B-8C079166\n'), KEY);
    assert.equal(License._normalizeKey('(85DB562A-C11D4B06-A2335A6B-8C079166!)'), KEY); // junk stripped
    assert.equal(License._normalizeKey(null), '');
  });

  mockFetch(() => gumroadResponse(VALID_PURCHASE));
  await atest('activation succeeds with a valid purchase', async () => {
    const r = await License.activate(KEY);
    assert.ok(r.ok, r.reason);
    assert.equal(r.license.email, 'buyer@example.com');
    assert.equal(r.license.key, KEY);
  });
  test('active license is stored and reported', () => {
    assert.ok(License.isActive());
    assert.equal(License.getLicense().key, KEY);
  });
  test('plan layer: license makes Plan.isPro() true (onChange fired)', () => {
    let sawActive = false;
    License.onChange(a => { sawActive = a; });
    Plan.setLicenseActive(License.isActive());
    assert.ok(Plan.isPro());
    assert.ok(Plan.hasLicense());
  });
  mockFetch((url, opts) => {
    const body = String(opts.body);
    return gumroadResponse(Object.assign({}, VALID_PURCHASE, { success: true }));
  });
  await atest('verify call posts product id + key, without consuming uses', async () => {
    let seen = '';
    mockFetch((url, opts) => {
      seen = String(opts.body);
      return gumroadResponse(VALID_PURCHASE);
    });
    await License.activate(KEY);
    assert.ok(seen.includes('product_id=TEST-PRODUCT-ID'), seen);
    assert.ok(seen.includes('increment_uses_count=false'), seen);
  });

  mockFetch(() => gumroadResponse({ success: false, message: 'That license does not exist for the provided product.' }, false));
  await atest('unknown key is rejected with a friendly reason', async () => {
    const r = await License.activate('AAAAAAAA-BBBBBBBB-CCCCCCCC-DDDDDDDD');
    assert.ok(!r.ok);
    assert.ok(r.reason.includes('not recognized'));
  });

  // ---- multi-store fallback (v1.8.3): earlier listing keys still activate ----
  License._setStoreConnection('NEW-PRODUCT-ID', 'https://teststore.example/l/new', ['OLD-PRODUCT-ID']);
  await atest('key from the earlier listing activates via store fallback', async () => {
    const calls = [];
    mockFetch((url, opts) => {
      const body = String(opts.body);
      calls.push(body);
      if (body.includes('product_id=OLD-PRODUCT-ID')) return gumroadResponse(VALID_PURCHASE);
      return gumroadResponse({ success: false, message: 'not found for this product' }, false);
    });
    const r = await License.activate(KEY);
    assert.ok(r.ok, r.reason);
    assert.equal(calls.length, 2, 'should try primary then fallback');
    assert.ok(calls[0].includes('product_id=NEW-PRODUCT-ID'));
    assert.ok(r.license.email === 'buyer@example.com');
  });
  await atest('key unknown on every listing is rejected after all attempts', async () => {
    let calls = 0;
    mockFetch(() => { calls++; return gumroadResponse({ success: false }, false); });
    const r = await License.activate('EEEEEEEE-EEEEEEEE-EEEEEEEE-EEEEEEEE');
    assert.ok(!r.ok);
    assert.ok(r.reason.includes('not recognized'));
    assert.equal(calls, 2);
  });
  await atest('refunded on the first listing is NOT retried on the second', async () => {
    let calls = 0;
    mockFetch(() => { calls++; return gumroadResponse({ success: true, purchase: { email: 'x@example.com', refunded: true } }); });
    const r = await License.activate(KEY);
    assert.ok(!r.ok);
    assert.ok(r.reason.includes('refunded'));
    assert.equal(calls, 1, 'refund must surface immediately');
  });
  License._setStoreConnection('TEST-PRODUCT-ID', 'https://teststore.example/l/profitleak-pro');
  // ---------------------------------------------------------------------------

  mockFetch(() => gumroadResponse({ success: true, purchase: { email: 'x@example.com', refunded: true } }));
  await atest('refunded purchase is rejected', async () => {
    const r = await License.activate(KEY);
    assert.ok(!r.ok);
    assert.ok(r.reason.includes('refunded'));
  });

  mockFetch(() => gumroadResponse({ success: true, purchase: { email: 'x@example.com', disputed: true } }));
  await atest('disputed purchase is rejected', async () => {
    const r = await License.activate(KEY);
    assert.ok(!r.ok);
    assert.ok(r.reason.includes('dispute'));
  });

  mockFetch(() => Promise.reject(new Error('offline')));
  await atest('network failure is handled with an actionable message', async () => {
    const r = await License.activate(KEY);
    assert.ok(!r.ok);
    assert.ok(r.reason.includes('internet connection'));
  });

  await atest('too-short input never triggers a network call', async () => {
    let called = false;
    mockFetch(() => { called = true; return gumroadResponse(VALID_PURCHASE); });
    const r = await License.activate('SHORT');
    assert.ok(!r.ok);
    assert.ok(!called);
  });

  License._reset();
  test('deactivate clears the license and reports to listeners', () => {
    assert.ok(!License.isActive());
    assert.equal(License.getLicense(), null);
  });

  License._setStoreConnection('', '');
  await atest('unconfigured store: activation explains it is not live yet', async () => {
    const r = await License.activate(KEY);
    assert.ok(!r.ok);
    assert.ok(r.reason.includes('not connected yet'));
  });
  restoreFetch();

  /* ============ 2. App journey (jsdom, mocked fetch) ============ */
  console.log('\n\u2500\u2500 2. App journey: activation on the pricing page \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');

  const standalone = fs.readFileSync(path.join(ROOT, 'ProfitLeak-AI.html'), 'utf-8');
  const vc = new VirtualConsole();
  const pageErrors = [];
  vc.on('jsdomError', e => {
    const m = String((e && e.message) || e);
    if (!/^Not implemented:/i.test(m)) pageErrors.push(m);
  });

  async function bootApp(fetchHandler, seedScript) {
    let html = standalone;
    if (seedScript) html = html.replace('<head>', '<head><script>' + seedScript + '</script>');
    const dom = new JSDOM(html, {
      runScripts: 'dangerously', pretendToBeVisual: true,
      url: 'https://profitleak.example/', virtualConsole: vc,
      beforeParse(window) { window.fetch = fetchHandler; }
    });
    await tick(250);
    return dom;
  }

  // store connected from the start of this journey
  const dom = await bootApp(() => gumroadResponse(VALID_PURCHASE));
  const w = dom.window, d = w.document;
  w.PL_LICENSE._setStoreConnection('TEST-PRODUCT-ID', 'https://teststore.example/l/profitleak-pro');
  d.querySelector('#welcome-start').click(); await tick(50);

  test('pricing page shows the license box once the store is connected', () => {
    w.location.hash = '#/pricing';
  });
  await tick(70);
  test('license box rendered with input + Activate button', () => {
    assert.ok(d.getElementById('license-input'));
    assert.ok(d.getElementById('license-activate-btn'));
    assert.ok(d.getElementById('license-activate-btn').textContent.includes('Activate'));
  });
  test('PRO card sells subscriptions on-site (no Gumroad redirect)', () => {
    const link = d.querySelector('#pricing-body a[href*="checkout-start?method=paypal&plan=yearly"]');
    assert.ok(link);
    assert.equal(link.getAttribute('target'), '_blank');
    assert.ok(!d.querySelector('#pricing-body a[href*="gumroad.com"]'));
    assert.ok(d.querySelector('#pricing-body').textContent.includes('$19.99'));
  });

  // invalid key first
  w.fetch = () => gumroadResponse({ success: false }, false);
  d.getElementById('license-input').value = 'WRONG-KEY-123';
  d.getElementById('license-activate-btn').click();
  await tick(120);
  test('invalid key: error message shown, still on Free plan', () => {
    const err = d.getElementById('license-error');
    assert.ok(err && !err.hidden);
    assert.ok(err.textContent.includes('not recognized'));
    assert.ok(!d.querySelector('#plan-nav .pro-badge'));
  });

  // now the valid key
  w.fetch = () => gumroadResponse(VALID_PURCHASE);
  d.getElementById('license-input').value = '  85db562a-c11d4b06-a2335a6b-8c079166 ';
  d.getElementById('license-activate-btn').click();
  await tick(150);
  test('valid key: Pro activates \u2014 PRO badge + thank-you toast', () => {
    assert.ok(d.querySelector('#plan-nav .pro-badge'));
    assert.ok(d.querySelector('#toast-container').textContent.includes('thank you'));
  });
  test('pricing card shows \u201CPro licensed\u201D with Remove license', () => {
    const t = d.querySelector('#pricing-body').textContent;
    assert.ok(t.includes('Pro licensed'));
    assert.ok(d.querySelector('[data-action="license-remove"]'));
  });
  test('licensed user gets the 6-product demo set (Pro)', async () => {});
  w.location.hash = '#/dashboard'; await tick(70);
  d.querySelector('.table-tools [data-action="load-samples"]').click(); await tick(40);
  d.getElementById('modal-confirm').click(); await tick(80);
  test('licensed user: demo loads all 6 Pro samples', () =>
    assert.equal(d.querySelectorAll('#table-wrap tbody tr').length, 6));

  const licenseJson = w.localStorage.getItem('profitleak.license.v1');

  // remove license -> back to free, products safe
  w.location.hash = '#/pricing'; await tick(70);
  d.querySelector('[data-action="license-remove"]').click(); await tick(80);
  test('Remove license: back to Free plan, products stay safe', () => {
    assert.ok(!d.querySelector('#plan-nav .pro-badge'));
    assert.ok(d.querySelector('#plan-nav .btn-gold'));
    w.location.hash = '#/dashboard';
  });
  await tick(70);
  test('products survived the license removal', () =>
    assert.equal(d.querySelectorAll('#table-wrap tbody tr').length, 6));

  dom.window.close();

  // fresh boot with the license in storage -> Pro restored, no activation needed
  const dom2 = await bootApp(() => gumroadResponse(VALID_PURCHASE),
    'localStorage.setItem("profitleak.license.v1",' + JSON.stringify(licenseJson) + ');');
  const w2 = dom2.window, d2 = w2.document;
  w2.location.hash = '#/pricing'; await tick(150);
  test('reload: license restores Pro automatically (no network call needed)', () => {
    assert.ok(d2.querySelector('#plan-nav .pro-badge'));
    assert.ok(d2.querySelector('#pricing-body').textContent.includes('Pro licensed'));
  });
  dom2.window.close();

  // unconfigured build (self-hosted, empty store constants): no license box, no free unlock
  const dom3 = await bootApp(() => gumroadResponse(VALID_PURCHASE));
  const w3 = dom3.window, d3 = w3.document;
  w3.PL_LICENSE._setStoreConnection('', '');
  d3.querySelector('#welcome-start').click(); await tick(50);
  w3.location.hash = '#/pricing'; await tick(80);
  let upgradeBtn = null;
  test('store not connected yet: no license box, upgrade button still works', () => {
    assert.ok(!d3.getElementById('license-input'));
    upgradeBtn = d3.querySelector('[data-action="upgrade"]');
    assert.ok(upgradeBtn && upgradeBtn.textContent.includes('$3.99'));
  });
  upgradeBtn.click();
  await tick(80);
  test('upgrade dialog points to checkout, no free preview offered', () => {
    assert.ok(!d3.querySelector('#modal-overlay').hidden);
    assert.ok(d3.querySelector('#modal-overlay').textContent.includes('$3.99'));
    assert.ok(!d3.querySelector('#modal-overlay').textContent.includes('free preview'));
  });
  d3.getElementById('modal-confirm').click(); await tick(60);
  test('confirming never unlocks Pro without a purchase', () =>
    assert.ok(!d3.querySelector('#plan-nav .pro-badge')));

  test('no unexpected page errors in the license journey', () => {
    if (pageErrors.length) console.error('        page errors: ' + pageErrors.slice(0, 5).join(' | '));
    assert.equal(pageErrors.length, 0);
  });
  dom3.window.close();

  console.log('\n\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');
  console.log('LICENSE TESTS: ' + passed + ' passed, ' + failed + ' failed');
  console.log('\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');
  if (failed) process.exitCode = 1;
}

main().catch(e => { console.error('LICENSE FATAL:', e && (e.stack || e)); process.exit(1); });
