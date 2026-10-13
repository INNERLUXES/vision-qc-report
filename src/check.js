// A run: read the two files, check every row and every part, work out the rates, check them against the limits and build the report
// object that the formats write.

import { createCollector, show } from './collect.js';
import { DEFAULTS, LEVELS, LIMITS as WORK_LIMITS, NOTICE } from './data.js';
import { InputError, displayPath, locateInput, readInputText } from './files.js';
import { analyze } from './analyze.js';
import { percentFixed, rateAbove, rateBelow, readCount, readPercent } from './rate.js';
import { readLabels, readResults } from './read.js';
import { RULES, decide, ruleById } from './rules.js';
import { safeText } from './text.js';

export { InputError };

export const LIMITS = { ...WORK_LIMITS };

const clean = (t, max = 900) => safeText(t, max);

const ORDER = { error: 0, warning: 1, info: 2 };
const KIND_ORDER = { file: 0, record: 1, part: 2, metric: 3 };
const FILE_ORDER = { labels: 0, results: 1 };

// The options of a run, each given as text or left to its default. A value that cannot be used throws an Error whose message says
// which.
export function readOptions({ maxEscape = null, maxFalseReject = null, minRepeatability = null, minDefects = null, minGood = null, thresholdSweep = false, scoreDirection = null } = {}) {
  const percent = (flag, given, fallback) => {
    const p = readPercent(given ?? fallback);
    if (p === null) throw new Error(`${flag}: ${show(String(given), 40)} is not a plain number of percent from 0 to 100`);
    return p;
  };
  const count = (flag, given, fallback) => {
    const n = readCount(given ?? fallback);
    if (n === null) throw new Error(`${flag}: ${show(String(given), 40)} is not a whole number from 0 to 999999999`);
    return n;
  };
  const direction = scoreDirection ?? 'high';
  if (direction !== 'high' && direction !== 'low') throw new Error(`--score-direction: ${show(String(scoreDirection), 40)} is not high or low`);
  return {
    maxEscape: percent('--max-escape', maxEscape, DEFAULTS.maxEscape),
    maxFalseReject: percent('--max-false-reject', maxFalseReject, DEFAULTS.maxFalseReject),
    minRepeatability: percent('--min-repeatability', minRepeatability, DEFAULTS.minRepeatability),
    minRepeatabilityGiven: minRepeatability !== null,
    minDefects: count('--min-defects', minDefects, DEFAULTS.minDefects),
    minGood: count('--min-good', minGood, DEFAULTS.minGood),
    thresholdSweep: Boolean(thresholdSweep),
    scoreDirection: direction
  };
}

