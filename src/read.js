// Reading the two files. Each is a table (CSV, or TSV when the first line has tabs) with a header row. A row the tool cannot follow
// or use is a finding and is left out, never read as something else, and a file the tool cannot follow at all is a finding and
// stops the rates. The labels become a list of rows; the results become columns of numbers (a part, a run, a verdict, a type, a
// score, a station) so that a million rows take little memory.

import { CsvError, cellAt, readTable } from './csv.js';
import { LIMITS } from './data.js';
import { InputError } from './files.js';
import { LABEL_FIELDS, LABEL_NAMES, RESULT_FIELDS, RESULT_NAMES, nearest, normalizeName } from './fields.js';
import { nameKey, show } from './collect.js';
import { findSecrets } from './secrets.js';
import { parseScore } from './score.js';

export const TABLE_LIMITS = { maxRows: LIMITS.maxRows, maxColumns: LIMITS.maxColumns, maxCells: LIMITS.maxCells, maxCellLength: LIMITS.maxCellLength };

const WHAT = { labels: 'labels', results: 'results' };

// What is lost when a soft column is not there.
const MISSING = {
  labels: {
    defect_type: 'The labels file has no "defect_type" column, so no defect has a type and the report has no rates for each defect type.'
  },
  results: {
    run: 'The results file has no "run" column, so every row is read as run 1 and a part with more than one row is reported by run-sequence.',
    defect_type: 'The results file has no "defect_type" column, so the confusion matrix cannot name what the station reported; a failed run of a defect part counts as "(not named)".',
    score: 'The results file has no "score" column, so --threshold-sweep has no scores to sweep.'
  }
};

// The table of a file, or null with a file-unreadable finding.
function openTable(text, file, add, notes) {
  let table;
  try {
    table = readTable(text, { limits: TABLE_LIMITS });
  } catch (error) {
    if (!(error instanceof CsvError)) throw error;
    add('file-unreadable', { file, line: error.line, column: error.column }, `The ${WHAT[file]} file is not a table the reader can follow: ${error.message}. Nothing was worked out.`);
    return null;
  }
  if (table.notes.length > 0) {
    add('file-unreadable', { file, line: 1, column: 1 }, `The ${WHAT[file]} file holds more than ${LIMITS.maxRows.toLocaleString('en-US')} rows, which is more than the tool reads. Nothing was worked out; split the file or check a smaller set.`);
    return null;
  }
  if (table.rows.length === 0) {
    add('file-unreadable', { file, line: 1, column: 1 }, `The ${WHAT[file]} file holds a header and no rows, so there is nothing to work out. Nothing was worked out.`);
    return null;
  }
  return table;
}

// The columns of a header: { index, ok }. index maps a column name to its position. Unknown and repeated columns are findings;
// a needed column that is absent is a file-unreadable finding; a soft column that is absent is a column-missing warning (the
// column score only when a sweep is asked for).
function mapColumns(table, fields, names, file, add, sweep) {
  const index = new Map();
  table.header.cells.forEach((cell, i) => {
    const name = normalizeName(cell);
    const at = { file, ...cellAt(table.header, i) };
    if (!names.includes(name)) {
      const near = name === '' ? null : nearest(name, names);
      add('column-unknown', at, `The column "${show(cell)}" of the ${WHAT[file]} file is not a column the tool reads${near ? `; did you mean "${near}"?` : '.'} Nothing under it is checked.`, cell);
    } else if (index.has(name)) {
      add('column-duplicate', at, `The column "${show(cell)}" of the ${WHAT[file]} file has the same name as column ${index.get(name) + 1} once case and separators are ignored; only the first is read.`, name);
    } else index.set(name, i);
  });
  const lacking = fields.filter((f) => f.needed && !index.has(f.name)).map((f) => f.name);
  if (lacking.length > 0) {
    add('file-unreadable', { file, ...cellAt(table.header, 0) }, `The header of the ${WHAT[file]} file has no "${lacking.join('" and "')}" column, which every row needs. Nothing was worked out.`, lacking[0]);
    return { index, ok: false };
  }
  for (const f of fields) {
    if (f.needed || index.has(f.name) || !f.soft) continue;
    if (f.soft === 'sweep' && !sweep) continue;
    add('column-missing', { file, ...cellAt(table.header, 0) }, MISSING[file][f.name], f.name);
  }
  return { index, ok: true };
}

