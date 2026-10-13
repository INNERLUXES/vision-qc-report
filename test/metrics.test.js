import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze, evaluateLimits, readLabels, readOptions, readResults, resolveLabels } from '../src/index.js';
import { bench, labelsOf, ofCheck, resultsOf, runOf } from './helpers.js';

const NOSIZE = { minDefects: '0', minGood: '0' };
const L = (rows, columns) => labelsOf(rows, columns);
const R = (rows, columns) => resultsOf(rows, columns);

test('counts: escapes are runs of defect parts that passed, false rejects runs of good parts that failed, each over its own side', () => {
  const b = bench({ good: 10, defect: 20, runs: 3, escapes: ['D1:1', 'D2:3'], falseRejects: ['G1:1', 'G1:2', 'G5:3'] });
  const a = runOf(b.labels, b.results, NOSIZE).analysis;
  assert.deepEqual([a.measured.good, a.measured.defect, a.measured.runs], [10, 20, 90]);
  assert.deepEqual(a.escape.perRun, { count: 2, of: 60, percent: '3.33' });
  assert.deepEqual(a.falseReject.perRun, { count: 3, of: 30, percent: '10.00' });
  assert.deepEqual(a.escape.majority, { count: 0, of: 20, percent: '0.00' });
  assert.deepEqual(a.falseReject.majority, { count: 1, of: 10, percent: '10.00' }, 'G1 failed twice in three runs');
  assert.deepEqual(a.repeatability, { ...a.repeatability, parts: 30, disagreeing: 4, consistent: 26 });
  assert.equal(a.repeatability.rate.percent, '86.67');
});

test('the majority verdict: a tie between pass and fail counts against the station, on both sides', () => {
  const b = bench({ good: 3, defect: 3, runs: 2, escapes: ['D1:1'], falseRejects: ['G1:2'] });
  const a = runOf(b.labels, b.results, NOSIZE).analysis;
  assert.deepEqual(a.escape.majority, { count: 1, of: 3, percent: '33.33' }, 'D1 passed once and failed once');
  assert.deepEqual(a.falseReject.majority, { count: 1, of: 3, percent: '33.33' });
  assert.equal(a.escape.tied, 1);
  assert.equal(a.falseReject.tied, 1);
  const three = bench({ good: 3, defect: 3, runs: 3, escapes: ['D1:1'], falseRejects: ['G1:2'] });
  const t = runOf(three.labels, three.results, NOSIZE).analysis;
  assert.equal(t.escape.majority.count, 0, 'one pass in three runs is not a majority');
  assert.equal(t.escape.tied, 0);
});

test('escape-above-limit: 1 of 50 is exactly 2 percent and passes, 1 of 49 is above and fails', () => {
  const at = bench({ good: 30, defect: 50, escapes: ['D1:1'] });
  assert.deepEqual(ofCheck(at.labels, at.results, 'escape-above-limit', NOSIZE), []);
  const over = bench({ good: 30, defect: 49, escapes: ['D1:1'] });
  const found = ofCheck(over.labels, over.results, 'escape-above-limit', NOSIZE);
  assert.equal(found.length, 1);
  assert.match(found[0].message, /The escape rate is 2\.04 percent per run \(1 of 49 runs of defect parts passed\), 2\.04 percent by majority verdict \(1 of 49 defect parts\); the limit is 2 percent and the rate is above it per run and by majority verdict\./);
  assert.equal(found[0].file, null);
});

test('escape-above-limit: either rate above the limit fails, and the message says which', () => {
  const b = bench({ good: 30, defect: 30, runs: 3, escapes: ['D1:1', 'D1:2'] });
  const found = ofCheck(b.labels, b.results, 'escape-above-limit', { ...NOSIZE, maxEscape: '3' });
  assert.equal(found.length, 1, '2 of 90 runs is 2.22 percent, but D1 passed twice in three runs: 1 of 30 parts is 3.33 percent');
  assert.match(found[0].message, /the rate is above it by majority verdict\./);
  assert.deepEqual(ofCheck(b.labels, b.results, 'escape-above-limit', { ...NOSIZE, maxEscape: '3.34' }), []);
  const perRun = bench({ good: 30, defect: 30, runs: 5, escapes: ['D1:1', 'D2:1', 'D3:1', 'D4:1'] });
  const run = ofCheck(perRun.labels, perRun.results, 'escape-above-limit', { ...NOSIZE, maxEscape: '2.5' });
  assert.match(run[0].message, /4 of 150 runs/);
  assert.match(run[0].message, /the rate is above it per run\./);
});

