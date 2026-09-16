/* =============================================================
   ProfitLeak AI — DEPLOYMENT E2E JOURNEY
   One continuous user journey through the exact pre-deployment
   path, run against the DEPLOYMENT ARTIFACT (ProfitLeak-AI.html,
   the single-file build):

   Landing → Get Started → Dashboard → Add Product → Analysis →
   Smart Diagnosis → What-If Simulator → CSV Import → Report →
   Free/Pro → Mobile layout

   Requires dev dependency:  npm install   then   node tests/e2e.test.js
   ============================================================= */
'use strict';

let jsdom;
try { jsdom = require('jsdom'); } catch (e) {
  console.log('  ! jsdom is not installed — e2e test skipped.');
  process.exit(0);
}

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const CALC = require('../js/calc.js');
const { JSDOM, VirtualConsole } = jsdom;

const ROOT = path.join(__dirname, '..');
const STANDALONE = fs.readFileSync(path.join(ROOT, 'ProfitLeak-AI.html'), 'utf-8');
const CSS_TEXT = fs.readFileSync(path.join(ROOT, 'css/styles.css'), 'utf-8');
const money = v => CALC.money(v);

function tick(ms) { return new Promise(r => setTimeout(r, ms || 70)); }

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  \u2713 ' + name); }
  catch (e) { failed++; console.error('  \u2717 ' + name + ' \u2014 ' + e.message); process.exitCode = 1; }
}