// The cell under a column of a row, trimmed; a cell marked as a secret is left out as if it were empty.
function cellReader(table, index) {
  return (row, name) => {
    const i = index.get(name);
    if (i === undefined || table.secretColumns.has(i) || row.secrets?.has(i)) return '';
    return row.cells[i].trim();
  };
}

function searchSecrets(table, index, file, add) {
  const hex = new Set(index.has('part_id') ? [index.get('part_id')] : []);
  for (const f of findSecrets(table, cellAt, hex)) add('secret-in-file', { file, line: f.line, column: f.column }, `${file === 'labels' ? 'Labels' : 'Results'} file: ${f.message}`);
}

const place = (file, row, index, name) => ({ file, ...cellAt(row, index.get(name) ?? 0) });

// The label rows. Returns { ok, format, rows, records, leftOut, hasType }.
export function readLabels(text, add, notes, { sweep = false } = {}) {
  const table = openTable(text, 'labels', add, notes);
  if (table === null) return { ok: false, format: 'CSV', rows: [], records: 0, leftOut: 0, hasType: false };
  const format = table.delimiter === '\t' ? 'TSV' : 'CSV';
  const { index, ok } = mapColumns(table, LABEL_FIELDS, LABEL_NAMES, 'labels', add, sweep);
  if (!ok) return { ok: false, format, rows: [], records: table.rows.length, leftOut: table.rows.length, hasType: false };
  searchSecrets(table, index, 'labels', add);
  const get = cellReader(table, index);
  const hasType = index.has('defect_type');
  const rows = [];
  let leftOut = 0;
  for (const row of table.rows) {
    if (row.cells.length !== table.header.cells.length) {
      add('row-malformed', { file: 'labels', ...cellAt(row, 0) }, `The row on line ${row.line} of the labels file has ${row.cells.length} cells but the header has ${table.header.cells.length}; the row was left out.`);
      leftOut += 1;
      continue;
    }
    const part = get(row, 'part_id');
    const raw = get(row, 'label');
    const missing = part === '' ? 'part_id' : raw === '' ? 'label' : null;
    if (missing) {
      add('cell-missing', place('labels', row, index, missing), `The row on line ${row.line} of the labels file has no value under "${missing}", which every row needs; the row was left out.`, missing);
      leftOut += 1;
      continue;
    }
    const label = raw.toLowerCase();
    if (label !== 'good' && label !== 'defect') {
      add('label-invalid', place('labels', row, index, 'label'), `The label of the part "${show(part)}" is "${show(raw, 40)}", which is not good or defect; the row was left out.`, part);
      leftOut += 1;
      continue;
    }
    let type = get(row, 'defect_type');
    if (label === 'good' && type !== '') {
      add('defect-type-on-good', place('labels', row, index, 'defect_type'), `The part "${show(part)}" is labelled good but has the defect type "${show(type, 40)}". The type is ignored; one of the two cells is wrong.`, part);
      type = '';
    } else if (label === 'defect' && type === '' && hasType) {
      add('defect-type-missing', place('labels', row, index, 'defect_type'), `The part "${show(part)}" is labelled defect and has no defect type, so it is counted in the escape rate but in no defect type.`, part);
    }
    rows.push({ line: row.line, column: cellAt(row, index.get('part_id')).column, part, key: nameKey(part), label, type, labeler: get(row, 'labeler') });
  }
  return { ok: true, format, rows, records: table.rows.length, leftOut, hasType };
}

const RUN = /^[1-9][0-9]{0,6}$/;

// Interns a text under its key, up to a limit of distinct keys.
function intern(map, names, text, what, limit = Infinity) {
  const key = nameKey(text);
  let i = map.get(key);
  if (i === undefined) {
    if (names.length >= limit) throw new InputError([`the results file names more than ${limit} different ${what}; the report would not be readable`]);
    i = names.length;
    map.set(key, i);
    names.push(text);
  }
  return i;
}

