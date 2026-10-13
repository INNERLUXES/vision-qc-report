import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { USAGE, VERSION, RULES, parseArgs, explainJson, listChecksJson } from '../src/index.js';
import { ARGS, BAD, GOOD, bench, cli, labelsOf, resultsOf, run, withFiles } from './helpers.js';

const NOSIZE = ['--min-defects', '0', '--min-good', '0'];

test('--help prints the usage with every option and every check, and exits 0', async () => {
  const r = await cli(['--help'], process.cwd());
  assert.equal(r.code, 0);
  assert.equal(r.out, USAGE);
  for (const option of ['--format', '--json', '--max-escape', '--max-false-reject', '--min-repeatability', '--min-defects', '--min-good', '--threshold-sweep', '--score-direction', '--min-severity', '--fail-on', '--list-checks', '--explain', '--help', '--version']) assert.ok(USAGE.includes(option), option);
  for (const rule of RULES) assert.ok(USAGE.includes(rule.id), rule.id);
  assert.match(USAGE, /It never reads an image\./);
});

test('--version prints the version of package.json', async () => {
  const r = await cli(['--version'], process.cwd());
  assert.equal(r.out, `${VERSION}\n`);
  assert.equal(VERSION, '1.0.0');
  assert.equal((await cli(['-v'], process.cwd())).out, `${VERSION}\n`);
});

test('usage errors exit 2 with the message and the usage, and no report', async () => {
  const bad = [
    [[], /give the labels file and the results file, such as vision-qc-report labels\.csv results\.csv/],
    [['labels.csv'], /give the labels file and the results file/],
    [['a.csv', 'b.csv', 'c.csv'], /give two files: the labels file and the results file/],
    [[...ARGS, '--nope'], /unknown argument --nope/],
    [[...ARGS, '-x'], /unknown argument -x/],
    [['-', 'b.csv'], /reading from standard input is not supported/],
    [['a.csv', '-'], /reading from standard input is not supported/],
    [['https://example.com/a.csv', 'b.csv'], /give a local path; the tool never fetches a URL/],
    [['a.csv', 'ftp://example.com/b.csv'], /give a local path/],
    [[...ARGS, '--format', 'pdf'], /unknown format pdf \(text, markdown, json, sarif or junit\)/],
    [[...ARGS, '--json', '--format', 'markdown'], /--json and --format markdown ask for two formats; give one/],
    [[...ARGS, '--format'], /--format needs a value/],
    [[...ARGS, '--format', '--json'], /--format needs a value/],
    [[...ARGS, '--max-escape', '1', '--max-escape', '2'], /--max-escape was given twice/],
    [[...ARGS, '--fail-on', 'fatal'], /--fail-on: unknown level fatal \(info, warning, error\)/],
    [[...ARGS, '--min-severity', 'x'], /--min-severity: unknown level x/],
    [[...ARGS, '--max-escape', '101'], /--max-escape: 101 is not a plain number of percent from 0 to 100/],
    [[...ARGS, '--max-false-reject', '5%'], /--max-false-reject: 5% is not a plain number/],
    [[...ARGS, '--min-repeatability', '-1'], /--min-repeatability: -1 is not a plain number/],
    [[...ARGS, '--min-defects', '1.5'], /--min-defects: 1\.5 is not a whole number/],
    [[...ARGS, '--min-good', 'many'], /--min-good: many is not a whole number/],
    [[...ARGS, '--score-direction', 'up'], /--score-direction: up is not high or low/],
    [['--explain', 'nope'], /--explain: unknown check nope/],
    [['--list-checks', '--format', 'sarif'], /--list-checks has no SARIF form/],
    [['--explain', 'sample-small', '--format', 'junit'], /--explain has no JUNIT form/]
  ];
  for (const [args, message] of bad) {
    const r = await cli(args, process.cwd());
    assert.equal(r.code, 2, args.join(' '));
    assert.match(r.err, message, args.join(' '));
    assert.match(r.err, /Usage: vision-qc-report <labels file> <results file> \[options\]/);
    assert.equal(r.out, '');
  }
});

