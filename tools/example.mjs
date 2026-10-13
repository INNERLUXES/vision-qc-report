// Runs the README examples, checks that they report what the README shows, and writes the reports of the two made-up stations to
// examples/output. CI runs it and then fails if those files changed, so the example output in the repository is always the real
// output.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from '../src/index.js';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');

// Every path is relative to the root of the repository.
export const BAD = ['examples/bad/labels.csv', 'examples/bad/results.csv'];
export const GOOD = ['examples/good/labels.csv', 'examples/good/results.csv'];
export const SWEEP = ['--threshold-sweep'];
export const EXPLAIN = ['--explain', 'escape-above-limit'];

// Runs the tool on files of the repository; the paths shown in the report are relative to the root of the repository.
export async function run(argv, base = root) {
  let out = '';
  let err = '';
  const code = await main(argv, { out: (t) => { out += t; }, err: (t) => { err += t; } }, undefined, base);
  return { code, out, err };
}

// What the README says of the bad station: the counts, a finding of every check but one, the three limits and the result.
export const EXPECTED = [
  'parts: 22 labelled (10 good, 11 defect, 1 tied), 20 measured (10 good, 10 defect)',
  'runs: 58 runs of the measured parts; 67 rows in the results file, 5 left out',
  'findings: 27 (22 error, 5 warning)',
  'escape rate, per run                 8 of 28   28.57%  at most 2%',
  'false reject rate, per run           8 of 30   26.67%  at most 5%',
  'repeatability                        13 of 20  65.00%  at least 95%',
  'The column "inspector" of the labels file is not a column the tool reads. Nothing under it is checked.',
  'The column "Label" of the labels file has the same name as column 2 once case and separators are ignored; only the first is read.',
  'The results file has no "defect_type" column, so the confusion matrix cannot name what the station reported',
  'Labels file: A cell of the column "note" is shaped like a mnemonic. The tool never reads a seed or a key, and the value is not shown.',
  'The part "B-G05" is labelled good but has the defect type "scratch". The type is ignored; one of the two cells is wrong.',
  'The part "B-D09" is labelled defect and has no defect type',
  'The row on line 28 of the labels file has 3 cells but the header has 7; the row was left out.',
  'The row on line 33 of the results file has no value under "verdict", which every row needs; the row was left out.',
  'The label of the part "B-X02" is "maybe", which is not good or defect; the row was left out.',
  'The verdict of the part "B-G02" is "maybe", which is not pass or fail; the row was left out.',
  'The run of the part "B-G03" is "two", which is not a whole number from 1 to 9,999,999; the row was left out.',
  'The score of the part "B-G04" is "1e-1", which is not a plain decimal',
  'The part "B-D02" is labelled again by the labeler "inspector-a"; the row on line 13 already labels it. The later row was left out.',
  'The labelers of the part "B-D03" disagree: inspector-a says defect (dent) on line 14, inspector-b says good on line 25 and inspector-c says defect (dent) on line 26. The majority label is defect, with the type dent.',
  'The votes tie, so the part is left out of every rate.',
  'The run numbers of the part "B-D05" do not go from 1 to n: the runs of the part are 1 and 3, and run 2 is missing',
  'run 2 is on line 46 and again on line 67, and the later row was left out.',
  'The part "B-Z99" has 1 row in the results file and no label in the labels file, so it is in no rate.',
  'The part "B-D11" is labelled defect but has no usable row in the results file, so it is in no rate.',
  'The escape rate is 28.57 percent per run (8 of 28 runs of defect parts passed), 30.00 percent by majority verdict (3 of 10 defect parts); the limit is 2 percent and the rate is above it per run and by majority verdict.',
  'Repeatability is 65.00 percent (13 of 20 parts with more than one run gave the same verdict every time); the minimum is 95 percent. 7 parts had runs that disagreed.',
  'Only 10 defect parts (at least 30 asked for) and 10 good parts (at least 30 asked for) were measured.',
  'This report is arithmetic on the labels and the results in the two files. It never looks at an image.',
  'RESULT: FAIL - 22 findings at or above error (22 error, 5 warning)'
];
// What must not be reported: the check the bad station cannot hold, the seed, and a pass.
export const UNWANTED = ['ERROR    file-unreadable', 'lantern', 'RESULT: PASS'];

// What the README says of the good station: no finding.
export const GOOD_EXPECTED = [
  'parts: 80 labelled (40 good, 40 defect), 80 measured (40 good, 40 defect)',
  'findings: 0',
  'escape rate, per run                 1 of 120  0.83%   at most 2%',
  'false reject rate, per run           2 of 120  1.67%   at most 5%',
  'repeatability                        77 of 80  96.25%  at least 95%',
  'RESULT: PASS - no finding at or above error'
];