test('false-reject-above-limit: 1 of 20 is exactly 5 percent and passes, 1 of 19 is above and fails', () => {
  const at = bench({ good: 20, defect: 30, falseRejects: ['G1:1'] });
  assert.deepEqual(ofCheck(at.labels, at.results, 'false-reject-above-limit', NOSIZE), []);
  const over = bench({ good: 19, defect: 30, falseRejects: ['G1:1'] });
  const found = ofCheck(over.labels, over.results, 'false-reject-above-limit', NOSIZE);
  assert.equal(found.length, 1);
  assert.match(found[0].message, /The false reject rate is 5\.26 percent per run \(1 of 19 runs of good parts failed\)/);
});

test('--max-escape and --max-false-reject take decimals and compare them exactly', () => {
  const b = bench({ good: 120, defect: 120, escapes: ['D1:1'], falseRejects: ['G1:1', 'G2:1'] });
  assert.equal(ofCheck(b.labels, b.results, 'escape-above-limit', { ...NOSIZE, maxEscape: '0.83' }).length, 1, '0.8333 is above 0.83');
  assert.equal(ofCheck(b.labels, b.results, 'escape-above-limit', { ...NOSIZE, maxEscape: '0.84' }).length, 0);
  assert.equal(ofCheck(b.labels, b.results, 'false-reject-above-limit', { ...NOSIZE, maxFalseReject: '1.66' }).length, 1);
  assert.equal(ofCheck(b.labels, b.results, 'false-reject-above-limit', { ...NOSIZE, maxFalseReject: '1.67' }).length, 0);
  assert.equal(ofCheck(b.labels, b.results, 'escape-above-limit', { ...NOSIZE, maxEscape: '0' }).length, 1);
  assert.equal(ofCheck(b.labels, b.results, 'escape-above-limit', { ...NOSIZE, maxEscape: '100' }).length, 0);
});

test('a rate that cannot be measured is a failure: no defect part, or no good part, with a result', () => {
  const onlyGood = bench({ good: 5, defect: 0 });
  const e = ofCheck(onlyGood.labels, onlyGood.results, 'escape-above-limit', NOSIZE);
  assert.equal(e.length, 1);
  assert.match(e[0].message, /cannot be measured: no defect part has a result/);
  const onlyDefect = bench({ good: 0, defect: 5 });
  assert.match(ofCheck(onlyDefect.labels, onlyDefect.results, 'false-reject-above-limit', NOSIZE)[0].message, /cannot be measured: no good part has a result/);
  const r = runOf(onlyGood.labels, onlyGood.results, NOSIZE);
  assert.deepEqual(r.limits.map((l) => l.status), ['fail', 'pass', 'skipped']);
});

test('repeatability: 19 of 20 parts is exactly 95 percent and passes; 18 of 20 is below', () => {
  const at = bench({ good: 10, defect: 10, runs: 3, falseRejects: ['G1:1'] });
  assert.deepEqual(ofCheck(at.labels, at.results, 'repeatability-below-limit', NOSIZE), []);
  const below = bench({ good: 10, defect: 10, runs: 3, falseRejects: ['G1:1', 'G2:2'] });
  const found = ofCheck(below.labels, below.results, 'repeatability-below-limit', NOSIZE);
  assert.equal(found.length, 1);
  assert.match(found[0].message, /Repeatability is 90\.00 percent \(18 of 20 parts with more than one run gave the same verdict every time\); the minimum is 95 percent\. 2 parts had runs that disagreed\./);
  assert.deepEqual(ofCheck(below.labels, below.results, 'repeatability-below-limit', { ...NOSIZE, minRepeatability: '90' }), []);
  assert.equal(ofCheck(below.labels, below.results, 'repeatability-below-limit', { ...NOSIZE, minRepeatability: '90.01' }).length, 1);
});

