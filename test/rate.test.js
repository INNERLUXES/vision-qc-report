import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alignScores, formatScore, parseScore, percentFixed, rateAbove, rateBelow, rateOf, readCount, readPercent, sweepThresholds, InputError, WORK_LIMITS } from '../src/index.js';

const lim = (t) => readPercent(t);

test('readPercent: plain decimals from 0 to 100, with the text kept; nothing else', () => {
  assert.equal(readPercent('2').text, '2');
  assert.deepEqual([readPercent('0.5').int, readPercent('0.5').scale], [5n, 1]);
  assert.equal(readPercent('100').text, '100');
  assert.equal(readPercent('100.0').text, '100.0');
  for (const bad of ['100.1', '101', '-1', '1e1', '1,5', '', ' 5', '5%', 'five', '.5', '5.', '0x10', '+5']) assert.equal(readPercent(bad), null, bad);
  assert.equal(readPercent('1'.repeat(41)), null, 'past the digits the decimal reader allows');
});

test('readCount: a whole number of 0 to 999999999', () => {
  assert.equal(readCount('0'), 0);
  assert.equal(readCount('30'), 30);
  assert.equal(readCount('999999999'), 999999999);
  for (const bad of ['', '-1', '1.5', '1e3', '1000000000', ' 3', 'x']) assert.equal(readCount(bad), null, bad);
});

test('percentFixed: two decimals, half up, exact', () => {
  assert.equal(percentFixed(1, 120), '0.83');
  assert.equal(percentFixed(2, 120), '1.67');
  assert.equal(percentFixed(1, 3), '33.33');
  assert.equal(percentFixed(2, 3), '66.67');
  assert.equal(percentFixed(0, 7), '0.00');
  assert.equal(percentFixed(7, 7), '100.00');
  assert.equal(percentFixed(1, 8, 1), '12.5');
  assert.equal(percentFixed(1, 16, 1), '6.3', 'half rounds up');
  assert.equal(percentFixed(1, 16, 0), '6');
  assert.equal(percentFixed(1, 0), null);
  assert.equal(percentFixed(5n, 10n), '50.00');
  assert.equal(percentFixed(1, 3, 3), '33.333');
});

test('percentFixed: a count past the size of a double is still exact', () => {
  const big = 10n ** 30n;
  assert.equal(percentFixed(big - 1n, big), '100.00');
  assert.equal(percentFixed(big / 3n, big), '33.33');
});

test('rateOf: the counts and the percent', () => {
  assert.deepEqual(rateOf(1, 120), { count: 1, of: 120, percent: '0.83' });
  assert.deepEqual(rateOf(0, 0), { count: 0, of: 0, percent: null });
});

test('rateAbove: a rate is above a limit only when it is strictly above, compared exactly', () => {
  assert.equal(rateAbove(1, 50, lim('2')), false, '1 of 50 is exactly 2 percent');
  assert.equal(rateAbove(1, 49, lim('2')), true, '1 of 49 is above 2 percent');
  assert.equal(rateAbove(1, 120, lim('0.83')), true, '0.8333 is above 0.83');
  assert.equal(rateAbove(1, 120, lim('0.84')), false);
  assert.equal(rateAbove(0, 10, lim('0')), false);
  assert.equal(rateAbove(1, 10, lim('0')), true);
  assert.equal(rateAbove(10, 10, lim('100')), false);
  assert.equal(rateAbove(5, 0, lim('0')), false, 'no denominator: not above anything');
});

test('rateBelow: a rate is below a limit only when it is strictly below', () => {
  assert.equal(rateBelow(19, 20, lim('95')), false, '95 percent is not below 95');
  assert.equal(rateBelow(94, 100, lim('95')), true);
  assert.equal(rateBelow(77, 80, lim('96.25')), false, '96.25 is exactly the limit');
  assert.equal(rateBelow(77, 80, lim('96.26')), true);
  assert.equal(rateBelow(0, 0, lim('95')), false);
});

test('a double would get these wrong and the exact comparison does not', () => {
  assert.equal((7 / 100) * 100 > 7, true, 'a double puts 7 of 100 above 7 percent');
  assert.equal(rateAbove(7, 100, lim('7')), false);
  assert.equal((29 / 100) * 100 < 29, true, 'a double puts 29 of 100 below 29 percent');
  assert.equal(rateBelow(29, 100, lim('29')), false);
  assert.equal(rateAbove(58, 200, lim('29')), false);
  assert.equal(rateBelow(9, 10, lim('90')), false);
  assert.equal(rateBelow(899, 1000, lim('90')), true);
});

test('parseScore: plain decimals with an optional minus sign, as a whole number and a scale', () => {
  assert.deepEqual(parseScore('0.82'), { int: 82n, scale: 2 });
  assert.deepEqual(parseScore('-1.5'), { int: -15n, scale: 1 });
  assert.deepEqual(parseScore('3'), { int: 3n, scale: 0 });
  assert.deepEqual(parseScore('-0'), { int: 0n, scale: 0 });
  assert.deepEqual(parseScore('0.10'), { int: 10n, scale: 2 });
  for (const bad of ['', '-', '1e-1', '+1', '1,000', '.5', '5.', '01', '--1', ' 1', '0x1', 'NaN', 'Infinity', '1.2.3']) assert.equal(parseScore(bad), null, bad);
  assert.equal(parseScore('9'.repeat(41)), null);
  assert.equal(parseScore('9'.repeat(40)).int, BigInt('9'.repeat(40)));
});

test('alignScores: every score on the scale of the finest one, exact', () => {
  const a = alignScores([{ int: 5n, scale: 1 }, { int: 125n, scale: 2 }, { int: -3n, scale: 0 }]);
  assert.equal(a.scale, 2);
  assert.deepEqual(a.ints, [50n, 125n, -300n]);
  assert.deepEqual(alignScores([]), { scale: 0, ints: [] });
});