// The result rows, as columns. Returns { ok, format, records, leftOut, data } where data holds, for each kept row, the part
// (an index into parts), the run, whether it passed, the reported type (an index into types or -1), the station (or -1), the
// score (a BigInt and its scale, or null) and the line.
export function readResults(text, add, notes, { sweep = false } = {}) {
  const table = openTable(text, 'results', add, notes);
  const none = { ok: false, format: 'CSV', records: 0, leftOut: 0, data: null };
  if (table === null) return none;
  const format = table.delimiter === '\t' ? 'TSV' : 'CSV';
  const { index, ok } = mapColumns(table, RESULT_FIELDS, RESULT_NAMES, 'results', add, sweep);
  if (!ok) return { ...none, format, records: table.rows.length, leftOut: table.rows.length };
  searchSecrets(table, index, 'results', add);
  const get = cellReader(table, index);
  const hasRun = index.has('run');
  const partIds = new Map();
  const typeIds = new Map();
  const stationIds = new Map();
  const data = { parts: [], partLines: [], types: [], stations: [], part: [], run: [], pass: [], type: [], station: [], score: [], scale: [], line: [], column: [], hasScore: false, hasType: index.has('defect_type'), hasStation: false };
  let leftOut = 0;
  for (const row of table.rows) {
    if (row.cells.length !== table.header.cells.length) {
      add('row-malformed', { file: 'results', ...cellAt(row, 0) }, `The row on line ${row.line} of the results file has ${row.cells.length} cells but the header has ${table.header.cells.length}; the row was left out.`);
      leftOut += 1;
      continue;
    }
    const part = get(row, 'part_id');
    const runRaw = get(row, 'run');
    const verdictRaw = get(row, 'verdict');
    const missing = part === '' ? 'part_id' : hasRun && runRaw === '' ? 'run' : verdictRaw === '' ? 'verdict' : null;
    if (missing) {
      add('cell-missing', place('results', row, index, missing), `The row on line ${row.line} of the results file has no value under "${missing}", which every row needs; the row was left out.`, missing);
      leftOut += 1;
      continue;
    }
    if (hasRun && !RUN.test(runRaw)) {
      add('run-invalid', place('results', row, index, 'run'), `The run of the part "${show(part)}" is "${show(runRaw, 40)}", which is not a whole number from 1 to ${LIMITS.maxRun.toLocaleString('en-US')}; the row was left out.`, part);
      leftOut += 1;
      continue;
    }
    const verdict = verdictRaw.toLowerCase();
    if (verdict !== 'pass' && verdict !== 'fail') {
      add('verdict-invalid', place('results', row, index, 'verdict'), `The verdict of the part "${show(part)}" is "${show(verdictRaw, 40)}", which is not pass or fail; the row was left out.`, part);
      leftOut += 1;
      continue;
    }
    let scored = null;
    const scoreRaw = get(row, 'score');
    if (scoreRaw !== '') {
      scored = parseScore(scoreRaw);
      if (scored === null) add('score-invalid', place('results', row, index, 'score'), `The score of the part "${show(part)}" is "${show(scoreRaw, 40)}", which is not a plain decimal such as 0.82 or -1.5 (no exponent, no plus sign, no separator, at most 40 digits on each side of the point); the row is read without its score.`, part);
    }
    const typeRaw = get(row, 'defect_type');
    const stationRaw = get(row, 'station');
    const p = intern(partIds, data.parts, part, 'parts');
    if (p === data.partLines.length) data.partLines.push(row.line);
    data.part.push(p);
    data.run.push(hasRun ? Number(runRaw) : 1);
    data.pass.push(verdict === 'pass' ? 1 : 0);
    data.type.push(verdict === 'fail' && typeRaw !== '' ? intern(typeIds, data.types, typeRaw, 'defect types', LIMITS.maxTypes) : -1);
    data.station.push(stationRaw === '' ? -1 : intern(stationIds, data.stations, stationRaw, 'stations', LIMITS.maxTypes));
    data.score.push(scored ? scored.int : null);
    data.scale.push(scored ? scored.scale : 0);
    data.line.push(row.line);
    data.column.push(cellAt(row, index.get('part_id')).column);
    if (scored) data.hasScore = true;
    if (stationRaw !== '') data.hasStation = true;
  }
  return { ok: true, format, records: table.rows.length, leftOut, data };
}