test('repeatability counts only the parts with more than one run; a part with one run is neither consistent nor not', () => {
  const labels = L([['G1', 'good', '', '', ''], ['G2', 'good', '', '', ''], ['D1', 'defect', 'dent', '', '']]);
  const results = R([['G1', '1', 'pass', '', '', ''], ['G1', '2', 'fail', '', '', ''], ['G2', '1', 'pass', '', '', ''], ['D1', '1', 'fail', 'dent', '', '']]);
  const a = runOf(labels, results, NOSIZE).analysis;
  assert.deepEqual([a.repeatability.parts, a.repeatability.disagreeing, a.repeatability.consistent], [1, 1, 0]);
});

test('repeatability is not measured when no part has more than one run: skipped by default, a failure when --min-repeatability is given', () => {
  const b = bench({ good: 30, defect: 30, runs: 1 });
  const dflt = runOf(b.labels, b.results);
  assert.equal(dflt.findings.length, 0);
  assert.equal(dflt.limits[2].status, 'skipped');
  assert.ok(dflt.notes.includes('repeatability was not measured: no part has more than one run'));
  const given = runOf(b.labels, b.results, { minRepeatability: '90' });
  assert.equal(given.limits[2].status, 'fail');
  assert.match(given.findings[0].message, /--min-repeatability was given, but no part has more than one run/);
  assert.deepEqual(given.findings.map((f) => f.id), ['repeatability-below-limit']);
  assert.ok(!given.notes.some((n) => n.startsWith('repeatability was not measured')));
});

test('sample-small: exactly 30 of each is enough and 29 is not; the message says plainly that a rate on so few parts misleads', () => {
  const enough = bench({ good: 30, defect: 30 });
  assert.deepEqual(ofCheck(enough.labels, enough.results, 'sample-small'), []);
  const few = bench({ good: 30, defect: 29 });
  const one = ofCheck(few.labels, few.results, 'sample-small');
  assert.equal(one.length, 1);
  assert.match(one[0].message, /^Only 29 defect parts \(at least 30 asked for\) were measured\. Rates on so few parts mislead: one defect part is 3\.45 percent of the defect parts, so one part moves a rate by that much,/);
  assert.doesNotMatch(one[0].message, /good part/);
  const both = bench({ good: 12, defect: 8 });
  const two = ofCheck(both.labels, both.results, 'sample-small')[0].message;
  assert.match(two, /Only 8 defect parts \(at least 30 asked for\) and 12 good parts \(at least 30 asked for\) were measured/);
  assert.match(two, /one defect part is 12\.50 percent of the defect parts and one good part is 8\.33 percent of the good parts/);
  assert.match(two, /no escape among a handful of defect parts does not show that the escape rate is low/);
});

test('--min-defects and --min-good move the size of the sample that is asked for; zero asks for none', () => {
  const b = bench({ good: 10, defect: 10 });
  assert.equal(ofCheck(b.labels, b.results, 'sample-small', { minDefects: '10', minGood: '10' }).length, 0);
  assert.equal(ofCheck(b.labels, b.results, 'sample-small', { minDefects: '11', minGood: '10' }).length, 1);
  assert.equal(ofCheck(b.labels, b.results, 'sample-small', { minDefects: '10', minGood: '11' }).length, 1);
  assert.equal(ofCheck(b.labels, b.results, 'sample-small', NOSIZE).length, 0);
});

test('the sample is the parts that were measured, not the parts that were labelled', () => {
  const b = bench({ good: 30, defect: 30 });
  const fewer = b.results.split('\n').filter((l) => !l.startsWith('D30,')).join('\n');
  const found = ofCheck(b.labels, fewer, 'sample-small');
  assert.equal(found.length, 1);
  assert.match(found[0].message, /Only 29 defect parts/);
});

