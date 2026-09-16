/* =============================================================
   ProfitLeak AI — one-session free trial tests (v1.9)
   1) Unit: the trial state machine (first session, same-tab
      continuation, 30-minute resume window, second-session lock,
      licensed users never gated).
   2) App journey (jsdom, deployment artifact): fresh visitor is
      free, a returning visitor after the session ends hits the
      paywall, activation from the paywall unlocks Pro, invalid
      keys are rejected, the landing page stays visible, and a
      licensed user with an expired trial is never locked.
   Network calls are mocked — no real requests.
   ============================================================= */
'use strict';

let jsdom;
try { jsdom = require('jsdom'); } catch (e) {
  console.log('  ! jsdom is not installed — trial test skipped.');
  process.exit(0);
}

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Plan, Trial } = require('../js/data.js');
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

const VALID_PURCHASE = {
  success: true, uses: 1,
  purchase: { email: 'buyer@example.com', refunded: false, disputed: false,
              product_name: 'ProfitLeak AI \u2014 Pro License', price: 19 }
};
const gumroadOk = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(VALID_PURCHASE) });
const gumroadBad = () => Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({ success: false }) });
const KEY = '85DB562A-C11D4B06-A2335A6B-8C079166';

const GAP = 60 * 1000; /* any gap between visits (v1.18: EVERY reopen ends the sitting) */

