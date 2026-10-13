import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FINDING_CAP, RULES, TABLE_LIMITS } from '../src/index.js';
import { bench, findingsOf, idsOf, labelsOf, lineOf, ofCheck, resultsOf, runOf } from './helpers.js';

// A pair of files small enough to work out by hand; the sample size is not under test here, so the minimums are zero.
const NOSIZE = { minDefects: '0', minGood: '0' };
const L = (rows, columns) => labelsOf(rows, columns);
const R = (rows, columns) => resultsOf(rows, columns);
const base = () => ({ labels: L([['G1', 'good', '', 'a', ''], ['D1', 'defect', 'scratch', 'a', '']]), results: R([['G1', '1', 'pass', '', '', ''], ['D1', '1', 'fail', 'scratch', '', '']]) });
const ids = (labels, results, options = NOSIZE) => idsOf(labels, results, options);

test('the base pair of files has no finding at all', () => {
  const { labels, results } = base();
  assert.deepEqual(findingsOf(labels, results, NOSIZE), []);
});

test('there are 22 checks, each with a level, a kind, a summary, a fix, a reason and what it cannot see, and every id is used by the code', () => {
  assert.equal(RULES.length, 22);
  assert.deepEqual([...new Set(RULES.map((r) => r.id))].length, 22);
  for (const r of RULES) {
    assert.match(r.id, /^[a-z]+(?:-[a-z]+)+$/);
    assert.ok(['error', 'warning'].includes(r.severity), r.id);
    assert.ok(['file', 'record', 'part', 'metric'].includes(r.kind), r.id);
    for (const k of ['summary', 'fix', 'own', 'cannot']) assert.ok(r[k].length > 30, `${r.id} ${k}`);
    assert.match(r.own, /is a best practice of this tool; no standard sets it;/, r.id);
  }
});

test('file-unreadable: a quote never closed, text after a closing quote, semicolons, a cell too long and a header with no rows', () => {
  const ok = base();
  const cases = [
    ['part_id,label\n"G1,good\n', 'never closed'],
    ['part_id,label\n"G1"x,good\n', 'text after the closing quote'],
    ['part_id;label\nG1;good\n', 'semicolons'],
    [`part_id,label\nG1,${'a'.repeat(TABLE_LIMITS.maxCellLength + 1)}\n`, 'longer than'],
    ['part_id,label\n', 'no rows'],
    ['', 'no text']
  ];
  for (const [labels, why] of cases) {
    const found = ofCheck(labels, ok.results, 'file-unreadable', NOSIZE);
    assert.equal(found.length, 1, why);
    assert.equal(found[0].file, 'labels', why);
  }
  for (const [results, why] of cases) assert.equal(ofCheck(ok.labels, results.replace('label', 'verdict'), 'file-unreadable', NOSIZE).filter((f) => f.file === 'results').length, 1, why);
  assert.equal(ofCheck(ok.labels, ok.results, 'file-unreadable', NOSIZE).length, 0);
});

test('file-unreadable: the line and the column of the cell where the reader stopped', () => {
  const found = ofCheck('part_id,label\nG1,good\nG2,"open\n', base().results, 'file-unreadable', NOSIZE);
  assert.deepEqual([found[0].line, found[0].column], [3, 4]);
});

test('a file that cannot be read stops the rates: no analysis, the limits are not evaluated, and the other checks of the other file still run', () => {
  const r = runOf('', base().results.replace('verdict', 'verdict,extra'), NOSIZE);
  assert.equal(r.analysis, null);
  assert.deepEqual(r.limits.map((l) => l.status), ['not-evaluated', 'not-evaluated', 'not-evaluated']);
  assert.ok(r.findings.some((f) => f.id === 'file-unreadable'));
  assert.ok(r.findings.some((f) => f.id === 'column-unknown'), 'the results file was still read');
});

