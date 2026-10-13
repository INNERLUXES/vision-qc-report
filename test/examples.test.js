import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RULES, secretShape } from '../src/index.js';
import { BAD, EXPECTED, EXPLAIN, GOOD, GOOD_EXPECTED, SWEEP, UNWANTED, run } from '../tools/example.mjs';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');
const saved = (name) => readFile(resolve(root, 'examples/output', name), 'utf8');
const text = (rel) => readFile(resolve(root, rel), 'utf8');

test('examples: the bad station fails with the report that is saved in examples/output', async () => {
  const r = await run(BAD);
  assert.equal(r.code, 1);
  assert.equal(r.err, '');
  assert.equal(r.out, await saved('bad.txt'));
  for (const e of EXPECTED) assert.ok(r.out.includes(e), e);
  for (const u of UNWANTED) assert.ok(!r.out.includes(u), u);
});

test('examples: the good station passes at error, warning and info level with the report that is saved', async () => {
  const r = await run(GOOD);
  assert.equal(r.code, 0);
  assert.equal(r.out, await saved('good.txt'));
  for (const e of GOOD_EXPECTED) assert.ok(r.out.includes(e), e);
  assert.equal((await run([...GOOD, '--fail-on', 'warning'])).code, 0);
  assert.equal((await run([...GOOD, '--fail-on', 'info'])).code, 0);
  assert.equal((await run([...GOOD, '--max-escape', '0.84', '--max-false-reject', '1.67', '--min-repeatability', '96.25'])).code, 0, 'the limits can be set to the exact rates');
  assert.doesNotMatch(r.out, /ERROR {4}|WARNING {2}|INFO {5}/);
  assert.doesNotMatch(r.out, /\nnote: /);
  assert.match(r.out, /\nfindings: 0\n/);
});

test('examples: the good station fails when a limit is set one step below its exact rate', async () => {
  for (const [option, value, id] of [['--max-escape', '0.83', 'escape-above-limit'], ['--max-false-reject', '1.66', 'false-reject-above-limit'], ['--min-repeatability', '96.26', 'repeatability-below-limit']]) {
    const r = await run([...GOOD, option, value]);
    assert.equal(r.code, 1, option);
    assert.match(r.out, new RegExp(`ERROR {4}${id} `), option);
  }
});

test('examples: every output saved in examples/output is the real output, in all five formats for both stations', async () => {
  const outputs = {
    'bad.txt': BAD,
    'bad.md': [...BAD, '--format', 'markdown'],
    'bad.json': [...BAD, '--json'],
    'bad.sarif': [...BAD, '--format', 'sarif'],
    'bad.junit.xml': [...BAD, '--format', 'junit'],
    'good.txt': GOOD,
    'good.md': [...GOOD, '--format', 'markdown'],
    'good.json': [...GOOD, '--json'],
    'good.sarif': [...GOOD, '--format', 'sarif'],
    'good.junit.xml': [...GOOD, '--format', 'junit'],
    'good-sweep.txt': [...GOOD, ...SWEEP],
    'checks.txt': ['--list-checks'],
    'checks.md': ['--list-checks', '--format', 'markdown'],
    'checks.json': ['--list-checks', '--format', 'json'],
    'explain-escape-above-limit.txt': EXPLAIN,
    'explain-escape-above-limit.md': [...EXPLAIN, '--format', 'markdown']
  };
  for (const [name, args] of Object.entries(outputs)) assert.equal((await run(args)).out, await saved(name), name);
});