const problems = [];
function expect(name, result, code, expected, unwanted, stream = 'out') {
  const text = result[stream];
  const missing = expected.filter((e) => !text.includes(e));
  const wrong = unwanted.filter((e) => text.includes(e));
  if (result.code !== code || missing.length || wrong.length) {
    problems.push(`${name}: unexpected report (exit code ${result.code}, expected ${code}; missing: ${missing.join(' / ') || 'none'}; should not appear: ${wrong.join(' / ') || 'none'})${result.err ? `\n${result.err}` : ''}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const bad = await run(BAD);
  process.stdout.write(bad.out);
  expect('bad station', bad, 1, EXPECTED, UNWANTED);

  const good = await run(GOOD);
  expect('good station', good, 0, GOOD_EXPECTED, ['ERROR    ', 'WARNING  ', 'INFO     ', 'RESULT: FAIL', 'note: ']);
  // The good station also passes when warnings and notes fail the run.
  expect('good, fail on warning', await run([...GOOD, '--fail-on', 'warning']), 0, ['RESULT: PASS - no finding at or above warning'], []);
  expect('good, fail on info', await run([...GOOD, '--fail-on', 'info']), 0, ['RESULT: PASS - no finding at or above info'], []);
  // Tighter limits fail it, and the sweep lists the rates at each score.
  expect('good, no escape allowed', await run([...GOOD, '--max-escape', '0.8']), 1, ['escape-above-limit', 'the limit is 0.8 percent'], []);
  expect('good, sweep', await run([...GOOD, ...SWEEP]), 0, ['Threshold sweep (72 thresholds)', 'RESULT: PASS'], []);
  // The bad station with only the errors shown still counts the rest.
  expect('bad, errors only', await run([...BAD, '--min-severity', 'error']), 1, ['findings: 22 (22 error); 5 below error not shown'], ['WARNING  ', 'INFO     ']);
  // A file that is not there stops the run with no report, and so does a limit that is not a number.
  expect('missing file', await run(['examples/none/labels.csv', GOOD[1]]), 2, ['examples/none/labels.csv: does not exist'], [], 'err');
  expect('limit that is not a number', await run([...GOOD, '--max-escape', '120']), 2, ['--max-escape: 120 is not a plain number of percent from 0 to 100'], [], 'err');

  // The README shows the head of the report of the bad station, the acceptance limits, two of its findings, the end of the report,
  // and the head and the end of the report of the good one.
  const readme = (await readFile(resolve(root, 'README.md'), 'utf8')).split('\r\n').join('\n');
  const lines = bad.out.split('\n');
  const head = lines.slice(0, lines.findIndex((l) => l.startsWith('A rate is a count over a count'))).join('\n');
  if (!readme.includes(head)) problems.push('README: the head of the sample output of the bad station differs from a real run');
  const from = lines.findIndex((l) => l === 'Acceptance limits');
  const accept = lines.slice(from, lines.findIndex((l) => l.startsWith('Checks ('))).join('\n').trimEnd();
  if (!readme.includes(accept)) problems.push('README: the acceptance limits of the sample output of the bad station differ from a real run');
  for (const [id, at] of [['run-sequence', 'examples/bad/results.csv:47'], ['label-conflict', 'examples/bad/labels.csv:14']]) {
    const i = lines.findIndex((l) => l.includes(id) && l.includes(at));
    const sample = lines.slice(i, i + 3).join('\n');
    if (i < 0 || !readme.includes(sample)) problems.push(`README: the sample finding of ${id} differs from a real run`);
  }
  const tail = lines.slice(-6).join('\n');
  if (!readme.includes(tail)) problems.push('README: the tail of the sample output of the bad station differs from a real run');
  const goodLines = good.out.split('\n');
  const goodHead = goodLines.slice(0, goodLines.findIndex((l) => l.startsWith('A rate is a count over a count'))).join('\n');
  if (!readme.includes(goodHead)) problems.push('README: the head of the sample output of the good station differs from a real run');
  const goodTail = goodLines.slice(-6).join('\n');
  if (!readme.includes(goodTail)) problems.push('README: the tail of the sample output of the good station differs from a real run');

  await mkdir(resolve(root, 'examples/output'), { recursive: true });
  const outputs = [
    ['bad.txt', BAD, 1],
    ['bad.md', [...BAD, '--format', 'markdown'], 1],
    ['bad.json', [...BAD, '--json'], 1],
    ['bad.sarif', [...BAD, '--format', 'sarif'], 1],
    ['bad.junit.xml', [...BAD, '--format', 'junit'], 1],
    ['good.txt', GOOD, 0],
    ['good.md', [...GOOD, '--format', 'markdown'], 0],
    ['good.json', [...GOOD, '--json'], 0],
    ['good.sarif', [...GOOD, '--format', 'sarif'], 0],
    ['good.junit.xml', [...GOOD, '--format', 'junit'], 0],
    ['good-sweep.txt', [...GOOD, ...SWEEP], 0],
    ['checks.txt', ['--list-checks'], 0],
    ['checks.md', ['--list-checks', '--format', 'markdown'], 0],
    ['checks.json', ['--list-checks', '--format', 'json'], 0],
    ['explain-escape-above-limit.txt', EXPLAIN, 0],
    ['explain-escape-above-limit.md', [...EXPLAIN, '--format', 'markdown'], 0]
  ];
  for (const [name, args, code] of outputs) {
    const r = await run(args);
    if (r.code !== code) problems.push(`${name}: exit code ${r.code}, expected ${code}`);
    await writeFile(resolve(root, 'examples/output', name), r.out);
  }

  if (problems.length) {
    for (const p of problems) console.error(`example: ${p}`);
    process.exit(1);
  }
}
