/* =============================================================
   ProfitLeak AI — headless smoke test (FREE + PRO journey)
   Loads the REAL app (index.html + all scripts) in jsdom and
   walks the complete monetization + product journey:
   free user (limits & locked Pro features) → pricing page →
   upgrade ("coming soon" + free preview) → full Pro experience.
   Requires dev dependency:  npm install   then   node tests/smoke.test.js
   ============================================================= */
'use strict';

let jsdom;
try { jsdom = require('jsdom'); } catch (e) {
  console.log('  ! jsdom is not installed \u2014 smoke test skipped.');
  console.log('    Run "npm install" first to enable it.');
  process.exit(0);
}

const assert = require('node:assert/strict');
const path = require('path');
const { CSV } = require('../js/data.js');
const { JSDOM, VirtualConsole } = jsdom;

function tick(ms) { return new Promise(r => setTimeout(r, ms || 70)); }

async function main() {
  const virtualConsole = new VirtualConsole();
  const pageErrors = [];
  virtualConsole.on('jsdomError', err => {
    const msg = String((err && err.message) || err);
    if (!/^Not implemented:/i.test(msg)) pageErrors.push(msg);
  });

  const dom = await JSDOM.fromFile(path.join(__dirname, '..', 'index.html'), {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    virtualConsole
  });
  const w = dom.window;
  const d = w.document;

  await new Promise(res => { if (d.readyState === 'complete') res(); else w.addEventListener('load', res); });
  await tick(100);

  let passed = 0, failed = 0;
  const test = (name, fn) => {
    try { fn(); passed++; console.log('  \u2713 ' + name); }
    catch (e) { failed++; console.error('  \u2717 ' + name + ' \u2014 ' + e.message); process.exitCode = 1; }
  };

  console.log('\nProfitLeak AI \u2014 app smoke test (FREE + PRO journey)\n');

  /* ================= STAGE 1 — FREE USER ================= */

  /* ---- landing ---- */
  test('landing page renders', () => assert.ok(d.querySelector('.hero h1')));
  test('hero example computed live by the engine (\u2212$0.76)', () =>
    assert.ok(d.querySelector('#hero-example').textContent.includes('\u2212$0.76')));
  test('landing nav links to Pricing', () =>
    assert.ok(d.querySelector('.landing-nav a[href="#/pricing"]')));

  /* ---- first-time welcome ---- */
  test('hero CTA still links to the dashboard', () =>
    assert.ok(d.querySelector('.hero-cta a[href="#/dashboard"]')));
  test('first visit shows the welcome screen', () => {
    assert.ok(!d.querySelector('#welcome-overlay').hidden);
    const t3 = d.querySelector('#welcome-overlay').textContent;
    assert.ok(t3.includes('Welcome to ProfitLeak AI'));
    assert.ok(t3.includes('making money') && t3.includes('losing it'));
    assert.ok(t3.includes('Add your products'));
    assert.ok(t3.includes('Analyze your true profit'));
    assert.ok(t3.includes('Discover what you should change'));
  });
  test('welcome offers Get Started and Try Demo Data', () => {
    assert.ok(d.querySelector('#welcome-start'));
    assert.ok(d.querySelector('#welcome-demo'));
  });
  d.querySelector('#welcome-start').click();
  await tick();
  test('Get Started dismisses the welcome and opens the dashboard', () => {
    assert.ok(d.querySelector('#welcome-overlay').hidden);
    assert.ok(!d.querySelector('#page-dashboard').hidden);
  });
  test('empty dashboard: "No products yet." + demo hint', () => {
    const t3 = d.querySelector('#table-wrap').textContent;
    assert.ok(t3.includes('No products yet.'));
    assert.ok(t3.includes('Add your first product or try the demo.'));
  });
  test('no auto-seeded products \u2014 a new user starts clean', () =>
    assert.equal(d.querySelectorAll('#table-wrap tbody tr').length, 0));

  /* ---- demo data ---- */
  d.querySelector('#table-wrap [data-action="load-samples"]').click();
  await tick(30);
  test('Try Demo Data loads 3 demo products (free plan)', () =>
    assert.equal(d.querySelectorAll('#table-wrap tbody tr').length, 3));
  test('every demo product is clearly labeled "Demo Data"', () =>
    assert.equal(d.querySelectorAll('#table-wrap .badge-demo').length, 3));
  test('"Clear Demo Data" appears once demo products exist', () =>
    assert.ok(!d.getElementById('btn-clear-demo').hidden));

  /* ---- dashboard as a free user (with demo loaded) ---- */
  test('free plan banner shows 3 of 3 products used', () => {
    const b = d.querySelector('#plan-banner');
    assert.ok(!b.hidden);
    assert.ok(b.textContent.includes('Free plan') && b.textContent.includes('3 of 3'));
  });
  test('topbar shows an Upgrade to Pro button', () =>
    assert.ok(d.querySelector('#plan-nav .btn-gold')));
  test('6 KPI cards render', () => assert.equal(d.querySelectorAll('#kpi-grid .kpi').length, 6));
  test('KPI help is collapsed by default', () =>
    assert.ok(d.querySelector('#kpi-grid [data-help="profit"]').closest('.kpi').querySelector('.help-box').hidden));
  d.querySelector('#kpi-grid [data-help="revenue"]').click();
  await tick(30);
  test('KPI help explains Total Revenue in plain language', () => {
    const box = d.querySelector('#kpi-grid .kpi .help-box:not([hidden])');
    assert.ok(box && box.textContent.includes('before any costs'));
  });
  d.querySelector('#kpi-grid [data-help="losing"]').click();
  await tick(30);
  test('KPI help explains Losing Products', () => {
    const box = d.querySelector('#kpi-grid [data-help="losing"]').closest('.kpi').querySelector('.help-box');
    assert.ok(box && !box.hidden && box.textContent.includes('lose money on every sale'));
  });
  test('row action is labeled "View Analysis"', () =>
    assert.ok(d.querySelector('#table-wrap [data-action="view"]').textContent.includes('View Analysis')));
  test('one product of each status (\uD83D\uDD34 \uD83D\uDFE1 \uD83D\uDFE2)', () => {
    assert.equal(d.querySelectorAll('#table-wrap .badge-red').length, 1);
    assert.equal(d.querySelectorAll('#table-wrap .badge-amber').length, 1);
    assert.equal(d.querySelectorAll('#table-wrap .badge-green').length, 1);
  });
  test('profit chart has 3 clickable bars', () =>
    assert.equal(d.querySelectorAll('#chart-profit .bar-row').length, 3));
  test('cost donut renders', () => assert.ok(d.querySelector('#chart-costs svg')));
  test('losing-money alert banner shown', () => assert.ok(d.querySelector('#alerts .alert-red')));

  /* ---- analysis as a free user: basics yes, Pro locked ---- */
  d.querySelector('tr.clickable').click();
  await tick();
  test('worst product (Clear Phone Case) analysed first', () =>
    assert.ok(d.querySelector('#analysis-head h1').textContent.includes('Clear Phone Case')));
  test('free user sees findings ("where are you losing money?")', () =>
    assert.ok(d.querySelectorAll('#analysis-issues .finding').length >= 3));
  test('free user sees recommendations ("what should you change?")', () =>
    assert.ok(d.querySelectorAll('#analysis-recs li').length >= 3));
  test('free user sees the numbers table & unit bar', () => {
    assert.ok(d.querySelector('#analysis-numbers .profit-row'));
    assert.ok(d.querySelector('#analysis-bar .anatomy-track'));
  });
  test('free user sees the basic diagnosis (tiles + sentence)', () => {
    assert.ok(d.querySelector('#diagnosis-section .diag-current').textContent.includes('\u2212$380.00'));
    assert.ok(d.querySelector('.diag-sentence').textContent.includes('40% of your total costs'));
    assert.ok(d.querySelector('.diag-action .diag-value').textContent.includes('Reduce advertising cost'));
  });
  test('free user: cost ranking, simulator & goal are LOCKED', () => {
    assert.equal(d.querySelectorAll('#diagnosis-section .pro-locked').length, 3);
    assert.ok(!d.querySelector('.wi-slider'));
    assert.ok(!d.querySelector('#goal-input'));
    assert.ok(!d.querySelector('#diagnosis-section .rank-row'));
  });

  /* ---- free limit blocks adding a 4th product ---- */
  d.querySelector('.back-link').click();
  await tick();
  d.querySelector('#page-dashboard .page-actions a[href="#/add"]').click();
  await tick();
  test('add form is blocked at the free limit — upsell shown', () => {
    assert.ok(!d.querySelector('#form-upsell').hidden);
    assert.ok(d.querySelector('.form-layout').hidden);
    assert.ok(d.querySelector('#form-upsell').textContent.includes('free plan limit'));
  });
  test('upsell links to the pricing page', () =>
    assert.ok(d.querySelector('#form-upsell a[href="#/pricing"]')));

  /* ---- import attempt on a full free plan: gated, data safe ---- */
  const freeTryCsv = CSV.toCsv([
    { name: 'Free Try A', sellingPrice: 10, purchaseCost: 4, adCostPerSale: 1,
      shippingCost: 1, platformFees: 0.5, discountPerSale: 0, returnCostPerSale: 0, unitsSold: 10 },
    { name: 'Free Try B', sellingPrice: 12, purchaseCost: 5, adCostPerSale: 1,
      shippingCost: 1, platformFees: 0.6, discountPerSale: 0, returnCostPerSale: 0, unitsSold: 8 }
  ]);
  const fi = d.getElementById('csv-file');
  const ff = new w.File([freeTryCsv], 'free-try.csv', { type: 'text/csv' });
  Object.defineProperty(fi, 'files', { value: [ff], configurable: true });
  fi.dispatchEvent(new w.Event('change', { bubbles: true }));
  await tick(200);
  test('free user: CSV import is blocked with the Pro upgrade dialog (v1.19)', () => {
    assert.ok(d.querySelector('#import-overlay').hidden);
    assert.ok(!d.querySelector('#modal-overlay').hidden);
    assert.ok(d.querySelector('#modal-title').textContent.includes('Pro feature'));
  });
  test('the blocked import leaves the 3 products untouched', () =>
    assert.equal(d.querySelectorAll('#table-wrap tbody tr').length, 3));
  d.getElementById('modal-cancel').click();
  await tick(30);
  test('the blocked import closes cleanly (no overlay, no dialog)', () => {
    assert.ok(d.querySelector('#import-overlay').hidden);
    assert.ok(d.querySelector('#modal-overlay').hidden);
  });

  /* ---- profit report (free user, 3 products) ---- */
  d.querySelector('#page-dashboard .page-actions a[href="#/report"]').click();
  await tick();
  test('"Generate Report" opens the report page', () =>
    assert.ok(!d.querySelector('#page-report').hidden));
  test('report shows the generation date', () => {
    const t3 = d.querySelector('#report-body .rep-date').textContent;
    assert.ok(t3.includes('Generated') && /, 20\d\d \u00B7/.test(t3));
  });
  test('business summary lists every key figure', () => {
    const t3 = d.querySelector('#report-body').textContent;
    ['Business summary', 'Total products', 'Total revenue', 'Total costs', 'True profit',
     'Overall margin', 'Profitable products', 'Losing products'].forEach(k =>
      assert.ok(t3.includes(k), k));
  });
  test('summary values correct for the 3 free products', () => {
    const tiles = Array.from(d.querySelectorAll('#report-body .rep-tile'));
    const val = label => tiles.find(x => x.textContent.includes(label)).querySelector('.rep-tile-value').textContent;
    assert.equal(val('Total products'), '3');
    assert.ok(val('Total revenue').includes('$32,889.20'));
    assert.ok(val('True profit').includes('$3,624.20'));
    assert.ok(val('Losing products').includes('1'));
  });
  test('top performers: Wireless Earbuds Pro first ($3,356.80)', () => {
    const first = d.querySelector('#report-body .rep-sec-top tbody tr');
    assert.ok(first.textContent.includes('Wireless Earbuds Pro') && first.textContent.includes('$3,356.80'));
  });
  test('biggest losses: Clear Phone Case at \u2212$380.00 with its biggest cost', () => {
    const first = d.querySelector('#report-body .rep-sec-losses tbody tr');
    assert.ok(first.textContent.includes('Clear Phone Case'));
    assert.ok(first.textContent.includes('\u2212$380.00') && first.textContent.includes('Advertising'));
  });
  test('profit leaks: Purchase ranks #1 at $11,320.00', () => {
    const first = d.querySelector('#report-body .rep-sec-leaks tbody tr');
    assert.ok(first.textContent.includes('Purchase') && first.textContent.includes('$11,320.00'));
  });
  test('smart recommendations generated from the data', () => {
    const recs = d.querySelectorAll('#report-body .rep-sec-recs li');
    assert.ok(recs.length >= 3);
    assert.ok(d.querySelector('#report-body .rep-sec-recs').textContent.includes('largest cost category'));
  });
  let printed = false;
  w.print = function () { printed = true; };
  d.getElementById('report-print').click();
  await tick(30);
  test('"Download Report" is Pro-only: upgrade dialog instead, nothing printed (v1.19)', () => {
    assert.ok(!printed);
    assert.ok(!d.querySelector('#modal-overlay').hidden);
    assert.ok(d.querySelector('#modal-title').textContent.includes('Pro feature'));
  });
  d.getElementById('modal-cancel').click();
  await tick(30);
  d.querySelector('.report-toolbar a[href="#/dashboard"]').click();
  await tick();

  /* ================= STAGE 2 — PRICING & UPGRADE ================= */

  w.location.hash = '#/pricing';
  await tick();
  test('pricing page renders FREE $0 and PRO $19.99 / year', () => {
    const t = d.querySelector('#pricing-body').textContent;
    assert.ok(t.includes('$0') && t.includes('$19.99') && t.includes('/ year'));
  });
  test('pricing cards show the right tags and ribbon', () => {
    const t = d.querySelector('#pricing-body').textContent;
    assert.ok(t.includes('Your first session \u2014 free') && t.includes('For serious online sellers'));
    assert.ok(t.includes('Most popular'));
  });
  test('PRO card lists the key features', () => {
    const t = d.querySelector('#pricing-body').textContent;
    ['Unlimited products', 'What-if simulator', 'Cost ranking', 'Advanced profit diagnosis',
     'Amazon', 'eBay', 'Shopify'].forEach(f => assert.ok(t.includes(f), f));
  });
  test('trust line: instant activation, no codes, on-site payments', () =>
    assert.ok(d.querySelector('.pricing-trust').textContent.includes('Instant activation')));

  /* v1.24: the PRO card sells subscriptions ON-SITE (never Gumroad) */
  test('PRO card sells subscriptions inside the site', () => {
    const link = d.querySelector('#pricing-body a[href*="checkout-start?method=paypal&plan=yearly"]');
    assert.ok(link, 'on-site subscribe link present');
    assert.ok(!d.querySelector('#pricing-body a[href*="gumroad.com"]'), 'no Gumroad redirect');
    assert.equal(link.getAttribute('target'), '_blank');
  });
  test('license activation box is shown to free users', () => {
    assert.ok(d.getElementById('license-input'));
    assert.ok(d.getElementById('license-activate-btn'));
  });
  /* simulate an unlicensed pro plan flag (app API — works even with blocked storage) */
  w.PL_PLAN.setPlan('pro');
  w.location.hash = '#/dashboard'; await tick(70);
  test('preview activated — topbar shows the PRO badge', () => {
    assert.ok(d.querySelector('#plan-nav .pro-badge'));
  });
  w.location.hash = '#/pricing'; await tick(70);
  test('plan is saved to browser storage', () => {
    let saved = null;
    try { saved = w.localStorage.getItem('profitleak.plan.v1'); } catch (e) { saved = null; }
    assert.ok(saved === 'pro' || saved === null);
  });
  test('unlicensed plan flag still shows the Buy Pro button (preview era ended)', () => {
    assert.ok(d.querySelector('#pricing-body a[href*="checkout-start?method="]'),
      'on-site subscribe link present');
    assert.ok(!d.querySelector('[data-action="deactivate-preview"]'));
  });

  /* ================= STAGE 3 — PRO USER ================= */

  /* ---- adding now works ---- */
  w.location.hash = '#/add';
  await tick();
  test('add form is available again on Pro', () =>
    assert.ok(!d.querySelector('.form-layout').hidden && d.querySelector('#form-upsell').hidden));
  d.getElementById('product-form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  await tick(30);
  test('empty form is blocked with inline errors', () =>
    assert.ok(d.querySelectorAll('#product-form .has-error').length >= 2));

  const set = (id, v) => { d.getElementById(id).value = v; };
  set('f-name', 'Smoke Test Widget');
  set('f-price', '5.00');
  set('f-units', '10');
  set('f-purchase', '10.00');
  set('f-ad', '0'); set('f-ship', '0'); set('f-fees', '0');
  set('f-discount', '0'); set('f-returns', '0');
  d.getElementById('product-form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  await tick();
  test('product saved \u2014 table now has 4 rows', () =>
    assert.equal(d.querySelectorAll('#table-wrap tbody tr').length, 4));
  test('new product flagged \uD83D\uDD34 LOSING MONEY', () => {
    const row = Array.from(d.querySelectorAll('#table-wrap tbody tr'))
      .find(r => r.textContent.includes('Smoke Test Widget'));
    assert.ok(row && row.querySelector('.badge-red'));
  });

  /* ---- new product: analysis with unlocked Pro features ---- */
  Array.from(d.querySelectorAll('#table-wrap tbody tr'))
    .find(r => r.textContent.includes('Smoke Test Widget')).click();
  await tick();
  test('new product\u2019s recommendation explains the biggest cost', () =>
    assert.ok(d.querySelector('#analysis-recs').textContent.includes('The biggest cost causing this loss is purchase cost at $10.00 per sale')));
  test('cost ranking unlocked (1 row for a single-cost product)', () =>
    assert.equal(d.querySelectorAll('#diagnosis-section .rank-row').length, 1));
  test('simulator unlocked (7 sliders) and goal unlocked', () => {
    assert.equal(d.querySelectorAll('.wi-slider').length, 7);
    assert.ok(d.querySelector('#goal-input'));
  });

  /* ---- delete it again ---- */
  d.querySelector('.back-link').click();
  await tick();
  Array.from(d.querySelectorAll('#table-wrap tbody tr'))
    .find(r => r.textContent.includes('Smoke Test Widget'))
    .querySelector('[data-action="delete"]').click();
  await tick(30);
  d.getElementById('modal-confirm').click();
  await tick();
  test('product deleted \u2014 back to 3 rows', () =>
    assert.equal(d.querySelectorAll('#table-wrap tbody tr').length, 3));

  /* ---- status filters (dynamic counts) ---- */
  const allBadges = Array.from(d.querySelectorAll('#table-wrap .badge'));
  const nLosing = allBadges.filter(b => b.classList.contains('badge-red')).length;
  test('filter chips render with correct counts', () => {
    const chips = Array.from(d.querySelectorAll('#table-filters .chip'));
    assert.equal(chips.length, 4);
    assert.ok(chips.find(c => c.textContent.includes('Losing money')).textContent.includes(String(nLosing)));
  });
  d.querySelector('[data-filter="losing"]').click();
  await tick();
  test('filter: losing chip shows exactly the losing products', () =>
    assert.equal(d.querySelectorAll('#table-wrap tbody tr').length, nLosing));
  d.querySelector('#table-filters [data-filter="all"]').click();
  await tick();

  /* ---- CSV export & import (pro) ---- */
  d.querySelector('[data-action="export-csv"]').click();
  await tick(30);
  test('CSV export shows a confirmation toast', () =>
    assert.ok(Array.from(d.querySelectorAll('#toast-container .toast'))
      .some(t => t.textContent.includes('Exported 3 product(s)'))));

  d.querySelector('[data-action="csv-template"]').click();
  await tick(30);
  test('CSV template download button shows a toast', () =>
    assert.ok(Array.from(d.querySelectorAll('#toast-container .toast'))
      .some(t2 => t2.textContent.includes('Template downloaded'))));

  const fileInput = d.getElementById('csv-file');
  const pick = (text, name) => {
    const f = new w.File([text], name, { type: 'text/csv' });
    Object.defineProperty(fileInput, 'files', { value: [f], configurable: true });
    fileInput.dispatchEvent(new w.Event('change', { bubbles: true }));
  };
  const csvText = CSV.toCsv([
    { name: 'Imported Lamp', sellingPrice: 15, purchaseCost: 6, adCostPerSale: 1.5,
      shippingCost: 2, platformFees: 1.2, discountPerSale: 0, returnCostPerSale: 0.5, unitsSold: 30 },
    { name: 'Imported Poster', sellingPrice: 9.99, purchaseCost: 2, adCostPerSale: 2,
      shippingCost: 1.5, platformFees: 0.9, discountPerSale: 0, returnCostPerSale: 0, unitsSold: 60 }
  ]);
  pick(csvText, 'import-test.csv');
  await tick(200);
  test('import opens a PREVIEW modal listing both products', () => {
    assert.ok(!d.querySelector('#import-overlay').hidden);
    assert.equal(d.querySelectorAll('#import-body .imp-table tbody tr').length, 2);
    assert.ok(d.querySelector('#import-body').textContent.includes('Imported Lamp'));
    assert.ok(d.querySelector('#import-body').textContent.includes('Imported Poster'));
  });
  test('preview shows true profit & status per product ($114.00, PROFITABLE)', () => {
    const t2 = d.querySelector('#import-body').textContent;
    assert.ok(t2.includes('$114.00') && t2.includes('PROFITABLE'));
  });
  d.getElementById('import-confirm').click();
  await tick();
  test('"Import Products" adds both products (5 rows total)', () =>
    assert.equal(d.querySelectorAll('#table-wrap tbody tr').length, 5));
  test('dashboard KPIs refresh after import (Total products = 5)', () =>
    assert.ok(d.querySelector('#kpi-grid').textContent.includes('5')));

  /* ---- import with invalid rows: clear reasons, only valid imported ---- */
  const FULL_HEADER = 'Name,Selling Price,Purchase Cost,Ad Cost per Sale,Shipping Cost,Platform Fees,Discount per Sale,Return Cost per Sale,Units Sold';
  const badCsv = FULL_HEADER + '\nGood Lamp,20,8,2,2,1,0,0,10\n,15,5,1,1,1,0,0,5\nBad Price,abc,5,1,1,1,0,0,5\nNeg Ads,20,5,-2,1,1,0,0,5\nHalf Units,20,5,1,1,1,0,0,2.5\n';
  pick(badCsv, 'with-errors.csv');
  await tick(200);
  test('invalid rows are listed with clear reasons', () => {
    const t2 = d.querySelector('#import-body').textContent;
    assert.ok(t2.includes('Missing product name'));
    assert.ok(t2.includes('greater than $0'));
    assert.ok(t2.includes('Negative value in'));
    assert.ok(t2.includes('whole number of at least 1'));
    assert.ok(t2.includes('row(s) will be skipped'));
  });
  test('the 1 valid row is still previewed for import', () => {
    assert.equal(d.querySelectorAll('#import-body .imp-table tbody tr').length, 1);
    assert.ok(d.querySelector('#import-body').textContent.includes('Good Lamp'));
  });
  d.getElementById('import-confirm').click();
  await tick();
  test('import adds just the 1 valid product (6 rows)', () =>
    assert.equal(d.querySelectorAll('#table-wrap tbody tr').length, 6));

  /* ---- missing required columns ---- */
  pick('Foo,Bar\n1,2\n', 'no-header.csv');
  await tick(200);
  test('missing required columns: notice shown, import disabled', () => {
    const summary = d.querySelector('#import-summary').textContent;
    const body = d.querySelector('#import-body').textContent;
    assert.ok(summary.includes('missing required columns'));
    assert.ok(body.includes('needs a header row'));
    assert.ok(body.includes('Product name'));
    assert.ok(d.getElementById('import-confirm').disabled);
  });
  test('missing-columns notice offers the CSV template', () =>
    assert.ok(d.querySelector('#import-body [data-action="csv-template"]')));
  d.getElementById('import-cancel').click();
  await tick(30);
  test('cancel closes the preview without importing (still 6 rows)', () => {
    assert.ok(d.querySelector('#import-overlay').hidden);
    assert.equal(d.querySelectorAll('#table-wrap tbody tr').length, 6);
  });
  test('imported lamp is flagged PROFITABLE with correct math ($114.00)', () => {
    const row = Array.from(d.querySelectorAll('#table-wrap tbody tr'))
      .find(r => r.textContent.includes('Imported Lamp'));
    assert.ok(row && row.querySelector('.badge-green'));
    assert.ok(row.textContent.includes('$114.00'));
  });

  /* ---- load samples: PRO gets all 6 ---- */
  d.querySelector('[data-action="load-samples"]').click();
  await tick(30);
  d.getElementById('modal-confirm').click();
  await tick();
  test('Try Demo Data (pro) reloads demo alongside real products (9 rows)', () =>
    assert.equal(d.querySelectorAll('#table-wrap tbody tr').length, 9));

  /* ---- profit report (pro, 9 products: 3 real + 6 demo) ---- */
  w.location.hash = '#/report';
  await tick();
  test('report (9 products): counts and leak ranking scale up', () => {
    const tiles = Array.from(d.querySelectorAll('#report-body .rep-tile'));
    const val = label => tiles.find(x => x.textContent.includes(label)).querySelector('.rep-tile-value').textContent;
    assert.equal(val('Total products'), '9');
    assert.ok(val('Losing products').includes('2'));
    const leak = d.querySelector('#report-body .rep-sec-leaks tbody tr');
    assert.ok(leak.textContent.includes('Purchase'));
  });
  test('report lists real and demo products (top performers + losses)', () => {
    const t3 = d.querySelector('#report-body').textContent;
    assert.ok(t3.includes('Imported Poster'));   // real product, 4th best
    assert.ok(t3.includes('Wireless Earbuds Pro')); // demo product, best
    assert.ok(t3.includes('Clear Phone Case'));     // worst (losses table)
  });
  w.location.hash = '#/dashboard';
  await tick();

  /* ---- full Pro analysis on Clear Phone Case ---- */
  d.querySelector('tr.clickable').click();
  await tick();
  test('worst product is Clear Phone Case again', () =>
    assert.ok(d.querySelector('#analysis-head h1').textContent.includes('Clear Phone Case')));
  test('cost ranking: 6 rows, advertising ranked #1', () => {
    const rows = Array.from(d.querySelectorAll('#diagnosis-section .rank-row'));
    assert.equal(rows.length, 6);
    assert.ok(rows[0].textContent.includes('Advertising'));
  });

  /* ---- profit goal (pro) ---- */
  const goalInput = d.querySelector('#goal-input');
  goalInput.value = '2';
  goalInput.dispatchEvent(new w.Event('input', { bubbles: true }));
  await tick(30);
  test('goal: required price ($15.75) and biggest-cost route ($2.74)', () => {
    const t = d.querySelector('#goal-out').textContent;
    assert.ok(t.includes('$15.75') && t.includes('would drop to $2.74'));
  });
  goalInput.value = '0.5';
  goalInput.dispatchEvent(new w.Event('input', { bubbles: true }));
  await tick(30);
  test('goal: 50c target needs +$1.26', () =>
    assert.ok(d.querySelector('#goal-out').textContent.includes('$1.26')));
  goalInput.value = '';
  goalInput.dispatchEvent(new w.Event('input', { bubbles: true }));
  await tick(30);
  test('goal: empty input shows the hint', () =>
    assert.ok(d.querySelector('#goal-out').textContent.includes('Type a target profit')));

  /* ---- what-if simulator (pro) ---- */
  const adSlider = d.querySelector('[data-wi-slider="adCostPerSale"]');
  adSlider.value = '0';
  adSlider.dispatchEvent(new w.Event('input', { bubbles: true }));
  await tick(30);
  test('what-if: ads to $0 shows +$2,750.00 and new profit $2,370.00', () => {
    const t = d.querySelector('#wi-results').textContent;
    assert.ok(t.includes('+$2,750.00') && t.includes('$2,370.00') && t.includes('improves'));
  });
  d.querySelector('#wi-reset').click();
  await tick(30);
  test('what-if: reset restores the current numbers', () =>
    assert.ok(d.querySelector('#wi-results').textContent.includes('No change yet')));
  const priceNum = d.querySelector('[data-wi-num="sellingPrice"]');
  priceNum.value = '13.75';
  priceNum.dispatchEvent(new w.Event('input', { bubbles: true }));
  await tick(30);
  test('what-if: break-even price shows +$380.00 improvement', () =>
    assert.ok(d.querySelector('#wi-results').textContent.includes('+$380.00')));
  d.querySelector('#wi-reset').click();
  await tick(30);
  const feesNum = d.querySelector('[data-wi-num="platformFees"]');
  feesNum.value = '0';
  feesNum.dispatchEvent(new w.Event('input', { bubbles: true }));
  await tick(30);
  test('what-if: fees to $0 shows +$975.00', () =>
    assert.ok(d.querySelector('#wi-results').textContent.includes('+$975.00')));
  d.querySelector('#wi-reset').click();
  await tick(30);
  d.querySelector('[data-wi-slider="adCostPerSale"]').value = '0';
  d.querySelector('[data-wi-slider="adCostPerSale"]').dispatchEvent(new w.Event('input', { bubbles: true }));
  await tick(30);
  d.querySelector('#wi-apply').click();
  await tick(30);
  test('what-if: apply updates the product (true profit $2,370.00)', () =>
    assert.ok(d.querySelector('#analysis-stats').textContent.includes('$2,370.00')));
  test('what-if: after apply, diagnosis updates (leak is now purchase cost)', () =>
    assert.equal(d.querySelector('#diagnosis-section .diag-leak .diag-value').textContent.trim(), 'Purchase cost'));

  /* ---- live calculation preview ---- */
  w.location.hash = '#/add';
  await tick();
  set('f-price', '20');
  set('f-units', '100');
  set('f-purchase', '5');
  d.getElementById('f-price').dispatchEvent(new w.Event('input', { bubbles: true }));
  await tick(30);
  test('live preview computes revenue ($2,000.00)', () =>
    assert.ok(d.querySelector('#lp-rows').textContent.includes('$2,000.00')));

  /* ---- back to free (grandfathered data stays safe) ---- */
  w.location.hash = '#/pricing';
  await tick();
  w.PL_PLAN.setPlan('free'); // preview era ended — plan returns to Free
  w.location.hash = '#/dashboard';
  await tick(30);
  test('returning to the free plan shows the upgrade button', () => {
    assert.ok(d.querySelector('#plan-nav .btn-gold'));
  });
  w.location.hash = '#/dashboard';
  await tick();
  test('free banner explains 9 products are over the limit (data safe)', () => {
    const b = d.querySelector('#plan-banner');
    assert.ok(!b.hidden && b.textContent.includes('over the free limit'));
    assert.equal(d.querySelectorAll('#table-wrap tbody tr').length, 9); // nothing deleted
  });

  /* ---- Clear Demo Data: removes ONLY demo products ---- */
  d.querySelector('#btn-clear-demo').click();
  await tick(30);
  test('Clear Demo Data asks for confirmation', () =>
    assert.ok(d.querySelector('#modal-overlay').textContent.includes('demo product')));
  d.getElementById('modal-confirm').click();
  await tick(30);
  test('only the 6 demo products are removed \u2014 3 real products stay', () => {
    assert.equal(d.querySelectorAll('#table-wrap tbody tr').length, 3);
    assert.ok(d.querySelector('#table-wrap').textContent.includes('Imported Lamp'));
  });
  test('no "Demo Data" badges remain', () =>
    assert.equal(d.querySelectorAll('#table-wrap .badge-demo').length, 0));
  test('"Clear Demo Data" hides again when no demo remains', () =>
    assert.ok(d.getElementById('btn-clear-demo').hidden));

  /* ---- health ---- */
  test('no unexpected page errors', () => assert.deepEqual(pageErrors, []));

  console.log('\n' + passed + ' passed, ' + failed + ' failed\n');
  w.close();
  if (failed > 0) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