test('the limits report: three limits with a status and the numbers', () => {
  const b = bench({ good: 30, defect: 30, runs: 3, escapes: ['D1:1', 'D2:1', 'D3:1', 'D4:1'] });
  const r = runOf(b.labels, b.results);
  assert.deepEqual(r.limits.map((l) => [l.check, l.status]), [['escape-above-limit', 'fail'], ['false-reject-above-limit', 'pass'], ['repeatability-below-limit', 'fail']]);
  assert.equal(r.limits[0].name, 'escape rate at most 2 percent');
  assert.match(r.limits[0].detail, /4\.44 percent per run \(4 of 90 runs of defect parts passed\), 0\.00 percent by majority verdict \(0 of 30 defect parts\)/);
  assert.equal(r.limits[1].name, 'false reject rate at most 5 percent');
});

test('evaluateLimits with no analysis does not evaluate anything', () => {
  const found = [];
  const out = evaluateLimits(null, readOptions(), (...args) => found.push(args));
  assert.deepEqual(out.map((l) => l.status), ['not-evaluated', 'not-evaluated', 'not-evaluated']);
  assert.deepEqual(found, []);
});

test('the matrix: rows are the labelled types, columns the reported types, with not named and passed; counts are runs', () => {
  const labels = L([['D1', 'defect', 'scratch', '', ''], ['D2', 'defect', 'dent', '', ''], ['D3', 'defect', 'dent', '', ''], ['G1', 'good', '', '', '']]);
  const results = R([
    ['D1', '1', 'fail', 'scratch', '', ''], ['D1', '2', 'fail', 'dent', '', ''], ['D1', '3', 'pass', '', '', ''],
    ['D2', '1', 'fail', 'dent', '', ''], ['D2', '2', 'fail', '', '', ''], ['D3', '1', 'fail', 'crack', '', ''],
    ['G1', '1', 'pass', '', '', ''], ['G1', '2', 'fail', 'scratch', '', '']
  ]);
  const a = runOf(labels, results, NOSIZE).analysis;
  assert.deepEqual(a.matrix.columns, ['crack', 'dent', 'scratch', '(not named)', 'passed']);
  assert.deepEqual(a.matrix.rows.map((r) => [r.type, ...r.counts]), [
    ['dent', 1, 1, 0, 1, 0],
    ['scratch', 0, 1, 1, 0, 1],
    ['(good part)', 0, 0, 1, 0, 1]
  ]);
  assert.deepEqual(a.types.map((t) => [t.type, t.parts, t.runs, t.detected.count, t.named.count]), [['dent', 2, 3, 3, 1], ['scratch', 1, 3, 2, 1]]);
  assert.deepEqual(a.types[0].detected, { count: 3, of: 3, percent: '100.00' });
  assert.deepEqual(a.types[1].detected, { count: 2, of: 3, percent: '66.67' });
});

test('the matrix: types are compared without regard to case, the spelling of the labels is shown, and a type named like a fixed label stays a type', () => {
  const labels = L([['D1', 'defect', 'Scratch', '', ''], ['D2', 'defect', '', '', ''], ['G1', 'good', '', '', '']]);
  const results = R([['D1', '1', 'fail', 'scratch', '', ''], ['D2', '1', 'fail', '(not named)', '', ''], ['D2', '2', 'fail', '', '', ''], ['G1', '1', 'pass', '(good part)', '', '']]);
  const a = runOf(labels, results, NOSIZE).analysis;
  assert.deepEqual(a.matrix.columns, ['(not named)', 'Scratch', '(not named)', 'passed'], 'the reported type "(not named)" has a column of its own');
  assert.equal(a.matrix.rows[0].type, 'Scratch');
  assert.deepEqual(a.matrix.rows[0].counts, [0, 1, 0, 0]);
  assert.equal(a.matrix.rows[1].type, '(no type)');
  assert.deepEqual(a.matrix.rows[1].counts, [1, 0, 1, 0]);
  assert.deepEqual(a.types.map((t) => [t.type, t.named === null ? null : t.named.count]), [['Scratch', 1], ['(no type)', null]]);
  assert.deepEqual(a.matrix.rows[2].counts, [0, 0, 0, 1], 'a type on a pass is ignored');
});