async function main() {
  const PAGE_ERRORS = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', err => {
    const msg = String((err && err.message) || err);
    if (!/^Not implemented:/i.test(msg)) PAGE_ERRORS.push(msg);
  });

  const dom = new JSDOM(STANDALONE, {
    runScripts: 'dangerously', pretendToBeVisual: true,
    url: 'https://profitleak.example/', virtualConsole: vc
  });
  const w = dom.window, d = w.document;
  await tick(300);

  const set = (id, v) => { d.getElementById(id).value = v; };
  const submit = () => d.getElementById('product-form')
    .dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  const rows = () => d.querySelectorAll('#table-wrap tbody tr');
  const storage = () => JSON.parse(w.localStorage.getItem('profitleak.products.v1') || '[]');
  const confirmModal = async () => { d.getElementById('modal-confirm').click(); await tick(50); };
  const go = async h => { w.location.hash = h; await tick(70); };

  console.log('\nProfitLeak AI \u2014 DEPLOYMENT E2E JOURNEY (single-file build)\n');

  /* ============ 1. LANDING PAGE ============ */
  console.log('\u2500\u2500 1. Landing page \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');
  test('landing renders with title and hero', () => {
    assert.ok(d.querySelector('.hero h1'));
    assert.ok(d.title.includes('ProfitLeak'));
  });
  test('hero example is computed live by the engine (\u2212$0.76)', () =>
    assert.ok(d.querySelector('#hero-example').textContent.includes('\u2212$0.76')));
  test('welcome screen greets a first-time visitor', () => {
    assert.ok(!d.querySelector('#welcome-overlay').hidden);
    assert.ok(d.querySelector('#welcome-overlay').textContent.includes('Welcome to ProfitLeak AI'));
  });

  /* ============ 2. GET STARTED ============ */
  console.log('\n\u2500\u2500 2. Get Started \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');
  d.querySelector('#welcome-start').click(); await tick(70);
  test('Get Started dismisses welcome and opens the dashboard', () => {
    assert.ok(d.querySelector('#welcome-overlay').hidden);
    assert.ok(!d.querySelector('#page-dashboard').hidden);
  });

  /* ============ 3. DASHBOARD (EMPTY) ============ */
  console.log('\n\u2500\u2500 3. Dashboard (empty) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');
  test('empty state: "No products yet." + demo hint', () => {
    const t = d.querySelector('#table-wrap').textContent;
    assert.ok(t.includes('No products yet.'));
    assert.ok(t.includes('Add your first product or try the demo.'));
  });
  test('6 KPI cards render with zero totals', () => {
    assert.equal(d.querySelectorAll('#kpi-grid .kpi').length, 6);
    const t = d.querySelector('#kpi-grid').textContent;
    assert.ok(t.includes('$0.00'));
  });

  /* ============ 4. ADD PRODUCT ============ */
  console.log('\n\u2500\u2500 4. Add Product \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');
  await go('#/add');
  const WIDGET = { sellingPrice: 25, purchaseCost: 10, adCostPerSale: 3, shippingCost: 2,
                   platformFees: 2.5, discountPerSale: 1, returnCostPerSale: 0.5, unitsSold: 40 };
  const wm = CALC.computeMetrics(WIDGET);
  set('f-name', 'E2E Widget'); set('f-price', '25'); set('f-units', '40');
  set('f-purchase', '10'); set('f-ad', '3'); set('f-ship', '2');
  set('f-fees', '2.5'); set('f-discount', '1'); set('f-returns', '0.5');
  d.getElementById('f-price').dispatchEvent(new w.Event('input', { bubbles: true }));
  await tick(40);
  test('live preview computes while typing (engine numbers)', () => {
    const t = d.querySelector('#lp-rows').textContent;
    assert.ok(t.includes(money(wm.revenue)), 'revenue');
    assert.ok(t.includes(money(wm.trueProfit)), 'profit');
  });
  submit(); await tick(70);
  test('product saved and listed with engine-true numbers', () => {
    assert.equal(rows().length, 1);
    const row = rows()[0];
    assert.ok(row.textContent.includes('E2E Widget'));
    assert.ok(row.textContent.includes(money(wm.revenue)), 'revenue');
    assert.ok(row.textContent.includes(money(wm.trueProfit)), 'profit');
    assert.ok(row.textContent.includes(CALC.pct1(wm.profitMargin)), 'margin');
  });
  test('dashboard KPIs now equal the engine for this product', () => {
    const t = d.querySelector('#kpi-grid').textContent;
    assert.ok(t.includes(money(wm.revenue)));
    assert.ok(t.includes(money(wm.trueProfit)));
  });
  test('product persisted to localStorage', () => {
    assert.equal(storage().length, 1);
    assert.equal(storage()[0].name, 'E2E Widget');
  });

  /* ============ 5. ANALYSIS ============ */
  console.log('\n\u2500\u2500 5. Analysis \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');
  d.querySelector('#table-wrap .btn-view').click(); await tick(70);
  test('View Analysis opens the product page', () => {
    assert.ok(!d.querySelector('#page-analysis').hidden);
    assert.ok(d.querySelector('#analysis-head h1').textContent.includes('E2E Widget'));
  });
  test('stat tiles = engine (profit, per unit, margin, break-even)', () => {
    const t = d.querySelector('#analysis-stats').textContent;
    assert.ok(t.includes(money(wm.trueProfit)));
    assert.ok(t.includes(money(wm.profitPerUnit)));
    assert.ok(t.includes(CALC.pct1(wm.profitMargin)));
    assert.ok(t.includes(money(wm.totalCostPerUnit)));
  });
  test('numbers table: revenue row and total cost = engine', () => {
    const t = d.querySelector('#analysis-numbers').textContent;
    assert.ok(t.includes(money(wm.revenue)));
    assert.ok(t.includes(money(wm.totalCost)));
  });

  /* ============ 6. SMART DIAGNOSIS ============ */
  console.log('\n\u2500\u2500 6. Smart Diagnosis \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');
  const big = CALC.biggestCost(WIDGET);
  test('diagnosis tiles = engine (profit + biggest leak + action)', () => {
    assert.ok(d.querySelector('.diag-current .diag-value').textContent.includes(money(wm.trueProfit)));
    assert.equal(d.querySelector('.diag-tile.diag-leak .diag-value').textContent.trim(), big.label);
    assert.ok(d.querySelector('.diag-tile.diag-action .diag-value').textContent.length > 3);
  });
  test('diagnosis sentence quotes the real share of total costs', () => {
    const sent = d.querySelector('.diag-sentence').textContent;
    assert.ok(sent.includes(big.label.toLowerCase()));
    assert.ok(sent.includes(CALC.pct(big.total / wm.totalCost * 100) + ' of your total costs'));
  });
  test('FREE plan: simulator, cost ranking and goal are locked', () => {
    assert.equal(d.querySelectorAll('#diagnosis-section .pro-locked').length, 3);
    assert.ok(d.querySelector('#diagnosis-section').textContent.includes('Upgrade to Pro'));
  });

  /* ============ 7. WHAT-IF SIMULATOR ============ */
  console.log('\n\u2500\u2500 7. What-If Simulator \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');
  await go('#/pricing');
  test('PRO card sells subscriptions on-site + license box', () => {
    const link = d.querySelector('#pricing-body a[href*="checkout-start?method=paypal&plan=yearly"]');
    assert.ok(link);
    assert.ok(d.querySelector('#pricing-body').textContent.includes('$19.99'));
    assert.ok(!d.querySelector('#pricing-body a[href*="gumroad.com"]'));
    assert.ok(d.getElementById('license-input'));
  });
  w.PL_PLAN.setPlan('pro'); // simulate the preview for the simulator stage
  await go('#/dashboard');
  test('Pro (preview) active for the simulator stage', () =>
    assert.ok(d.querySelector('#plan-nav .pro-badge')));
  await go('#/product/' + encodeURIComponent(storage()[0].id));
  test('simulator now unlocked (7 sliders + number inputs)', () => {
    assert.equal(d.querySelectorAll('#diagnosis-section [data-wi-slider]').length, 7);
    assert.equal(d.querySelectorAll('#diagnosis-section [data-wi-num]').length, 7);
  });
  const priceNum = d.querySelector('[data-wi-num="sellingPrice"]');
  priceNum.value = '30';
  priceNum.dispatchEvent(new w.Event('input', { bubbles: true }));
  await tick(40);
  const sim = CALC.simulate(WIDGET, { sellingPrice: 30 });
  test('live simulation = engine simulate() (profit + difference)', () => {
    const t = d.querySelector('#wi-results').textContent;
    assert.ok(t.includes(money(sim.metrics.trueProfit)), 'new total');
    assert.ok(t.includes(money(sim.diffTotal)), 'difference');
    assert.ok(t.includes('improves'), 'verdict');
  });
  d.getElementById('wi-apply').click(); await tick(70);
  test('Apply persists the simulated price to the product', () => {
    assert.equal(storage()[0].sellingPrice, 30);
    assert.ok(d.querySelector('#toast-container').textContent.includes('applied'));
  });

  /* ============ 8. CSV IMPORT ============ */
  console.log('\n\u2500\u2500 8. CSV Import \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');
  await go('#/dashboard');
  const csvText = 'Name,Selling Price,Purchase Cost,Ad Cost per Sale,Shipping Cost,Platform Fees,Discount per Sale,Return Cost per Sale,Units Sold\n' +
    'Imported Lamp,45,20,6,5,4,2,1,80\n' +
    'Imported Poster,15,4,3,2,1.5,0,0.5,120\n' +
    'Broken Row,-5,1,1,1,1,0,0,10\n';
  const fi = d.getElementById('csv-file');
  const ff = new w.File([csvText], 'e2e-import.csv', { type: 'text/csv' });
  Object.defineProperty(fi, 'files', { value: [ff], configurable: true });
  fi.dispatchEvent(new w.Event('change', { bubbles: true }));
  await tick(90);
  test('import preview opens via the Import CSV button + file dialog', () =>
    assert.ok(!d.querySelector('#import-overlay').hidden));
  test('preview: 2 valid products found, 1 row flagged with its reason', () => {
    const all = d.querySelector('#import-overlay').textContent;
    assert.ok(all.includes('2 valid product'));
    assert.ok(d.querySelector('#import-body').textContent.includes('Row 4')); // header is row 1, Broken Row is data row 3 -> line 4
    assert.ok(d.querySelector('#import-body').textContent.includes('greater than $0'));
  });
  d.getElementById('import-confirm').click(); await tick(90);
  test('confirm imports exactly the 2 valid rows (3 products total)', () => {
    assert.equal(storage().length, 3);
    assert.equal(rows().length, 3);
    assert.ok(d.querySelector('#table-wrap').textContent.includes('Imported Lamp'));
    assert.ok(d.querySelector('#toast-container').textContent.includes('Imported 2'));
  });

  /* ============ 9. REPORT ============ */
  console.log('\n\u2500\u2500 9. Report \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');
  await go('#/report');
  const s = CALC.summarizePortfolio(storage());
  test('report summary tiles = engine totals for all 3 products', () => {
    const t = d.querySelector('#report-body').textContent;
    assert.ok(t.includes(money(s.revenue)), 'revenue');
    assert.ok(t.includes(money(s.totalCost)), 'costs');
    assert.ok(t.includes(money(s.trueProfit)), 'profit');
    assert.ok(t.includes(CALC.pct1(s.margin)), 'margin');
    assert.ok(t.includes('3 products') || t.includes('3 product'), 'count');
  });
  test('report lists top performers and biggest losses sections', () => {
    const t = d.querySelector('#report-body').textContent;
    assert.ok(t.includes('Top performers'));
    assert.ok(t.includes('Biggest losses'));
  });
  test('report recommendations are generated from the entered data', () => {
    assert.ok(d.querySelectorAll('#report-body .recs li').length >= 3);
  });
  test('print button enabled (Save as PDF works via browser print)', () =>
    assert.ok(!d.getElementById('report-print').disabled));

  /* ============ 10. FREE / PRO ============ */
  console.log('\n\u2500\u2500 10. Free / Pro \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');
  await go('#/pricing');
  w.PL_PLAN.setPlan('free'); // preview era ended — plan returns to Free
  await go('#/dashboard');
  test('returning to Free shows the upgrade button (data stays safe)', () => {
    assert.ok(d.querySelector('#plan-nav .btn-gold'));
  });
  await go('#/add');
  test('free plan at the limit blocks a 4th product with upgrade panel', () => {
    assert.ok(d.querySelector('.form-layout').hidden);
    assert.ok(!d.querySelector('#form-upsell').hidden);
    assert.ok(d.querySelector('#form-upsell').textContent.includes('free plan limit'));
  });
  await go('#/pricing');
  w.PL_PLAN.setPlan('pro'); // simulate the preview
  await go('#/add');
  set('f-name', 'Pro Fourth Item'); set('f-price', '60'); set('f-units', '10');
  set('f-purchase', '30');
  submit(); await tick(70);
  test('Pro allows the 4th product (unlimited)', () => {
    assert.equal(storage().length, 4);
    assert.equal(rows().length, 4);
  });
  d.querySelector('.table-tools [data-action="load-samples"]').click(); await tick(40);
  await confirmModal();
  test('demo data on Pro loads all 6 samples (clearly labeled)', () => {
    assert.equal(d.querySelectorAll('#table-wrap .badge-demo').length, 6);
    assert.equal(rows().length, 10);
  });

  /* ============ 11. MOBILE LAYOUT (structure + CSS) ============ */
  console.log('\n\u2500\u2500 11. Mobile layout \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');
  test('viewport meta present', () =>
    assert.ok(d.querySelector('meta[name="viewport"][content*="width=device-width"]')));
  test('tablet + phone breakpoints exist in CSS', () => {
    assert.ok(CSS_TEXT.includes('max-width: 760px'));
    assert.ok(CSS_TEXT.includes('max-width: 480px'));
    assert.ok((CSS_TEXT.match(/@media/g) || []).length >= 10);
  });
  test('table turns into labeled cards on mobile (data-label)', () =>
    assert.ok(CSS_TEXT.includes('attr(data-label)')));
  test('every table cell has its data-label', () => {
    Array.from(rows()).forEach(r => Array.from(r.querySelectorAll('td')).forEach(td =>
      assert.ok(td.getAttribute('data-label'))));
  });
  test('number inputs show the right mobile keyboard (inputmode)', () => {
    assert.equal(d.getElementById('f-price').getAttribute('inputmode'), 'decimal');
    assert.equal(d.getElementById('f-units').getAttribute('inputmode'), 'numeric');
  });
  test('all text inputs are 16px+ (no iOS zoom-on-focus)', () => {
    assert.ok(/\.field input\s*{[^}]*font-size:\s*16px/.test(CSS_TEXT), '.field input 16px');
    assert.ok(/\.wi-num\s*{[^}]*font-size:\s*16px/.test(CSS_TEXT), '.wi-num 16px');
    assert.ok(/#goal-input\s*{[^}]*font-size:\s*16px/.test(CSS_TEXT), '#goal-input 16px');
  });
  test('print CSS hides interactive chrome everywhere (Ctrl+P from any page)', () => {
    const m = CSS_TEXT.match(/@media print\s*{([\s\S]*)}/);
    assert.ok(m, 'print block exists');
    ['.table-tools', '.table-filters', '.help-btn', '.btn', '.btn-view', '.wi-slider'].forEach(sel =>
      assert.ok(m[1].includes(sel), sel + ' hidden in print'));
  });

  /* ============ 12. RAPID DOUBLE-SUBMIT (deployment hardening) ============ */
  console.log('\n\u2500\u2500 12. Rapid double-submit \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');
  await go('#/add');
  set('f-name', 'Double Submit Guard'); set('f-price', '22'); set('f-units', '15');
  set('f-purchase', '9');
  const fire = () => d.getElementById('product-form')
    .dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  fire(); fire(); fire(); // stuck Enter key / double-firing input device
  await tick(90);
  test('triple-firing the save button creates exactly ONE product', () => {
    assert.equal(storage().filter(pr => pr.name === 'Double Submit Guard').length, 1);
    assert.equal(storage().length, 11);
  });
  await go('#/add'); // reopening the form must clear the lock
  set('f-name', 'After Unlock'); set('f-price', '10'); set('f-units', '5'); set('f-purchase', '2');
  fire(); await tick(90);
  test('the form unlocks again on the next visit', () =>
    assert.equal(storage().filter(pr => pr.name === 'After Unlock').length, 1));

  test('help buttons are real buttons (touch-friendly, no hover-only UI)', () => {
    const btns = d.querySelectorAll('#kpi-grid .help-btn');
    assert.ok(btns.length >= 5);
    btns.forEach(b => assert.equal(b.tagName, 'BUTTON'));
  });

  /* ============ FINAL GATE ============ */
  test('NO runtime errors during the entire journey', () => {
    if (PAGE_ERRORS.length) console.error('        page errors: ' + PAGE_ERRORS.slice(0, 5).join(' | '));
    assert.equal(PAGE_ERRORS.length, 0);
  });
  test('final state persisted (12 products = 6 real + 6 demo)', () =>
    assert.equal(storage().length, 12));

  dom.window.close();

  console.log('\n\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');
  console.log('E2E JOURNEY: ' + passed + ' passed, ' + failed + ' failed');
  console.log('\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');
  if (failed) process.exitCode = 1;
}

main().catch(e => { console.error('E2E FATAL:', e && (e.stack || e)); process.exit(1); });
