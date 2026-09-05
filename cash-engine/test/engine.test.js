/* Reads the math straight out of index.html so these tests can never drift
   from the shipping app. If the comp grid or calc() changes, these fail. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, '..', 'index.html'), 'utf8');

const START = '/* math:start';
const END = '/* math:end */';
const i = html.indexOf(START), j = html.indexOf(END);
assert.ok(i > -1 && j > i, 'math region markers missing from index.html');
const block = html.slice(html.indexOf('*/', i) + 2, j);

/** Build the engine with a given settings object (level, advance map, payLag). */
function engine(settings) {
  return new Function('settings', block + '\n;return {calc,rateFor,CARRIERS,LEVELS};')(settings);
}
const base = () => ({ level: 100, advance: {}, payLag: 7 });
const moo = (over = {}) => ({
  client: 'Test', carrier: 'Mutual of Omaha', product: 'Term Life Express',
  prem: 100, mode: 'monthly', status: 'submitted', written: '2026-09-01',
  draft: '', paidDate: '', advance: null, paidAmt: null, ...over,
});

test('Mutual of Omaha Term Life Express, $100/mo at level 100', () => {
  const { calc } = engine(base());
  const c = calc(moo());
  assert.equal(c.ap, 1200, 'annual premium');
  assert.equal(c.rate, 100, 'comp rate at level 100');
  assert.equal(c.fyc, 1200, 'first year commission');
  assert.equal(c.advance, 900, 'advance at the 75% default');
  assert.equal(c.tail, 300, 'as-earned tail');
  assert.equal(c.advPct, 75, 'advance percent');
  assert.equal(c.advMonths, 9, '75% advance is a 9 month advance');
});

test('switching to level 120 moves the rate to 120%', () => {
  const s = base(); s.level = 120;
  const { calc, rateFor } = engine(s);
  assert.equal(rateFor('Mutual of Omaha', 'Term Life Express', 120), 120);
  const c = calc(moo());
  assert.equal(c.rate, 120, 'rate follows the contract level');
  assert.equal(c.ap, 1200, 'premium is unaffected by level');
  assert.equal(c.fyc, 1440, 'first year commission at 120%');
  assert.equal(c.advance, 1080, '75% of 1440');
  assert.equal(c.tail, 360);
});

test('every contract level maps to the published grid row', () => {
  const { rateFor, LEVELS } = engine(base());
  const expected = [145,140,135,130,125,120,115,110,105,100,95,90,85,80,75,70,65];
  assert.deepEqual(LEVELS, expected, 'level ladder');
  expected.forEach(l =>
    assert.equal(rateFor('Mutual of Omaha', 'Term Life Express', l), l,
      `Term Life Express at ${l} should pay ${l}%`));
});

test('annual premium mode does not get multiplied by 12', () => {
  const { calc } = engine(base());
  assert.equal(calc(moo({ prem: 1200, mode: 'annual' })).ap, 1200);
  assert.equal(calc(moo({ prem: 1200, mode: 'monthly' })).ap, 14400);
});

test('a product not offered at your level returns no rate, not a wrong one', () => {
  const s = base(); s.level = 145;
  const { calc, rateFor } = engine(s);
  assert.equal(rateFor('Royal Neighbors', 'Term', 145), null);
  const c = calc(moo({ carrier: 'Royal Neighbors', product: 'Term' }));
  assert.equal(c.rate, null);
  assert.equal(c.fyc, 0, 'no rate means no commission, not NaN');
  assert.equal(c.advance, 0);
});

test('advance percent: per-policy beats carrier default beats 75', () => {
  const { calc } = engine(base());
  assert.equal(calc(moo()).advPct, 75, 'falls back to 75');

  const s = base(); s.advance['Mutual of Omaha'] = 50;
  assert.equal(engine(s).calc(moo()).advPct, 50, 'carrier default wins over 75');
  assert.equal(engine(s).calc(moo()).advance, 600, '50% of 1200');

  assert.equal(engine(s).calc(moo({ advance: 100 })).advPct, 100, 'per-policy wins over carrier');
  assert.equal(engine(s).calc(moo({ advance: 100 })).advance, 1200);
  assert.equal(engine(s).calc(moo({ advance: 100 })).tail, 0, 'a 100% advance leaves no tail');
});

test('chargeback exposure decays as the policy stays on the books', () => {
  const { calc } = engine(base());
  const months = n => { const d = new Date(); d.setMonth(d.getMonth() - n); return d.toISOString().slice(0, 10); };
  const paid = over => moo({ status: 'paid', paidDate: months(0), ...over });

  const fresh = calc(paid({ draft: months(0) }));
  assert.equal(fresh.paidAmt, 900, 'paid amount defaults to the advance');
  assert.equal(Math.round(fresh.unearned), 900, 'day one, the whole advance is at risk');

  assert.equal(Math.round(calc(paid({ draft: months(3) })).unearned), 600, '3 of 9 months earned');
  assert.equal(Math.round(calc(paid({ draft: months(9) })).unearned), 0, 'fully earned at 9 months');
  assert.equal(Math.round(calc(paid({ draft: months(24) })).unearned), 0, 'never goes negative');
});

test('a submitted policy counts as pending cash, a declined one does not', () => {
  const { calc } = engine(base());
  assert.equal(calc(moo({ status: 'submitted' })).pending, true);
  assert.equal(calc(moo({ status: 'approved' })).pending, true);
  assert.equal(calc(moo({ status: 'paid' })).pending, false);
  assert.equal(calc(moo({ status: 'declined' })).pending, false);
});

test('the comp grid still has every carrier and no ragged rows', () => {
  const { CARRIERS, LEVELS } = engine(base());
  assert.equal(CARRIERS.length, 14, 'carrier count');
  for (const c of CARRIERS)
    for (const p of c.products)
      assert.equal(p.r.length, LEVELS.length, `${c.name} / ${p.name} has a rate for every level`);
});
