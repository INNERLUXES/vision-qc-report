// The labels of each part (more than one labeler may label a part), the join of the labels with the results, and the rates. Parts
// are found by their name without regard to case and runs of white space. Everything is a count; no rate is a floating point
// number. Nothing here recurses: parts are grouped by a counting sort and the maps are plain Maps.

import { LIMITS, GOOD_ROW, NOT_NAMED, NO_TYPE, PASSED } from './data.js';
import { InputError } from './files.js';
import { list, nameKey, show } from './collect.js';
import { rateOf } from './rate.js';
import { alignScores } from './score.js';
import { sweepThresholds } from './sweep.js';

const byKey = (a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);

// The label of each part from the rows of the labels file. A labeler who labels a part twice has the later row left out
// (label-duplicate). Several labelers vote: the label with more votes wins, and a tie leaves the part out; among the votes for
// defect, the type with more votes wins, and a tie leaves the part with no type. Returns a Map from the key of a part to
// { name, line, column, label, type, undecided, votes }.
export function resolveLabels(rows, add) {
  const groups = new Map();
  for (const r of rows) {
    if (!groups.has(r.key)) groups.set(r.key, []);
    groups.get(r.key).push(r);
  }
  const parts = new Map();
  let leftOut = 0;
  for (const [key, all] of groups) {
    const first = all[0];
    const seen = new Map();
    const votes = [];
    for (const r of all) {
      const who = nameKey(r.labeler);
      if (seen.has(who)) {
        add('label-duplicate', { file: 'labels', line: r.line, column: r.column }, `The part "${show(r.part)}" is labelled again by ${who === '' ? 'a labeler with no name' : `the labeler "${show(r.labeler, 40)}"`}; the row on line ${seen.get(who)} already labels it. The later row was left out.`, r.part);
        leftOut += 1;
        continue;
      }
      seen.set(who, r.line);
      votes.push(r);
    }
    const good = votes.filter((v) => v.label === 'good').length;
    const defect = votes.length - good;
    const typeVotes = new Map();
    for (const v of votes) {
      if (v.label !== 'defect' || v.type === '') continue;
      const k = nameKey(v.type);
      if (!typeVotes.has(k)) typeVotes.set(k, { name: v.type, n: 0 });
      typeVotes.get(k).n += 1;
    }
    const ranked = [...typeVotes.values()].sort((a, b) => b.n - a.n);
    const type = ranked.length > 0 && (ranked.length === 1 || ranked[0].n > ranked[1].n) ? ranked[0].name : '';
    const undecided = good === defect;
    const label = undecided ? null : defect > good ? 'defect' : 'good';
    const disagree = (good > 0 && defect > 0) || ranked.length > 1;
    if (disagree) {
      const said = votes.map((v) => `${v.labeler === '' ? 'a labeler with no name' : show(v.labeler, 40)} says ${v.label}${v.label === 'defect' && v.type ? ` (${show(v.type, 40)})` : ''} on line ${v.line}`);
      const outcome = undecided ? 'The votes tie, so the part is left out of every rate.' : label === 'good' ? 'The majority label is good.' : `The majority label is defect${type ? `, with the type ${show(type, 40)}` : ' and the types tie, so it has no type'}.`;
      add('label-conflict', { file: 'labels', line: first.line, column: first.column }, `The labelers of the part "${show(first.part)}" disagree: ${list(said, 4)}. ${outcome}`, first.part);
    }
    parts.set(key, { name: first.part, line: first.line, column: first.column, label, type: label === 'defect' ? type : '', undecided, votes: votes.length });
  }
  return { parts, leftOut };
}

// The numbers 1 to n without a gap, for the runs of a part: returns the runs that are missing in the span 1 to the highest, and
// whether the first run is above 1.
function gapsOf(sorted) {
  const gaps = [];
  let next = 1;
  for (const r of sorted) {
    if (r > next) for (let g = next; g < r && gaps.length <= 20; g += 1) gaps.push(g);
    next = r + 1;
  }
  return gaps;
}