test('column-missing: defect_type in the labels, and run, defect_type in the results, are warnings that say what is lost; the file is still read', () => {
  const labels = L([['G1', 'good'], ['D1', 'defect']], ['part_id', 'label']);
  const results = R([['G1', 'pass'], ['D1', 'fail']], ['part_id', 'verdict']);
  const found = ofCheck(labels, results, 'column-missing', NOSIZE);
  assert.deepEqual(found.map((f) => [f.file, f.subject]), [['labels', 'defect_type'], ['results', 'run'], ['results', 'defect_type']]);
  assert.match(found[0].message, /no rates for each defect type/);
  assert.match(found[1].message, /every row is read as run 1/);
  assert.match(found[2].message, /cannot name what the station reported/);
  assert.equal(runOf(labels, results, NOSIZE).analysis.measured.parts, 2, 'the rates were still worked out');
  assert.equal(ofCheck(base().labels, base().results, 'column-missing', NOSIZE).length, 0);
});

test('column-missing: the score column is missing only when a sweep is asked for', () => {
  const labels = base().labels;
  const results = R([['G1', '1', 'pass', '', ''], ['D1', '1', 'fail', 'scratch', '']], ['part_id', 'run', 'verdict', 'defect_type', 'station']);
  assert.equal(ofCheck(labels, results, 'column-missing', NOSIZE).length, 0);
  const found = ofCheck(labels, results, 'column-missing', { ...NOSIZE, thresholdSweep: true });
  assert.equal(found.length, 1);
  assert.equal(found[0].subject, 'score');
  assert.match(found[0].message, /--threshold-sweep has no scores to sweep/);
});

test('column names are found with case and separators ignored', () => {
  const labels = L([['G1', 'good', '', '', ''], ['D1', 'defect', 'scratch', '', '']], ['Part ID', 'LABEL', 'Defect-Type', 'Labeler', 'Note']);
  const results = R([['G1', '1', 'pass', '', '', ''], ['D1', '1', 'fail', 'scratch', '', '']], ['PART_ID', 'Run', 'Verdict', 'defect type', 'Score', 'Station']);
  assert.deepEqual(ids(labels, results), []);
});

test('column-unknown: a misspelt column gets the nearest name; a far one gets none; both sides of the file', () => {
  const { labels, results } = base();
  const found = ofCheck(labels.replace('defect_type', 'defect_typ'), results.replace('station', 'stations'), 'column-unknown', NOSIZE);
  assert.equal(found.length, 2);
  assert.match(found[0].message, /The column "defect_typ" of the labels file is not a column the tool reads; did you mean "defect_type"\?/);
  assert.match(found[1].message, /"stations" of the results file .* did you mean "station"\?/);
  const far = ofCheck(labels.replace('note', 'inspector'), results, 'column-unknown', NOSIZE);
  assert.match(far[0].message, /reads\. Nothing under it is checked\./);
  assert.doesNotMatch(far[0].message, /did you mean/);
  assert.deepEqual([found[0].line, found[0].column], [1, 15]);
});

test('column-duplicate: the second column of the same name is reported and not read', () => {
  const { labels, results } = base();
  const dup = labels.replace('label,', 'label,Label,').replace(/\n(G1,good,)/, '\n$1,').replace(/\n(D1,defect,)/, '\n$1,');
  const found = ofCheck(dup, results, 'column-duplicate', NOSIZE);
  assert.equal(found.length, 1);
  assert.match(found[0].message, /The column "Label" of the labels file has the same name as column 2/);
  assert.equal(ofCheck(labels, results, 'column-duplicate', NOSIZE).length, 0);
});

test('row-malformed: a row with one cell too few or too many is reported with its line; a row of the right width is not', () => {
  const labels = L([['G1', 'good', '', 'a', ''], ['D1', 'defect', 'scratch', 'a', '']]);
  const short = `${labels}G2,good\n`;
  const long = `${labels}G2,good,,a,,extra\n`;
  for (const text of [short, long]) {
    const found = ofCheck(text, base().results, 'row-malformed', NOSIZE);
    assert.equal(found.length, 1);
    assert.equal(found[0].line, lineOf(text, 'G2'));
  }
  assert.match(ofCheck(short, base().results, 'row-malformed', NOSIZE)[0].message, /has 2 cells but the header has 5/);
  assert.equal(ofCheck(`${labels}G2,good,,a,\n`, base().results, 'row-malformed', NOSIZE).length, 0);
  const rows = ofCheck(labels, `${base().results}G1,2,pass\n`, 'row-malformed', NOSIZE);
  assert.equal(rows[0].file, 'results');
});