test('examples: the counts of the good station are the ones counted by hand', async () => {
  const good = JSON.parse(await saved('good.json'));
  assert.deepEqual(good.summary.measured, { parts: 80, good: 40, defect: 40, runs: 240 });
  assert.deepEqual(good.rates.escape.perRun, { count: 1, of: 120, percent: '0.83' });
  assert.deepEqual(good.rates.escape.majority, { count: 0, of: 40, percent: '0.00' });
  assert.deepEqual(good.rates.falseReject.perRun, { count: 2, of: 120, percent: '1.67' });
  assert.deepEqual(good.rates.repeatability, { parts: 80, consistent: 77, disagreeing: 3, rate: { count: 77, of: 80, percent: '96.25' } });
  assert.deepEqual(good.disagreements.listed.map((d) => d.part), ['BRK-G012', 'BRK-G031', 'BRK-D017']);
  assert.deepEqual(good.types.map((t) => [t.type, t.parts, t.runs, t.detected.count]), [['burr', 9, 27, 27], ['dent', 10, 30, 29], ['missing-hole', 9, 27, 27], ['scratch', 12, 36, 36]]);
  assert.deepEqual(good.matrix.columns, ['burr', 'dent', 'missing-hole', 'scratch', '(not named)', 'passed']);
  assert.deepEqual(good.matrix.rows.map((r) => r.type), ['burr', 'dent', 'missing-hole', 'scratch', '(good part)']);
  assert.deepEqual(good.matrix.rows.at(-1).counts, [0, 1, 0, 1, 0, 118]);
  assert.deepEqual(good.stations.map((s) => s.station), ['cell-1', 'cell-2']);
  assert.deepEqual(good.findings, []);
  assert.deepEqual(good.notes, []);
  assert.deepEqual(good.acceptance.map((a) => a.status), ['pass', 'pass', 'pass']);
});

test('examples: the matrix rows of the good station add up to the runs of each type', async () => {
  const good = JSON.parse(await saved('good.json'));
  for (const row of good.matrix.rows) {
    const total = row.counts.reduce((n, c) => n + c, 0);
    const type = good.types.find((t) => t.type === row.type);
    assert.equal(total, type ? type.runs : 120, row.type);
  }
  const all = good.matrix.rows.flatMap((r) => r.counts).reduce((n, c) => n + c, 0);
  assert.equal(all, 240);
});

test('examples: the sweep of the good station is sorted, exact, and marks the thresholds within both limits', async () => {
  const out = (await saved('good-sweep.txt')).split('\n');
  const head = out.findIndex((l) => l.startsWith('Threshold sweep ('));
  assert.equal(out[head], 'Threshold sweep (72 thresholds)');
  const rows = out.slice(head + 3).filter((l) => /^ {2}\d/.test(l)).map((l) => l.trim().split(/ {2,}/));
  assert.equal(rows.length, 72);
  const thresholds = rows.map((r) => r[0]);
  assert.deepEqual(thresholds, [...thresholds].sort((a, b) => Number(a) - Number(b)));
  const within = rows.filter((r) => r[3] === 'yes').map((r) => r[0]);
  assert.deepEqual(within, ['0.33', '0.46', '0.52', '0.55', '0.58', '0.62']);
  assert.deepEqual(rows.find((r) => r[0] === '0.52').slice(1), ['1 of 120 (0.83%)', '2 of 120 (1.67%)', 'yes']);
  assert.deepEqual(rows.find((r) => r[0] === '0.33').slice(1), ['0 of 120 (0.00%)', '6 of 120 (5.00%)', 'yes'], 'exactly 5 percent is within the limit of 5');
  assert.deepEqual(rows.find((r) => r[0] === '0.63').slice(1, 3), ['4 of 120 (3.33%)', '0 of 120 (0.00%)']);
});