test('the matrix: the columns are sorted by name and do not depend on the order of the files', () => {
  const labels = L([['D1', 'defect', 'zip', '', ''], ['D2', 'defect', 'apple', '', '']]);
  const results = R([['D1', '1', 'fail', 'mid', '', ''], ['D2', '1', 'fail', 'zip', '', '']]);
  const a = runOf(labels, results, NOSIZE).analysis;
  assert.deepEqual(a.matrix.columns, ['apple', 'mid', 'zip', '(not named)', 'passed']);
  assert.deepEqual(a.matrix.rows.map((r) => r.type), ['apple', 'zip']);
});

test('more than 200 different defect types is an input error with a clear message', () => {
  const labels = L([['D1', 'defect', 't0', '', '']]);
  const rows = Array.from({ length: 201 }, (_, i) => ['D1', String(i + 1), 'fail', `t${i}`, '', '']);
  assert.throws(() => runOf(labels, R(rows), NOSIZE), /names more than 200 different defect types/);
  const fine = rows.slice(0, 200);
  assert.equal(runOf(labels, R(fine), NOSIZE).analysis.matrix.columns.length, 202);
});

test('the stations: runs are counted for each station, with the rows that name none under (no station)', () => {
  const labels = L([['G1', 'good', '', '', ''], ['D1', 'defect', 'dent', '', '']]);
  const results = R([['G1', '1', 'fail', '', '', 'cam-b'], ['G1', '2', 'pass', '', '', 'cam-a'], ['D1', '1', 'pass', '', '', 'cam-a'], ['D1', '2', 'fail', 'dent', '', 'CAM-A'], ['D1', '3', 'fail', 'dent', '', '']]);
  const a = runOf(labels, results, NOSIZE).analysis;
  assert.deepEqual(a.stations.map((s) => [s.station, s.escape.count, s.escape.of, s.falseReject.count, s.falseReject.of]), [['(no station)', 0, 1, 0, 0], ['cam-a', 1, 2, 0, 1], ['cam-b', 0, 0, 1, 1]]);
  const none = runOf(base2().labels, base2().results, NOSIZE).analysis;
  assert.equal(none.stations, null, 'no station column, no table');
});

function base2() {
  return bench({ good: 2, defect: 2 });
}

test('the parts where the runs disagreed are listed with their runs in order, the label and the line', () => {
  const labels = L([['G1', 'good', '', '', ''], ['D1', 'defect', 'dent', '', '']]);
  const results = R([['G1', '2', 'fail', '', '', ''], ['G1', '1', 'pass', '', '', ''], ['D1', '1', 'fail', 'dent', '', ''], ['D1', '2', 'fail', 'dent', '', '']]);
  const a = runOf(labels, results, NOSIZE).analysis;
  assert.equal(a.repeatability.listed.length, 1);
  assert.deepEqual(a.repeatability.listed[0], { part: 'G1', label: 'good', type: null, line: 2, runs: [{ run: 1, verdict: 'pass', line: 3 }, { run: 2, verdict: 'fail', line: 2 }] });
  const typed = runOf(labels, R([['D1', '1', 'fail', 'dent', '', ''], ['D1', '2', 'pass', '', '', ''], ['G1', '1', 'pass', '', '', '']]), NOSIZE).analysis;
  assert.deepEqual([typed.repeatability.listed[0].type, typed.repeatability.listed[0].label], ['dent', 'defect']);
});

test('the threshold sweep uses the runs of measured parts that have a score, and says how many it left out', () => {
  const labels = L([['G1', 'good', '', '', ''], ['D1', 'defect', 'dent', '', ''], ['X1', 'good', '', '', '']]);
  const results = R([['G1', '1', 'pass', '', '0.2', ''], ['G1', '2', 'pass', '', '', ''], ['D1', '1', 'fail', 'dent', '0.8', ''], ['D1', '2', 'pass', '', '0.4', ''], ['X1', '1', 'fail', '', '0.9', ''], ['Z9', '1', 'fail', '', '0.9', '']]);
  const r = runOf(labels, results, { ...NOSIZE, thresholdSweep: true });
  const sweep = r.analysis.sweep;
  assert.deepEqual([sweep.defectRuns, sweep.goodRuns, sweep.runsWithoutScore], [2, 2, 1]);
  assert.deepEqual(sweep.rows.map((x) => x.threshold), ['0.2', '0.4', '0.8', '0.9']);
  assert.ok(r.notes.includes('the threshold sweep left out 1 run that has no score'));
  assert.equal(runOf(labels, results, NOSIZE).analysis.sweep, null);
});