test('row-malformed: a quoted cell with a comma and a line end is one cell', () => {
  const labels = L([['G1', 'good', '', 'a', 'oil film, wiped\nbefore the run'], ['D1', 'defect', 'scratch', 'a', '']]);
  assert.deepEqual(ids(labels, base().results), []);
});

test('cell-missing: an empty part_id, label, run or verdict; a cell of white space counts as empty; the run column is not needed when absent', () => {
  const { labels, results } = base();
  const noPart = ofCheck(`${labels},good,,a,\n`, results, 'cell-missing', NOSIZE);
  assert.equal(noPart.length, 1);
  assert.equal(noPart[0].subject, 'part_id');
  assert.equal(ofCheck(`${labels}G2,  ,,a,\n`, results, 'cell-missing', NOSIZE)[0].subject, 'label');
  assert.equal(ofCheck(labels, `${results}G1,2,,,,\n`, 'cell-missing', NOSIZE)[0].subject, 'verdict');
  assert.equal(ofCheck(labels, `${results}G1,,pass,,,\n`, 'cell-missing', NOSIZE)[0].subject, 'run');
  assert.equal(ofCheck(labels, `${results},1,pass,,,\n`, 'cell-missing', NOSIZE)[0].subject, 'part_id');
  assert.equal(ofCheck(labels, `${results}G1,2,pass,,,\n`, 'cell-missing', NOSIZE).length, 0);
  const noRun = R([['G1', 'pass'], ['D1', 'fail']], ['part_id', 'verdict']);
  assert.equal(ofCheck(labels, noRun, 'cell-missing', NOSIZE).length, 0);
});

test('cell-missing: the row is left out and counted', () => {
  const { labels, results } = base();
  const r = runOf(labels, `${results}G1,2,,,,\n`, NOSIZE);
  assert.equal(r.results.leftOut, 1);
  assert.equal(r.results.records, 3);
  assert.equal(r.analysis.measured.runs, 2);
});

test('label-invalid: anything but good or defect, in any case, leaves the row out', () => {
  const { labels, results } = base();
  for (const bad of ['maybe', 'ok', 'nok', 'bad', 'gooood', '1', 'defects']) {
    const found = ofCheck(`${labels}G2,${bad},,a,\n`, results, 'label-invalid', NOSIZE);
    assert.equal(found.length, 1, bad);
    assert.match(found[0].message, new RegExp(`is "${bad}", which is not good or defect`));
  }
  for (const ok of ['Good', 'GOOD', 'defect', 'Defect', ' good ']) assert.equal(ofCheck(`${labels}G2,${ok},,a,\n`, results, 'label-invalid', NOSIZE).length, 0, ok);
});

test('verdict-invalid: anything but pass or fail, in any case, leaves the row out', () => {
  const { labels, results } = base();
  for (const bad of ['review', 'ok', 'reject', 'maybe', '0', 'passed']) {
    const found = ofCheck(labels, `${results}G1,2,${bad},,,\n`, 'verdict-invalid', NOSIZE);
    assert.equal(found.length, 1, bad);
  }
  for (const ok of ['PASS', 'Fail', ' pass ']) assert.equal(ofCheck(labels, `${results}G1,2,${ok},,,\n`, 'verdict-invalid', NOSIZE).length, 0, ok);
});

test('run-invalid: a run must be a whole number from 1 to 9,999,999', () => {
  const { labels, results } = base();
  for (const bad of ['0', '-1', '1.5', '1e1', 'two', '10000000', '01', '+1', '"1,000"']) assert.equal(ofCheck(labels, `${results}G1,${bad},pass,,,\n`, 'run-invalid', NOSIZE).length, 1, bad);
  for (const ok of ['1', '2', '9999999']) assert.equal(ofCheck(labels, `${results}G1,${ok},pass,,,\n`, 'run-invalid', NOSIZE).length, 0, ok);
});

