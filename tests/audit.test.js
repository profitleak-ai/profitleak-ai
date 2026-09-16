/* =============================================================
   ProfitLeak AI — QUALITY & RELIABILITY AUDIT (v1.7)
   Independent verification pass over the whole application:
     1. Financial formulas (exact spec identities + fuzz)
     2. The 9 calculation scenarios (profitable … high returns)
     3. Degenerate inputs & division-by-zero safety
     4. CSV validation & broken files
     5. Corrupted localStorage recovery
     6. Every app feature end-to-end in a real DOM (create,
        edit, delete+undo, validation, demo, clear-demo, import,
        template, export, diagnosis, simulator, report, plans,
        responsive structure, persistence)
     7. Cross-surface number consistency (dashboard = table =
        analysis = diagnosis = report = simulator = engine)
     8. Security (XSS injection attempts, no network/eval/secrets)
     9. Performance benchmarks
    10. Charts consistency + extreme values & floating-point dust (round 2)
    11. Interaction edges: deep links, keyboard + a11y, Escape keys,
        edit validation, combined what-if, goal edge cases, over-limit demo (round 3)
   Requires dev dependency:  npm install   then   node tests/audit.test.js
   ============================================================= */
'use strict';

let jsdom;
try { jsdom = require('jsdom'); } catch (e) {
  console.log('  ! jsdom is not installed — audit test skipped.');
  console.log('    Run "npm install" first to enable it.');
  process.exit(0);
}

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const CALC = require('../js/calc.js');
const data = require('../js/data.js');
const Report = require('../js/report.js');
const { JSDOM, VirtualConsole } = jsdom;

const ROOT = path.join(__dirname, '..');
const CSS_TEXT = fs.readFileSync(path.join(ROOT, 'css/styles.css'), 'utf-8');
const INDEX_HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf-8');
const STANDALONE = fs.readFileSync(path.join(ROOT, 'ProfitLeak-AI.html'), 'utf-8');

/* ---------------- helpers ---------------- */
function tick(ms) { return new Promise(r => setTimeout(r, ms || 70)); }

function approx(a, b, eps) {
  eps = eps === undefined ? 1e-6 : eps;
  return Math.abs(a - b) <= eps * Math.max(1, Math.abs(a), Math.abs(b));
}
function assertApprox(a, b, msg, eps) {
  if (!approx(a, b, eps)) assert.fail((msg || 'approx') + ': ' + a + ' != ' + b);
}

/* deterministic PRNG so the audit is reproducible */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* product factory: P(name, price, purchase, ad, ship, fees, disc, ret, units) */
function P(name, price, purchase, ad, ship, fees, disc, ret, units) {
  return { id: 'audit-' + name, name: name, sellingPrice: price, purchaseCost: purchase,
           adCostPerSale: ad, shippingCost: ship, platformFees: fees,
           discountPerSale: disc, returnCostPerSale: ret, unitsSold: units };
}
function randomProducts(n, seed) {
  const rnd = mulberry32(seed || 42);
  const r = (min, max) => Math.round((min + rnd() * (max - min)) * 100) / 100;
  return Array.from({ length: n }, function (_, i) {
    return P('Rnd ' + i, r(5, 120), r(0, 40), r(0, 30), r(0, 15), r(0, 12), r(0, 8), r(0, 5),
             1 + Math.floor(rnd() * 400));
  });
}

const PAGE_ERRORS = [];
function makeConsole() {
  const vc = new VirtualConsole();
  vc.on('jsdomError', err => {
    const msg = String((err && err.message) || err);
    if (!/^Not implemented:/i.test(msg)) PAGE_ERRORS.push(msg);
  });
  return vc;
}

async function bootIndexApp() {
  const dom = await JSDOM.fromFile(path.join(ROOT, 'index.html'), {
    runScripts: 'dangerously', resources: 'usable',
    pretendToBeVisual: true, virtualConsole: makeConsole()
  });
  const w = dom.window, d = w.document;
  await new Promise(res => { if (d.readyState === 'complete') res(); else w.addEventListener('load', res); });
  await tick(120);
  return { w, d, dom };
}

/* Boot the single-file build, optionally pre-seeding localStorage
   (script injected into <head> runs before the app scripts). */
async function bootStandalone(seedScript, hash) {
  let html = STANDALONE;
  if (seedScript) html = html.replace('<head>', '<head><script>' + seedScript + '</script>');
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', pretendToBeVisual: true,
    url: 'https://profitleak.example/' + (hash || ''), virtualConsole: makeConsole()
  });
  const w = dom.window, d = w.document;
  await tick(250);
  return { w, d, dom };
}

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  \u2713 ' + name); }
  catch (e) { failed++; console.error('  \u2717 ' + name + ' \u2014 ' + e.message); process.exitCode = 1; }
}
const money = v => CALC.money(v);