const plural = (n, one, many = `${one}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
const pct = (r) => (r.percent === null ? 'n/a' : `${r.percent} percent`);

// The acceptance limits, with the finding each one raises. status: pass, fail, skipped (not measurable and not asked for) or
// not-evaluated (a file could not be read).
export function evaluateLimits(a, options, add) {
  const out = [];
  const escapeName = `escape rate at most ${options.maxEscape.text} percent`;
  const rejectName = `false reject rate at most ${options.maxFalseReject.text} percent`;
  const repeatName = `repeatability at least ${options.minRepeatability.text} percent`;
  if (a === null) {
    for (const [id, name] of [['escape-above-limit', escapeName], ['false-reject-above-limit', rejectName], ['repeatability-below-limit', repeatName]]) out.push({ check: id, name, status: 'not-evaluated', detail: 'a file could not be read, so no rate was worked out' });
    return out;
  }
  const e = a.escape;
  if (a.measured.defect === 0) {
    add('escape-above-limit', {}, 'The escape rate cannot be measured: no defect part has a result, so there is nothing to divide by. A limit that cannot be measured is not met.');
    out.push({ check: 'escape-above-limit', name: escapeName, status: 'fail', detail: 'cannot be measured: no defect part has a result' });
  } else {
    const over = [rateAbove(e.perRun.count, e.perRun.of, options.maxEscape) && 'per run', rateAbove(e.majority.count, e.majority.of, options.maxEscape) && 'by majority verdict'].filter(Boolean);
    const detail = `${pct(e.perRun)} per run (${e.perRun.count} of ${e.perRun.of} runs of defect parts passed), ${pct(e.majority)} by majority verdict (${e.majority.count} of ${e.majority.of} defect parts)`;
    if (over.length > 0) add('escape-above-limit', {}, `The escape rate is ${detail}; the limit is ${options.maxEscape.text} percent and the rate is above it ${over.join(' and ')}.`);
    out.push({ check: 'escape-above-limit', name: escapeName, status: over.length > 0 ? 'fail' : 'pass', detail });
  }
  const f = a.falseReject;
  if (a.measured.good === 0) {
    add('false-reject-above-limit', {}, 'The false reject rate cannot be measured: no good part has a result, so there is nothing to divide by. A limit that cannot be measured is not met.');
    out.push({ check: 'false-reject-above-limit', name: rejectName, status: 'fail', detail: 'cannot be measured: no good part has a result' });
  } else {
    const over = [rateAbove(f.perRun.count, f.perRun.of, options.maxFalseReject) && 'per run', rateAbove(f.majority.count, f.majority.of, options.maxFalseReject) && 'by majority verdict'].filter(Boolean);
    const detail = `${pct(f.perRun)} per run (${f.perRun.count} of ${f.perRun.of} runs of good parts failed), ${pct(f.majority)} by majority verdict (${f.majority.count} of ${f.majority.of} good parts)`;
    if (over.length > 0) add('false-reject-above-limit', {}, `The false reject rate is ${detail}; the limit is ${options.maxFalseReject.text} percent and the rate is above it ${over.join(' and ')}.`);
    out.push({ check: 'false-reject-above-limit', name: rejectName, status: over.length > 0 ? 'fail' : 'pass', detail });
  }
  const r = a.repeatability;
  if (r.parts === 0) {
    if (options.minRepeatabilityGiven) {
      add('repeatability-below-limit', {}, '--min-repeatability was given, but no part has more than one run, so repeatability cannot be measured. A limit that cannot be measured is not met.');
      out.push({ check: 'repeatability-below-limit', name: repeatName, status: 'fail', detail: 'cannot be measured: no part has more than one run' });
    } else out.push({ check: 'repeatability-below-limit', name: repeatName, status: 'skipped', detail: 'not measured: no part has more than one run, and --min-repeatability was not given' });
  } else {
    const below = rateBelow(r.consistent, r.parts, options.minRepeatability);
    const detail = `${pct(r.rate)} (${r.consistent} of ${r.parts} parts with more than one run gave the same verdict every time)`;
    if (below) add('repeatability-below-limit', {}, `Repeatability is ${detail}; the minimum is ${options.minRepeatability.text} percent. ${plural(r.disagreeing, 'part')} had runs that disagreed.`);
    out.push({ check: 'repeatability-below-limit', name: repeatName, status: below ? 'fail' : 'pass', detail });
  }
  const small = [];
  if (a.measured.defect < options.minDefects) small.push(`${plural(a.measured.defect, 'defect part')} (at least ${options.minDefects} asked for)`);
  if (a.measured.good < options.minGood) small.push(`${plural(a.measured.good, 'good part')} (at least ${options.minGood} asked for)`);
  if (small.length > 0) {
    const share = (n) => (n > 0 ? percentFixed(1, n) : null);
    const moves = [a.measured.defect > 0 && a.measured.defect < options.minDefects && `one defect part is ${share(a.measured.defect)} percent of the defect parts`, a.measured.good > 0 && a.measured.good < options.minGood && `one good part is ${share(a.measured.good)} percent of the good parts`].filter(Boolean);
    add('sample-small', {}, `Only ${small.join(' and ')} were measured. Rates on so few parts mislead: ${moves.length ? `${moves.join(' and ')}, so one part moves a rate by that much, and ` : ''}no escape among a handful of defect parts does not show that the escape rate is low. Measure more parts before accepting the station on these numbers.`);
  }
  return out;
}

// The findings of the text of the two files, with no file system. Returns { labels, results, analysis, limits, findings, notes,
// omitted }; analysis is null when a file could not be read.
export function checkText(labelsText, resultsText, { options = readOptions() } = {}) {
  const collector = createCollector();
  const { add, notes } = collector;
  const labels = readLabels(labelsText, add, notes, { sweep: options.thresholdSweep });
  const results = readResults(resultsText, add, notes, { sweep: options.thresholdSweep });
  let analysis = null;
  if (labels.ok && results.ok) {
    analysis = analyze({ labels, results, options, add });
    if (analysis.labelled.undecided > 0) notes.push(`${plural(analysis.labelled.undecided, 'part')} ${analysis.labelled.undecided === 1 ? 'was' : 'were'} left out of every rate because the labelers tied on good or defect`);
    if (analysis.results.rowsLeftOut > 0) notes.push(`${plural(analysis.results.rowsLeftOut, 'result row')} ${analysis.results.rowsLeftOut === 1 ? 'was' : 'were'} left out because a run number was used twice for a part`);
    if (analysis.sweep && analysis.sweep.runsWithoutScore > 0) notes.push(`the threshold sweep left out ${plural(analysis.sweep.runsWithoutScore, 'run')} that ${analysis.sweep.runsWithoutScore === 1 ? 'has' : 'have'} no score`);
    if (options.thresholdSweep && analysis.sweep && analysis.sweep.rows.length === 0) notes.push('the threshold sweep has no rows because no run has a score');
  } else notes.push('no rate was worked out because a file could not be read');
  const limits = evaluateLimits(analysis, options, add);
  if (analysis && limits.find((l) => l.check === 'repeatability-below-limit').status === 'skipped') notes.push('repeatability was not measured: no part has more than one run');
  return { labels, results, analysis, limits, findings: collector.findings, notes, omitted: collector.omitted };
}

const lineCount = (text) => {
  const parts = text === '' ? [] : text.split(/\r\n|\r|\n/);
  return parts.length > 0 && parts.at(-1) === '' ? parts.length - 1 : parts.length;
};

// The report object for the findings. files is { labels, results }, each { file, bytes, lines }.
export function buildReport({ files, checked, version, minSeverity = 'info', failOn = 'error', options = readOptions() }) {
  const names = { labels: files.labels.file, results: files.results.file };
  const all = checked.findings.map((f) => {
    const rule = ruleById(f.id);
    const file = f.file === null ? null : names[f.file];
    return {
      id: f.id,
      severity: rule.severity,
      message: clean(f.message),
      file,
      line: f.line,
      column: f.column,
      at: file === null ? 'rates' : `${file}:${f.line}`,
      subject: f.subject == null ? null : clean(f.subject, 120),
      fix: rule.fix,
      kind: rule.kind
    };
  });
  const rank = (f) => (f.file === null ? 2 : FILE_ORDER[f.file === names.labels ? 'labels' : 'results']);
  all.sort((a, b) => ORDER[a.severity] - ORDER[b.severity] || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || rank(a) - rank(b) || (a.line ?? 0) - (b.line ?? 0) || (a.column ?? 0) - (b.column ?? 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) || (a.message < b.message ? -1 : a.message > b.message ? 1 : 0));
  const omitted = checked.omitted;
  const shown = all.filter((f) => LEVELS.indexOf(f.severity) >= LEVELS.indexOf(minSeverity));
  const extra = (rule) => omitted.get(rule.id) ?? 0;
  const byLevel = { error: 0, warning: 0, info: 0 };
  const allByLevel = { error: 0, warning: 0, info: 0 };
  for (const f of all) allByLevel[f.severity] += 1;
  for (const f of shown) byLevel[f.severity] += 1;
  for (const rule of RULES) {
    allByLevel[rule.severity] += extra(rule);
    if (LEVELS.indexOf(rule.severity) >= LEVELS.indexOf(minSeverity)) byLevel[rule.severity] += extra(rule);
  }
  const total = (o) => o.error + o.warning + o.info;
  const notes = [...checked.notes];
  for (const [id, n] of omitted) notes.push(`${n.toLocaleString('en-US')} more findings of ${id} are not listed; the first 1,000 are`);
  const a = checked.analysis;
  return {
    tool: 'vision-qc-report',
    version,
    input: {
      labels: { file: files.labels.file, format: checked.labels.format, bytes: files.labels.bytes, lines: files.labels.lines, records: checked.labels.records, leftOut: checked.labels.leftOut },
      results: { file: files.results.file, format: checked.results.format, bytes: files.results.bytes, lines: files.results.lines, records: checked.results.records, leftOut: checked.results.leftOut }
    },
    evaluated: a !== null,
    summary: a === null ? null : { labelled: a.labelled, results: a.results, measured: a.measured },
    rates: a === null ? null : { escape: a.escape, falseReject: a.falseReject, repeatability: { parts: a.repeatability.parts, consistent: a.repeatability.consistent, disagreeing: a.repeatability.disagreeing, rate: a.repeatability.rate } },
    types: a === null ? null : a.types,
    matrix: a === null ? null : a.matrix,
    disagreements: a === null ? null : { listed: a.repeatability.listed, notListed: a.repeatability.notListed },
    stations: a === null ? null : a.stations,
    sweep: a === null ? null : a.sweep,
    acceptance: checked.limits,
    totals: { findings: total(byLevel), byLevel, hidden: total(allByLevel) - total(byLevel) },
    rules: RULES.map((r) => ({ id: r.id, level: r.severity, kind: r.kind, findings: shown.filter((f) => f.id === r.id).length + (LEVELS.indexOf(r.severity) >= LEVELS.indexOf(minSeverity) ? extra(r) : 0) })),
    options: {
      minSeverity,
      failOn,
      maxEscape: options.maxEscape.text,
      maxFalseReject: options.maxFalseReject.text,
      minRepeatability: options.minRepeatability.text,
      minDefects: options.minDefects,
      minGood: options.minGood,
      thresholdSweep: options.thresholdSweep,
      scoreDirection: options.scoreDirection
    },
    findings: shown,
    notes: notes.map((n) => clean(n)),
    notice: NOTICE,
    result: decide(allByLevel, failOn)
  };
}

async function load({ path, limits, base }) {
  const absolute = await locateInput(path, base);
  const { text, bytes } = await readInputText(absolute, base, limits);
  return { absolute, text, file: { file: displayPath(absolute, base), bytes, lines: lineCount(text) } };
}

// Reads the two files and builds the report. Problems with either file are collected, so a run that cannot read both says so for
// both.
export async function checkFiles({ labelsPath, resultsPath, minSeverity = 'info', failOn = 'error', options = null, optionValues = {}, version, limits = LIMITS, base = process.cwd() }) {
  const used = options ?? readOptions(optionValues);
  const problems = [];
  const loaded = {};
  for (const [name, path] of [['labels', labelsPath], ['results', resultsPath]]) {
    try {
      loaded[name] = await load({ path, limits, base });
    } catch (error) {
      if (!(error instanceof InputError)) throw error;
      problems.push(...error.problems);
    }
  }
  if (problems.length > 0) throw new InputError(problems);
  if (loaded.labels.absolute === loaded.results.absolute) throw new InputError([`${loaded.labels.file.file}: the labels file and the results file are the same file`]);
  const checked = checkText(loaded.labels.text, loaded.results.text, { options: used });
  return buildReport({ files: { labels: loaded.labels.file, results: loaded.results.file }, checked, version, minSeverity, failOn, options: used });
}