test('--explain suggests the nearest check for a misspelt id', async () => {
  const r = await cli(['--explain', 'escape-above-limt'], process.cwd());
  assert.match(r.err, /unknown check escape-above-limt\. Did you mean escape-above-limit\?/);
  const far = await cli(['--explain', 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzz'], process.cwd());
  assert.doesNotMatch(far.err, /Did you mean/);
});

test('parseArgs reads two paths and every option', () => {
  const o = parseArgs(['l.csv', 'r.csv', '--format', 'junit', '--max-escape', '0.5', '--max-false-reject', '3', '--min-repeatability', '99', '--min-defects', '10', '--min-good', '12', '--threshold-sweep', '--score-direction', 'low', '--min-severity', 'warning', '--fail-on', 'info']);
  assert.deepEqual(o.paths, ['l.csv', 'r.csv']);
  assert.deepEqual([o.format, o.maxEscape, o.maxFalseReject, o.minRepeatability, o.minDefects, o.minGood, o.thresholdSweep, o.scoreDirection, o.minSeverity, o.failOn], ['junit', '0.5', '3', '99', '10', '12', true, 'low', 'warning', 'info']);
  assert.equal(parseArgs(['--list-checks']).listChecks, true);
});

test('exit codes: 0 when no finding is at or above the fail-on level, 1 when one is, 2 for an input that cannot be read', async () => {
  assert.equal((await run(GOOD, ARGS)).code, 0);
  assert.equal((await run(BAD, ARGS)).code, 1);
  assert.equal((await run({}, ARGS)).code, 2);
  const warn = bench({ good: 3, defect: 3 });
  const files = { 'labels.csv': warn.labels, 'results.csv': warn.results };
  assert.equal((await run(files, ARGS)).code, 0, 'a warning (a small sample) does not fail the run by default');
  assert.equal((await run(files, [...ARGS, '--fail-on', 'warning'])).code, 1);
  assert.equal((await run(files, [...ARGS, '--fail-on', 'info'])).code, 1);
  assert.equal((await run(files, [...ARGS, ...NOSIZE, '--fail-on', 'info'])).code, 0);
});

test('a finding below --min-severity is not shown but still counts for the result', async () => {
  const b = bench({ good: 3, defect: 3, escapes: ['D1:1'] });
  const files = { 'labels.csv': b.labels, 'results.csv': b.results };
  const all = await run(files, ARGS);
  assert.match(all.out, /\nfindings: 2 \(1 error, 1 warning\)\n/);
  assert.match(all.out, /WARNING {2}sample-small/);
  const errors = await run(files, [...ARGS, '--min-severity', 'error']);
  assert.match(errors.out, /\nfindings: 1 \(1 error\); 1 below error not shown\n/);
  assert.doesNotMatch(errors.out, /WARNING {2}sample-small/);
  assert.match(errors.out, /sample-small +warning +metric +0\n/, 'the table of checks counts only what is shown');
  const quiet = await run({ 'labels.csv': GOOD['labels.csv'], 'results.csv': GOOD['results.csv'] }, [...ARGS, '--min-severity', 'error', '--fail-on', 'info']);
  assert.equal(quiet.code, 0);
});

test('the text report: the files, the counts, the rates with their limits, the checks, the findings, the notice and the result', async () => {
  const r = await run(BAD, ARGS);
  assert.match(r.out, /^vision-qc-report: labels\.csv \+ results\.csv\nlabels: labels\.csv \(CSV, 61 lines, [\d,]+ bytes\)\nresults: results\.csv \(CSV, 61 lines, [\d,]+ bytes\)\n/);
  assert.match(r.out, /\nparts: 60 labelled \(30 good, 30 defect\), 60 measured \(30 good, 30 defect\)\n/);
  assert.match(r.out, /\n {2}escape rate, per run +3 of 30 +10\.00% +at most 2%\n/);
  assert.match(r.out, /\n {2}false reject rate, majority verdict +0 of 30 +0\.00% +at most 5%\n/);
  assert.match(r.out, /\n {2}repeatability +0 of 0 +n\/a +at least 95%\n/);
  assert.match(r.out, /\nAcceptance limits\n/);
  assert.match(r.out, /\n {2}escape rate at most 2 percent +fail +10\.00 percent per run/);
  assert.match(r.out, /\nChecks \(22\)\n/);
  assert.match(r.out, /\n {2}ERROR {4}escape-above-limit +rates\n {11}The escape rate is 10\.00 percent/);
  assert.match(r.out, /\nThis report is arithmetic on the labels and the results in the two files\. It never looks at an image\./);
  assert.match(r.out, /\nRESULT: FAIL - 1 finding at or above error \(1 error\)\n$/);
  assert.ok(r.out.endsWith('\n'));
});

test('the text report lists the parts where the runs disagreed with their runs and the line', async () => {
  const b = bench({ good: 3, defect: 3, runs: 3, escapes: ['D2:2'] });
  const r = await run({ 'labels.csv': b.labels, 'results.csv': b.results }, [...ARGS, ...NOSIZE]);
  assert.match(r.out, /\nParts where the runs disagreed \(1 of 6 parts with more than one run\)\n\n {2}D2 \(defect, scratch\): run 1 fail, run 2 pass, run 3 fail {2}\[results\.csv:\d+\]\n/);
});

test('the text report shows the defect types, the matrix, the stations and the sweep when there is something to show, and leaves them out when there is not', async () => {
  const labels = labelsOf([['G1', 'good', '', '', ''], ['D1', 'defect', 'dent', '', '']]);
  const results = resultsOf([['G1', '1', 'pass', '', '0.1', 's1'], ['D1', '1', 'fail', 'dent', '0.9', 's1']]);
  const r = await run({ 'labels.csv': labels, 'results.csv': results }, [...ARGS, ...NOSIZE, '--threshold-sweep']);
  assert.match(r.out, /\nDefect types \(1\)\n/);
  assert.match(r.out, /\nConfusion matrix, in runs: the rows are what the labels say, the columns what the station reported\n\n {2}labelled \\ reported +dent +\(not named\) +passed\n/);
  assert.match(r.out, /\nStations \(1\)\n/);
  assert.match(r.out, /\nThreshold sweep \(2 thresholds\)\n/);
  assert.match(r.out, /\n {2}0\.9 +0 of 1 \(0\.00%\) +0 of 1 \(0\.00%\) +yes\n/);
  assert.match(r.out, /Threshold sweep: the score is read as a defect score, so a run fails when its score is at or above the threshold\./);
  const plain = await run({ 'labels.csv': GOOD['labels.csv'], 'results.csv': GOOD['results.csv'] }, ARGS);
  assert.doesNotMatch(plain.out, /\nStations|\nThreshold sweep/);
  const low = await run({ 'labels.csv': labels, 'results.csv': results }, [...ARGS, ...NOSIZE, '--threshold-sweep', '--score-direction', 'low']);
  assert.match(low.out, /at or below the threshold/);
});

test('the JSON report has the files, the counts, the rates, the types, the matrix, the limits, the checks, the findings and the result', async () => {
  const r = await run(BAD, [...ARGS, '--json']);
  const j = JSON.parse(r.out);
  assert.equal(j.tool, 'vision-qc-report');
  assert.equal(j.version, '1.0.0');
  assert.equal(j.input.labels.file, 'labels.csv');
  assert.equal(j.evaluated, true);
  assert.deepEqual(j.summary.measured, { parts: 60, good: 30, defect: 30, runs: 60 });
  assert.deepEqual(j.rates.escape.perRun, { count: 3, of: 30, percent: '10.00' });
  assert.deepEqual(j.rates.repeatability, { parts: 0, consistent: 0, disagreeing: 0, rate: { count: 0, of: 0, percent: null } });
  assert.deepEqual(j.acceptance.map((a) => a.status), ['fail', 'pass', 'skipped']);
  assert.equal(j.rules.length, 22);
  assert.equal(j.findings[0].id, 'escape-above-limit');
  assert.equal(j.findings[0].file, null);
  assert.equal(j.findings[0].at, 'rates');
  assert.equal(j.result.pass, false);
  assert.deepEqual(j.options, { minSeverity: 'info', failOn: 'error', maxEscape: '2', maxFalseReject: '5', minRepeatability: '95', minDefects: 30, minGood: 30, thresholdSweep: false, scoreDirection: 'high' });
  assert.match(j.notice, /never looks at an image/);
});

test('the JSON report of a run that could not be evaluated has no rates', async () => {
  const r = await run({ ...GOOD, 'labels.csv': '' }, [...ARGS, '--json']);
  const j = JSON.parse(r.out);
  assert.equal(j.evaluated, false);
  for (const k of ['summary', 'rates', 'types', 'matrix', 'disagreements', 'stations', 'sweep']) assert.equal(j[k], null, k);
  assert.deepEqual(j.acceptance.map((a) => a.status), ['not-evaluated', 'not-evaluated', 'not-evaluated']);
});

test('the markdown report has tables for the rates and the findings and escapes what markdown gives a meaning to', async () => {
  const labels = labelsOf([['G|1', 'good', '', '', ''], ['D[x](http://example.com)', 'defect', 'a*b', '', ''], ['<b>D2</b>', 'defect', 'c_d', '', '']]);
  const results = resultsOf([['G|1', '1', 'pass', '', '', ''], ['D[x](http://example.com)', '1', 'fail', 'a*b', '', ''], ['<b>D2</b>', '1', 'pass', '', '', ''], ['<b>D2</b>', '2', 'fail', 'c_d', '', '']]);
  const r = await run({ 'labels.csv': labels, 'results.csv': results }, [...ARGS, ...NOSIZE, '--format', 'markdown']);
  assert.match(r.out, /^# vision-qc-report: labels\.csv \+ results\.csv\n/);
  assert.match(r.out, /\n## Rates\n\n\| measure \| count \| rate \| limit \|\n\| --- \| --- \| --- \| --- \|\n/);
  assert.match(r.out, /\n## Acceptance limits\n/);
  assert.ok(!r.out.includes('<b>'), 'tags are escaped');
  assert.ok(!r.out.includes('D[x](http'), 'links are escaped');
  assert.match(r.out, /a\\\*b/);
  assert.match(r.out, /\n## Findings\n/);
  const unlabelled = await run({ 'labels.csv': labels, 'results.csv': `${results}<b>X</b>|[y](http://example.com),1,pass,,,\n` }, [...ARGS, ...NOSIZE, '--format', 'markdown']);
  assert.ok(unlabelled.out.includes('The part "\\<b\\>X\\</b\\>\\|\\[y\\]\\(http://example.com\\)" has 1 row'), 'the part id is escaped in the finding');
  assert.ok(!unlabelled.out.includes('<b>X'));
});

test('the SARIF report: version 2.1.0, every check as a rule, and a result with a place only for a finding that is in a file', async () => {
  const b = bench({ good: 3, defect: 3 });
  const labels = `${b.labels}G9,maybe,,,\n`;
  const r = await run({ 'labels.csv': labels, 'results.csv': `${b.results}X1,1,pass,,,\n` }, [...ARGS, '--format', 'sarif']);
  const s = JSON.parse(r.out);
  assert.equal(s.version, '2.1.0');
  assert.equal(s.$schema, 'https://json.schemastore.org/sarif-2.1.0.json');
  const run0 = s.runs[0];
  assert.equal(run0.tool.driver.name, 'vision-qc-report');
  assert.equal(run0.tool.driver.rules.length, 22);
  assert.deepEqual(run0.artifacts.map((a) => a.location.uri), ['labels.csv', 'results.csv']);
  assert.deepEqual(run0.results.map((x) => x.ruleId).sort(), ['label-invalid', 'result-without-label']);
  const invalid = run0.results.find((x) => x.ruleId === 'label-invalid');
  assert.equal(invalid.level, 'error');
  assert.deepEqual(invalid.locations[0].physicalLocation.artifactLocation, { uri: 'labels.csv', index: 0 });
  assert.deepEqual(invalid.locations[0].physicalLocation.region, { startLine: 8, startColumn: 4 });
  assert.equal(run0.results.find((x) => x.ruleId === 'result-without-label').locations[0].physicalLocation.artifactLocation.index, 1);
  const warning = run0.tool.driver.rules.find((x) => x.id === 'sample-small');
  assert.equal(warning.defaultConfiguration.level, 'warning');
  assert.ok(!run0.results.some((x) => x.ruleId === 'sample-small'), 'a finding about a rate has no place in a file');
});

test('the JUnit report: one test case for each acceptance limit, a failure with the message for a broken one, well formed XML', async () => {
  const r = await run(BAD, [...ARGS, '--format', 'junit']);
  assert.match(r.out, /^<\?xml version="1.0" encoding="UTF-8"\?>\n<testsuites name="vision-qc-report" tests="3" failures="1" errors="0" time="0">\n/);
  assert.equal([...r.out.matchAll(/<testcase /g)].length, 3);
  assert.equal([...r.out.matchAll(/<failure /g)].length, 1);
  assert.match(r.out, /<testcase classname="acceptance" name="escape rate at most 2 percent" time="0">\n {6}<failure type="escape-above-limit" message="10\.00 percent per run/);
  assert.match(r.out, /<testcase classname="acceptance" name="false reject rate at most 5 percent" time="0"\/>/);
  assert.match(r.out, /<skipped message="not measured: no part has more than one run, and --min-repeatability was not given"\/>/);
  assert.match(r.out, /<testsuite name="acceptance" tests="3" failures="1" errors="0" skipped="1" time="0">/);
  const stack = [];
  for (const [, closing, name, self] of r.out.matchAll(/<(\/?)(testsuites|testsuite|testcase|failure|error|skipped)\b[^>]*?(\/?)>/g)) {
    if (self) continue;
    if (closing) assert.equal(stack.pop(), name);
    else stack.push(name);
  }
  assert.deepEqual(stack, []);
  const good = await run(GOOD, [...ARGS, '--format', 'junit']);
  assert.doesNotMatch(good.out, /<failure|<error/);
});

test('the JUnit report of a run that could not be evaluated has an error for each limit', async () => {
  const r = await run({ ...GOOD, 'results.csv': '' }, [...ARGS, '--format', 'junit']);
  assert.equal([...r.out.matchAll(/<error type="not-evaluated"/g)].length, 3);
  assert.match(r.out, /errors="3"/);
});

test('the JUnit report holds no text of the input, so nothing from the files can break the XML', async () => {
  const labels = labelsOf([['G<&"\'1', 'good', '', '', ''], ['D\u0001\ud800', 'defect', 'x', '', '']]);
  const results = resultsOf([['G<&"\'1', '1', 'fail', '', '', ''], ['D\u0001\ud800', '1', 'pass', '', '', '']]);
  const r = await run({ 'labels.csv': labels, 'results.csv': results }, [...ARGS, ...NOSIZE, '--format', 'junit']);
  assert.ok(!r.out.includes('G<'));
  assert.ok(!r.out.includes('\ud800'));
  assert.equal([...r.out.matchAll(/<testcase /g)].length, 3);
});

test('text from the files is cleaned in every format: control characters, escapes and direction controls never reach the output', async () => {
  const evil = 'P\u001b[31m\u202eX\u2028Y\u0007';
  const labels = labelsOf([[evil, 'good', '', 'l\u001b]0;t\u0007', ''], ['D1', 'defect', 'ty\u001bpe', '', ''], [`${evil}2`, 'maybe', '', '', '']]);
  const results = resultsOf([[evil, '1', 'pass', '', '', 's\u001b1'], ['D1', '1', 'fail', 'ty\u001bpe', '', ''], ['Z\u202e', '1', 'pass', '', '', '']]);
  for (const format of ['text', 'markdown', 'json', 'sarif']) {
    const r = await run({ 'labels.csv': labels, 'results.csv': results }, [...ARGS, ...NOSIZE, '--format', format, '--min-severity', 'info']);
    assert.ok(!/[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u202a-\u202e\u2028\u2029\u2066-\u2069]/.test(r.out.replace(/\n/g, '')), format);
  }
});

test('--list-checks and --explain, in text, markdown and JSON', async () => {
  const text = await cli(['--list-checks'], process.cwd());
  assert.match(text.out, /^vision-qc-report checks\n/);
  for (const rule of RULES) assert.ok(text.out.includes(rule.id), rule.id);
  assert.match(text.out, /Every check is a best practice of this tool; no standard sets it\./);
  const md = await cli(['--list-checks', '--format', 'markdown'], process.cwd());
  assert.match(md.out, /\| Check \| Level \| Kind \| What it looks at \|/);
  const json = JSON.parse((await cli(['--list-checks', '--json'], process.cwd())).out);
  assert.equal(json.length, 22);
  assert.deepEqual(json.map((x) => x.id), RULES.map((x) => x.id));
  assert.equal(listChecksJson(), `${JSON.stringify(json, null, 2)}\n`);
  const ex = await cli(['--explain', 'sample-small'], process.cwd());
  assert.match(ex.out, /^sample-small\n\nlevel: warning\nkind: metric\n\nwhat it looks at: fewer than --min-defects/);
  assert.match(ex.out, /why it exists: .* is a best practice of this tool; no standard sets it;/);
  assert.match(ex.out, /what it cannot see:/);
  const exMd = await cli(['--explain', 'sample-small', '--format', 'markdown'], process.cwd());
  assert.match(exMd.out, /^# sample-small\n/);
  const exJson = JSON.parse((await cli(['--explain', 'sample-small', '--format', 'json'], process.cwd())).out);
  assert.equal(exJson.id, 'sample-small');
  assert.equal(explainJson(RULES[0]).includes('"file-unreadable"'), true);
});

test('the same files give the same report on every run, and the tool leaves the folder as it was', async () => {
  await withFiles(BAD, async (dir) => {
    const before = (await readdir(dir)).sort();
    const first = await cli(ARGS, dir);
    const second = await cli(ARGS, dir);
    assert.equal(first.out, second.out);
    assert.deepEqual((await readdir(dir)).sort(), before);
    for (const format of ['markdown', 'json', 'sarif', 'junit']) assert.equal((await cli([...ARGS, '--format', format], dir)).out, (await cli([...ARGS, '--format', format], dir)).out, format);
    assert.deepEqual((await readdir(dir)).sort(), before);
  });
});

test('--threshold-sweep and --score-direction through the command line, with the score column missing', async () => {
  const threeColumns = GOOD['results.csv'].split('\n').map((l) => l.split(',').slice(0, 3).join(',')).join('\n');
  const noScore = await run({ ...GOOD, 'results.csv': threeColumns }, [...ARGS, '--threshold-sweep']);
  assert.match(noScore.out, /WARNING {2}column-missing +results\.csv:1/);
  assert.match(noScore.out, /note: the threshold sweep has no rows because no run has a score/);
  assert.match(noScore.out, /\nThreshold sweep \(0 thresholds\)\n\n {2}none\n/);
  assert.equal(noScore.code, 0);
});

test('the report names the file paths relative to the folder, with forward slashes', async () => {
  const r = await run({ 'station one/labels.csv': GOOD['labels.csv'], 'station one/results.csv': BAD['results.csv'] }, ['station one/labels.csv', 'station one/results.csv', '--json']);
  const j = JSON.parse(r.out);
  assert.equal(j.input.labels.file, 'station one/labels.csv');
  assert.equal(j.input.results.file, 'station one/results.csv');
});
