// Command line: vision-qc-report <labels file> <results file> [options]

import { readFileSync } from 'node:fs';
import { InputError, LIMITS, checkFiles, readOptions } from './check.js';
import { DEFAULTS, LEVELS } from './data.js';
import { editDistance } from './fields.js';
import { explainJson, explainMarkdown, explainText, listChecksJson, listChecksMarkdown, listChecksText, toJson, toJunit, toMarkdown, toSarif, toText } from './report.js';
import { RULES, ruleById } from './rules.js';
import { safeText } from './text.js';

export const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

const FORMATS = { text: toText, markdown: toMarkdown, json: toJson, sarif: toSarif, junit: toJunit };
const LISTS = { text: listChecksText, markdown: listChecksMarkdown, json: listChecksJson };
const EXPLAINS = { text: explainText, markdown: explainMarkdown, json: explainJson };

export const USAGE = `Usage: vision-qc-report <labels file> <results file> [options]

Checks a vision inspection station against a labelled set of parts. It reads two tables (CSV, or TSV when the first line has
tabs): the labels people gave the parts (part_id, label, defect_type, labeler, note) and the pass and fail results of the
station on the same parts (part_id, run, verdict, defect_type, score, station). It reports the escape rate, the false reject
rate, the detection rate and a confusion matrix for each defect type, and the parts where repeated runs disagreed; with
--threshold-sweep, the rates at every score threshold. A run fails when a limit is broken. It never reads an image. It
contacts nothing over the network, reads no clock and writes nothing to disk.

Options:
  --format <name>            text, markdown, json, sarif or junit (default: text)
  --json                     the same as --format json
  --max-escape <percent>     the highest escape rate that is accepted, from 0 to 100 (default: ${DEFAULTS.maxEscape})
  --max-false-reject <percent>
                             the highest false reject rate that is accepted, from 0 to 100 (default: ${DEFAULTS.maxFalseReject})
  --min-repeatability <percent>
                             the lowest share of the parts with more than one run that gave one verdict every time, from 0
                             to 100 (default: ${DEFAULTS.minRepeatability})
  --min-defects <number>     the fewest defect parts a sample should hold before its rates are trusted (default: ${DEFAULTS.minDefects})
  --min-good <number>        the fewest good parts a sample should hold (default: ${DEFAULTS.minGood})
  --threshold-sweep          list the escape rate and the false reject rate at every distinct score of the results file
  --score-direction <name>   high (a run fails at or above the threshold, the default) or low (at or below it)
  --min-severity <level>     the lowest level of a finding that is shown: ${LEVELS.join(', ')} (default: info)
  --fail-on <level>          the lowest level of a finding that fails the run: ${LEVELS.join(', ')} (default: error)
  --list-checks              list the checks with their level and kind, and exit
  --explain <id>             explain one check: what it looks at, what to change, what it cannot see, and exit
  --help                     show this text
  --version                  show the version

Checks: ${RULES.map((r) => r.id).join(', ')}.

Exit codes: 0 no finding at or above the fail-on level, 1 a finding at or above it, 2 usage or input error.
`;

const isUrl = (f) => /^[a-z][a-z0-9+.-]*:\/\//i.test(f);

// The check whose id is nearest to the text, for a message about a misspelt id.
function nearestId(text) {
  let best = null;
  let bestDistance = Infinity;
  for (const r of RULES) {
    const d = editDistance(text.toLowerCase(), r.id);
    if (d < bestDistance) {
      best = r.id;
      bestDistance = d;
    }
  }
  return bestDistance <= 6 ? best : null;
}