test('score-invalid: a score is a plain decimal; the row is kept without its score', () => {
  const { labels, results } = base();
  for (const bad of ['1e-1', '+0.5', '"1,5"', '.5', '5.', '0x1', 'high', '1.2.3', '--1', '9'.repeat(41)]) assert.equal(ofCheck(labels, `${results}G1,2,pass,,${bad},\n`, 'score-invalid', NOSIZE).length, 1, bad);
  for (const ok of ['0', '0.82', '-1.5', '10', '0.000000000000000001', '9'.repeat(40)]) assert.equal(ofCheck(labels, `${results}G1,2,pass,,${ok},\n`, 'score-invalid', NOSIZE).length, 0, ok);
  const r = runOf(labels, `${results}G1,2,pass,,1e-1,\n`, NOSIZE);
  assert.equal(r.analysis.measured.runs, 3, 'the row is kept');
});

test('defect-type-on-good: a type on a good part is an error and the type is ignored; a good part without one and a defect with one are not', () => {
  const { results } = base();
  const labels = L([['G1', 'good', 'scratch', 'a', ''], ['D1', 'defect', 'scratch', 'a', '']]);
  const found = ofCheck(labels, results, 'defect-type-on-good', NOSIZE);
  assert.equal(found.length, 1);
  assert.equal(found[0].line, lineOf(labels, 'G1'));
  assert.equal(found[0].column, 9);
  assert.deepEqual(runOf(labels, results, NOSIZE).analysis.matrix.rows.map((r) => r.type), ['scratch', '(good part)']);
  assert.equal(runOf(labels, results, NOSIZE).analysis.matrix.rows[1].counts.slice(0, 1)[0], 0);
  assert.equal(ofCheck(base().labels, results, 'defect-type-on-good', NOSIZE).length, 0);
});

test('defect-type-missing: a warning for a defect with no type when the column is there; none when it has one or the column is absent', () => {
  const { results } = base();
  const labels = L([['G1', 'good', '', 'a', ''], ['D1', 'defect', '', 'a', '']]);
  const found = ofCheck(labels, results, 'defect-type-missing', NOSIZE);
  assert.equal(found.length, 1);
  assert.equal(found[0].line, lineOf(labels, 'D1'));
  assert.equal(ofCheck(base().labels, results, 'defect-type-missing', NOSIZE).length, 0);
  const noColumn = L([['G1', 'good'], ['D1', 'defect']], ['part_id', 'label']);
  assert.equal(ofCheck(noColumn, results, 'defect-type-missing', NOSIZE).length, 0);
  assert.equal(ofCheck(noColumn, results, 'column-missing', NOSIZE).length, 1);
});

test('label-duplicate: the same labeler twice for a part, or two rows with no labeler; the later row is left out', () => {
  const { results } = base();
  const twice = L([['G1', 'good', '', 'ann', ''], ['G1', 'good', '', 'ann', ''], ['D1', 'defect', 'scratch', 'ann', '']]);
  const found = ofCheck(twice, results, 'label-duplicate', NOSIZE);
  assert.equal(found.length, 1);
  assert.equal(found[0].line, lineOf(twice, 'G1', 2));
  assert.match(found[0].message, /the labeler "ann"; the row on line 2 already labels it/);
  const unnamed = L([['G1', 'good', '', '', ''], ['G1', 'good', '', '', ''], ['D1', 'defect', 'scratch', '', '']]);
  assert.match(ofCheck(unnamed, results, 'label-duplicate', NOSIZE)[0].message, /a labeler with no name/);
  const spelt = L([['G1', 'good', '', 'Ann', ''], ['g1', 'good', '', ' ann ', ''], ['D1', 'defect', 'scratch', 'ann', '']]);
  assert.equal(ofCheck(spelt, results, 'label-duplicate', NOSIZE).length, 1, 'case and spaces do not make another labeler or another part');
  const two = L([['G1', 'good', '', 'ann', ''], ['G1', 'good', '', 'bob', ''], ['D1', 'defect', 'scratch', 'ann', '']]);
  assert.equal(ofCheck(two, results, 'label-duplicate', NOSIZE).length, 0, 'two labelers are two votes');
  const named = L([['G1', 'good', '', 'ann', ''], ['G1', 'good', '', '', ''], ['D1', 'defect', 'scratch', 'ann', '']]);
  assert.equal(ofCheck(named, results, 'label-duplicate', NOSIZE).length, 0, 'a labeler with no name is one more labeler');
});