test('the threshold sweep with direction low, and with scores that are negative', () => {
  const labels = L([['G1', 'good', '', '', ''], ['D1', 'defect', 'dent', '', '']]);
  const results = R([['G1', '1', 'pass', '', '2', ''], ['D1', '1', 'fail', 'dent', '-1.5', '']]);
  const low = runOf(labels, results, { ...NOSIZE, thresholdSweep: true, scoreDirection: 'low' }).analysis.sweep;
  assert.deepEqual(low.rows.map((x) => [x.threshold, x.escapes.count, x.falseRejects.count, x.within]), [['-1.5', 0, 0, true], ['2', 0, 1, false]], 'a run fails at or below the threshold: at -1.5 only the defect fails, at 2 both do');
  const high = runOf(labels, results, { ...NOSIZE, thresholdSweep: true }).analysis.sweep;
  assert.deepEqual(high.rows.map((x) => [x.threshold, x.escapes.count, x.falseRejects.count]), [['-1.5', 0, 1], ['2', 1, 1]]);
});

test('a sweep with no score at all has no rows and says so', () => {
  const b = bench({ good: 2, defect: 2 });
  const r = runOf(b.labels, b.results, { ...NOSIZE, thresholdSweep: true });
  assert.deepEqual(r.analysis.sweep.rows, []);
  assert.ok(r.notes.includes('the threshold sweep has no rows because no run has a score'));
});

test('readOptions: defaults, decimals, counts and the direction; a value that cannot be used names its option', () => {
  const o = readOptions();
  assert.deepEqual([o.maxEscape.text, o.maxFalseReject.text, o.minRepeatability.text, o.minDefects, o.minGood, o.thresholdSweep, o.scoreDirection, o.minRepeatabilityGiven], ['2', '5', '95', 30, 30, false, 'high', false]);
  assert.equal(readOptions({ minRepeatability: '99.5' }).minRepeatabilityGiven, true);
  assert.throws(() => readOptions({ maxEscape: '101' }), /--max-escape: 101 is not a plain number of percent from 0 to 100/);
  assert.throws(() => readOptions({ maxFalseReject: 'x' }), /--max-false-reject: x is not a plain number/);
  assert.throws(() => readOptions({ minRepeatability: '-1' }), /--min-repeatability: -1 is not a plain number/);
  assert.throws(() => readOptions({ minDefects: '2.5' }), /--min-defects: 2.5 is not a whole number from 0 to 999999999/);
  assert.throws(() => readOptions({ minGood: '-3' }), /--min-good: -3 is not a whole number/);
  assert.throws(() => readOptions({ scoreDirection: 'up' }), /--score-direction: up is not high or low/);
  assert.equal(readOptions({ scoreDirection: 'low' }).scoreDirection, 'low');
});

test('readLabels, readResults, resolveLabels and analyze can be used one by one', () => {
  const found = [];
  const add = (...args) => found.push(args);
  const labels = readLabels(L([['G1', 'good', '', 'a', ''], ['D1', 'defect', 'dent', 'a', '']]), add, []);
  const results = readResults(R([['G1', '1', 'pass', '', '0.1', 's'], ['D1', '1', 'fail', 'dent', '0.9', 's']]), add, []);
  assert.deepEqual([labels.ok, results.ok, labels.rows.length, results.data.part.length], [true, true, 2, 2]);
  assert.equal(resolveLabels(labels.rows, add).parts.size, 2);
  const a = analyze({ labels, results, options: readOptions(NOSIZE), add });
  assert.equal(a.measured.parts, 2);
  assert.deepEqual(found, []);
});