export function parseArgs(argv) {
  const o = { paths: [], format: null, json: false, maxEscape: null, maxFalseReject: null, minRepeatability: null, minDefects: null, minGood: null, thresholdSweep: false, scoreDirection: null, minSeverity: null, failOn: null, listChecks: false, explain: null, help: false, version: false };
  const once = (name, current, value) => {
    if (current !== null) throw new Error(`${name} was given twice`);
    return value;
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => {
      const v = argv[i + 1];
      if (v === undefined || (v.startsWith('--') && v.length > 2)) throw new Error(`${a} needs a value`);
      if (v === '-') throw new Error('reading from standard input is not supported; give a file');
      i += 1;
      return v;
    };
    if (a === '--help' || a === '-h') o.help = true;
    else if (a === '--version' || a === '-v') o.version = true;
    else if (a === '--json') o.json = true;
    else if (a === '--list-checks') o.listChecks = true;
    else if (a === '--threshold-sweep') o.thresholdSweep = true;
    else if (a === '--format') o.format = once(a, o.format, next());
    else if (a === '--max-escape') o.maxEscape = once(a, o.maxEscape, next());
    else if (a === '--max-false-reject') o.maxFalseReject = once(a, o.maxFalseReject, next());
    else if (a === '--min-repeatability') o.minRepeatability = once(a, o.minRepeatability, next());
    else if (a === '--min-defects') o.minDefects = once(a, o.minDefects, next());
    else if (a === '--min-good') o.minGood = once(a, o.minGood, next());
    else if (a === '--score-direction') o.scoreDirection = once(a, o.scoreDirection, next());
    else if (a === '--min-severity') o.minSeverity = once(a, o.minSeverity, next());
    else if (a === '--fail-on') o.failOn = once(a, o.failOn, next());
    else if (a === '--explain') o.explain = once(a, o.explain, next());
    else if (a === '-') throw new Error('reading from standard input is not supported; give a file');
    else if (a.startsWith('-')) throw new Error(`unknown argument ${a}`);
    else {
      if (o.paths.length === 2) throw new Error('give two files: the labels file and the results file');
      o.paths.push(a);
    }
  }
  if (o.json) {
    if (o.format !== null && o.format !== 'json') throw new Error(`--json and --format ${o.format} ask for two formats; give one`);
    o.format = 'json';
  }
  if (o.format === null) o.format = 'text';
  if (!Object.hasOwn(FORMATS, o.format)) throw new Error(`unknown format ${safeText(o.format, 40)} (text, markdown, json, sarif or junit)`);
  for (const [flag, v] of [['--min-severity', o.minSeverity], ['--fail-on', o.failOn]]) if (v !== null && !LEVELS.includes(v)) throw new Error(`${flag}: unknown level ${safeText(v, 40)} (${LEVELS.join(', ')})`);
  if (o.explain !== null && ruleById(o.explain) === undefined) {
    const near = nearestId(o.explain);
    throw new Error(`--explain: unknown check ${safeText(o.explain, 60)}${near ? `. Did you mean ${near}?` : ''} (--list-checks lists them)`);
  }
  if ((o.listChecks || o.explain !== null) && (o.format === 'sarif' || o.format === 'junit')) throw new Error(`${o.listChecks ? '--list-checks' : '--explain'} has no ${o.format.toUpperCase()} form; use text, markdown or json`);
  if (!o.help && !o.version && !o.listChecks && o.explain === null) {
    if (o.paths.length !== 2) throw new Error('give the labels file and the results file, such as vision-qc-report labels.csv results.csv');
    for (const p of o.paths) if (isUrl(p)) throw new Error('give a local path; the tool never fetches a URL');
    optionsOf(o);
  }
  return o;
}

// The options of a run from the parsed arguments; throws an Error that names the option that cannot be used.
function optionsOf(o) {
  return readOptions({ maxEscape: o.maxEscape, maxFalseReject: o.maxFalseReject, minRepeatability: o.minRepeatability, minDefects: o.minDefects, minGood: o.minGood, thresholdSweep: o.thresholdSweep, scoreDirection: o.scoreDirection });
}

const clean = (text) => safeText(text, 1500);

// Exit code: 0 no finding at or above the fail-on level, 1 a finding at or above it, 2 usage or input error.
export async function main(argv, io = { out: (t) => process.stdout.write(t), err: (t) => process.stderr.write(t) }, limits = undefined, base = process.cwd()) {
  let o;
  try {
    o = parseArgs(argv);
  } catch (error) {
    io.err(`vision-qc-report: ${clean(error.message)}\n\n${USAGE}`);
    return 2;
  }
  if (o.help) {
    io.out(USAGE);
    return 0;
  }
  if (o.version) {
    io.out(`${VERSION}\n`);
    return 0;
  }
  if (o.listChecks) {
    io.out(LISTS[o.format]());
    return 0;
  }
  if (o.explain !== null) {
    io.out(EXPLAINS[o.format](ruleById(o.explain)));
    return 0;
  }
  const merged = { ...LIMITS, ...(limits ?? {}) };
  try {
    const report = await checkFiles({
      labelsPath: o.paths[0],
      resultsPath: o.paths[1],
      minSeverity: o.minSeverity ?? 'info',
      failOn: o.failOn ?? 'error',
      options: optionsOf(o),
      version: VERSION,
      limits: merged,
      base
    });
    io.out(FORMATS[o.format](report));
    return report.result.pass ? 0 : 1;
  } catch (error) {
    if (error instanceof InputError) io.err(`vision-qc-report: no result, the input has ${error.problems.length === 1 ? 'a problem' : 'problems'}:\n${error.problems.map((p) => `  ${clean(p)}`).join('\n')}\n`);
    else io.err(`vision-qc-report: ${clean(error.message)}\n`);
    return 2;
  }
}