test('label-conflict: a warning when labelers disagree on the label or on the type; none when they agree', () => {
  const { results } = base();
  const mk = (rows) => L([...rows, ['G1', 'good', '', 'ann', '']].filter((r, i, all) => i === all.findIndex((x) => x[0] === r[0] && x[3] === r[3])));
  const agree = mk([['D1', 'defect', 'scratch', 'ann', ''], ['D1', 'defect', 'scratch', 'bob', '']]);
  assert.equal(ofCheck(agree, results, 'label-conflict', NOSIZE).length, 0);
  const blankType = mk([['D1', 'defect', 'scratch', 'ann', ''], ['D1', 'defect', '', 'bob', '']]);
  assert.equal(ofCheck(blankType, results, 'label-conflict', NOSIZE).length, 0, 'a blank type is not a vote');
  const types = mk([['D1', 'defect', 'scratch', 'ann', ''], ['D1', 'defect', 'dent', 'bob', '']]);
  const found = ofCheck(types, results, 'label-conflict', NOSIZE);
  assert.equal(found.length, 1);
  assert.match(found[0].message, /the types tie, so it has no type/);
  const spelling = mk([['D1', 'defect', 'Scratch', 'ann', ''], ['D1', 'defect', ' scratch ', 'bob', '']]);
  assert.equal(ofCheck(spelling, results, 'label-conflict', NOSIZE).length, 0, 'the same type in another case is the same type');
});

test('label-conflict: the majority decides the label and the type, and a tie on good or defect leaves the part out of every rate', () => {
  const results = R([['G1', '1', 'pass', '', '', ''], ['D1', '1', 'fail', 'dent', '', ''], ['D2', '1', 'fail', 'dent', '', ''], ['D3', '1', 'fail', 'dent', '', '']]);
  const labels = L([
    ['G1', 'good', '', 'ann', ''],
    ['D1', 'defect', 'dent', 'ann', ''], ['D1', 'good', '', 'bob', ''], ['D1', 'defect', 'dent', 'cat', ''],
    ['D2', 'defect', 'dent', 'ann', ''], ['D2', 'defect', 'scratch', 'bob', ''], ['D2', 'defect', 'scratch', 'cat', ''],
    ['D3', 'defect', 'dent', 'ann', ''], ['D3', 'good', '', 'bob', '']
  ]);
  const r = runOf(labels, results, NOSIZE);
  const found = r.findings.filter((f) => f.id === 'label-conflict');
  assert.equal(found.length, 3);
  assert.match(found[0].message, /The labelers of the part "D1" disagree: ann says defect \(dent\) on line 3, bob says good on line 4 and cat says defect \(dent\) on line 5\. The majority label is defect, with the type dent\./);
  assert.match(found[1].message, /The majority label is defect, with the type scratch\./);
  assert.match(found[2].message, /The votes tie, so the part is left out of every rate\./);
  assert.deepEqual([r.analysis.measured.good, r.analysis.measured.defect, r.analysis.labelled.undecided], [1, 2, 1]);
  assert.deepEqual(r.analysis.types.map((t) => [t.type, t.parts]), [['dent', 1], ['scratch', 1]]);
  assert.ok(r.notes.some((n) => n === '1 part was left out of every rate because the labelers tied on good or defect'));
  assert.equal(r.findings.filter((f) => f.id === 'label-without-result').length, 0, 'a part left out by a tie is not reported as without a result');
});