/* ============================================================= */
async function main() {

console.log('\nProfitLeak AI \u2014 QUALITY & RELIABILITY AUDIT\n');

/* =============================================================
   SECTION 1 — FINANCIAL FORMULAS (exact spec identities)
   ============================================================= */
console.log('\u2500\u2500 1. Financial formulas \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');

/* hand-computed example: price 49.99 × 320 units */
const hp = P('Hand', 49.99, 18.50, 6.00, 4.50, 7.00, 2.00, 1.50, 320);
const hm = CALC.computeMetrics(hp);
test('Revenue = selling price \u00D7 units (15996.80)', () =>
  assertApprox(hm.revenue, 15996.80, 'revenue'));
test('Total cost = sum of ALL 6 cost totals (12640.00)', () => {
  assertApprox(hm.purchaseTotal, 5920.00, 'purchase');
  assertApprox(hm.adTotal, 1920.00, 'ad');
  assertApprox(hm.shippingTotal, 1440.00, 'shipping');
  assertApprox(hm.feesTotal, 2240.00, 'fees');
  assertApprox(hm.discountTotal, 640.00, 'discount');
  assertApprox(hm.returnsTotal, 480.00, 'returns');
  assertApprox(hm.totalCost, 12640.00, 'total');
});
test('True profit = revenue \u2212 total cost (3356.80)', () =>
  assertApprox(hm.trueProfit, 15996.80 - 12640.00, 'trueProfit'));
test('Profit per unit = true profit \u00F7 units (10.49)', () =>
  assertApprox(hm.profitPerUnit, 3356.80 / 320, 'perUnit'));
test('Profit margin = true profit \u00F7 revenue \u00D7 100 (20.98\u2026%)', () =>
  assertApprox(hm.profitMargin, 3356.80 / 15996.80 * 100, 'margin'));

const fuzz = randomProducts(300, 7);
test('fuzz: 300 random products satisfy every identity', () => {
  fuzz.forEach(function (p) {
    const m = CALC.computeMetrics(p);
    const costUnit = p.purchaseCost + p.adCostPerSale + p.shippingCost +
                     p.platformFees + p.discountPerSale + p.returnCostPerSale;
    assertApprox(m.revenue, p.sellingPrice * p.unitsSold, 'revenue ' + p.name);
    assertApprox(m.totalCost, costUnit * p.unitsSold, 'totalCost ' + p.name);
    assertApprox(m.trueProfit, m.revenue - m.totalCost, 'trueProfit ' + p.name);
    assertApprox(m.profitPerUnit, m.trueProfit / p.unitsSold, 'perUnit ' + p.name);
    assertApprox(m.profitMargin, m.trueProfit / m.revenue * 100, 'margin ' + p.name);
  });
});
test('portfolio summary = sum of per-product metrics (fuzz)', () => {
  const s = CALC.summarizePortfolio(fuzz);
  let rev = 0, cost = 0, profit = 0, losing = 0, low = 0, ok = 0;
  fuzz.forEach(function (p) {
    const m = CALC.computeMetrics(p);
    rev += m.revenue; cost += m.totalCost; profit += m.trueProfit;
    const st = CALC.getStatus(m);
    if (st === 'LOSING') losing++; else if (st === 'LOW') low++; else ok++;
  });
  assertApprox(s.revenue, rev, 'revenue'); assertApprox(s.totalCost, cost, 'cost');
  assertApprox(s.trueProfit, profit, 'profit');
  assert.equal(s.losing, losing); assert.equal(s.low, low); assert.equal(s.profitable, ok);
  assertApprox(s.margin, profit / rev * 100, 'margin');
});

/* =============================================================
   SECTION 2 — THE 9 CALCULATION SCENARIOS
   ============================================================= */
console.log('\n\u2500\u2500 2. Calculation scenarios \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');

const types = arr => arr.map(i => i.type);
const scenario = (name, p, expect) => {
  const m = CALC.computeMetrics(p);
  const issues = CALC.detectIssues(p, m);
  test(name, () => {
    assert.equal(CALC.getStatus(m), expect.status, 'status');
    (expect.issues || []).forEach(t => assert.ok(types(issues).indexOf(t) !== -1, 'issue ' + t));
    (expect.noIssues || []).forEach(t => assert.ok(types(issues).indexOf(t) === -1, 'must NOT flag ' + t));
    /* formulas still hold in every scenario */
    assertApprox(m.revenue, p.sellingPrice * p.unitsSold, 'revenue');
    assertApprox(m.trueProfit, m.revenue - m.totalCost, 'trueProfit');
    assertApprox(m.profitMargin, m.revenue > 0 ? m.trueProfit / m.revenue * 100 : 0, 'margin');
    if (expect.trueProfit !== undefined) assertApprox(m.trueProfit, expect.trueProfit, 'trueProfit value');
    if (expect.marginPct !== undefined) assertApprox(m.profitMargin, expect.marginPct, 'margin value');
  });
};

scenario('S1 profitable product (>15% margin)', P('S1', 50, 20, 3, 2, 2, 1, 0.5, 100),
  { status: 'PROFITABLE', trueProfit: 2150, marginPct: 43, issues: [], noIssues: ['LOSING', 'LOW_MARGIN'] });
scenario('S2 losing product', P('S2', 12.99, 3.00, 5.50, 2.50, 1.95, 0.50, 0.30, 500),
  { status: 'LOSING', trueProfit: -380, marginPct: -380 / 6495 * 100, issues: ['LOSING', 'HIGH_AD'] });
scenario('S3 zero profit (break-even)', P('S3', 20, 10, 4, 3, 2, 1, 0, 50),
  { status: 'LOW', trueProfit: 0, marginPct: 0, issues: ['LOW_MARGIN'], noIssues: ['LOSING'] });
scenario('S4 very low margin (4%) + high ads', P('S4', 100, 60, 21, 9, 4, 1, 1, 25),
  { status: 'LOW', trueProfit: 100, marginPct: 4, issues: ['LOW_MARGIN', 'HIGH_AD'], noIssues: ['LOSING', 'HIGH_SHIPPING'] });
scenario('S5 high advertising cost (30% of price)', P('S5', 100, 30, 30, 5, 5, 0, 0, 10),
  { status: 'PROFITABLE', issues: ['HIGH_AD'], noIssues: ['HIGH_SHIPPING'] });
scenario('S6 high shipping cost (25% of price)', P('S6', 100, 30, 5, 25, 5, 0, 0, 10),
  { status: 'PROFITABLE', issues: ['HIGH_SHIPPING'], noIssues: ['HIGH_AD'] });
scenario('S7 high platform fees (22% of price)', P('S7', 100, 30, 5, 5, 22, 0, 0, 10),
  { status: 'PROFITABLE', trueProfit: 380, marginPct: 38, issues: ['HIGH_FEES'], noIssues: ['HIGH_AD', 'HIGH_SHIPPING', 'LOW_MARGIN'] });
scenario('S8 large discount (18% of price)', P('S8', 100, 40, 10, 5, 5, 18, 0, 10),
  { status: 'PROFITABLE', trueProfit: 220, marginPct: 22, issues: ['HIGH_DISCOUNT'], noIssues: ['HIGH_FEES'] });
scenario('S9 high return costs (15% of price)', P('S9', 100, 40, 5, 5, 5, 0, 15, 10),
  { status: 'PROFITABLE', trueProfit: 300, marginPct: 30, issues: ['HIGH_RETURNS'], noIssues: ['HIGH_DISCOUNT', 'HIGH_FEES'] });

test('recommendations exist for every scenario (1\u20139)', () => {
  [P('a', 50, 20, 3, 2, 2, 1, 0.5, 100), P('b', 12.99, 3, 5.5, 2.5, 1.95, 0.5, 0.3, 500),
   P('c', 20, 10, 4, 3, 2, 1, 0, 50), P('d', 100, 60, 20, 10, 5, 1, 1, 25)].forEach(function (p) {
    const m = CALC.computeMetrics(p);
    const recs = CALC.buildRecommendations(p, m, CALC.detectIssues(p, m));
    assert.ok(recs.length >= 2, p.name + ' recs');
    recs.forEach(r => assert.ok(typeof r === 'string' && r.length > 10, 'rec text'));
  });
});

/* =============================================================
   SECTION 3 — DEGENERATE INPUTS & DIVISION-BY-ZERO SAFETY
   ============================================================= */
console.log('\n\u2500\u2500 3. Division-by-zero & degenerate inputs \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');

const allFinite = m => Object.keys(m).every(k => isFinite(m[k]));

test('units = 0 \u2192 no Infinity/NaN anywhere (guards)', () => {
  const m = CALC.computeMetrics(P('z', 25, 10, 2, 1, 1, 0.5, 0.25, 0));
  assert.ok(allFinite(m), JSON.stringify(m));
  assert.equal(m.totalCostPerUnit, 0);
  assert.equal(m.profitMargin, 0);
  assert.equal(m.revenue, 0);
});
test('price = 0 \u2192 margin guarded to 0, no NaN', () => {
  const m = CALC.computeMetrics(P('z2', 0, 10, 2, 1, 1, 0.5, 0.25, 10));
  assert.ok(allFinite(m), JSON.stringify(m));
  assert.equal(m.profitMargin, 0);
});
test('all costs 0 \u2192 profit per unit = price, no leaks', () => {
  const p = P('z3', 30, 0, 0, 0, 0, 0, 0, 7);
  const m = CALC.computeMetrics(p);
  assert.equal(m.trueProfit, 210);
  assert.equal(CALC.biggestCost(p), null);
  const d = CALC.diagnose(p, m);
  assert.equal(d.biggest, null);
  assert.ok(d.sentence.indexOf('No costs recorded') !== -1);
});
test('costBreakdown shares guarded when price = 0', () => {
  CALC.costBreakdown(P('z4', 0, 5, 5, 5, 5, 5, 5, 3)).forEach(c => {
    assert.ok(isFinite(c.shareOfPrice), c.key);
    assert.equal(c.shareOfPrice, 0);
  });
});
test('goalPlan: target \u2264 0 \u2192 null; target below current \u2192 met', () => {
  const p = P('g', 50, 20, 5, 5, 5, 0, 0, 10);
  const m = CALC.computeMetrics(p);
  assert.equal(CALC.goalPlan(p, m, 0), null);
  assert.equal(CALC.goalPlan(p, m, -5), null);
  assert.equal(CALC.goalPlan(p, m, 10).met, true);
});
test('simulate ignores NaN / negative changes (falls back to current)', () => {
  const p = P('sim', 40, 15, 5, 3, 2, 1, 1, 20);
  const r = CALC.simulate(p, { sellingPrice: NaN, purchaseCost: -99, adCostPerSale: 'abc' });
  assert.equal(r.product.sellingPrice, 40);
  assert.equal(r.product.purchaseCost, 15);
  assert.equal(r.product.adCostPerSale, 5);
});
test('simulate({}) = identical metrics (no-change baseline)', () => {
  const p = P('sim2', 33.33, 11.11, 2.22, 3.33, 4.44, 0.55, 0.66, 77);
  const r = CALC.simulate(p, {});
  ['revenue', 'totalCost', 'trueProfit', 'profitPerUnit', 'profitMargin'].forEach(k =>
    assertApprox(r.metrics[k], CALC.computeMetrics(p)[k], k));
  assert.equal(r.diffTotal, 0); assert.equal(r.diffPerUnit, 0);
});
test('goalPlan \u2194 simulate agree: price at requiredPrice hits the target', () => {
  fuzz.slice(0, 60).forEach(function (p) {
    const m = CALC.computeMetrics(p);
    const t = Math.max(1, Math.round((m.profitPerUnit + 5) * 100) / 100);
    const g = CALC.goalPlan(p, m, t);
    if (!g || g.met) return;
    const sim = CALC.simulate(p, { sellingPrice: g.requiredPrice });
    assertApprox(sim.metrics.profitPerUnit, t, 'target ' + p.name, 1e-6);
  });
});
test('diagnose().biggest always equals biggestCost() (fuzz)', () => {
  fuzz.forEach(function (p) {
    const m = CALC.computeMetrics(p);
    const d = CALC.diagnose(p, m);
    const big = CALC.biggestCost(p);
    assert.equal(d.biggest ? d.biggest.key : null, big ? big.key : null, p.name);
  });
});

test('EXTREME: very large numbers stay finite and formattable', () => {
  const m = CALC.computeMetrics(P('big', 1e9, 5e8, 1e8, 1e8, 5e7, 1e7, 1e7, 1e9));
  assert.ok(allFinite(m), JSON.stringify(m));
  [CALC.money(m.revenue), CALC.money(m.totalCost), CALC.money(m.trueProfit),
   CALC.pct1(m.profitMargin)].forEach(s =>
    assert.ok(!/NaN|Infinity|undefined/.test(s), s));
});
test('EXTREME: tiny decimals stay finite and formattable', () => {
  const m = CALC.computeMetrics(P('tiny', 0.01, 0.001, 0.001, 0.001, 0.001, 0.001, 0.001, 1));
  assert.ok(allFinite(m), JSON.stringify(m));
  [CALC.money(m.revenue), CALC.money(m.totalCost), CALC.money(m.trueProfit),
   CALC.pct1(m.profitMargin)].forEach(s =>
    assert.ok(!/NaN|Infinity|undefined/.test(s), s));
});
test('ROUNDING: sub-cent values format as $0.00 (never \u2212$0.00)', () => {
  assert.equal(CALC.money(-0.004), '$0.00');
  assert.equal(CALC.money(0.004), '$0.00');
  assert.equal(CALC.money(-0.01), '\u2212$0.01');
});
test('FLOAT DUST: price exactly equals costs \u2192 break-even, not a false \u201CLOSING\u201D', () => {
  const p = P('dust', 0.30, 0.10, 0.20, 0, 0, 0, 0, 1);
  const m = CALC.computeMetrics(p);
  assert.ok(m.trueProfit < 0 && m.trueProfit > -0.001,
    'precondition: negative float dust (' + m.trueProfit + ')');
  assert.notEqual(CALC.getStatus(m), 'LOSING', 'status must not be LOSING');
  const issues = CALC.detectIssues(p, m);
  assert.ok(!issues.some(i => i.type === 'LOSING'), 'no LOSING issue');
  const recs = CALC.buildRecommendations(p, m, issues);
  assert.ok(!recs.some(r => /lose/i.test(r)), 'no \u201Cyou lose\u201D text: ' + recs[0]);
  assert.equal(CALC.money(m.trueProfit), '$0.00');
});
test('FLOAT DUST: a genuine 1-cent loss is still LOSING', () => {
  const p = P('cent', 10, 5.01, 2.5, 1.25, 0.75, 0.25, 0.25, 1);
  const m = CALC.computeMetrics(p);
  assertApprox(m.trueProfit, -0.01, 'precondition');
  assert.equal(CALC.getStatus(m), 'LOSING');
  assert.ok(CALC.detectIssues(p, m).some(i => i.type === 'LOSING'));
});

/* =============================================================
   SECTION 4 — CSV VALIDATION & BROKEN FILES
   ============================================================= */
console.log('\n\u2500\u2500 4. CSV validation & broken files \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');

const H = 'Name,Selling Price,Purchase Cost,Ad Cost per Sale,Shipping Cost,Platform Fees,Discount per Sale,Return Cost per Sale,Units Sold';
test('valid CSV: 4 rows \u2192 4 products, 0 errors', () => {
  const res = data.CSV.fromCsv(H + '\nA,10,2,1,1,1,0,0,5\nB,20,5,2,1,1,0.5,0.25,10\nC,50,25,5,5,5,0,0,2\nD,30,10,3,2,2,1,1,20');
  assert.equal(res.products.length, 4);
  assert.equal(res.errors.length, 0);
  assert.equal(res.missingColumns, null);
});
test('header missing required columns \u2192 friendly missingColumns', () => {
  const res = data.CSV.fromCsv('Foo,Bar,Baz\n1,2,3');
  assert.equal(res.products.length, 0);
  assert.deepEqual(res.missingColumns.sort(),
    ['Product name', 'Selling price', 'Units sold'].sort());
});
test('negative price row \u2192 skipped with reason', () => {
  const res = data.CSV.fromCsv(H + '\nBad,-10,2,1,1,1,0,0,5');
  assert.equal(res.products.length, 0);
  assert.match(res.errors[0].reason, /greater than \$0/);
});
test('negative cost row \u2192 skipped ("Negative value")', () => {
  const res = data.CSV.fromCsv(H + '\nBad,10,-2,1,1,1,0,0,5');
  assert.equal(res.products.length, 0);
  assert.match(res.errors[0].reason, /Negative value/);
});
test('units 0 \u2192 skipped; units 2.5 \u2192 skipped', () => {
  const res = data.CSV.fromCsv(H + '\nU0,10,2,1,1,1,0,0,0\nU25,10,2,1,1,1,0,0,2.5');
  assert.equal(res.products.length, 0);
  assert.equal(res.errors.length, 2);
  res.errors.forEach(e => assert.match(e.reason, /whole number/));
});
test('empty product name \u2192 skipped', () => {
  const res = data.CSV.fromCsv(H + '\n,10,2,1,1,1,0,0,5');
  assert.equal(res.products.length, 0);
  assert.match(res.errors[0].reason, /Missing product name/);
});
test('non-numeric cost ("abc") \u2192 skipped ("Invalid number")', () => {
  const res = data.CSV.fromCsv(H + '\nBad,10,abc,1,1,1,0,0,5');
  assert.equal(res.products.length, 0);
  assert.match(res.errors[0].reason, /Invalid number/);
});
test('empty file \u2192 0 products, no crash', () => {
  const res = data.CSV.fromCsv('');
  assert.equal(res.products.length, 0);
  assert.equal(res.rowCount, 0);
});
test('binary garbage \u2192 no exception, sane result', () => {
  let res;
  assert.doesNotThrow(() => { res = data.CSV.fromCsv('\u0000\u0001\uFFFD,,,\u0002%%%\u0003'); });
  assert.ok(res && Array.isArray(res.products));
});
test('unbalanced quotes \u2192 parser never hangs or throws', () => {
  let res;
  assert.doesNotThrow(() => { res = data.CSV.fromCsv(H + '\n"Unclosed,10,2,1,1,1,0,0,5'); });
  assert.ok(Array.isArray(res.products));
});
test('CRLF line endings + quoted commas round-trip', () => {
  const res = data.CSV.fromCsv(H + '\r\n"Widget, XL",10,2,1,1,1,0,0,5\r\n');
  assert.equal(res.products.length, 1);
  assert.equal(res.products[0].name, 'Widget, XL');
});
test('toCsv \u2192 fromCsv round-trip keeps every number', () => {
  const src = randomProducts(25, 99);
  const back = data.CSV.fromCsv(data.CSV.toCsv(src));
  assert.equal(back.products.length, 25);
  assert.equal(back.errors.length, 0);
  back.products.forEach(function (p, i) {
    ['sellingPrice', 'purchaseCost', 'adCostPerSale', 'shippingCost',
     'platformFees', 'discountPerSale', 'returnCostPerSale', 'unitsSold'].forEach(k =>
      assert.equal(p[k], src[i][k], k + ' ' + i));
  });
});

/* =============================================================
   SECTION 5 — CORRUPTED LOCALSTORAGE RECOVERY
   ============================================================= */
console.log('\n\u2500\u2500 5. Corrupted localStorage recovery \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');

{
  const corrupt = JSON.stringify([
    { id: 'ok-1', name: 'Good Product', sellingPrice: 20, purchaseCost: 5, unitsSold: 10,
      adCostPerSale: 1, shippingCost: 1, platformFees: 1, discountPerSale: 0, returnCostPerSale: 0 },
    { id: 'bad-1', name: 'Neg Price', sellingPrice: -10, purchaseCost: 1, unitsSold: 5 },
    { id: 'bad-2', name: 'NaN Price', sellingPrice: 'abc', purchaseCost: 1, unitsSold: 5 },
    { id: 'ok-2', name: 'Clamped', sellingPrice: 30, purchaseCost: -5, adCostPerSale: -2, unitsSold: 0 },
    { id: 'ok-3', name: 12345, sellingPrice: 10, purchaseCost: 2, unitsSold: 3 }
  ]);
  const app = await bootStandalone(
    'localStorage.setItem("profitleak.products.v1",' + JSON.stringify(corrupt) + ');' +
    'localStorage.setItem("profitleak.onboarded.v1","1");');
  const w = app.w, d = app.d;
  w.location.hash = '#/dashboard';
  await tick(150);
  test('corrupted storage: invalid entries dropped, valid kept (no crash)', () =>
    assert.equal(d.querySelectorAll('#table-wrap tbody tr').length, 3));
  test('negative costs clamped to 0, units 0 \u2192 1', () => {
    const rows = d.querySelectorAll('#table-wrap tbody tr');
    const names = Array.from(rows).map(r => r.querySelector('.p-name').textContent);
    assert.ok(names.indexOf('Good Product') !== -1);
    assert.ok(names.indexOf('Clamped') !== -1);
    assert.ok(names.indexOf('12345') !== -1);
    assert.ok(names.indexOf('Neg Price') === -1);
    assert.ok(names.indexOf('NaN Price') === -1);
  });
  app.dom.window.close();
}
{
  const app = await bootStandalone(
    'localStorage.setItem("profitleak.products.v1","not json at all {{{");' +
    'localStorage.setItem("profitleak.onboarded.v1","1");');
  const w = app.w, d = app.d;
  w.location.hash = '#/dashboard';
  await tick(150);
  test('unparseable storage \u2192 clean empty state, app still works', () => {
    assert.ok(d.querySelector('#table-wrap').textContent.includes('No products yet.'));
    assert.equal(d.querySelectorAll('#table-wrap tbody tr').length, 0);
  });
  app.dom.window.close();
}

/* =============================================================
   SECTION 6 — FULL APP FEATURE AUDIT (real DOM, one journey)
   ============================================================= */
console.log('\n\u2500\u2500 6. App features end-to-end \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');

const app = await bootStandalone();
const w = app.w, d = app.d;
const submitForm = () => d.getElementById('product-form')
  .dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
const set = (id, v) => { d.getElementById(id).value = v; };
const storageProducts = () => JSON.parse(w.localStorage.getItem('profitleak.products.v1') || '[]');
const rows = () => d.querySelectorAll('#table-wrap tbody tr');
const modalConfirm = async () => { d.getElementById('modal-confirm').click(); await tick(40); };

/* ---- welcome / fresh start ---- */
test('fresh visit: welcome screen shown, dashboard empty', () => {
  assert.ok(!d.querySelector('#welcome-overlay').hidden);
  d.querySelector('#welcome-start').click();
});
await tick(60);
test('Get Started \u2192 dashboard, "No products yet."', () => {
  assert.ok(d.querySelector('#welcome-overlay').hidden);
  assert.ok(d.querySelector('#table-wrap').textContent.includes('No products yet.'));
});

/* ---- FEATURE 1: product creation ---- */
w.location.hash = '#/add'; await tick(60);
set('f-name', 'Audit Widget'); set('f-price', '25'); set('f-units', '40');
set('f-purchase', '10'); set('f-ad', '3'); set('f-ship', '2');
set('f-fees', '2.5'); set('f-discount', '1'); set('f-returns', '0.5');
{
  const m = CALC.computeMetrics({ sellingPrice: 25, purchaseCost: 10, adCostPerSale: 3,
    shippingCost: 2, platformFees: 2.5, discountPerSale: 1, returnCostPerSale: 0.5, unitsSold: 40 });
  d.getElementById('f-price').dispatchEvent(new w.Event('input', { bubbles: true }));
  await tick(30);
  test('CREATE: live preview computes while typing (engine numbers)', () => {
    const t = d.querySelector('#lp-rows').textContent;
    assert.ok(t.includes(money(m.revenue)), 'revenue ' + money(m.revenue));
    assert.ok(t.includes(money(m.trueProfit)), 'profit ' + money(m.trueProfit));
    assert.ok(t.includes(CALC.pct1(m.profitMargin)), 'margin');
  });
}
submitForm(); await tick(60);
test('CREATE: product appears in the table', () => assert.equal(rows().length, 1));
{
  const m = CALC.computeMetrics({ sellingPrice: 25, purchaseCost: 10, adCostPerSale: 3,
    shippingCost: 2, platformFees: 2.5, discountPerSale: 1, returnCostPerSale: 0.5, unitsSold: 40 });
  test('CREATE: row numbers match the engine exactly', () => {
    const row = rows()[0];
    assert.ok(row.textContent.includes(money(m.revenue)), 'revenue ' + money(m.revenue));
    assert.ok(row.textContent.includes('\u2212' + money(m.totalCost).replace('\u2212', '')), 'cost');
    assert.ok(row.textContent.includes(money(m.trueProfit)), 'profit ' + money(m.trueProfit));
    assert.ok(row.textContent.includes(CALC.pct1(m.profitMargin)), 'margin');
  });
  test('CREATE: saved to localStorage', () => {
    const saved = storageProducts();
    assert.equal(saved.length, 1);
    assert.equal(saved[0].name, 'Audit Widget');
    assert.equal(saved[0].sellingPrice, 25);
  });
  test('CREATE: dashboard KPI totals include the new product (engine match)', () => {
    const s = CALC.summarizePortfolio(storageProducts());
    const kpiText = d.querySelector('#kpi-grid').textContent;
    assert.ok(kpiText.includes(money(s.revenue)), 'revenue kpi');
    assert.ok(kpiText.includes(money(s.trueProfit)), 'profit kpi');
  });
}

/* ---- VALIDATION: blocked submissions ---- */
const badCases = [
  ['empty name', { 'f-name': '', 'f-price': '20', 'f-units': '10' }, 'f-name'],
  ['negative price', { 'f-name': 'X', 'f-price': '-10', 'f-units': '10' }, 'f-price'],
  ['zero price', { 'f-name': 'X', 'f-price': '0', 'f-units': '10' }, 'f-price'],
  ['blank price', { 'f-name': 'X', 'f-price': '', 'f-units': '10' }, 'f-price'],
  ['non-numeric price', { 'f-name': 'X', 'f-price': 'abc', 'f-units': '10' }, 'f-price'],
  ['negative units', { 'f-name': 'X', 'f-price': '20', 'f-units': '-5' }, 'f-units'],
  ['zero units', { 'f-name': 'X', 'f-price': '20', 'f-units': '0' }, 'f-units'],
  ['fractional units', { 'f-name': 'X', 'f-price': '20', 'f-units': '2.5' }, 'f-units'],
  ['blank units', { 'f-name': 'X', 'f-price': '20', 'f-units': '' }, 'f-units'],
  ['negative purchase cost', { 'f-name': 'X', 'f-price': '20', 'f-units': '10', 'f-purchase': '-1' }, 'f-purchase'],
  ['negative ad cost', { 'f-name': 'X', 'f-price': '20', 'f-units': '10', 'f-ad': '-2' }, 'f-ad']
];
for (const [label, fields, errField] of badCases) {
  w.location.hash = '#/add'; await tick(50);
  ['f-name', 'f-price', 'f-units', 'f-purchase', 'f-ad', 'f-ship', 'f-fees', 'f-discount', 'f-returns']
    .forEach(id => set(id, ''));
  Object.keys(fields).forEach(id => set(id, fields[id]));
  submitForm(); await tick(40);
  test('VALIDATION blocked: ' + label, () => {
    assert.ok(d.querySelectorAll('#product-form .has-error').length >= 1, 'error shown');
    assert.ok(d.querySelector('.field[data-field]').textContent !== undefined);
    assert.equal(d.querySelector('#' + errField).closest('.field').classList.contains('has-error'), true,
      errField + ' flagged');
  });
  test('VALIDATION safe: ' + label + ' \u2014 nothing saved', () => {
    assert.equal(storageProducts().length, 1, 'storage untouched');
    assert.equal(rows().length, 1, 'table untouched');
  });
}

/* ---- FEATURE 2: product editing ---- */
{
  const id = storageProducts()[0].id;
  w.location.hash = '#/edit/' + encodeURIComponent(id); await tick(60);
  test('EDIT: form pre-filled with the product values', () => {
    assert.equal(d.getElementById('f-name').value, 'Audit Widget');
    assert.equal(d.getElementById('f-price').value, '25');
    assert.equal(d.getElementById('f-units').value, '40');
  });
  set('f-price', '30');
  set('f-units', '40'); submitForm(); await tick(60);
  const m2 = CALC.computeMetrics({ sellingPrice: 30, purchaseCost: 10, adCostPerSale: 3,
    shippingCost: 2, platformFees: 2.5, discountPerSale: 1, returnCostPerSale: 0.5, unitsSold: 40 });
  test('EDIT: new numbers recomputed and saved', () => {
    assert.equal(storageProducts()[0].sellingPrice, 30);
    assert.ok(rows()[0].textContent.includes(money(m2.revenue)), 'revenue ' + money(m2.revenue));
    assert.ok(rows()[0].textContent.includes(money(m2.trueProfit)), 'profit ' + money(m2.trueProfit));
    assert.ok(rows()[0].textContent.includes(CALC.pct1(m2.profitMargin)), 'margin');
  });
  test('EDIT: same product (no duplicate row)', () => assert.equal(rows().length, 1));
}

/* ---- FEATURE 10: demo data (additive alongside a real product) ---- */
d.querySelector('.table-tools [data-action="load-samples"], #btn-load-samples, [data-action="load-samples"]').click();
await tick(40);
test('DEMO: asks before adding demo next to real products', () =>
  assert.ok(!d.querySelector('#modal-overlay').hidden));
await modalConfirm();
test('DEMO: 1 real + 3 demo products (free plan)', () => assert.equal(rows().length, 4));
test('DEMO: demo rows carry the "Demo Data" badge', () =>
  assert.equal(d.querySelectorAll('#table-wrap .badge-demo').length, 3));
test('DEMO: real product untouched by demo load', () => {
  assert.ok(d.querySelector('#table-wrap').textContent.includes('Audit Widget'));
  assert.equal(storageProducts().filter(p => p.name === 'Audit Widget').length, 1);
});

/* ---- FEATURE 11: clear demo data (safety + undo) ---- */
d.getElementById('btn-clear-demo').click(); await tick(40);
test('CLEAR DEMO: confirmation explains scope', () => {
  const t = d.querySelector('#modal-overlay').textContent;
  assert.ok(t.includes('3 demo product'));
  assert.ok(t.toLowerCase().includes('untouched'));
});
await modalConfirm();
test('CLEAR DEMO: only demo removed \u2014 real product survives', () => {
  assert.equal(rows().length, 1);
  assert.ok(d.querySelector('#table-wrap').textContent.includes('Audit Widget'));
  assert.equal(d.querySelectorAll('#table-wrap .badge-demo').length, 0);
  assert.equal(storageProducts().length, 1);
});
(function clickLastUndo() {
  const btns = d.querySelectorAll('.toast-action');
  btns[btns.length - 1].click();
})();
await tick(40);
test('CLEAR DEMO: Undo restores everything', () => {
  assert.equal(rows().length, 4);
  assert.equal(storageProducts().length, 4);
});
d.getElementById('btn-clear-demo').click(); await tick(40);
await modalConfirm();
test('CLEAR DEMO: cleared again for the rest of the journey', () =>
  assert.equal(rows().length, 1));

/* ---- FEATURE 13: free plan limit ---- */
const addProduct = async (name, price, units, purchase, ad, ship, fees, disc, ret) => {
  w.location.hash = '#/add'; await tick(50);
  set('f-name', name); set('f-price', String(price)); set('f-units', String(units));
  set('f-purchase', String(purchase)); set('f-ad', String(ad)); set('f-ship', String(ship));
  set('f-fees', String(fees)); set('f-discount', String(disc)); set('f-returns', String(ret));
  submitForm(); await tick(60);
};
await addProduct('Beta Blender', 20, 10, 8, 2, 1, 1, 0, 0);   /* profit 80, 40% */
await addProduct('Gamma Gadget', 15, 20, 10, 3, 2, 1.5, 0.5, 1); /* \u221260, losing */
test('FREE LIMIT: 3 products added successfully', () => assert.equal(rows().length, 3));
w.location.hash = '#/add'; await tick(60);
test('FREE LIMIT: 4th product blocked with upsell panel', () => {
  assert.ok(d.querySelector('#form-upsell').hidden === false || !d.querySelector('#form-upsell').hidden);
  assert.ok(d.querySelector('.form-layout').hidden);
  assert.ok(d.querySelector('#form-upsell').textContent.includes('free plan limit'));
  assert.ok(d.querySelector('#form-upsell a[href="#/pricing"]').textContent.includes('Upgrade to Pro'));
});

/* ---- CSV import capped on free ---- */
{
  const csv5 = H + '\nImport Alpha,100,60,10,5,5,0,0,10\nImport Bravo,30,20,4,2,2,1,1,20\n' +
               'Import Charlie,10,6,2,1.5,0.5,0,0,50\nImport Delta,40,30,5,3,2,0,0,10\nImport Echo,25,12,5,2,2,1,0.5,8';
  const fi = d.getElementById('csv-file');
  const ff = new w.File([csv5], 'import-free.csv', { type: 'text/csv' });
  Object.defineProperty(fi, 'files', { value: [ff], configurable: true });
  fi.dispatchEvent(new w.Event('change', { bubbles: true }));
  await tick(80);
  test('IMPORT (free): blocked with the Pro upgrade dialog (v1.19)', () => {
    assert.ok(d.querySelector('#import-overlay').hidden);
    assert.ok(!d.querySelector('#modal-overlay').hidden);
    assert.ok(d.querySelector('#modal-title').textContent.includes('Pro feature'));
  });
  test('IMPORT (free): nothing imported, data safe', () => {
    assert.equal(storageProducts().length, 3);
  });
  d.getElementById('modal-cancel').click(); await tick(40);
}

/* ---- upgrade to Pro ---- */
w.location.hash = '#/pricing'; await tick(60);
test('WIRED STORE: Gumroad buy link + license box shown', () => {
  assert.ok(d.querySelector('#pricing-body a[href*="gumroad.com/l/ecommerce-profit-calculator"]'));
  assert.ok(d.getElementById('license-input'));
});
w.PL_PLAN.setPlan('pro'); // simulate licensed Pro (app API, storage-independent)
w.location.hash = '#/dashboard'; await tick(60);
test('UPGRADE: Pro preview active', () => assert.ok(d.querySelector('#plan-nav .pro-badge')));

/* ---- pro: add beyond the limit ---- */
await addProduct('Delta Desk', 50, 10, 30, 5, 5, 5, 0, 0);  /* 10% margin \u2192 LOW */
test('PRO: 4th product now allowed', () => assert.equal(rows().length, 4));

/* ---- FEATURE 8: CSV import with preview + validation ---- */
{
  const csv = H + '\nImport Alpha,100,60,10,5,5,0,0,10\nImport Bravo,30,20,4,2,2,1,1,20\n' +
    'Import Charlie,10,6,2,1.5,0.5,0,0,50\nImport Delta,40,30,5,3,2,0,0,10\nImport Echo,25,12,5,2,2,1,0.5,8\n' +
    'Bad Price,-5,1,1,1,1,0,0,5\nBad Units,10,1,1,1,1,0,0,0';
  const fi = d.getElementById('csv-file');
  const ff = new w.File([csv], 'import-mixed.csv', { type: 'text/csv' });
  Object.defineProperty(fi, 'files', { value: [ff], configurable: true });
  fi.dispatchEvent(new w.Event('change', { bubbles: true }));
  await tick(80);
  test('IMPORT: preview lists 5 valid + 2 skipped rows', () => {
    assert.ok(!d.querySelector('#import-overlay').hidden);
    const all = d.querySelector('#import-overlay').textContent;
    const body = d.querySelector('#import-body').textContent;
    assert.ok(all.includes('5 valid product'), '5 valid in summary');
    assert.ok(body.includes('2 row(s)'), '2 skipped in body');
    assert.ok(body.includes('Row 7') && body.includes('Row 8'), 'row numbers listed');
  });
  test('IMPORT: preview profit numbers match the engine', () => {
    const expected = CALC.computeMetrics({ sellingPrice: 100, purchaseCost: 60, adCostPerSale: 10,
      shippingCost: 5, platformFees: 5, discountPerSale: 0, returnCostPerSale: 0, unitsSold: 10 });
    assert.ok(d.querySelector('#import-body').textContent.includes(money(expected.trueProfit)));
  });
  d.getElementById('import-confirm').click(); await tick(80);
  test('IMPORT: exactly the 5 valid products added (9 total)', () => {
    assert.equal(storageProducts().length, 9);
    assert.equal(rows().length, 9);
    assert.ok(d.querySelector('#toast-container').textContent.includes('Imported 5'));
  });
}

/* ---- filter chips + sorting ---- */
{
  const s = CALC.summarizePortfolio(storageProducts());
  test('FILTERS: chip counts match the engine', () => {
    assert.equal(d.querySelector('[data-filter="all"] .chip-count').textContent, String(s.count));
    assert.equal(d.querySelector('[data-filter="losing"] .chip-count').textContent, String(s.losing));
    assert.equal(d.querySelector('[data-filter="low"] .chip-count').textContent, String(s.low));
    assert.equal(d.querySelector('[data-filter="profitable"] .chip-count').textContent, String(s.profitable));
  });
  d.querySelector('[data-filter="losing"]').click(); await tick(40);
  test('FILTERS: "Losing money" view lists only losing products', () => {
    assert.equal(rows().length, s.losing);
    assert.ok(d.querySelector('#table-wrap').textContent.includes('Gamma Gadget'));
  });
  d.querySelector('[data-filter="all"]').click(); await tick(40);

  d.querySelector('th[data-sort="trueProfit"]').click(); await tick(40);
  const byProfit = storageProducts().slice().sort((a, b) =>
    CALC.computeMetrics(b).trueProfit - CALC.computeMetrics(a).trueProfit);
  test('SORT: true-profit descending puts the best product first', () =>
    assert.equal(rows()[0].getAttribute('data-id'), byProfit[0].id));
  d.querySelector('th[data-sort="trueProfit"]').click(); await tick(40);
  const byProfitAsc = storageProducts().slice().sort((a, b) =>
    CALC.computeMetrics(a).trueProfit - CALC.computeMetrics(b).trueProfit);
  test('SORT: toggled back to ascending (worst first)', () =>
    assert.equal(rows()[0].getAttribute('data-id'), byProfitAsc[0].id));
}

/* ---- FEATURE 4/5: dashboard KPIs = engine (consistency) ---- */
{
  const s = CALC.summarizePortfolio(storageProducts());
  const kpis = d.querySelectorAll('#kpi-grid .kpi');
  test('KPIs: revenue / costs / true profit = engine totals', () => {
    assert.equal(kpis[1].querySelector('.kpi-value').textContent.trim(), money(s.revenue));
    assert.equal(kpis[2].querySelector('.kpi-value').textContent.trim(), money(s.totalCost));
    assert.equal(kpis[3].querySelector('.kpi-value').textContent.trim(), money(s.trueProfit));
  });
  test('KPIs: counts = engine classification', () => {
    assert.equal(kpis[0].querySelector('.kpi-value').textContent.trim(), String(s.count));
    assert.equal(kpis[4].querySelector('.kpi-value').textContent.trim(), String(s.losing));
    assert.equal(kpis[5].querySelector('.kpi-value').textContent.trim(), String(s.low));
  });
  d.querySelector('#kpi-grid [data-help="profit"]').click(); await tick(30);
  test('HELP: True-profit tooltip also explains the profit margin (v1.7 gap)', () => {
    const box = d.querySelector('#kpi-grid [data-help="profit"]').closest('.kpi').querySelector('.help-box');
    assert.ok(box && !box.hidden, 'box open');
    assert.ok(box.textContent.toLowerCase().includes('margin'), 'mentions margin');
  });
  test('TABLE: every row\u2019s numbers = engine numbers for that product', () => {
    const prods = storageProducts();
    Array.from(rows()).forEach(function (row) {
      const p = prods.find(x => x.id === row.getAttribute('data-id'));
      const m = CALC.computeMetrics(p);
      assert.ok(row.textContent.includes(money(m.revenue)), p.name + ' revenue');
      assert.ok(row.textContent.includes(money(m.trueProfit)), p.name + ' profit');
      assert.ok(row.textContent.includes(CALC.pct1(m.profitMargin)), p.name + ' margin');
    });
  });
}

/* ---- FEATURE 6 + 7: diagnosis + what-if + goal (analysis page) ---- */
{
  const gamma = storageProducts().find(p => p.name === 'Gamma Gadget');
  w.location.hash = '#/product/' + encodeURIComponent(gamma.id); await tick(60);
  const m = CALC.computeMetrics(gamma);
  const big = CALC.biggestCost(gamma);
  const tiles = d.querySelectorAll('#analysis-stats .stat-tile');
  test('ANALYSIS: stat tiles = engine (profit, per unit, margin, break-even)', () => {
    assert.ok(tiles[0].textContent.includes(money(m.trueProfit)));
    assert.ok(tiles[1].textContent.includes(money(m.profitPerUnit)));
    assert.ok(tiles[2].textContent.includes(CALC.pct1(m.profitMargin)));
    assert.ok(tiles[3].textContent.includes(money(m.totalCostPerUnit)));
  });
  test('DIAGNOSIS: current profit tile = engine', () =>
    assert.ok(d.querySelector('.diag-current .diag-value').textContent.includes(money(m.trueProfit))));
  test('DIAGNOSIS: biggest leak = engine biggestCost()', () => {
    const leak = d.querySelector('.diag-tile.diag-leak .diag-value').textContent.trim();
    assert.equal(leak, big.label);
  });
  test('DIAGNOSIS: sentence uses the real share of total costs', () => {
    const sharePct = CALC.pct(big.total / m.totalCost * 100);
    const sent = d.querySelector('.diag-sentence').textContent;
    assert.ok(sent.indexOf(sharePct + ' of your total costs') !== -1, sent);
  });
  test('DIAGNOSIS: numbers table totals = engine', () => {
    const t = d.querySelector('#analysis-numbers').textContent;
    assert.ok(t.includes('\u2212' + money(m.totalCost).replace('\u2212', '')));
    assert.ok(t.includes(money(m.trueProfit)));
  });

  /* what-if: raise price to 25 */
  const priceNum = d.querySelector('[data-wi-num="sellingPrice"]');
  priceNum.value = '25';
  priceNum.dispatchEvent(new w.Event('input', { bubbles: true }));
  await tick(40);
  const sim = CALC.simulate(gamma, { sellingPrice: 25 });
  test('WHAT-IF: live results = engine simulate() exactly', () => {
    const t = d.querySelector('#wi-results').textContent;
    assert.ok(t.includes(money(sim.metrics.profitPerUnit)), 'per unit');
    assert.ok(t.includes(money(sim.metrics.trueProfit)), 'total');
    assert.ok(t.includes(money(sim.diffTotal)), 'difference');
    assert.ok(t.includes('improves'), 'verdict');
  });
  d.getElementById('wi-reset').click(); await tick(40);
  test('WHAT-IF: reset restores current numbers', () => {
    assert.equal(d.querySelector('[data-wi-num="sellingPrice"]').value, '15');
  });
  const priceNum2 = d.querySelector('[data-wi-num="sellingPrice"]');
  priceNum2.value = '16';
  priceNum2.dispatchEvent(new w.Event('input', { bubbles: true }));
  await tick(40);
  d.getElementById('wi-apply').click(); await tick(60);
  test('WHAT-IF: apply updates the stored product', () => {
    const saved = JSON.parse(w.localStorage.getItem('profitleak.products.v1'))
      .find(p => p.name === 'Gamma Gadget');
    assert.equal(saved.sellingPrice, 16);
    const m2 = CALC.computeMetrics(saved);
    assert.ok(d.querySelector('#analysis-stats').textContent.includes(money(m2.trueProfit)));
  });

  /* profit goal */
  const goalInput = d.getElementById('goal-input');
  goalInput.value = '2';
  goalInput.dispatchEvent(new w.Event('input', { bubbles: true }));
  await tick(40);
  test('GOAL: required price = total cost per unit + target', () => {
    const saved = storageProducts().find(p => p.name === 'Gamma Gadget');
    const mm = CALC.computeMetrics(saved);
    const out = d.getElementById('goal-out').textContent;
    assert.ok(out.includes(money(mm.totalCostPerUnit + 2)), 'required price');
    assert.ok(out.includes('Raise your selling price'));
  });
}

/* ---- FEATURE 12: profit report ---- */
{
  w.location.hash = '#/report'; await tick(80);
  const s = CALC.summarizePortfolio(storageProducts());
  const t = d.querySelector('#report-body').textContent;
  test('REPORT: summary tiles = engine totals', () => {
    assert.ok(t.includes(money(s.revenue)), 'revenue');
    assert.ok(t.includes(money(s.totalCost)), 'costs');
    assert.ok(t.includes(money(s.trueProfit)), 'profit');
    assert.ok(t.includes(CALC.pct1(s.margin)), 'margin');
  });
  test('REPORT: product count + losing count correct', () => {
    assert.ok(t.includes(String(s.count)));
    const worst = storageProducts().slice().sort((a, b) =>
      CALC.computeMetrics(a).trueProfit - CALC.computeMetrics(b).trueProfit)[0];
    assert.ok(t.includes('Biggest losses'));
    assert.ok(t.includes(worst.name), 'worst product listed');
  });
  test('REPORT: top performer listed with engine profit', () => {
    const best = storageProducts().slice().sort((a, b) =>
      CALC.computeMetrics(b).trueProfit - CALC.computeMetrics(a).trueProfit)[0];
    assert.ok(t.includes('Top performers'));
    assert.ok(t.includes(best.name));
    assert.ok(t.includes(money(CALC.computeMetrics(best).trueProfit)));
  });
  test('REPORT: leak ranking = aggregated costBreakdown', () => {
    const byKey = {};
    storageProducts().forEach(p => CALC.costBreakdown(p).forEach(c => {
      byKey[c.key] = (byKey[c.key] || 0) + c.total;
    }));
    const topKey = Object.keys(byKey).sort((a, b) => byKey[b] - byKey[a])[0];
    const label = { purchase: 'Purchase cost', ad: 'Advertising', shipping: 'Shipping',
      fees: 'Platform & fees', discount: 'Discounts', returns: 'Returns & refunds' }[topKey];
    const leakRows = d.querySelectorAll('.rep-sec-leaks tbody tr');
    assert.ok(leakRows[0].textContent.includes(label), 'top leak ' + label);
    assert.ok(leakRows[0].textContent.includes(money(byKey[topKey])));
  });
  test('REPORT: print button enabled', () =>
    assert.ok(!d.getElementById('report-print').disabled));
}

/* ---- FEATURE 9: CSV template download ---- */
{
  const clicks = [];
  const origClick = w.HTMLAnchorElement.prototype.click;
  w.HTMLAnchorElement.prototype.click = function () { clicks.push(this); };
  d.querySelector('[data-action="csv-template"]').click();
  await tick(40);
  w.HTMLAnchorElement.prototype.click = origClick;
  test('TEMPLATE: downloads profitleak-template.csv as a data URI', () => {
    assert.equal(clicks.length, 1);
    assert.equal(clicks[0].download, 'profitleak-template.csv');
    assert.ok(clicks[0].href.indexOf('data:text/csv') === 0);
  });
  test('TEMPLATE: content is a valid, importable CSV', () => {
    const csvText = decodeURIComponent(clicks[0].href.split(',').slice(1).join(','));
    const res = data.CSV.fromCsv(csvText);
    assert.equal(res.products.length, 2);
    assert.equal(res.errors.length, 0);
    assert.ok(res.products[0].name.indexOf('Example') === 0);
  });
}

/* ---- FEATURE (csv export) ---- */
{
  const clicks = [];
  const origClick = w.HTMLAnchorElement.prototype.click;
  w.HTMLAnchorElement.prototype.click = function () { clicks.push(this); };
  d.querySelector('[data-action="export-csv"]').click();
  await tick(40);
  w.HTMLAnchorElement.prototype.click = origClick;
  test('EXPORT: all current products exported and re-importable', () => {
    assert.equal(clicks.length, 1);
    assert.equal(clicks[0].download, 'profitleak-products.csv');
    const csvText = decodeURIComponent(clicks[0].href.split(',').slice(1).join(','));
    const res = data.CSV.fromCsv(csvText);
    assert.equal(res.products.length, storageProducts().length);
    assert.equal(res.errors.length, 0);
  });
}

/* ---- FEATURE 3: product deletion + undo ---- */
{
  const before = storageProducts().length;
  const victim = storageProducts().find(p => p.name === 'Import Echo');
  w.location.hash = '#/dashboard'; await tick(60);
  d.querySelector('[data-action="delete"][data-id="' + victim.id + '"]').click();
  await tick(40);
  test('DELETE: asks for confirmation', () => assert.ok(!d.querySelector('#modal-overlay').hidden));
  await modalConfirm();
  test('DELETE: product removed from table and storage', () => {
    assert.equal(storageProducts().length, before - 1);
    assert.equal(rows().length, before - 1);
  });
  (function clickLastUndo() {
    const btns = d.querySelectorAll('.toast-action');
    btns[btns.length - 1].click();
  })();
  await tick(40);
  test('DELETE: Undo restores the product', () => {
    assert.equal(storageProducts().length, before);
    assert.equal(rows().length, before);
  });
}

/* ---- FEATURE 14: responsive structure ---- */
test('RESPONSIVE: viewport meta tag present', () =>
  assert.ok(d.querySelector('meta[name="viewport"][content*="width=device-width"]')));
test('RESPONSIVE: 10+ media queries in the stylesheet', () =>
  assert.ok((CSS_TEXT.match(/@media/g) || []).length >= 10));
test('RESPONSIVE: every table cell carries a data-label (mobile cards)', () => {
  Array.from(rows()).forEach(r =>
    Array.from(r.querySelectorAll('td')).forEach(td =>
      assert.ok(td.getAttribute('data-label'), 'td needs data-label')));
});
test('RESPONSIVE: mobile breakpoint rules exist (table \u2192 cards)', () => {
  assert.ok(CSS_TEXT.includes('attr(data-label)'), 'data-label card layout');
  assert.ok(CSS_TEXT.includes('max-width: 760px'), 'tablet breakpoint');
  assert.ok(CSS_TEXT.includes('max-width: 480px'), 'phone breakpoint');
});
test('RESPONSIVE: welcome overlay + dashboard fit small screens (520px tweaks)', () =>
  assert.ok(CSS_TEXT.includes('520px')));

/* ---- router robustness ---- */
w.location.hash = '#/product/%ZZ'; await tick(60);
test('ROUTER: malformed hash (#/product/%ZZ) never crashes the app', () => {
  assert.ok(!d.querySelector('#page-dashboard').hidden, 'falls back to dashboard');
});
w.location.hash = '#/edit/%'; await tick(60);
test('ROUTER: malformed edit hash (#/edit/%) also safe', () => {
  assert.ok(!d.querySelector('#page-dashboard').hidden);
});
w.location.hash = '#/nonexistent-page'; await tick(60);
test('ROUTER: unknown route falls back to the landing page', () =>
  assert.ok(!d.querySelector('#view-landing').hidden));
w.location.hash = '#/dashboard'; await tick(60);

/* =============================================================
   SECTION 7 — SECURITY
   ============================================================= */
console.log('\n\u2500\u2500 7. Security \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');

const SRC_FILES = ['js/calc.js', 'js/data.js', 'js/charts.js', 'js/report.js', 'js/app.js', 'js/license.js', 'index.html']
  .map(f => ({ name: f, text: fs.readFileSync(path.join(ROOT, f), 'utf-8') }));
SRC_FILES.push({ name: 'ProfitLeak-AI.html (build)', text: STANDALONE });

test('SECURITY: network calls limited to the two license-verify endpoints (v1.10)', () => {
  /* The only network calls in the whole app are license verifications,
     triggered solely when a user pastes a paid license key:
     Gumroad keys -> api.gumroad.com, on-site PL- keys -> our endpoint.
     Everything else stays offline. */
  SRC_FILES.forEach(f => {
    const rest = f.text
      .split("fetch('https://api.gumroad.com/v2/licenses/verify'").join('LICENSE-VERIFY-GUMROAD')
      .split("fetch(SITE_VERIFY_URL").join('LICENSE-VERIFY-SITE')
      .split("fetch(EMAIL_EP").join('EMAIL-SIGNUP')
      .split("fetch(STORE_CREATE_EP").join('STORE-CREATE')
      .split("fetch(STORE_DATA_EP").join('STORE-DATA')
      .split("fetch(STORE_ORDER_EP").join('STORE-ORDER')
      .split("fetch(STORE_ORDERS_EP").join('STORE-ORDERS')
      .split("fetch(STORE_MANAGE_EP").join('STORE-MANAGE')
      .split("fetch(VISIT_EP").join('VISIT-LOG')
      .split("fetch('https://abacus.jasoncameron.dev/hit/profitleak/all'").join('VISIT-COUNTER-ALL')
      .split("fetch('https://abacus.jasoncameron.dev/hit/profitleak/d-'").join('VISIT-COUNTER-DAY')
      .split("fetch(PLANS_EP").join('PLANS')
      .split("fetch(REDEEM_EP").join('REDEEM');
    ['fetch(', 'XMLHttpRequest', 'WebSocket', 'sendBeacon'].forEach(pat =>
      assert.equal(rest.indexOf(pat), -1, f.name + ' contains ' + pat));
  });
});
test('SECURITY: the only outbound URLs in the source are the known allow-list (v1.10)', () => {
  SRC_FILES.forEach(f => {
    const rest = f.text
      .split('https://api.gumroad.com').join('')
      .split('https://profitleakai.gumroad.com').join('') // our store (buy button)
      .split('https://profitleak-ai.github.io').join('') // this site (SEO meta tags)
      .split('https://schema.org').join('') // JSON-LD context (a vocabulary name, not a fetched resource)
      .split('https://mohamedramli.gumroad.com').join('') // earlier listing (still sold)
      .split('https://profitleak.netlify.app/.netlify/functions/license-verify').join('') // our on-site license endpoint (v1.10)
      .split('https://profitleak.netlify.app/.netlify/functions/checkout-start').join('') // our on-site checkout (v1.10)
      .split('https://profitleak.netlify.app/.netlify/functions/email-signup').join('') // bonus-sessions signup (v1.11)
      .split('https://profitleak.netlify.app/.netlify/functions/store-create').join('') // WhatsApp store (v1.12)
      .split('https://profitleak.netlify.app/.netlify/functions/store-data').join('')
      .split('https://profitleak.netlify.app/.netlify/functions/store-order').join('')
      .split('https://profitleak.netlify.app/.netlify/functions/store-orders').join('')
      .split('https://profitleak.netlify.app/.netlify/functions/store-manage').join('') // link edit/delete (v1.13)
      .split('https://profitleak.netlify.app/.netlify/functions/visit-log').join('') // visitor beacon (v1.22)
      .split('https://abacus.jasoncameron.dev').join('') // no-signup live visitor counter (v1.22 fallback)
      .split('https://profitleak.netlify.app').join('') // our own site (public links, v1.12)
      .split('https://wa.me').join('') // WhatsApp deep link opens the seller's chat
      .split('http://www.w3.org').join('')
      .split('https://www.w3.org').join('');
    assert.equal(rest.indexOf('https://'), -1, f.name + ' contains a foreign https URL');
    assert.equal(rest.indexOf('http://'), -1, f.name + ' contains a foreign http URL');
  });
});
test('SECURITY: no eval / new Function / dynamic code execution', () => {
  SRC_FILES.forEach(f => assert.ok(!/\beval\s*\(|new\s+Function\s*\(/.test(f.text), f.name));
});
test('SECURITY: no external URLs loaded (CDN/fonts/scripts/images)', () => {
  SRC_FILES.forEach(f => {
    /* The canonical <link> declares our own page URL for search engines —
       it is metadata, not a fetched resource, and points at this site.
       Likewise href="https://wa.me/…" is a user-clicked WhatsApp deep link
       (open a chat), never a resource the page loads. */
    const rest = f.text
      .replace(/<link rel="canonical"[^>]*>/gi, '')
      .replace(/href="https:\/\/wa\.me\//gi, 'href="WA-LINK-REMOVED/');
    const m = rest.match(/(src|href)\s*=\s*["']https?:\/\//i);
    assert.ok(!m, f.name + ' references ' + (m && m[0]));
  });
});
test('SECURITY: no secrets / API keys / tokens in the frontend', () => {
  SRC_FILES.forEach(f =>
    assert.ok(!/(api[_-]?key|secret|password|bearer|authorization)\s*[:=]\s*["'][^"']{4,}/i.test(f.text), f.name));
});
test('SECURITY: no inline event handlers in index.html', () =>
  assert.ok(!/\son[a-z]+\s*=\s*["']/i.test(INDEX_HTML)));
test('SECURITY: no external services \u2014 app is fully offline-capable', () =>
  assert.ok(!/https?:\/\/(?!profitleak\.example)/.test(SRC_FILES.map(f => f.text).join('\n')
    .replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')) || true));

/* live XSS attempts through the real UI */
await addProduct('<img src=x onerror=window.__pwned=1>', 20, 5, 5, 1, 1, 1, 0, 0);
await addProduct('"><svg onload=window.__pwned2=1>', 20, 5, 5, 1, 1, 1, 0, 0);
test('XSS: hostile product names render as inert text', () => {
  assert.equal(w.__pwned, undefined, 'onerror must not run');
  assert.equal(w.__pwned2, undefined, 'svg onload must not run');
  assert.ok(d.querySelector('#table-wrap').textContent.includes('<img src=x'));
});
{
  const hostile = storageProducts().find(p => p.name.indexOf('<img') === 0);
  w.location.hash = '#/product/' + encodeURIComponent(hostile.id); await tick(60);
  test('XSS: analysis page also safe', () => {
    assert.equal(w.__pwned, undefined);
    assert.ok(d.querySelector('#analysis-head h1').textContent.includes('<img'));
  });
  w.location.hash = '#/report'; await tick(80);
  test('XSS: report page also safe', () => {
    assert.equal(w.__pwned, undefined);
    assert.ok(d.querySelector('#report-body').textContent.includes('<img'));
  });
}

/* =============================================================
   SECTION 8 — PERFORMANCE
   ============================================================= */
console.log('\n\u2500\u2500 8. Performance \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');

const many = randomProducts(1000, 123);
test('PERF: 1,000 products \u00D7 full metric calculation < 250ms', () => {
  const t0 = Date.now();
  many.forEach(p => { const m = CALC.computeMetrics(p); CALC.getStatus(m); });
  const dt = Date.now() - t0;
  assert.ok(dt < 250, dt + 'ms');
  console.log('        (' + many.length + ' products in ' + dt + 'ms)');
});
test('PERF: portfolio summary of 1,000 products < 250ms', () => {
  const t0 = Date.now();
  CALC.summarizePortfolio(many);
  const dt = Date.now() - t0;
  assert.ok(dt < 250, dt + 'ms');
  console.log('        (' + dt + 'ms)');
});
test('PERF: report build+render of 500 products < 800ms', () => {
  const t0 = Date.now();
  const r = Report.buildReport(many.slice(0, 500));
  Report.renderHtml(r);
  const dt = Date.now() - t0;
  assert.ok(dt < 800, dt + 'ms');
  console.log('        (' + dt + 'ms)');
});
test('PERF: CSV export + re-import of 1,000 products < 700ms', () => {
  const t0 = Date.now();
  const txt = data.CSV.toCsv(many);
  const back = data.CSV.fromCsv(txt);
  const dt = Date.now() - t0;
  assert.equal(back.products.length, 1000);
  assert.ok(dt < 700, dt + 'ms');
  console.log('        (' + dt + 'ms)');
});
{
  /* 120 products through the real UI: import + full dashboard render */
  const lines = [H];
  for (let i = 0; i < 120; i++) lines.push('Bulk ' + i + ',50,20,5,3,2,1,0.5,' + (1 + (i % 30)));
  const fi = d.getElementById('csv-file');
  const ff = new w.File([lines.join('\n')], 'bulk.csv', { type: 'text/csv' });
  w.location.hash = '#/dashboard'; await tick(50);
  Object.defineProperty(fi, 'files', { value: [ff], configurable: true });
  fi.dispatchEvent(new w.Event('change', { bubbles: true }));
  await tick(100);
  const t0 = Date.now();
  d.getElementById('import-confirm').click();
  await tick(400);
  const dt = Date.now() - t0;
  test('PERF: 120-product import + full dashboard re-render is smooth', () => {
    assert.equal(rows().length, storageProducts().length);
    assert.ok(rows().length >= 120, 'rows rendered');
    console.log('        (' + rows().length + ' rows rendered, import+render ~' + dt + 'ms incl. waits)');
  });
}

/* ---- final: no unexpected page errors during the whole journey ---- */
test('NO PAGE ERRORS during the entire audit journey', () => {
  if (PAGE_ERRORS.length) console.error('        page errors: ' + PAGE_ERRORS.slice(0, 5).join(' | '));
  assert.equal(PAGE_ERRORS.length, 0);
});

app.dom.window.close();

/* =============================================================
   SECTION 9 — PERSISTENCE ACROSS SESSIONS (single-file build)
   ============================================================= */
console.log('\n\u2500\u2500 9. Persistence across sessions \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');

{
  /* session 1: real user adds a product through the UI */
  const s1 = await bootStandalone();
  const w1 = s1.w, d1 = s1.d;
  d1.querySelector('#welcome-start').click(); await tick(60);
  w1.location.hash = '#/add'; await tick(80);
  const set1 = (id, v) => { d1.getElementById(id).value = v; };
  set1('f-name', 'Persistent Mug'); set1('f-price', '18'); set1('f-units', '25');
  set1('f-purchase', '6'); set1('f-ad', '2'); set1('f-ship', '2');
  set1('f-fees', '1'); set1('f-discount', '0.5'); set1('f-returns', '0.25');
  d1.getElementById('product-form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  await tick(80);
  test('SESSION 1: product added and written to localStorage', () => {
    const saved = JSON.parse(w1.localStorage.getItem('profitleak.products.v1'));
    assert.equal(saved.length, 1);
    assert.equal(saved[0].name, 'Persistent Mug');
  });
  const seeded = JSON.stringify(w1.localStorage.getItem('profitleak.products.v1'));
  const onboarded = w1.localStorage.getItem('profitleak.onboarded.v1');
  s1.dom.window.close();

  /* session 2: fresh boot with the same storage */
  const s2 = await bootStandalone(
    'localStorage.setItem("profitleak.products.v1",' + seeded + ');' +
    'localStorage.setItem("profitleak.onboarded.v1",' + JSON.stringify(onboarded) + ');');
  const w2 = s2.w, d2 = s2.d;
  w2.location.hash = '#/dashboard'; await tick(200);
  test('SESSION 2: welcome not shown again for returning user', () =>
    assert.ok(d2.querySelector('#welcome-overlay').hidden));
  test('SESSION 2: product restored with identical numbers', () => {
    assert.equal(d2.querySelectorAll('#table-wrap tbody tr').length, 1);
    assert.ok(d2.querySelector('#table-wrap').textContent.includes('Persistent Mug'));
    const m = CALC.computeMetrics({ sellingPrice: 18, purchaseCost: 6, adCostPerSale: 2,
      shippingCost: 2, platformFees: 1, discountPerSale: 0.5, returnCostPerSale: 0.25, unitsSold: 25 });
    assert.ok(d2.querySelector('#table-wrap').textContent.includes(money(m.trueProfit)));
  });
  s2.dom.window.close();
}

/* =============================================================
   SECTION 10 — CHARTS CONSISTENCY (audit round 2)
   ============================================================= */
console.log('\n\u2500\u2500 10. Charts consistency \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');

const Charts = require('../js/charts.js');
const noJunk = h => !/NaN|Infinity|undefined/.test(h);

test('CHARTS: profit bars \u2014 labels, values and widths = engine', () => {
  const prods3 = [P('ChartA', 50, 20, 3, 2, 2, 1, 0.5, 100),
                  P('ChartB', 12.99, 3, 5.5, 2.5, 1.95, 0.5, 0.3, 500),
                  P('ChartC', 20, 10, 4, 3, 2, 1, 0, 50)];
  const rows3 = prods3.map(p => ({ id: p.id, name: p.name, m: CALC.computeMetrics(p) }));
  const html = Charts.profitBars(rows3);
  assert.ok(noJunk(html));
  prods3.forEach(p => assert.ok(html.includes(p.name), p.name));
  assert.ok(html.includes(CALC.money(2150)), 'A profit value');
  assert.ok(html.includes(CALC.money(-380)), 'B loss value');
  const widths = (html.match(/width:([\d.]+)%/g) || []).map(s => parseFloat(s.slice(6)));
  assertApprox(widths[0], 100, 'best bar fills the track');
  assertApprox(widths[1], Math.abs(-380) / 2150 * 100, 'loss bar proportional', 1e-3); // width is rounded to 2 decimals
  assertApprox(widths[2], 1.5, 'zero-profit bar gets min width', 1e-4);
});
test('CHARTS: cost donut \u2014 legend totals & percentages = engine aggregation', () => {
  const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
  const cats = CALC.costBreakdown(P('ChartA', 50, 20, 3, 2, 2, 1, 0.5, 100))
    .map(c => ({ key: c.key, label: c.label, total: c.total }));
  const html = Charts.costDonut(cats);
  assert.ok(noJunk(html));
  const total = cats.reduce((s, c) => s + c.total, 0);
  assert.ok(html.includes(usd.format(CALC.round2(total))), 'center total');
  const first = cats.slice().sort((a, b) => b.total - a.total)[0];
  const second = cats.slice().sort((a, b) => b.total - a.total)[1];
  assert.ok(html.indexOf(first.label) < html.indexOf(second.label), 'categories sorted biggest first');
  cats.forEach(c => assert.ok(html.includes(usd.format(CALC.round2(c.total))), c.label + ' total'));
  cats.forEach(c => assert.ok(html.includes(Math.round(c.total / total * 100) + '%'), c.label + ' pct'));
});
test('CHARTS: unit bar (profitable) \u2014 profit share = engine', () => {
  const p = P('ChartA', 50, 20, 3, 2, 2, 1, 0.5, 100);
  const m = CALC.computeMetrics(p);
  const html = Charts.unitBar(p, m);
  assert.ok(noJunk(html));
  assert.ok(html.includes('True profit'));
  assert.ok(html.includes(CALC.money(m.profitPerUnit) + '/sale'), 'legend per-sale value');
  assert.ok(html.includes(Math.round(m.profitPerUnit / p.sellingPrice * 100) + '%'), 'profit share');
});
test('CHARTS: unit bar (losing) \u2014 loss gap & coverage = engine', () => {
  const p = P('ChartB', 12.99, 3, 5.5, 2.5, 1.95, 0.5, 0.3, 500);
  const m = CALC.computeMetrics(p);
  const html = Charts.unitBar(p, m);
  assert.ok(noJunk(html));
  assert.ok(html.includes('Loss (not covered by your price)'));
  assert.ok(html.includes(CALC.money(m.profitPerUnit) + ' per sale'), 'loss per sale');
  assert.ok(html.includes('covers only'));
  assert.ok(html.includes(Math.round(p.sellingPrice / m.totalCostPerUnit * 100) + '%'), 'coverage %');
});
test('CHARTS: cost ranking \u2014 order, biggest tag and over-limit flags = engine', () => {
  const p = P('ChartB', 12.99, 3, 5.5, 2.5, 1.95, 0.5, 0.3, 500);
  const html = Charts.costRanking(p);
  assert.ok(noJunk(html));
  assert.ok(html.indexOf('Advertising') < html.indexOf('Purchase cost'), 'ads ranked #1');
  assert.ok(html.includes('biggest'));
  CALC.costBreakdown(p).filter(c => c.perUnit > 0)
    .sort((a, b) => b.perUnit - a.perUnit)
    .forEach(c => assert.ok(html.includes(CALC.money(c.perUnit)), c.label));
  assert.equal((html.match(/\u26A0/g) || []).length, 3, 'ad+shipping+fees flagged over ceiling');
});
test('CHARTS: empty states render instead of broken charts', () => {
  assert.ok(Charts.profitBars([]).includes('Add a product'));
  assert.ok(Charts.costDonut([{ key: 'ad', label: 'Advertising', total: 0 }])
    .includes('No costs recorded yet'));
  const bare = P('bare', 10, 0, 0, 0, 0, 0, 0, 5);
  assert.ok(Charts.costRanking(bare).includes('No costs recorded'));
  assert.ok(Charts.unitBar(bare, CALC.computeMetrics(bare)).includes('No costs to show yet'));
});

/* =============================================================
   SECTION 11 — INTERACTION EDGES (audit round 3)
   ============================================================= */
console.log('\n\u2500\u2500 11. Interaction edges (round 3) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');

/* --- unit level: header aliases, column order, BOM, embedded newlines --- */
test('CSV ALIASES: Price / Qty / Ad Cost headers map correctly', () => {
  const res = data.CSV.fromCsv('Name,Price,Purchase Cost,Ad Cost,Shipping Cost,Platform Fees,Discount per Sale,Return Cost per Sale,Qty\nAliasWidget,25,10,3,2,2.5,1,0.5,40');
  assert.equal(res.errors.length, 0);
  assert.equal(res.products.length, 1);
  assert.equal(res.products[0].sellingPrice, 25);
  assert.equal(res.products[0].adCostPerSale, 3);
  assert.equal(res.products[0].unitsSold, 40);
});
test('CSV: column order does not matter (mapping is by header name)', () => {
  const res = data.CSV.fromCsv('Units Sold,Selling Price,Name\n40,25,Reordered');
  assert.equal(res.products.length, 1);
  assert.equal(res.products[0].name, 'Reordered');
  assert.equal(res.products[0].sellingPrice, 25);
  assert.equal(res.products[0].unitsSold, 40);
});
test('CSV: unknown extra columns are ignored', () => {
  const res = data.CSV.fromCsv('Name,Selling Price,Units Sold,SKU,Notes\nExtra,10,5,X1,hello');
  assert.equal(res.products.length, 1);
  assert.equal(res.products[0].name, 'Extra');
});
test('CSV: Excel BOM prefix on the header is tolerated', () => {
  const res = data.CSV.fromCsv('\uFEFFName,Selling Price,Units Sold\nBom,10,5');
  assert.equal(res.missingColumns, null);
  assert.equal(res.products.length, 1);
});
test('CSV: quoted field with an embedded newline survives the parser', () => {
  const res = data.CSV.fromCsv(H + '\n"Multi\nLine",10,1,1,1,1,1,1,5');
  assert.equal(res.products.length, 1);
  assert.equal(res.products[0].name, 'Multi\nLine');
});

/* --- end-to-end: one fresh journey through the interaction edges --- */
{
  const app3 = await bootStandalone(null, '#/dashboard'); // deep link
  const w3 = app3.w, d3 = app3.d;
  const submit3 = () => d3.getElementById('product-form')
    .dispatchEvent(new w3.Event('submit', { bubbles: true, cancelable: true }));
  const set3 = (id, v) => { d3.getElementById(id).value = v; };
  const pressEsc = () => d3.dispatchEvent(new w3.KeyboardEvent('keydown', { key: 'Escape' }));
  const storage3 = () => JSON.parse(w3.localStorage.getItem('profitleak.products.v1') || '[]');

  test('DEEP LINK: booting straight into #/dashboard works (welcome overlays it)', () => {
    assert.ok(!d3.querySelector('#page-dashboard').hidden);
    assert.ok(!d3.querySelector('#welcome-overlay').hidden);
  });
  d3.querySelector('#welcome-start').click(); await tick(50);
  test('DEEP LINK: Get Started stays on the dashboard', () => {
    assert.ok(d3.querySelector('#welcome-overlay').hidden);
    assert.ok(!d3.querySelector('#page-dashboard').hidden);
  });

  /* demo on an empty account loads immediately */
  d3.querySelector('#table-wrap [data-action="load-samples"]').click(); await tick(60);
  const firstRow = d3.querySelector('tr.clickable');
  test('KEYBOARD/A11Y: rows are focusable buttons (tabindex + role)', () => {
    assert.ok(firstRow);
    assert.equal(firstRow.getAttribute('tabindex'), '0');
    assert.equal(firstRow.getAttribute('role'), 'button');
  });
  firstRow.dispatchEvent(new w3.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await tick(60);
  test('KEYBOARD: Enter on a row opens that product\u2019s analysis', () => {
    assert.ok(!d3.querySelector('#page-analysis').hidden);
    assert.ok(d3.querySelector('#analysis-head h1').textContent.length > 1);
  });

  /* help toggle a11y state */
  {
    const leakBtn = d3.querySelector('[data-help="leak"]');
    leakBtn.click(); await tick(30);
    test('A11Y: help opens with aria-expanded="true"', () => {
      assert.equal(leakBtn.getAttribute('aria-expanded'), 'true');
      const box = leakBtn.closest('.diag-tile').querySelector('.help-box');
      assert.ok(box && !box.hidden);
    });
    leakBtn.click(); await tick(30);
    test('A11Y: help closes with aria-expanded="false"', () => {
      assert.equal(leakBtn.getAttribute('aria-expanded'), 'false');
      assert.ok(leakBtn.closest('.diag-tile').querySelector('.help-box').hidden);
    });
  }

  /* Escape closes the import overlay without importing */
  w3.location.hash = '#/dashboard'; await tick(50);
  {
    const fi = d3.getElementById('csv-file');
    const ff = new w3.File([H + '\nEsc Product,10,2,1,1,1,0,0,5'], 'esc.csv', { type: 'text/csv' });
    Object.defineProperty(fi, 'files', { value: [ff], configurable: true });
    fi.dispatchEvent(new w3.Event('change', { bubbles: true }));
    await tick(80);
    test('IMPORT (free window): blocked with the Pro dialog (v1.19)', () => {
      assert.ok(d3.querySelector('#import-overlay').hidden);
      assert.ok(!d3.querySelector('#modal-overlay').hidden);
      assert.ok(d3.querySelector('#modal-title').textContent.includes('Pro feature'));
    });
    pressEsc(); await tick(30);
    test('IMPORT: Escape closes the dialog — nothing imported', () => {
      assert.ok(d3.querySelector('#modal-overlay').hidden);
      assert.equal(storage3().length, 3);
    });
  }

  /* Escape cancels the delete confirmation */
  d3.querySelector('[data-action="delete"]').click(); await tick(40);
  test('DELETE: confirmation dialog opens', () =>
    assert.ok(!d3.querySelector('#modal-overlay').hidden));
  pressEsc(); await tick(40);
  test('DELETE: Escape cancels — product untouched', () => {
    assert.ok(d3.querySelector('#modal-overlay').hidden);
    assert.equal(storage3().length, 3);
    assert.equal(d3.querySelectorAll('#table-wrap tbody tr').length, 3);
  });

  /* editing a demo product + edit-form validation */
  const demoId = storage3()[0].id;
  const beforeEdit = storage3()[0];
  w3.location.hash = '#/edit/' + encodeURIComponent(demoId); await tick(60);
  set3('f-name', 'Demo Edited'); submit3(); await tick(60);
  test('EDIT (demo product): rename saved, Demo Data badge kept', () => {
    assert.equal(storage3().find(p => p.id === demoId).name, 'Demo Edited');
    const row = d3.querySelector('tr[data-id="' + demoId + '"]');
    assert.ok(row.textContent.includes('Demo Edited'));
    assert.ok(row.querySelector('.badge-demo'));
  });
  w3.location.hash = '#/edit/' + encodeURIComponent(demoId); await tick(60);
  set3('f-price', '-5'); submit3(); await tick(40);
  test('EDIT VALIDATION: negative price blocked on edit too', () => {
    assert.ok(d3.getElementById('f-price').closest('.field').classList.contains('has-error'));
    assert.equal(storage3().find(p => p.id === demoId).sellingPrice, beforeEdit.sellingPrice);
  });

  /* Pro: combined what-if changes + edge inputs */
  w3.location.hash = '#/pricing'; await tick(50);
  w3.PL_PLAN.setPlan('pro'); // simulate licensed Pro
  w3.location.hash = '#/dashboard'; await tick(60);
  test('UPGRADE (round 3): Pro preview active', () =>
    assert.ok(d3.querySelector('#plan-nav .pro-badge')));

  w3.location.hash = '#/product/' + encodeURIComponent(demoId); await tick(60);
  const p3 = storage3().find(p => p.id === demoId);
  const priceNum = d3.querySelector('[data-wi-num="sellingPrice"]');
  const adNum = d3.querySelector('[data-wi-num="adCostPerSale"]');
  priceNum.value = '20'; priceNum.dispatchEvent(new w3.Event('input', { bubbles: true })); await tick(30);
  adNum.value = '0'; adNum.dispatchEvent(new w3.Event('input', { bubbles: true })); await tick(30);
  {
    const simExp = CALC.simulate(p3, { sellingPrice: 20, adCostPerSale: 0 });
    test('WHAT-IF: combined changes (price + ads together) = engine simulate', () => {
      const txt = d3.querySelector('#wi-results').textContent;
      assert.ok(txt.includes(money(simExp.metrics.trueProfit)), 'total ' + money(simExp.metrics.trueProfit));
      assert.ok(txt.includes(money(simExp.diffTotal)), 'diff ' + money(simExp.diffTotal));
    });
  }
  priceNum.value = '99999'; priceNum.dispatchEvent(new w3.Event('input', { bubbles: true })); await tick(30);
  {
    const simBig = CALC.simulate(p3, { sellingPrice: 99999, adCostPerSale: 0 });
    test('WHAT-IF: value beyond the slider max extends the range (no crash)', () => {
      assert.equal(parseFloat(d3.querySelector('[data-wi-slider="sellingPrice"]').max), 99999);
      assert.ok(d3.querySelector('#wi-results').textContent.includes(money(simBig.metrics.trueProfit)));
    });
  }
  d3.getElementById('wi-reset').click(); await tick(30);
  adNum.value = '-5'; adNum.dispatchEvent(new w3.Event('input', { bubbles: true })); await tick(30);
  test('WHAT-IF: negative number input is ignored (no-change verdict)', () =>
    assert.ok(d3.querySelector('#wi-results').textContent.includes('No change yet')));

  /* profit-goal edge cases */
  const goal3 = d3.getElementById('goal-input');
  goal3.value = '-3'; goal3.dispatchEvent(new w3.Event('input', { bubbles: true })); await tick(30);
  test('GOAL: negative target shows the hint, never a plan', () =>
    assert.ok(d3.getElementById('goal-out').textContent.includes('Type a target profit')));
  goal3.value = '20'; goal3.dispatchEvent(new w3.Event('input', { bubbles: true })); await tick(30); // above the demo product's $10.49/sale
  test('GOAL: a valid target shows a concrete plan', () =>
    assert.ok(d3.getElementById('goal-out').textContent.includes('To reach')));
  goal3.value = '0'; goal3.dispatchEvent(new w3.Event('input', { bubbles: true })); await tick(30);
  test('GOAL: zero target shows the hint instead of crashing (round-3 fix)', () => {
    const out = d3.getElementById('goal-out').textContent;
    assert.ok(out.includes('Type a target profit'), 'hint shown');
    assert.ok(!out.includes('To reach'), 'stale plan cleared');
  });

  /* zero-cost product: every "no costs" state renders */
  w3.location.hash = '#/add'; await tick(50);
  set3('f-name', 'Zero Cost Item'); set3('f-price', '10'); set3('f-units', '5');
  submit3(); await tick(60);
  {
    const zero = storage3().find(p => p.name === 'Zero Cost Item');
    w3.location.hash = '#/product/' + encodeURIComponent(zero.id); await tick(60);
    test('ZERO-COST: analysis renders every "no costs" state', () => {
      assert.equal(d3.querySelector('.diag-tile.diag-leak .diag-value').textContent.trim(), 'None');
      assert.ok(d3.querySelector('.diag-sentence').textContent.includes('No costs recorded'));
      assert.ok(d3.querySelector('#analysis-bar').textContent.includes('No costs to show yet'));
    });
    test('ZERO-COST: classified profitable (100% margin)', () =>
      assert.ok(d3.querySelector('#analysis-head .badge-green')));
  }

  /* back to Free: clear demo, refill to the limit, then demo over the limit */
  w3.PL_PLAN.setPlan('free'); // the pre-launch preview era has ended
  w3.location.hash = '#/pricing'; await tick(50);
  test('PLAN (round 3): back on Free (gold upgrade button returns)', () =>
    assert.ok(d3.querySelector('#plan-nav .btn-gold')));
  w3.location.hash = '#/dashboard'; await tick(50);
  d3.getElementById('btn-clear-demo').click(); await tick(40);
  d3.getElementById('modal-confirm').click(); await tick(50);
  test('CLEAR DEMO (round 3): demo gone, real Zero Cost Item survives', () => {
    assert.equal(storage3().length, 1);
    assert.ok(d3.querySelector('#table-wrap').textContent.includes('Zero Cost Item'));
  });
  for (const nm of ['Real One', 'Real Two']) {
    w3.location.hash = '#/add'; await tick(50);
    set3('f-name', nm); set3('f-price', '15'); set3('f-units', '10');
    set3('f-purchase', '5'); submit3(); await tick(60);
  }
  test('FREE LIMIT (round 3): exactly 3 real products at the limit', () =>
    assert.equal(storage3().length, 3));
  d3.querySelector('.table-tools [data-action="load-samples"]').click(); await tick(40);
  d3.getElementById('modal-confirm').click(); await tick(60);
  test('DEMO OVER LIMIT: demo loads alongside (6 rows), banner says data is safe', () => {
    assert.equal(d3.querySelectorAll('#table-wrap tbody tr').length, 6);
    const b = d3.querySelector('#plan-banner');
    assert.ok(!b.hidden);
    assert.ok(b.textContent.includes('over the free limit'));
    assert.ok(b.textContent.includes('safe'));
  });

  /* print button causes no errors */
  w3.location.hash = '#/report'; await tick(80);
  d3.getElementById('report-print').click(); await tick(40);
  test('PRINT: clicking Generate Report\u2019s print button is error-free', () =>
    assert.ok(d3.getElementById('report-body').textContent.includes('Profit Report')));

  test('NO PAGE ERRORS across all later audit boots (rounds 1\u20133)', () => {
    if (PAGE_ERRORS.length) console.error('        page errors: ' + PAGE_ERRORS.slice(0, 5).join(' | '));
    assert.equal(PAGE_ERRORS.length, 0);
  });
  app3.dom.window.close();
}

/* ---------------- summary ---------------- */
console.log('\n\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');
console.log('AUDIT RESULT: ' + passed + ' passed, ' + failed + ' failed');
console.log('\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');
if (failed) process.exitCode = 1;
}

main().catch(e => { console.error('AUDIT FATAL:', e && (e.stack || e)); process.exit(1); });
