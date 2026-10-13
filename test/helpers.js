// Shared test helpers: labels and results built inline as CSV text, checked in memory or written into a temporary folder that is
// removed after the test. Paths are built with resolve() from forward-slash names, so the same test runs on Linux, macOS and
// Windows. The line a test expects is found with lineOf(), which counts lines the way the reader does, so a test never holds a
// line number worked out by hand for one system only. No test reads the clock, the time zone or the locale. Every part, labeler
// and number in the tests is made up.

import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { checkText, main, readOptions } from '../src/index.js';

export async function withFiles(files, fn) {
  const dir = await mkdtemp(resolve(tmpdir(), 'vision-qc-report-'));
  try {
    for (const [rel, content] of Object.entries(files)) {
      await mkdir(dirname(resolve(dir, rel)), { recursive: true });
      await writeFile(resolve(dir, rel), content);
    }
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// The line (from 1) of the n-th place where needle starts in text.
export function lineOf(text, needle, n = 1) {
  let at = -1;
  for (let i = 0; i < n; i += 1) {
    at = text.indexOf(needle, at + 1);
    if (at < 0) throw new Error(`${needle} is not in the text ${n} times`);
  }
  return text.slice(0, at).split('\n').length;
}

const quote = (v) => (/[",\n\r\t]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

// A table as text: the header and the rows (arrays of cells), with LF line ends.
export const table = (columns, rows, delimiter = ',') => `${[columns.join(delimiter), ...rows.map((r) => r.map(quote).join(delimiter))].join('\n')}\n`;

export const LABEL_COLUMNS = ['part_id', 'label', 'defect_type', 'labeler', 'note'];
export const RESULT_COLUMNS = ['part_id', 'run', 'verdict', 'defect_type', 'score', 'station'];

export const labelsOf = (rows, columns = LABEL_COLUMNS) => table(columns, rows);
export const resultsOf = (rows, columns = RESULT_COLUMNS) => table(columns, rows);

// A station in the files: `good` good parts G1.. and `defect` defect parts D1.., each with `runs` runs. A pass is a number
// "D3:2" in escapes (the run 2 of the defect part 3 passes) or "G4:1" in falseRejects (the run 1 of the good part 4 fails); every
// other run of a defect part fails and of a good part passes.
export function bench({ good = 30, defect = 30, runs = 1, escapes = [], falseRejects = [], type = 'scratch' } = {}) {
  const labels = [];
  const results = [];
  const pass = new Set(escapes);
  const fail = new Set(falseRejects);
  for (let i = 1; i <= good; i += 1) {
    labels.push([`G${i}`, 'good', '', '', '']);
    for (let r = 1; r <= runs; r += 1) results.push([`G${i}`, String(r), fail.has(`G${i}:${r}`) ? 'fail' : 'pass', '', '', '']);
  }
  for (let i = 1; i <= defect; i += 1) {
    labels.push([`D${i}`, 'defect', type, '', '']);
    for (let r = 1; r <= runs; r += 1) results.push([`D${i}`, String(r), pass.has(`D${i}:${r}`) ? 'pass' : 'fail', pass.has(`D${i}:${r}`) ? '' : type, '', '']);
  }
  return { labels: labelsOf(labels), results: resultsOf(results) };
}

// The whole run in memory.
export const runOf = (labels, results, options = {}) => checkText(labels, results, { options: readOptions(options) });

// The findings of a run in memory.
export const findingsOf = (labels, results, options) => runOf(labels, results, options).findings;

// The ids of the findings of a run.
export const idsOf = (labels, results, options) => findingsOf(labels, results, options).map((f) => f.id);

// The findings of one check.
export const ofCheck = (labels, results, id, options) => findingsOf(labels, results, options).filter((f) => f.id === id);

// Runs the command line with exactly these arguments, in a folder.
export async function cli(argv, base) {
  let out = '';
  let err = '';
  const code = await main(argv, { out: (t) => { out += t; }, err: (t) => { err += t; } }, undefined, base);
  return { code, out, err };
}

// Writes the files and runs the command line in the folder.
export async function run(files, args) {
  return withFiles(files, (dir) => cli(args, dir));
}

// A clean pair of files and one with a mistake, for the command line tests.
export const GOOD = (() => {
  const b = bench({ good: 30, defect: 30, runs: 1 });
  return { 'labels.csv': b.labels, 'results.csv': b.results };
})();
export const BAD = (() => {
  const b = bench({ good: 30, defect: 30, runs: 1, escapes: ['D1:1', 'D2:1', 'D3:1'] });
  return { 'labels.csv': b.labels, 'results.csv': b.results };
})();
export const ARGS = ['labels.csv', 'results.csv'];

// The time a hostile test may take: four times as long when the runner collects coverage, which sets NODE_V8_COVERAGE.
export const allowed = (ms) => (process.env.NODE_V8_COVERAGE ? ms * 4 : ms);