test('examples: every check but file-unreadable fires on the bad station, each on the line built for it', async () => {
  const report = JSON.parse((await run([...BAD, '--json'])).out);
  const files = { 'examples/bad/labels.csv': (await text('examples/bad/labels.csv')).split('\n'), 'examples/bad/results.csv': (await text('examples/bad/results.csv')).split('\n') };
  // The place of the n-th line of a file that holds needle.
  const at = (file, needle, n = 1) => {
    let seen = 0;
    for (let i = 0; i < files[file].length; i += 1) if (files[file][i].includes(needle) && (seen += 1) === n) return `${file}:${i + 1}`;
    throw new Error(`${needle} x${n}`);
  };
  const labels = (needle, n) => at('examples/bad/labels.csv', needle, n);
  const results = (needle, n) => at('examples/bad/results.csv', needle, n);
  const where = (id) => report.findings.filter((f) => f.id === id).map((f) => f.at);
  assert.deepEqual(RULES.map((r) => r.id).filter((id) => where(id).length === 0), ['file-unreadable']);
  assert.deepEqual(where('column-missing'), ['examples/bad/results.csv:1']);
  assert.deepEqual(where('column-unknown'), ['examples/bad/labels.csv:1', 'examples/bad/results.csv:1']);
  assert.deepEqual(where('column-duplicate'), ['examples/bad/labels.csv:1', 'examples/bad/results.csv:1']);
  assert.deepEqual(where('row-malformed'), [labels('B-X01'), results('B-G01,4,pass')].sort());
  assert.deepEqual(where('cell-missing'), [`examples/bad/labels.csv:${files['examples/bad/labels.csv'].indexOf(',good,,inspector-a,,,') + 1}`, results('B-G01,5,,')]);
  assert.deepEqual(where('label-invalid'), [labels('B-X02')]);
  assert.deepEqual(where('verdict-invalid'), [results('B-G02,4,maybe')]);
  assert.deepEqual(where('run-invalid'), [results('B-G03,two')]);
  assert.deepEqual(where('score-invalid'), [results('1e-1')]);
  assert.deepEqual(where('secret-in-file'), [labels('B-G02')]);
  assert.deepEqual(where('defect-type-on-good'), [labels('B-G05')]);
  assert.deepEqual(where('defect-type-missing'), [labels('B-D09')]);
  assert.deepEqual(where('label-duplicate'), [labels('B-D02', 2)]);
  assert.deepEqual(where('label-conflict'), [labels('B-D03'), labels('B-D12')]);
  assert.deepEqual(where('run-sequence'), [results('B-D05'), results('B-D04', 3)]);
  assert.deepEqual(where('result-without-label'), [results('B-Z99')]);
  assert.deepEqual(where('label-without-result'), [labels('B-D11')]);
  for (const id of ['escape-above-limit', 'false-reject-above-limit', 'repeatability-below-limit', 'sample-small']) assert.deepEqual(where(id), ['rates'], id);
});

test('examples: the bad station breaks every limit', async () => {
  const bad = JSON.parse(await saved('bad.json'));
  assert.deepEqual(bad.acceptance.map((a) => [a.check, a.status]), [['escape-above-limit', 'fail'], ['false-reject-above-limit', 'fail'], ['repeatability-below-limit', 'fail']]);
  assert.deepEqual(bad.rates.escape.perRun, { count: 8, of: 28, percent: '28.57' });
  assert.deepEqual(bad.rates.escape.majority, { count: 3, of: 10, percent: '30.00' });
  assert.deepEqual(bad.rates.falseReject.perRun, { count: 8, of: 30, percent: '26.67' });
  assert.deepEqual(bad.rates.repeatability.rate, { count: 13, of: 20, percent: '65.00' });
  assert.deepEqual(bad.summary.measured, { parts: 20, good: 10, defect: 10, runs: 58 });
  assert.equal(bad.totals.byLevel.error, 22);
  assert.equal(bad.totals.byLevel.warning, 5);
  assert.equal(bad.result.pass, false);
  assert.equal(JSON.parse(await saved('bad.json')).input.results.leftOut, 4);
});

test('examples: the files are plain ASCII with LF line ends, with no date, no number that reads like a year and no token of a code host', async () => {
  for (const file of ['examples/bad/labels.csv', 'examples/bad/results.csv', 'examples/good/labels.csv', 'examples/good/results.csv']) {
    const t = await text(file);
    assert.ok([...t].every((c) => c.charCodeAt(0) < 128), file);
    assert.ok(!t.includes('\r'), file);
    assert.doesNotMatch(t, /\b(?:19|20)\d{2}\b/, file);
    assert.doesNotMatch(t, /\b\d{4}-\d{2}-\d{2}\b/, file);
    assert.ok(t.endsWith('\n'), file);
    assert.ok(!t.includes(['gh', 'p_'].join('')) && !t.includes(['github', '_pat_'].join('')), file);
  }
  const good = await text('examples/good/labels.csv');
  assert.doesNotMatch(good, /amber|lantern|password|seed/);
});