const ascending = (a, b) => a - b;

// Joins and counts. labels is the output of readLabels, results the output of readResults. Returns the numbers of the report.
export function analyze({ labels, results, options, add }) {
  const data = results.data;
  const { parts: labelled, leftOut: duplicateRows } = resolveLabels(labels.rows, add);
  const P = data.parts.length;
  const N = data.part.length;
  // The rows of each part, in file order, by a counting sort.
  const start = new Int32Array(P + 1);
  for (let i = 0; i < N; i += 1) start[data.part[i] + 1] += 1;
  for (let p = 0; p < P; p += 1) start[p + 1] += start[p];
  const fill = start.slice(0, P);
  const order = new Int32Array(N);
  for (let i = 0; i < N; i += 1) order[fill[data.part[i]]++] = i;
  const keep = new Uint8Array(N).fill(1);
  const resultKeys = data.parts.map(nameKey);
  const resultKeySet = new Map();
  resultKeys.forEach((k, p) => resultKeySet.set(k, p));
  let repeatedRowsLeftOut = 0;

  // The run numbers of each part: a number used twice leaves the later row out; a gap, or a first run above 1, is reported.
  for (let p = 0; p < P; p += 1) {
    const from = start[p];
    const to = start[p + 1];
    const seen = new Map();
    const duplicates = [];
    const runs = [];
    for (let k = from; k < to; k += 1) {
      const i = order[k];
      const run = data.run[i];
      if (seen.has(run)) {
        keep[i] = 0;
        repeatedRowsLeftOut += 1;
        if (duplicates.length < 20) duplicates.push({ run, first: seen.get(run), later: data.line[i], column: data.column[i] });
      } else {
        seen.set(run, data.line[i]);
        runs.push(run);
      }
    }
    runs.sort(ascending);
    const gaps = gapsOf(runs);
    if (duplicates.length === 0 && gaps.length === 0) continue;
    const notes = [];
    for (const d of duplicates.slice(0, 3)) notes.push(`run ${d.run} is on line ${d.first} and again on line ${d.later}, and the later row was left out`);
    if (gaps.length > 0) notes.push(`the runs of the part are ${list(runs.map(String), 8)}, and run ${list(gaps.map(String), 8)} ${gaps.length === 1 ? 'is' : 'are'} missing (runs go from 1 to the number of runs without a gap)`);
    const where = duplicates.length > 0 ? { file: 'results', line: duplicates[0].later, column: duplicates[0].column } : { file: 'results', line: data.partLines[p], column: data.column[order[from]] };
    add('run-sequence', where, `The run numbers of the part "${show(data.parts[p])}" do not go from 1 to n: ${notes.join('; ')}.`, data.parts[p]);
  }

  // Join: every part of the results has a label, every labelled part has a result.
  let undecided = 0;
  let unlabelled = 0;
  for (const [key, entry] of labelled) {
    if (entry.undecided) undecided += 1;
    if (!resultKeySet.has(key) && !entry.undecided) {
      add('label-without-result', { file: 'labels', line: entry.line, column: entry.column }, `The part "${show(entry.name)}" is labelled ${entry.label} but has no usable row in the results file, so it is in no rate.`, entry.name);
    }
  }
  const measured = [];
  for (let p = 0; p < P; p += 1) {
    const entry = labelled.get(resultKeys[p]);
    if (!entry) {
      unlabelled += 1;
      add('result-without-label', { file: 'results', line: data.partLines[p], column: data.column[order[start[p]]] }, `The part "${show(data.parts[p])}" has ${(start[p + 1] - start[p]).toLocaleString('en-US')} ${start[p + 1] - start[p] === 1 ? 'row' : 'rows'} in the results file and no label in the labels file, so it is in no rate.`, data.parts[p]);
    } else if (!entry.undecided) measured.push([p, entry]);
  }

  // Counts.
  const typeNames = new Map();
  const typeKeyOf = (name) => {
    const k = nameKey(name);
    if (!typeNames.has(k)) typeNames.set(k, name);
    return k;
  };
  // The rows and columns of the matrix are keyed with a prefix, so that a defect type called like a fixed label stays a type.
  const GOOD_KEY = 'good';
  const NONE_KEY = 'none';
  const typeId = (k) => `t:${k}`;
  const rowsByType = new Map();
  const rowFor = (key, name) => {
    if (!rowsByType.has(key)) rowsByType.set(key, { key, name, parts: 0, runs: 0, detected: 0, named: 0, counts: new Map() });
    return rowsByType.get(key);
  };
  for (const [, e] of measured) if (e.type !== '') typeKeyOf(e.type);
  const reportedKeys = data.types.map(typeKeyOf);
  const labelTypeKeys = new Set();
  const stationCounts = new Map();
  const stationFor = (s) => {
    const k = s === -1 ? '' : s;
    if (!stationCounts.has(k)) stationCounts.set(k, { name: s === -1 ? '(no station)' : data.stations[s], defectRuns: 0, escapeRuns: 0, goodRuns: 0, falseRuns: 0 });
    return stationCounts.get(k);
  };
  const t = { defectParts: 0, goodParts: 0, defectRuns: 0, escapeRuns: 0, goodRuns: 0, falseRuns: 0, majorityEscapes: 0, majorityFalse: 0, tiesDefect: 0, tiesGood: 0 };
  let repeatedParts = 0;
  let disagreeing = 0;
  const disagreeList = [];
  const defectScores = [];
  const defectScales = [];
  const goodScores = [];
  const goodScales = [];
  let unscoredRuns = 0;
  let runsUsed = 0;
  for (const [p, entry] of measured) {
    let pass = 0;
    let fail = 0;
    const isDefect = entry.label === 'defect';
    let row;
    if (isDefect) {
      if (entry.type !== '') labelTypeKeys.add(typeKeyOf(entry.type));
      row = entry.type === '' ? rowFor(NONE_KEY, NO_TYPE) : rowFor(typeId(typeKeyOf(entry.type)), typeNames.get(typeKeyOf(entry.type)));
      row.parts += 1;
    } else row = rowFor(GOOD_KEY, GOOD_ROW);
    const runs = [];
    for (let k = start[p]; k < start[p + 1]; k += 1) {
      const i = order[k];
      if (!keep[i]) continue;
      runsUsed += 1;
      const passed = data.pass[i] === 1;
      if (passed) pass += 1;
      else fail += 1;
      runs.push(i);
      const col = passed ? 'passed' : data.type[i] === -1 ? 'unnamed' : typeId(reportedKeys[data.type[i]]);
      row.counts.set(col, (row.counts.get(col) ?? 0) + 1);
      row.runs += 1;
      if (!passed) row.detected += 1;
      if (!passed && isDefect && data.type[i] !== -1 && typeId(reportedKeys[data.type[i]]) === row.key) row.named += 1;
      const st = stationFor(data.station[i]);
      if (isDefect) {
        st.defectRuns += 1;
        if (passed) st.escapeRuns += 1;
      } else {
        st.goodRuns += 1;
        if (!passed) st.falseRuns += 1;
      }
      if (data.score[i] !== null) {
        (isDefect ? defectScores : goodScores).push(data.score[i]);
        (isDefect ? defectScales : goodScales).push(data.scale[i]);
      } else unscoredRuns += 1;
    }
    const total = pass + fail;
    if (isDefect) {
      t.defectParts += 1;
      t.defectRuns += total;
      t.escapeRuns += pass;
      if (pass >= fail) t.majorityEscapes += 1;
      if (pass === fail) t.tiesDefect += 1;
    } else {
      t.goodParts += 1;
      t.goodRuns += total;
      t.falseRuns += fail;
      if (fail >= pass) t.majorityFalse += 1;
      if (pass === fail) t.tiesGood += 1;
    }
    if (total >= 2) {
      repeatedParts += 1;
      if (pass > 0 && fail > 0) {
        disagreeing += 1;
        if (disagreeList.length < LIMITS.maxListed) {
          runs.sort((a, b) => data.run[a] - data.run[b]);
          disagreeList.push({ part: show(data.parts[p], 120), label: entry.label, type: entry.type === '' ? null : show(entry.type, 120), line: data.partLines[p], runs: runs.map((i) => ({ run: data.run[i], verdict: data.pass[i] === 1 ? 'pass' : 'fail', line: data.line[i] })) });
        }
      }
    }
  }
  const typesInUse = new Set([...labelTypeKeys, ...reportedKeys]);
  if (typesInUse.size > LIMITS.maxTypes) throw new InputError([`the files name more than ${LIMITS.maxTypes} different defect types; the confusion matrix would not be readable`]);

  // The confusion matrix: a row for each labelled type (sorted), the defects with no type, and the good parts; a column for
  // each type named by the labels or the station (sorted), the runs that failed with no type named, and the runs that passed.
  const typeRows = [...rowsByType.values()].filter((r) => r.key !== GOOD_KEY && r.key !== NONE_KEY).sort(byKey);
  const noType = rowsByType.get(NONE_KEY);
  const good = rowsByType.get(GOOD_KEY);
  const rowList = [...typeRows, ...(noType ? [noType] : []), ...(good ? [good] : [])];
  const columnKeys = [...typesInUse].sort();
  const columns = [...columnKeys.map((k) => typeNames.get(k)), NOT_NAMED, PASSED];
  const columnIds = [...columnKeys.map(typeId), 'unnamed', 'passed'];
  const matrix = rowList.map((r) => ({ type: r.name, counts: columnIds.map((c) => r.counts.get(c) ?? 0) }));
  const types = [...typeRows, ...(noType ? [noType] : [])].map((r) => ({
    type: r.name,
    parts: r.parts,
    runs: r.runs,
    detected: rateOf(r.detected, r.runs),
    named: r.key === NONE_KEY ? null : rateOf(r.named, r.runs)
  }));

  const stations = data.hasStation ? [...stationCounts.values()].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)).map((s) => ({ station: s.name, escape: rateOf(s.escapeRuns, s.defectRuns), falseReject: rateOf(s.falseRuns, s.goodRuns) })) : null;

  let sweep = null;
  if (options.thresholdSweep) {
    const all = alignScores([...defectScores.map((int, i) => ({ int, scale: defectScales[i] })), ...goodScores.map((int, i) => ({ int, scale: goodScales[i] }))]);
    const rows = sweepThresholds({ defects: all.ints.slice(0, defectScores.length), goods: all.ints.slice(defectScores.length), scale: all.scale, direction: options.scoreDirection, maxEscape: options.maxEscape, maxFalseReject: options.maxFalseReject });
    sweep = { direction: options.scoreDirection, defectRuns: defectScores.length, goodRuns: goodScores.length, runsWithoutScore: unscoredRuns, rows };
  }

  const R = repeatedParts;
  return {
    labelled: { parts: labelled.size, good: [...labelled.values()].filter((e) => e.label === 'good').length, defect: [...labelled.values()].filter((e) => e.label === 'defect').length, undecided, duplicateRows },
    results: { parts: P, rowsKept: N - repeatedRowsLeftOut, rowsLeftOut: repeatedRowsLeftOut, unlabelled },
    measured: { parts: measured.length, good: t.goodParts, defect: t.defectParts, runs: runsUsed },
    escape: { perRun: rateOf(t.escapeRuns, t.defectRuns), majority: rateOf(t.majorityEscapes, t.defectParts), tied: t.tiesDefect },
    falseReject: { perRun: rateOf(t.falseRuns, t.goodRuns), majority: rateOf(t.majorityFalse, t.goodParts), tied: t.tiesGood },
    repeatability: { parts: R, disagreeing, consistent: R - disagreeing, rate: rateOf(R - disagreeing, R), listed: disagreeList, notListed: disagreeing - disagreeList.length },
    types,
    matrix: { columns, rows: matrix },
    stations,
    sweep
  };
}