async function main() {
  console.log('\nProfitLeak AI \u2014 one-session free trial tests\n');
  console.log('\u2500\u2500 1. Unit: trial state machine (memory storage) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');

  test('fresh visitor: the free session starts unlocked', () => {
    Trial._reset();
    assert.ok(Trial.evaluate());
    assert.ok(!Trial.isLocked());
  });
  test('same sitting (session marker alive): still unlocked', () => {
    assert.ok(Trial.evaluate());
    assert.ok(!Trial.isLocked());
  });
  test('reopened after just 8 seconds: the attempt is OVER (v1.18)', () => {
    Trial._reset();
    Trial.evaluate();
    Trial._age(8 * 1000); /* closed the tab, reopened 8 seconds later */
    assert.ok(!Trial.evaluate());
    assert.ok(Trial.isLocked());
  });
  test('5 minutes away: the free attempt is OVER (v1.16)', () => {
    Trial._reset();
    Trial.evaluate();
    Trial._age(5 * 60 * 1000); /* 5 minutes away, fresh browser session */
    assert.ok(!Trial.evaluate());
    assert.ok(Trial.isLocked());
  });
  test('second session after the window: LOCKED', () => {
    Trial._age(GAP + 60 * 1000); /* a few minutes away, fresh browser session */
    assert.ok(!Trial.evaluate());
    assert.ok(Trial.isLocked());
  });
  test('locked stays locked on later visits', () => {
    assert.ok(!Trial.evaluate());
    assert.ok(Trial.isLocked());
  });
  test('licensed users are never gated', () => {
    Plan.setLicenseActive(true);
    assert.ok(!Trial.isLocked());
    assert.ok(Trial.evaluate());
    Plan.setLicenseActive(false);
    assert.ok(Trial.isLocked()); /* back to locked once the license is gone */
  });
  test('email signup grants 2 bonus sessions (one opens now)', () => {
    assert.ok(Trial.grantEmailSessions('seller@example.com', 2));
    assert.ok(!Trial.isLocked());
    assert.equal(Trial.getEmail(), 'seller@example.com');
  });
  test('second bonus session consumed after the next break', () => {
    Trial._age(GAP + 60 * 1000);
    assert.ok(Trial.evaluate());
    assert.ok(!Trial.isLocked());
  });
  test('after both bonuses: locked for good', () => {
    Trial._age(GAP + 60 * 1000);
    assert.ok(!Trial.evaluate());
    assert.ok(Trial.isLocked());
  });
  test('v1.20: once locked, repeated evaluate() stays locked (permanent done flag)', () => {
    assert.ok(!Trial.evaluate());
    assert.ok(!Trial.evaluate());
    assert.ok(!Trial.isLocked() === false);
  });

  console.log('\n\u2500\u2500 2. App journey: the paywall in the real build \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');

  const vc = new VirtualConsole();
  const pageErrors = [];
  vc.on('jsdomError', e => {
    const m = String((e && e.message) || e);
    if (!/^Not implemented:/i.test(m)) pageErrors.push(m);
  });

  async function bootApp(fetchHandler, seedScript) {
    let html = STANDALONE;
    if (seedScript) html = html.replace('<head>', '<head><script>' + seedScript + '</script>');
    const dom = new JSDOM(html, {
      runScripts: 'dangerously', pretendToBeVisual: true,
      url: 'https://profitleak.example/', virtualConsole: vc,
      beforeParse(window) { window.fetch = fetchHandler; }
    });
    await tick(250);
    return dom;
  }

  /* --- fresh visitor: full free session, no paywall --- */
  const dom1 = await bootApp(gumroadOk);
  const w1 = dom1.window, d1 = w1.document;
  d1.querySelector('#welcome-start').click(); await tick(60);
  w1.location.hash = '#/dashboard'; await tick(70);
  test('fresh visitor: no paywall, dashboard reachable', () => {
    assert.ok(d1.querySelector('#trial-overlay').hidden);
    assert.ok(!d1.querySelector('#page-dashboard').hidden);
  });
  test('fresh visitor: trial record created in storage', () => {
    const rec = JSON.parse(w1.localStorage.getItem('profitleak.trial.v1'));
    assert.ok(rec && rec.startedAt);
  });
  dom1.window.close();

  /* --- returning visitor, session long over: LOCKED --- */
  const oldTrial = 'localStorage.setItem("profitleak.trial.v1", ' +
    JSON.stringify(JSON.stringify({ startedAt: Date.now() - 7200e3, lastActive: Date.now() - 7200e3 })) + ');' +
    'localStorage.setItem("profitleak.onboarded.v1", "1");';
  const dom2 = await bootApp(gumroadOk, oldTrial);
  const w2 = dom2.window, d2 = w2.document;
  w2.location.hash = '#/dashboard'; await tick(90);
  test('returning visitor: the paywall appears', () => {
    assert.ok(!d2.querySelector('#trial-overlay').hidden);
  });
  test('paywall: buy button opens the on-site subscription checkout', () => {
    const buy = d2.querySelector('#trial-buy');
    assert.ok(buy);
    assert.ok(buy.href.includes('checkout-start?method=paypal&plan=yearly'));
    assert.ok(!buy.href.includes('gumroad.com'));
    assert.equal(buy.getAttribute('target'), '_blank');
  });
  test('paywall: license input + Activate present', () => {
    assert.ok(d2.querySelector('#trial-license-input'));
    assert.ok(d2.querySelector('#trial-activate-btn'));
  });
  w2.location.hash = '#/'; await tick(80);
  test('landing visible AND the email popup shows on it (v1.17)', () => {
    assert.ok(!d2.querySelector('#view-landing').hidden);
    assert.ok(!d2.querySelector('#trial-overlay').hidden);
    assert.ok(!d2.querySelector('.trial-email').hidden); /* the email offer is right there */
  });
  w2.location.hash = '#/dashboard'; await tick(80);
  test('navigating back to an app page re-shows the paywall', () => {
    assert.ok(!d2.querySelector('#trial-overlay').hidden);
  });


  /* --- email signup journey (fresh browser, same locked state) --- */
  const dom2c = await bootApp(gumroadOk, oldTrial);
  const w2c = dom2c.window, d2c = w2c.document;
  w2c.location.hash = '#/dashboard'; await tick(90);
  test('paywall shows the email box (2 extra sessions offer)', () => {
    assert.ok(!d2c.querySelector('#trial-overlay').hidden);
    assert.ok(d2c.querySelector('#trial-email-input'));
    assert.ok(d2c.querySelector('#trial-email-btn'));
  });
  w2c.fetch = (url, opts) => {
    if (String(url).includes('email-signup')) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ success: true, extraSessions: 2 }) });
    }
    return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({ success: false }) });
  };
  d2c.querySelector('#trial-email-input').value = 'not-an-email';
  d2c.querySelector('#trial-email-btn').click(); await tick(120);
  test('invalid email: inline error, still locked', () => {
    assert.ok(!d2c.querySelector('#trial-email-error').hidden);
    assert.ok(!d2c.querySelector('#trial-overlay').hidden);
  });
  d2c.querySelector('#trial-email-input').value = 'buyer@example.com';
  d2c.querySelector('#trial-email-btn').click(); await tick(180);
  test('valid email: 2 sessions granted, paywall closes, dashboard opens', () => {
    assert.ok(d2c.querySelector('#trial-overlay').hidden);
    assert.ok(!d2c.querySelector('#page-dashboard').hidden);
  });
  w2c.PL_TRIAL._age(7200e3);
  w2c.location.hash = '#/pricing'; await tick(90);
  test('second bonus session opens after the next break', () => {
    assert.ok(d2c.querySelector('#trial-overlay').hidden);
  });
  w2c.PL_TRIAL._age(7200e3);
  w2c.location.hash = '#/dashboard'; await tick(90);
  test('after both bonus sessions: paywall again (buy-only)', () => {
    assert.ok(!d2c.querySelector('#trial-overlay').hidden);
  });
  test('buy-only paywall: the email box is GONE (v1.16)', () => {
    assert.ok(d2c.querySelector('.trial-email').hidden);
    assert.ok(d2c.querySelector('#trial-license-input')); /* license path still there */
    assert.ok(d2c.body.textContent.includes('You have used your free session and your 2 bonus sessions'));
  });
  d2c.querySelector('[data-action="clear-all"]').click(); await tick(80);
  d2c.querySelector('#modal-confirm').click(); await tick(120);
  test('v1.20: Clear All on a locked visitor → payment popup pops, no free attempts back', () => {
    assert.ok(!d2c.querySelector('#trial-overlay').hidden);
    const rec = JSON.parse(w2c.localStorage.getItem('profitleak.trial.v1'));
    assert.ok(rec.done === true);              /* the lock is recorded permanently */
    assert.equal(rec.email, 'buyer@example.com'); /* the trial record itself is untouched */
  });
  test('v1.20: even a page refresh (live session marker) cannot revive the free time', () => {
    assert.ok(!w2c.PL_TRIAL.evaluate());
  });
  dom2c.window.close();

  /* --- v1.18: the 20-minute cap ends the sitting even with the tab open --- */
  const domCap = await bootApp(gumroadOk);
  const wCap = domCap.window, dCap = wCap.document;
  wCap.location.hash = '#/dashboard'; await tick(90);
  const rec = JSON.parse(wCap.localStorage.getItem('profitleak.trial.v1'));
  rec.startedAt = Date.now() - 21 * 60 * 1000; /* 21 minutes inside the same open tab */
  wCap.localStorage.setItem('profitleak.trial.v1', JSON.stringify(rec));
  wCap.location.hash = '#/pricing'; await tick(90);
  test('20-minute cap: popup shows even though the tab stayed open', () => {
    assert.ok(!dCap.querySelector('#trial-overlay').hidden);
    assert.ok(!dCap.querySelector('.trial-email').hidden); /* the email offer is there */
  });
  wCap.fetch = (url) => {
    if (String(url).includes('email-signup')) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ success: true, extraSessions: 2 }) });
    return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
  };
  dCap.querySelector('#trial-email-input').value = 'cap@example.com';
  dCap.querySelector('#trial-email-btn').click(); await tick(200);
  const rec2 = JSON.parse(wCap.localStorage.getItem('profitleak.trial.v1'));
  rec2.startedAt = Date.now() - 21 * 60 * 1000; /* cap again, one bonus still left */
  wCap.localStorage.setItem('profitleak.trial.v1', JSON.stringify(rec2));
  wCap.location.hash = '#/dashboard'; await tick(90);
  test('cap with a bonus left: the next bonus sitting starts seamlessly', () => {
    assert.ok(dCap.querySelector('#trial-overlay').hidden);
    const rec3 = JSON.parse(wCap.localStorage.getItem('profitleak.trial.v1'));
    assert.equal(rec3.extraSessions, 0); /* 2 granted, 1 opened at signup, 1 at the cap */
  });
  domCap.window.close();

  /* --- activation from the paywall --- */
  w2.fetch = gumroadBad;
  d2.querySelector('#trial-license-input').value = 'WRONG-KEY';
  d2.querySelector('#trial-activate-btn').click(); await tick(140);
  test('invalid key from the paywall: reason shown, still locked', () => {
    const err = d2.querySelector('#trial-license-error');
    assert.ok(err && !err.hidden);
    assert.ok(!d2.querySelector('#trial-overlay').hidden);
  });
  w2.fetch = gumroadOk;
  d2.querySelector('#trial-license-input').value = '  85db562a-c11d4b06-a2335a6b-8c079166 ';
  d2.querySelector('#trial-activate-btn').click(); await tick(180);
  test('valid key from the paywall: Pro unlocks and the paywall closes', () => {
    assert.ok(d2.querySelector('#trial-overlay').hidden);
    assert.ok(!d2.querySelector('#page-dashboard').hidden);
    assert.ok(d2.querySelector('#plan-nav .pro-badge'));
  });
  const licJson = w2.localStorage.getItem('profitleak.license.v1');
  dom2.window.close();

  /* --- licensed user with an expired trial: never locked --- */
  const dom3 = await bootApp(gumroadOk,
    'localStorage.setItem("profitleak.license.v1",' + JSON.stringify(licJson) + ');' +
    'localStorage.setItem("profitleak.trial.v1", ' +
    JSON.stringify(JSON.stringify({ startedAt: Date.now() - 7200e3, lastActive: Date.now() - 7200e3 })) + ');' +
    'localStorage.setItem("profitleak.onboarded.v1", "1");');
  const w3 = dom3.window, d3 = w3.document;
  w3.location.hash = '#/dashboard'; await tick(90);
  test('licensed user with an expired trial: never locked', () => {
    assert.ok(d3.querySelector('#trial-overlay').hidden);
    assert.ok(d3.querySelector('#plan-nav .pro-badge'));
  });
  dom3.window.close();

  /* --- same tab still open (within the 20-minute cap): session continues --- */
  const dom4 = await bootApp(gumroadOk,
    'localStorage.setItem("profitleak.trial.v1", ' +
    JSON.stringify(JSON.stringify({ startedAt: Date.now() - 10 * 60 * 1000, lastActive: Date.now() - 10 * 60 * 1000 })) + ');' +
    'localStorage.setItem("profitleak.onboarded.v1", "1");' +
    'sessionStorage.setItem("profitleak.trial.session.v1", "1");');
  const w4 = dom4.window, d4 = w4.document;
  w4.location.hash = '#/dashboard'; await tick(90);
  test('tab still open, within the 20-minute cap: session continues, no paywall', () => {
    assert.ok(d4.querySelector('#trial-overlay').hidden);
    assert.ok(!d4.querySelector('#page-dashboard').hidden);
  });
  dom4.window.close();

  test('no unexpected page errors in the trial journey', () => {
    if (pageErrors.length) console.error('        page errors: ' + pageErrors.slice(0, 5).join(' | '));
    assert.equal(pageErrors.length, 0);
  });

  console.log('\n\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');
  console.log('TRIAL TESTS: ' + passed + ' passed, ' + failed + ' failed');
  console.log('\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');
  if (failed) process.exitCode = 1;
}

main().catch(e => { console.error('TRIAL FATAL:', e && (e.stack || e)); process.exit(1); });
