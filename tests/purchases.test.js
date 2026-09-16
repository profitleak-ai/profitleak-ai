/* v1.23 — buyer analytics tests: recording, cleaning, aggregation. */
'use strict';
const assert = require('node:assert/strict');
const { clean, record, aggregate } = require('/home/user/netlify-functions/lib/purchases.js');

let passed = 0, failed = 0;
const test = (n, fn) => { try { fn(); passed++; console.log('  \u2713 ' + n); } catch (e) { failed++; console.error('  \u2717 ' + n + ' \u2014 ' + e.message); process.exitCode = 1; } };

const now = new Date();
const iso = off => new Date(now.getTime() - off).toISOString();

console.log('\nProfitLeak AI \u2014 buyer analytics tests (v1.23)\n');

/* ---- clean ---- */
test('clean lowercases email and strips invalid chars from the campaign tag', () => {
  const c = clean({ t: iso(0), m: 'PayPal', p: 'YEARLY', a: 19.999, e: 'Buyer@Gmail.COM', k: 'PLS-260916-ABCD', ref: 'Tik Tok!!', cc: 'ma' });
  assert.equal(c.m, 'paypal');
  assert.equal(c.p, 'yearly');
  assert.equal(c.e, 'buyer@gmail.com');
  assert.equal(c.ref, 'tiktok');
  assert.equal(c.cc, 'MA');
});
test('clean rounds the amount to 2 decimals and floors negatives to 0', () => {
  assert.equal(clean({ t: iso(0), m: 'paypal', a: 3.995 }).a, 4);
  assert.equal(clean({ t: iso(0), m: 'paypal', a: -5 }).a, 0);
});
test('clean caps field lengths', () => {
  const c = clean({ t: iso(0), m: 'paypal', e: 'x'.repeat(300), k: 'K'.repeat(100), ref: 'r'.repeat(100) });
  assert.equal(c.e.length, 120);
  assert.equal(c.k.length, 40);
  assert.equal(c.ref.length, 30);
});

/* ---- record ---- */
function fakeStore(initial) {
  return { update: async (name, mut) => { assert.equal(name, 'purchases.json'); return mut(initial) !== false; } };
}
test('record appends one sanitized entry', async () => {
  const list = [];
  await record(fakeStore(list), { m: 'paypal', p: 'yearly', a: 19.99, e: 'A@B.com', k: 'PL-1', ref: 'facebook', cc: 'MA' });
  assert.equal(list.length, 1);
  assert.equal(list[0].e, 'a@b.com');
  assert.equal(list[0].m, 'paypal');
});
test('record caps the log at 2000 entries (oldest dropped)', async () => {
  const list = [];
  for (let i = 0; i < 2000; i++) list.push({ t: '2026-01-0' + ((i % 9) + 1) + 'T00:00:00Z', m: 'paypal', a: 1, e: 'a' + i + '@x.com', k: 'PL-' + i });
  await record(fakeStore(list), { t: iso(0), m: 'crypto', p: 'monthly', a: 3.99, e: 'new@x.com', k: 'PL-NEW' });
  assert.equal(list.length, 2000);
  assert.equal(list[list.length - 1].k, 'PL-NEW');
});

/* ---- aggregate ---- */
const data = [
  { t: iso(0), m: 'paypal', p: 'yearly', a: 19.99, e: 'one@gmail.com', ref: 'tiktok', cc: 'MA' },
  { t: iso(0), m: 'paypal', p: 'monthly', a: 3.99, e: 'two@gmail.com', ref: 'tiktok', cc: 'MA' },
  { t: iso(3600e3), m: 'crypto', p: 'yearly', a: 19.99, e: 'one@gmail.com', cc: 'FR' },          /* 1h ago, no tag */
  { t: iso(26 * 3600e3), m: 'gumroad', p: 'yearly', a: 19.99, e: 'three@gmail.com', ref: 'x' }, /* yesterday */
  { t: iso(10 * 864e5), m: 'freeyear', p: 'freeyear', a: 0, e: '' }                              /* 10 days ago */
];
test('aggregate counts every sale', () => assert.equal(aggregate(data).total, 5));
test('revenue sums all amounts, rounded to 2 decimals', () => assert.equal(aggregate(data).revenue, 63.96));
test('today counts only today\u2019s sales (2 now + 1 an hour ago)', () => assert.equal(aggregate(data).today, 3));
test('last 7 days excludes the 10-day-old sale', () => assert.equal(aggregate(data).last7, 4));
test('buyers counts UNIQUE emails (one@gmail.com bought twice)', () => assert.equal(aggregate(data).buyers, 3));
test('byMethod ranks payment methods', () => {
  const m = aggregate(data).byMethod;
  assert.equal(m[0].k, 'paypal'); assert.equal(m[0].n, 2);
  assert.ok(m.some(x => x.k === 'crypto' && x.n === 1));
});
test('byRef counts campaign tags and labels untagged sales', () => {
  const r = aggregate(data).byRef;
  assert.ok(r.some(x => x.k === 'tiktok' && x.n === 2));
  assert.ok(r.some(x => x.k === '(no tag)'));
});
test('recent is sorted newest-first', () => {
  const rec = aggregate(data).recent;
  assert.ok(String(rec[0].t) >= String(rec[rec.length - 1].t));
});
test('recent is capped at 50', () => {
  const big = [];
  for (let i = 0; i < 60; i++) big.push({ t: new Date(now.getTime() - i * 3600e3).toISOString(), m: 'paypal', a: 1 });
  assert.equal(aggregate(big).recent.length, 50);
});
test('aggregate ignores junk entries', () => {
  assert.equal(aggregate([null, {}, { m: 'paypal' }, 'x']).total, 0);
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed) process.exit(1);