test('run-sequence: a gap, a run number used twice, a first run above 1; runs in any order from 1 to n are fine', () => {
  const { labels } = base();
  const mk = (runs) => R([['G1', '1', 'pass', '', '', ''], ...runs.map((r) => ['D1', String(r), 'fail', 'scratch', '', ''])]);
  assert.equal(ofCheck(labels, mk([1]), 'run-sequence', NOSIZE).length, 0);
  assert.equal(ofCheck(labels, mk([1, 2, 3]), 'run-sequence', NOSIZE).length, 0);
  assert.equal(ofCheck(labels, mk([3, 1, 2]), 'run-sequence', NOSIZE).length, 0, 'the order of the rows does not matter');
  const gap = ofCheck(labels, mk([1, 3]), 'run-sequence', NOSIZE);
  assert.equal(gap.length, 1);
  assert.match(gap[0].message, /the runs of the part are 1 and 3, and run 2 is missing/);
  const start = ofCheck(labels, mk([2]), 'run-sequence', NOSIZE);
  assert.match(start[0].message, /run 1 is missing/);
  const dup = mk([1, 2, 2]);
  const twice = ofCheck(labels, dup, 'run-sequence', NOSIZE);
  assert.equal(twice.length, 1);
  assert.equal(twice[0].line, lineOf(dup, 'D1', 3));
  assert.match(twice[0].message, /run 2 is on line 4 and again on line 5, and the later row was left out/);
  assert.equal(runOf(labels, dup, NOSIZE).analysis.measured.runs, 3, 'G1 once and D1 twice');
  assert.ok(runOf(labels, dup, NOSIZE).notes.includes('1 result row was left out because a run number was used twice for a part'));
});

test('run-sequence: every run is a row of its own across a part, and a part with a gap is still counted with its runs', () => {
  const { labels } = base();
  const results = R([['G1', '1', 'pass', '', '', ''], ['D1', '1', 'fail', 'scratch', '', ''], ['D1', '3', 'pass', '', '', '']]);
  const r = runOf(labels, results, NOSIZE);
  assert.equal(r.findings.filter((f) => f.id === 'run-sequence').length, 1);
  assert.equal(r.analysis.measured.runs, 3);
  assert.equal(r.analysis.repeatability.parts, 1);
});

test('result-without-label and label-without-result: parts found by name without regard to case and white space; the others are reported with their line', () => {
  const labels = L([['G1', 'good', '', 'a', ''], ['D1', 'defect', 'scratch', 'a', ''], ['D2', 'defect', 'dent', 'a', '']]);
  const results = R([['g1', '1', 'pass', '', '', ''], [' d1 ', '1', 'fail', 'scratch', '', ''], ['X9', '1', 'pass', '', '', ''], ['X9', '2', 'pass', '', '', '']]);
  const r = runOf(labels, results, NOSIZE);
  const without = r.findings.filter((f) => f.id === 'result-without-label');
  assert.equal(without.length, 1);
  assert.equal(without[0].line, lineOf(results, 'X9'));
  assert.match(without[0].message, /The part "X9" has 2 rows in the results file and no label/);
  const missing = r.findings.filter((f) => f.id === 'label-without-result');
  assert.equal(missing.length, 1);
  assert.equal(missing[0].line, lineOf(labels, 'D2'));
  assert.match(missing[0].message, /The part "D2" is labelled defect but has no usable row/);
  assert.equal(r.analysis.measured.parts, 2);
  assert.deepEqual(ofCheck(labels, results, 'label-without-result', NOSIZE).map((f) => f.file), ['labels']);
  assert.deepEqual(ofCheck(labels, results, 'result-without-label', NOSIZE).map((f) => f.file), ['results']);
});

test('label-without-result: a part whose only result rows were left out has no usable row', () => {
  const labels = base().labels;
  const results = R([['G1', '1', 'pass', '', '', ''], ['D1', '1', 'maybe', '', '', '']]);
  assert.deepEqual(ids(labels, results).sort(), ['escape-above-limit', 'label-without-result', 'verdict-invalid']);
});

test('a finding is kept at most 1,000 times for a check, and the rest are counted and noted', () => {
  const rows = Array.from({ length: FINDING_CAP + 5 }, (_, i) => [`X${i}`, '1', 'pass', '', '', '']);
  const r = runOf(base().labels, resultsOf([['G1', '1', 'pass', '', '', ''], ['D1', '1', 'fail', 'scratch', '', ''], ...rows]), NOSIZE);
  assert.equal(r.findings.filter((f) => f.id === 'result-without-label').length, FINDING_CAP);
  assert.equal(r.omitted.get('result-without-label'), 5);
});