test('examples: the made-up secret is a mnemonic the tool is built to find, and no real company or product is named', async () => {
  const labels = (await text('examples/bad/labels.csv')).split('\n');
  const noted = labels.find((l) => l.startsWith('B-G02'));
  const note = noted.split(',')[4];
  assert.equal(secretShape(note), 'a mnemonic');
  const everything = [await text('examples/bad/labels.csv'), await text('examples/bad/results.csv'), await text('examples/good/labels.csv'), await text('examples/good/results.csv')].join('\n');
  for (const m of everything.matchAll(/^(?:BRK|B)-[A-Z]\d+|^(?:G|D)\d+/gm)) assert.match(m[0], /^(?:BRK-[GD]\d{3}|B-[GDXZ]\d{2})$/, m[0]);
  assert.doesNotMatch(everything, /@|https?:/, 'no address');
});

test('examples: the good station has forty good and forty defect parts, three runs each, four types, and two labelers on some parts', async () => {
  const labels = (await text('examples/good/labels.csv')).trimEnd().split('\n').slice(1).map((l) => l.split(','));
  const results = (await text('examples/good/results.csv')).trimEnd().split('\n').slice(1).map((l) => l.split(','));
  const parts = new Map(labels.map((l) => [l[0], l[1]]));
  assert.equal(parts.size, 80);
  assert.equal([...parts.values()].filter((v) => v === 'good').length, 40);
  assert.equal([...parts.values()].filter((v) => v === 'defect').length, 40);
  assert.equal(results.length, 240);
  for (const id of parts.keys()) assert.equal(results.filter((r) => r[0] === id).length, 3, id);
  assert.deepEqual([...new Set(labels.map((l) => l[2]).filter(Boolean))].sort(), ['burr', 'dent', 'missing-hole', 'scratch']);
  assert.deepEqual([...new Set(labels.map((l) => l[3]))].sort(), ['inspector-a', 'inspector-b']);
  assert.equal(labels.length - parts.size, 7, 'seven parts are labelled twice');
});

test('examples: the JUnit reports are well formed and count what the JSON reports count', async () => {
  const xml = await saved('bad.junit.xml');
  assert.equal([...xml.matchAll(/<testcase /g)].length, 3);
  assert.equal([...xml.matchAll(/<failure /g)].length, 3);
  assert.equal((xml.match(/<testsuite /g) ?? []).length, (xml.match(/<\/testsuite>/g) ?? []).length);
  const stack = [];
  for (const [, closing, name, self] of xml.matchAll(/<(\/?)(testsuites|testsuite|testcase|failure|error|skipped)\b[^>]*?(\/?)>/g)) {
    if (self) continue;
    if (closing) assert.equal(stack.pop(), name);
    else stack.push(name);
  }
  assert.deepEqual(stack, []);
  const good = await saved('good.junit.xml');
  assert.equal([...good.matchAll(/<testcase /g)].length, 3);
  assert.doesNotMatch(good, /<failure|<error|<skipped/);
});

test('examples: the SARIF report of the bad station has a result with a place for every finding that is in a file', async () => {
  const sarif = JSON.parse(await saved('bad.sarif'));
  const json = JSON.parse(await saved('bad.json'));
  assert.equal(sarif.runs[0].results.length, json.findings.filter((f) => f.file !== null).length);
  assert.equal(sarif.runs[0].results.length, 23);
  assert.deepEqual(JSON.parse(await saved('good.sarif')).runs[0].results, []);
});

test('examples: the list of checks and the explanation saved in examples/output name every check', async () => {
  const checks = await saved('checks.txt');
  for (const r of RULES) assert.ok(checks.includes(r.id), r.id);
  assert.match(await saved('explain-escape-above-limit.txt'), /^escape-above-limit\n\nlevel: error\nkind: metric\n/);
});
