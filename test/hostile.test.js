import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FINDING_CAP, InputError, TABLE_LIMITS, WORK_LIMITS, checkText, readOptions } from '../src/index.js';
import { allowed, cli, labelsOf, resultsOf, withFiles } from './helpers.js';

// Each test builds input meant to make the tool slow or to exhaust the stack or the memory, and checks that it ends with an
// answer in good time. The time allowed is four times as long under coverage (NODE_V8_COVERAGE is set only when coverage is
// on).

function timed(fn) {
  const start = process.hrtime.bigint();
  const value = fn();
  return { value, ms: Number(process.hrtime.bigint() - start) / 1e6 };
}

// The findings that are not about a column the test left out or about a side of the sample the test has no parts for.
const real = (r) => r.findings.filter((f) => !['column-missing', 'escape-above-limit', 'false-reject-above-limit'].includes(f.id));

const run = (labels, results, options = {}) => checkText(labels, results, { options: readOptions({ minDefects: '0', minGood: '0', ...options }) });

// A hundred thousand parts, half good and half defect, each with ten runs.
function big(parts, runs, { escapeEvery = 0 } = {}) {
  const labels = ['part_id,label,defect_type,labeler,note'];
  const results = ['part_id,run,verdict,defect_type,score,station'];
  for (let i = 0; i < parts; i += 1) {
    const defect = i % 2 === 1;
    labels.push(`P${i},${defect ? 'defect' : 'good'},${defect ? `t${i % 5}` : ''},a,`);
    for (let r = 1; r <= runs; r += 1) {
      const wrong = escapeEvery > 0 && i % escapeEvery === 0 && r === 1;
      const fail = defect !== wrong;
      results.push(`P${i},${r},${fail ? 'fail' : 'pass'},${fail && defect ? `t${i % 5}` : ''},${fail ? '0.9' : '0.1'},cell-${i % 3}`);
    }
  }
  return { labels: `${labels.join('\n')}\n`, results: `${results.join('\n')}\n` };
}

test('a hundred thousand parts with ten runs each, a million result rows: all counted in good time, the rates exact', () => {
  const { labels, results } = big(100000, 10, { escapeEvery: 5 });
  assert.equal(results.split('\n').length - 2, 1000000);
  const { value, ms } = timed(() => run(labels, results, { thresholdSweep: true }));
  const a = value.analysis;
  assert.deepEqual([a.measured.good, a.measured.defect, a.measured.runs], [50000, 50000, 1000000]);
  // Every fifth part has its first run wrong: 20,000 parts, half of them good (false rejects) and half defect (escapes).
  assert.deepEqual(a.falseReject.perRun, { count: 10000, of: 500000, percent: '2.00' });
  assert.deepEqual(a.escape.perRun, { count: 10000, of: 500000, percent: '2.00' });
  assert.deepEqual(a.repeatability.parts, 100000);
  assert.equal(a.repeatability.disagreeing, 20000);
  assert.equal(a.repeatability.listed.length, WORK_LIMITS.maxListed);
  assert.equal(a.repeatability.notListed, 19000);
  assert.deepEqual(a.sweep.rows.map((r) => r.threshold), ['0.1', '0.9']);
  assert.equal(a.stations.length, 3);
  assert.deepEqual(value.findings.map((f) => f.id), ['repeatability-below-limit']);
  assert.ok(ms < allowed(90000), `took ${ms} ms`);
});

test('a million result rows for parts that have no label: every part is counted, the first 1,000 findings are listed', () => {
  const rows = ['part_id,run,verdict'];
  for (let i = 0; i < 1000000; i += 1) rows.push(`X${i},1,pass`);
  const { value, ms } = timed(() => run('part_id,label\nG1,good\n', `${rows.join('\n')}\n`));
  assert.equal(value.findings.filter((f) => f.id === 'result-without-label').length, FINDING_CAP);
  assert.equal(value.omitted.get('result-without-label'), 1000000 - FINDING_CAP);
  assert.equal(value.analysis.results.unlabelled, 1000000);
  assert.ok(ms < allowed(90000), `took ${ms} ms`);
});

test('more result rows than the limit is refused with the limit in the message, and not read in part', () => {
  const rows = ['part_id,verdict'];
  for (let i = 0; i < TABLE_LIMITS.maxRows + 5; i += 1) rows.push('a,pass');
  const { value, ms } = timed(() => run('part_id,label\na,good\n', `${rows.join('\n')}\n`));
  assert.deepEqual(value.findings.filter((f) => f.id === 'file-unreadable').map((f) => f.file), ['results']);
  assert.match(value.findings.find((f) => f.id === 'file-unreadable').message, /The results file holds more than 1,200,000 rows, which is more than the tool reads\. Nothing was worked out/);
  assert.equal(value.analysis, null);
  assert.ok(ms < allowed(90000), `took ${ms} ms`);
});

