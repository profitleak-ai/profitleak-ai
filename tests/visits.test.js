/* v1.22 — visitor analytics aggregation tests. */
'use strict';
const assert = require('node:assert/strict');
const { aggregate, refHost } = require('/home/user/netlify-functions/lib/visits.js');

let passed = 0, failed = 0;
const test = (n, fn) => { try { fn(); passed++; console.log('  \u2713 ' + n); } catch (e) { failed++; console.error('  \u2717 ' + n + ' \u2014 ' + e.message); process.exitCode = 1; } };

const now = new Date();
const iso = off => new Date(now.getTime() - off).toISOString();
const today = now.toISOString().slice(0, 10);

const data = [
  { t: iso(0), ref: 'https://www.facebook.com/groups/x', cc: 'MA', p: '#/' },
  { t: iso(0), ref: 'https://tiktok.com/@y', cc: 'MA', p: '#/dashboard' },
  { t: iso(3600e3), ref: '', cc: 'FR', p: '#/' },                       /* 1h ago, direct */
  { t: iso(26 * 3600e3), ref: 'https://facebook.com/post', cc: 'US' },  /* yesterday */
  { t: iso(10 * 864e5), ref: 'https://instagram.com/z', cc: 'MA' }      /* 10 days ago */
];

console.log('\nProfitLeak AI \u2014 visitor analytics tests (v1.22)\n');
test('total counts every entry', () => assert.equal(aggregate(data).total, 5));
test('today counts only today\u2019s visits (2 now + 1 an hour ago)', () => assert.equal(aggregate(data).today, 3));
test('last 7 days excludes the 10-day-old visit', () => assert.equal(aggregate(data).last7, 4));
test('top referrer groups www + bare facebook.com', () => {
  const top = aggregate(data).topReferrers;
  assert.equal(top[0].k, 'facebook.com');
  assert.equal(top[0].n, 2);
});
test('direct visits are labeled', () =>
  assert.ok(aggregate(data).topReferrers.some(r => r.k === '(direct)' && r.n === 1)));
test('countries ranked with counts', () => {
  const c = aggregate(data).countries;
  assert.equal(c[0].k, 'MA'); assert.equal(c[0].n, 3);
});
test('days array capped at 14 and sorted ascending', () => {
  const d = aggregate(data).days;
  assert.ok(d.length <= 14);
  assert.ok(d[0].d <= d[d.length - 1].d);
});
test('recent is latest-first', () => {
  const r = aggregate(data).recent;
  assert.ok(r[0].t >= r[r.length - 1].t);
});
test('empty / non-array input gives zeros, never throws', () => {
  const s = aggregate([]);
  assert.equal(s.total, 0); assert.equal(s.today, 0); assert.deepEqual(s.topReferrers, []);
  assert.equal(aggregate(null).total, 0);
});
test('refHost strips www and tolerates garbage', () => {
  assert.equal(refHost('https://www.tiktok.com/@y'), 'tiktok.com');
  assert.ok(refHost('not-a-url').length > 0);
});
test('entries without timestamps are ignored safely', () =>
  assert.equal(aggregate([{ ref: 'x' }, { t: iso(0), cc: 'MA' }]).total, 2));

console.log('\nVISITS TESTS: ' + passed + ' passed, ' + failed + ' failed\n');
if (failed) process.exitCode = 1;