test('formatScore: the shortest form, with the sign', () => {
  assert.equal(formatScore(50n, 2), '0.5');
  assert.equal(formatScore(-125n, 2), '-1.25');
  assert.equal(formatScore(300n, 2), '3');
  assert.equal(formatScore(5n, 3), '0.005');
  assert.equal(formatScore(0n, 4), '0');
  assert.equal(formatScore(7n, 0), '7');
});

const sweep = (defects, goods, extra = {}) => {
  const all = alignScores([...defects, ...goods].map((v) => parseScore(v)));
  const n = defects.length;
  return sweepThresholds({ defects: all.ints.slice(0, n), goods: all.ints.slice(n), scale: all.scale, maxEscape: lim('2'), maxFalseReject: lim('5'), ...extra });
};

test('sweepThresholds: a run fails at or above the threshold; the rows go from the lowest score to the highest', () => {
  const rows = sweep(['0.6', '0.9', '0.4'], ['0.1', '0.2', '0.5']);
  assert.deepEqual(rows.map((r) => r.threshold), ['0.1', '0.2', '0.4', '0.5', '0.6', '0.9']);
  const at = (t) => rows.find((r) => r.threshold === t);
  assert.deepEqual([at('0.1').escapes.count, at('0.1').falseRejects.count], [0, 3]);
  assert.deepEqual([at('0.4').escapes.count, at('0.4').falseRejects.count], [0, 1]);
  assert.deepEqual([at('0.5').escapes.count, at('0.5').falseRejects.count], [1, 1]);
  assert.deepEqual([at('0.6').escapes.count, at('0.6').falseRejects.count], [1, 0]);
  assert.deepEqual([at('0.9').escapes.count, at('0.9').falseRejects.count], [2, 0]);
  assert.deepEqual(at('0.9').escapes, { count: 2, of: 3, percent: '66.67' });
});

test('sweepThresholds: a score shared by a defect and a good run is one threshold, and equal scores fail together', () => {
  const rows = sweep(['0.5', '0.5', '0.8'], ['0.5', '0.3']);
  assert.deepEqual(rows.map((r) => r.threshold), ['0.3', '0.5', '0.8']);
  assert.deepEqual([rows[1].escapes.count, rows[1].falseRejects.count], [0, 1], 'at 0.5 the runs scored 0.5 fail');
  assert.deepEqual([rows[2].escapes.count, rows[2].falseRejects.count], [2, 0]);
});

test('sweepThresholds: a row is within the limits when both rates are, compared exactly, and not when a side has no runs', () => {
  const defects = Array.from({ length: 50 }, () => '0.9');
  const goods = Array.from({ length: 20 }, () => '0.1');
  const rows = sweep(defects, goods);
  assert.deepEqual(rows.map((r) => [r.threshold, r.within]), [['0.1', false], ['0.9', true]], 'at 0.1 every good run fails; at 0.9 the defects fail and the good runs pass');
  const withOne = sweep([...defects, '0.05'], goods);
  assert.equal(withOne.find((r) => r.threshold === '0.9').within, true, '1 of 51 escapes is 1.96 percent, within 2');
  const withTwo = sweep([...defects, '0.05', '0.06'], goods);
  assert.equal(withTwo.find((r) => r.threshold === '0.9').within, false, '2 of 52 escapes is 3.85 percent');
  assert.equal(sweep(['0.9'], []).every((r) => r.within === false), true);
  assert.equal(sweep([], ['0.1']).every((r) => r.within === false), true);
});

test('sweepThresholds: direction low reads a score at or below the threshold as a fail, and lists the thresholds from low to high', () => {
  const rows = sweep(['0.1', '0.2'], ['0.8', '0.9'], { direction: 'low' });
  assert.deepEqual(rows.map((r) => r.threshold), ['0.1', '0.2', '0.8', '0.9']);
  const at = (t) => rows.find((r) => r.threshold === t);
  assert.deepEqual([at('0.1').escapes.count, at('0.1').falseRejects.count], [1, 0], 'at 0.1 only the run at 0.1 fails');
  assert.deepEqual([at('0.2').escapes.count, at('0.2').falseRejects.count], [0, 0]);
  assert.deepEqual([at('0.9').escapes.count, at('0.9').falseRejects.count], [0, 2]);
});

test('sweepThresholds: negative scores, scores of different scales and a score past the double range', () => {
  const rows = sweep(['-0.5', '2'], ['-3', '0.25']);
  assert.deepEqual(rows.map((r) => r.threshold), ['-3', '-0.5', '0.25', '2']);
  const big = sweep([`1${'0'.repeat(30)}.5`], [`1${'0'.repeat(30)}.4`]);
  assert.deepEqual(big.map((r) => r.threshold), [`1${'0'.repeat(30)}.4`, `1${'0'.repeat(30)}.5`]);
});

test('sweepThresholds: more distinct scores than the limit is an input error that says so', () => {
  const n = WORK_LIMITS.maxThresholds + 1;
  const defects = Array.from({ length: n }, (_, i) => BigInt(i));
  assert.throws(() => sweepThresholds({ defects, goods: [], scale: 0, maxEscape: lim('2'), maxFalseReject: lim('5') }), (e) => e instanceof InputError && /100,000 the sweep lists/.test(e.message));
  const ok = Array.from({ length: WORK_LIMITS.maxThresholds }, (_, i) => BigInt(i));
  assert.equal(sweepThresholds({ defects: ok, goods: [], scale: 0, maxEscape: lim('2'), maxFalseReject: lim('5') }).length, WORK_LIMITS.maxThresholds);
});