test('a hundred thousand labels for one part, and a hundred thousand parts with one run each, are counted', () => {
  const rows = Array.from({ length: 100000 }, () => 'G1,good,,a,').join('\n');
  const dup = timed(() => run(`part_id,label,defect_type,labeler,note\n${rows}\n`, 'part_id,verdict\nG1,pass\n'));
  assert.equal(dup.value.findings.filter((f) => f.id === 'label-duplicate').length, FINDING_CAP);
  assert.equal(dup.value.omitted.get('label-duplicate'), 100000 - 1 - FINDING_CAP);
  assert.equal(dup.value.analysis.labelled.duplicateRows, 99999);
  assert.ok(dup.ms < allowed(30000), `took ${dup.ms} ms`);
  const labelers = Array.from({ length: 100000 }, (_, i) => `G1,${i % 2 ? 'good' : 'defect'},,l${i},`).join('\n');
  const many = timed(() => run(`part_id,label,defect_type,labeler,note\n${labelers}\n`, 'part_id,verdict\nG1,pass\n'));
  assert.equal(many.value.findings.filter((f) => f.id === 'label-conflict').length, 1);
  assert.equal(many.value.analysis.labelled.undecided, 1, 'half and half is a tie');
  assert.ok(many.ms < allowed(30000), `took ${many.ms} ms`);
});

test('one part with a million runs: the sequence, the majority and the repeatability end in good time', () => {
  const rows = ['part_id,run,verdict'];
  for (let i = 1; i <= 1000000; i += 1) rows.push(`G1,${i},${i % 3 === 0 ? 'fail' : 'pass'}`);
  const { value, ms } = timed(() => run('part_id,label\nG1,good\n', `${rows.join('\n')}\n`));
  assert.deepEqual(real(value).map((f) => f.id), ['repeatability-below-limit']);
  assert.deepEqual(value.analysis.falseReject.perRun, { count: 333333, of: 1000000, percent: '33.33' });
  assert.deepEqual(value.analysis.falseReject.majority, { count: 0, of: 1, percent: '0.00' });
  assert.equal(value.analysis.repeatability.disagreeing, 1);
  assert.equal(value.analysis.repeatability.listed[0].runs.length, 1000000);
  assert.ok(ms < allowed(60000), `took ${ms} ms`);
});

test('run numbers shuffled and repeated a hundred thousand times for one part: the sequence check ends in good time', () => {
  const rows = ['part_id,run,verdict'];
  for (let i = 0; i < 100000; i += 1) rows.push(`G1,${1 + ((i * 7919) % 50000)},pass`);
  const { value, ms } = timed(() => run('part_id,label\nG1,good\n', `${rows.join('\n')}\n`));
  assert.equal(value.findings.filter((f) => f.id === 'run-sequence').length, 1);
  assert.equal(value.analysis.results.rowsLeftOut, 50000);
  assert.ok(ms < allowed(30000), `took ${ms} ms`);
});

test('a score of five thousand digits, a run of five thousand digits, a limit of five thousand digits: refused, in good time', () => {
  const digits = '9'.repeat(5000);
  const labels = 'part_id,label\nG1,good\n';
  const a = timed(() => run(labels, `part_id,run,verdict,score\nG1,1,pass,${digits}\nG1,2,pass,0.${digits}\nG1,3,pass,-${digits}\nG1,${digits},pass,1\n`));
  assert.deepEqual(real(a.value).map((f) => f.id), ['score-invalid', 'score-invalid', 'score-invalid', 'run-invalid']);
  assert.ok(a.ms < allowed(3000), `took ${a.ms} ms`);
  assert.throws(() => readOptions({ maxEscape: digits }), /is not a plain number of percent/);
  assert.throws(() => readOptions({ minDefects: digits }), /is not a whole number/);
});

test('scores of forty digits on each side of the point are read exactly, and sweep without loss', () => {
  const lo = `1${'0'.repeat(39)}.${'0'.repeat(39)}1`;
  const hi = `1${'0'.repeat(39)}.${'0'.repeat(38)}2`;
  const { value } = timed(() => run('part_id,label\nG1,good\nD1,defect\n', `part_id,verdict,score\nG1,pass,${lo}\nD1,fail,${hi}\n`, { thresholdSweep: true }));
  assert.deepEqual(real(value), []);
  assert.deepEqual(value.analysis.sweep.rows.map((r) => r.threshold), [lo, hi]);
  assert.equal(value.analysis.sweep.rows[1].within, true);
});

test('a hundred thousand distinct scores sweep in good time; a hundred thousand and one are refused with an input error', () => {
  const labels = 'part_id,label\nG1,good\nD1,defect\n';
  const rows = ['part_id,run,verdict,score'];
  for (let i = 1; i <= 100000; i += 1) rows.push(`${i % 2 ? 'G1' : 'D1'},${Math.ceil(i / 2)},${i % 2 ? 'pass' : 'fail'},${i}.${i % 7}`);
  const ok = timed(() => run(labels, `${rows.join('\n')}\n`, { thresholdSweep: true }));
  assert.equal(ok.value.analysis.sweep.rows.length, 100000);
  assert.ok(ok.ms < allowed(30000), `took ${ok.ms} ms`);
  rows.push('G1,50001,pass,100001.1');
  const over = timed(() => assert.throws(() => run(labels, `${rows.join('\n')}\n`, { thresholdSweep: true }), (e) => e instanceof InputError && /100,001 different values/.test(e.message)));
  assert.ok(over.ms < allowed(30000), `took ${over.ms} ms`);
});

test('a cell of the longest length is read, one past it is refused, and so are a row of a million commas, a million quotes and a header of a million columns', () => {
  const long = 'a'.repeat(TABLE_LIMITS.maxCellLength - 10);
  const fine = timed(() => run(`part_id,label,defect_type,labeler,note\n${long},good,,a,${long}\n`, `part_id,verdict\n${long},pass\n`));
  assert.deepEqual(real(fine.value), []);
  assert.ok(fine.ms < allowed(5000), `took ${fine.ms} ms`);
  const over = timed(() => run(`part_id,label\n${'a'.repeat(TABLE_LIMITS.maxCellLength + 1)},good\n`, 'part_id,verdict\na,pass\n'));
  assert.deepEqual(real(over.value).map((f) => f.id), ['file-unreadable']);
  assert.match(over.value.findings[0].message, /A cell is longer than 20000 characters/);
  const commas = timed(() => run(`part_id,label\nq${','.repeat(1000000)}\n`, 'part_id,verdict\na,pass\n'));
  assert.deepEqual(real(commas.value).map((f) => f.id), ['file-unreadable']);
  assert.match(commas.value.findings[0].message, /A row has more than 40 cells/);
  assert.ok(commas.ms < allowed(5000), `took ${commas.ms} ms`);
  const quotes = timed(() => run('part_id,label\na,good\n', `part_id,verdict\n"${'"'.repeat(1000000)}\n`));
  assert.deepEqual(real(quotes.value).map((f) => f.id), ['file-unreadable']);
  assert.ok(quotes.ms < allowed(5000), `took ${quotes.ms} ms`);
  const header = timed(() => run(`${'v,'.repeat(1000000)}\n1\n`, 'part_id,verdict\na,pass\n'));
  assert.deepEqual(real(header.value).map((f) => f.id), ['file-unreadable']);
  assert.ok(header.ms < allowed(5000), `took ${header.ms} ms`);
  const doubled = timed(() => run('part_id,label\na,good\n', `part_id,verdict\n"${'""'.repeat(500000)}",pass\n`));
  assert.deepEqual(real(doubled.value).map((f) => f.id), ['file-unreadable']);
  assert.ok(doubled.ms < allowed(10000), `took ${doubled.ms} ms`);
});

test('a note of the longest length in quotes with four thousand line ends in it ends with an answer', () => {
  const note = `"${'line\n'.repeat(4000)}"`;
  const { value, ms } = timed(() => run(`part_id,label,note\ng1,good,${note}\n`, 'part_id,verdict\ng1,pass\n'));
  assert.deepEqual(real(value).map((f) => f.id), []);
  assert.ok(ms < allowed(5000), `took ${ms} ms`);
});

test('more than 200 different stations is an input error, and a file of a million different station names ends quickly', () => {
  const rows = Array.from({ length: 1000000 }, (_, i) => `G1,${i + 1},pass,s${i}`);
  const { ms } = timed(() => assert.throws(() => run('part_id,label\nG1,good\n', `part_id,run,verdict,station\n${rows.join('\n')}\n`), /names more than 200 different stations/));
  assert.ok(ms < allowed(30000), `took ${ms} ms`);
});

test('names that are properties of objects are only names: a part, a labeler, a defect type and a station called __proto__, constructor or toString', () => {
  const labels = labelsOf([['__proto__', 'defect', 'constructor', 'toString', ''], ['constructor', 'good', '', '__proto__', ''], ['toString', 'defect', '__proto__', 'hasOwnProperty', '']]);
  const results = resultsOf([['__proto__', '1', 'fail', 'constructor', '', '__proto__'], ['constructor', '1', 'pass', '', '', 'toString'], ['toString', '1', 'fail', 'toString', '', 'constructor']]);
  const r = run(labels, results);
  assert.deepEqual(r.findings, []);
  assert.deepEqual(r.analysis.matrix.columns, ['__proto__', 'constructor', 'toString', '(not named)', 'passed']);
  assert.deepEqual(r.analysis.stations.map((s) => s.station), ['__proto__', 'constructor', 'toString']);
  assert.equal(Object.prototype.x, undefined);
  assert.equal(r.analysis.measured.parts, 3);
});

test('a file of a million result rows is read from disk through the command line in good time, with an exit code', async () => {
  const { labels, results } = big(100000, 10, { escapeEvery: 5 });
  await withFiles({ 'labels.csv': labels, 'results.csv': results }, async (dir) => {
    const start = process.hrtime.bigint();
    const r = await cli(['labels.csv', 'results.csv', '--format', 'junit'], dir);
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    assert.equal(r.code, 1, r.err);
    assert.match(r.out, /name="escape rate at most 2 percent"/);
    assert.ok(ms < allowed(120000), `took ${ms} ms`);
  });
});
