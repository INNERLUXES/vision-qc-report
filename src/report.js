// The reports: text for a terminal, markdown for a job summary or a pull request, JSON for other tools, SARIF for code scanning and
// JUnit XML for the test view of a build system. Every text that comes from the input (a file name, a part id, a defect type, a
// message) was cleaned by safeText before it reached the report object. The markdown format also escapes what markdown gives a
// meaning to, the XML format escapes what XML gives a meaning to and drops the characters XML 1.0 cannot hold, and the SARIF and
// JSON formats are built as objects and written by JSON.stringify.

import { BEST, NOT_A } from './data.js';
import { RULES } from './rules.js';
import { grouped, plural } from './size.js';
import { safeText } from './text.js';

const URI = 'https://github.com/INNERLUXES/vision-qc-report';

const clean = (t, max = 120) => safeText(t, max);

function findingsLine(r) {
  const b = r.totals.byLevel;
  const parts = ['error', 'warning', 'info'].filter((l) => b[l]).map((l) => `${grouped(b[l])} ${l}`);
  return `${grouped(r.totals.findings)}${parts.length ? ` (${parts.join(', ')})` : ''}${r.totals.hidden ? `; ${grouped(r.totals.hidden)} below ${r.options.minSeverity} not shown` : ''}`;
}

const fileLine = (f) => `${f.file} (${f.format}, ${plural(f.lines, 'line')}, ${plural(f.bytes, 'byte')})`;

const percent = (rate) => (rate.percent === null ? 'n/a' : `${rate.percent}%`);
const count = (rate) => `${grouped(rate.count)} of ${grouped(rate.of)}`;

// The lines about the parts, a line for each part of the story.
function summaryLines(r) {
  if (!r.evaluated) return [['parts', 'no rate was worked out because a file could not be read']];
  const s = r.summary;
  const lines = [
    ['parts', `${grouped(s.labelled.parts)} labelled (${grouped(s.labelled.good)} good, ${grouped(s.labelled.defect)} defect${s.labelled.undecided ? `, ${grouped(s.labelled.undecided)} tied` : ''}), ${grouped(s.measured.parts)} measured (${grouped(s.measured.good)} good, ${grouped(s.measured.defect)} defect)`],
    ['runs', `${grouped(s.measured.runs)} runs of the measured parts; ${grouped(r.input.results.records)} rows in the results file, ${grouped(r.input.results.leftOut + s.results.rowsLeftOut)} left out`]
  ];
  return lines;
}

function limitFor(r, id) {
  const o = r.options;
  if (id === 'escape') return `at most ${o.maxEscape}%`;
  if (id === 'falseReject') return `at most ${o.maxFalseReject}%`;
  return `at least ${o.minRepeatability}%`;
}

// The rows of the table of rates.
function rateRows(r) {
  const x = r.rates;
  return [
    ['escape rate, per run', count(x.escape.perRun), percent(x.escape.perRun), limitFor(r, 'escape')],
    ['escape rate, majority verdict', count(x.escape.majority), percent(x.escape.majority), limitFor(r, 'escape')],
    ['false reject rate, per run', count(x.falseReject.perRun), percent(x.falseReject.perRun), limitFor(r, 'falseReject')],
    ['false reject rate, majority verdict', count(x.falseReject.majority), percent(x.falseReject.majority), limitFor(r, 'falseReject')],
    ['repeatability', count({ count: x.repeatability.consistent, of: x.repeatability.parts }), percent(x.repeatability.rate), limitFor(r, 'repeatability')]
  ];
}

const RATE_HEAD = ['measure', 'count', 'rate', 'limit'];
const RATE_NOTE = 'A rate is a count over a count, shown as a percent with two decimals and compared with its limit exactly. Per run counts every result row; the majority verdict counts each part once, and a tie between pass and fail counts against the station. Repeatability is the share of the parts with more than one run whose runs all gave the same verdict.';

function table(head, rows, indent = '  ') {
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((row) => row[i].length)));
  const line = (cells) => `${indent}${cells.map((c, i) => (i === cells.length - 1 ? c : c.padEnd(widths[i]))).join('  ')}`.trimEnd();
  return [line(head), ...rows.map(line)];
}

const TYPE_HEAD = ['defect type', 'parts', 'runs', 'detected', 'detection rate', 'named as labelled'];
const typeRows = (r) => r.types.map((t) => [clean(t.type), grouped(t.parts), grouped(t.runs), count(t.detected), percent(t.detected), t.named === null ? 'n/a' : `${count(t.named)} (${percent(t.named)})`]);

const matrixHead = (r) => ['labelled \\ reported', ...r.matrix.columns.map((c) => clean(c))];
const matrixRows = (r) => r.matrix.rows.map((row) => [clean(row.type), ...row.counts.map((n) => grouped(n))]);

const runsText = (d) => d.runs.map((x) => `run ${x.run} ${x.verdict}`).join(', ');

const STATION_HEAD = ['station', 'escape rate, per run', 'false reject rate, per run'];
const stationRows = (r) => r.stations.map((s) => [clean(s.station), `${count(s.escape)} (${percent(s.escape)})`, `${count(s.falseReject)} (${percent(s.falseReject)})`]);

const SWEEP_HEAD = ['threshold', 'escape rate', 'false reject rate', 'within both limits'];
const sweepRows = (r) => r.sweep.rows.map((x) => [x.threshold, `${count(x.escapes)} (${percent(x.escapes)})`, `${count(x.falseRejects)} (${percent(x.falseRejects)})`, x.within ? 'yes' : 'no']);
const sweepNote = (r) => `Threshold sweep: the score is read as a defect score, so a run fails when its score is ${r.sweep.direction === 'high' ? 'at or above' : 'at or below'} the threshold. Escape rate is over ${grouped(r.sweep.defectRuns)} runs of defect parts with a score, false reject rate over ${grouped(r.sweep.goodRuns)} runs of good parts with a score.`;

const ACCEPT_HEAD = ['limit', 'status', 'detail'];
const acceptRows = (r) => r.acceptance.map((a) => [a.name, a.status, a.detail]);

const PAD = ' '.repeat(11);

export function toText(r) {
  const out = [];
  out.push(`vision-qc-report: ${r.input.labels.file} + ${r.input.results.file}`);
  out.push(`labels: ${fileLine(r.input.labels)}`);
  out.push(`results: ${fileLine(r.input.results)}`);
  for (const [k, v] of summaryLines(r)) out.push(`${k}: ${v}`);
  out.push(`findings: ${findingsLine(r)}`);
  if (r.evaluated) {
    out.push('', 'Rates', '');
    out.push(...table(RATE_HEAD, rateRows(r)));
    out.push('', RATE_NOTE);
    if (r.types.length) {
      out.push('', `Defect types (${grouped(r.types.length)})`, '');
      out.push(...table(TYPE_HEAD, typeRows(r)));
    }
    if (r.matrix.rows.length) {
      out.push('', 'Confusion matrix, in runs: the rows are what the labels say, the columns what the station reported', '');
      out.push(...table(matrixHead(r), matrixRows(r)));
    }
    const d = r.disagreements;
    out.push('', `Parts where the runs disagreed (${grouped(r.rates.repeatability.disagreeing)} of ${grouped(r.rates.repeatability.parts)} parts with more than one run)`, '');
    if (!d.listed.length) out.push('  none');
    for (const x of d.listed) out.push(`  ${clean(x.part)} (${x.label}${x.type ? `, ${clean(x.type)}` : ''}): ${runsText(x)}  [${r.input.results.file}:${x.line}]`);
    if (d.notListed > 0) out.push(`  and ${grouped(d.notListed)} more are not listed; the first 1,000 are`);
    if (r.stations) {
      out.push('', `Stations (${grouped(r.stations.length)})`, '');
      out.push(...table(STATION_HEAD, stationRows(r)));
    }
    if (r.sweep) {
      out.push('', `Threshold sweep (${grouped(r.sweep.rows.length)} thresholds)`, '');
      if (r.sweep.rows.length) out.push(...table(SWEEP_HEAD, sweepRows(r)), '', sweepNote(r));
      else out.push('  none');
    }
  }
  out.push('', 'Acceptance limits', '');
  out.push(...table(ACCEPT_HEAD, acceptRows(r)));
  out.push('', `Checks (${grouped(r.rules.length)})`, '');
  out.push(...table(['check', 'level', 'kind', 'findings'], r.rules.map((x) => [x.id, x.level, x.kind, grouped(x.findings)])), '');
  out.push(`Findings (${grouped(r.findings.length)})`, '');
  if (!r.findings.length) out.push('  none', '');
  const width = Math.max(...RULES.map((x) => x.id.length));
  for (const f of r.findings) {
    out.push(`  ${f.severity.toUpperCase().padEnd(8)} ${f.id.padEnd(width)}  ${f.at}`);
    out.push(`${PAD}${f.message}`);
    out.push(`${PAD}fix: ${f.fix}`);
    out.push('');
  }
  for (const n of r.notes) out.push(`note: ${n}`);
  if (r.notes.length) out.push('');
  out.push(r.notice, '');
  out.push(`RESULT: ${r.result.text}`);
  return `${out.join('\n')}\n`;
}

// Text for a markdown table cell or line: the characters markdown gives a meaning to are escaped.
const md = (t) => String(t).replace(/[\\`*_{}[\]<>()#+!|~]/g, (c) => `\\${c}`).replace(/\r?\n/g, ' ');

function mdTable(head, rows) {
  return [`| ${head.map(md).join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...rows.map((row) => `| ${row.map(md).join(' | ')} |`), ''];
}

export function toMarkdown(r) {
  const out = [];
  out.push(`# vision-qc-report: ${md(r.input.labels.file)} + ${md(r.input.results.file)}`, '');
  out.push(`- Labels: ${md(fileLine(r.input.labels))}`, `- Results: ${md(fileLine(r.input.results))}`);
  for (const [k, v] of summaryLines(r)) out.push(`- ${k[0].toUpperCase()}${k.slice(1)}: ${md(v)}`);
  out.push(`- Findings: ${md(findingsLine(r))}`);
  out.push(`- Result: **${md(r.result.text)}**`, '');
  if (r.evaluated) {
    out.push('## Rates', '', ...mdTable(RATE_HEAD, rateRows(r)), md(RATE_NOTE), '');
    if (r.types.length) out.push('## Defect types', '', ...mdTable(TYPE_HEAD, typeRows(r)));
    if (r.matrix.rows.length) out.push('## Confusion matrix', '', 'In runs: the rows are what the labels say, the columns what the station reported.', '', ...mdTable(matrixHead(r), matrixRows(r)));
    const d = r.disagreements;
    out.push('## Parts where the runs disagreed', '', `${grouped(r.rates.repeatability.disagreeing)} of ${grouped(r.rates.repeatability.parts)} parts with more than one run.`, '');
    if (d.listed.length) {
      out.push('| Part | Label | Runs | Where |', '| --- | --- | --- | --- |');
      for (const x of d.listed) out.push(`| ${md(clean(x.part))} | ${md(x.label + (x.type ? `, ${clean(x.type)}` : ''))} | ${md(runsText(x))} | ${md(`${r.input.results.file}:${x.line}`)} |`);
      out.push('');
    }
    if (d.notListed > 0) out.push(`And ${grouped(d.notListed)} more are not listed; the first 1,000 are.`, '');
    if (r.stations) out.push('## Stations', '', ...mdTable(STATION_HEAD, stationRows(r)));
    if (r.sweep) {
      out.push('## Threshold sweep', '');
      if (r.sweep.rows.length) out.push(...mdTable(SWEEP_HEAD, sweepRows(r)), md(sweepNote(r)), '');
      else out.push('None.', '');
    }
  }
  out.push('## Acceptance limits', '', ...mdTable(ACCEPT_HEAD, acceptRows(r)));
  out.push('## Findings', '');
  if (!r.findings.length) out.push('None.', '');
  else {
    out.push('| Level | Check | Where | Message |', '| --- | --- | --- | --- |');
    for (const f of r.findings) out.push(`| ${f.severity} | ${f.id} | ${md(f.at)} | ${md(f.message)} Fix: ${md(f.fix)} |`);
    out.push('');
  }
  for (const n of r.notes) out.push(`Note: ${md(n)}`, '');
  out.push(`${md(r.notice)}`, '');
  return `${out.join('\n')}`;
}

export function toJson(r) {
  return `${JSON.stringify(r, null, 2)}\n`;
}

const SARIF_LEVEL = { error: 'error', warning: 'warning', info: 'note' };

// SARIF 2.1.0: the checks as rules of the driver, the two files as the artifacts, and one result for each finding that has a place
// in a file, with its line and column. The rates and the findings about a rate have no place in a file and are left out.
export function toSarif(r) {
  const files = [r.input.labels.file, r.input.results.file];
  const sarif = {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'vision-qc-report',
            version: r.version,
            informationUri: URI,
            rules: RULES.map((x) => ({
              id: x.id,
              name: x.id,
              shortDescription: { text: x.summary },
              help: { text: `${x.fix} (${x.kind})` },
              defaultConfiguration: { level: SARIF_LEVEL[x.severity] },
              properties: { kind: x.kind }
            }))
          }
        },
        artifacts: files.map((uri) => ({ location: { uri } })),
        results: r.findings.filter((f) => f.file !== null).map((f) => ({
          ruleId: f.id,
          ruleIndex: RULES.findIndex((x) => x.id === f.id),
          level: SARIF_LEVEL[f.severity],
          message: { text: `${f.message} Fix: ${f.fix}` },
          locations: [{ physicalLocation: { artifactLocation: { uri: f.file, index: files.indexOf(f.file) }, region: { startLine: f.line, startColumn: f.column } } }],
          properties: { kind: f.kind, subject: f.subject }
        })),
        properties: { notice: r.notice, result: r.result.text }
      }
    ]
  };
  return `${JSON.stringify(sarif, null, 2)}\n`;
}

// Text for XML: the five characters XML gives a meaning to are escaped, and the characters XML 1.0 cannot hold (a lone surrogate,
// U+FFFE and U+FFFF) are replaced by a question mark.
const xml = (t) => String(t)
  .replace(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]|[\ufffe\uffff]/g, '?')
  .replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);

// JUnit XML: one test suite, "acceptance", with one test case for each acceptance limit. A limit that is broken or cannot be
// measured is a failure, a limit that was not asked for and cannot be measured is skipped, and a limit that could not be worked
// out because a file could not be read is an error. No time is recorded, because the tool reads no clock, so every time is 0.
export function toJunit(r) {
  const cases = r.acceptance.map((a) => {
    const head = `    <testcase classname="acceptance" name="${xml(a.name)}" time="0"`;
    if (a.status === 'pass') return { kind: 'pass', xml: `${head}/>` };
    if (a.status === 'skipped') return { kind: 'skipped', xml: `${head}>\n      <skipped message="${xml(a.detail)}"/>\n    </testcase>` };
    if (a.status === 'not-evaluated') return { kind: 'error', xml: `${head}>\n      <error type="not-evaluated" message="${xml(a.detail)}">${xml(a.detail)}</error>\n    </testcase>` };
    const finding = r.findings.find((f) => f.id === a.check);
    const text = finding ? finding.message : a.detail;
    return { kind: 'failure', xml: `${head}>\n      <failure type="${xml(a.check)}" message="${xml(a.detail)}">${xml(text)}</failure>\n    </testcase>` };
  });
  const n = (kind) => cases.filter((c) => c.kind === kind).length;
  const attrs = `tests="${cases.length}" failures="${n('failure')}" errors="${n('error')}"`;
  const out = ['<?xml version="1.0" encoding="UTF-8"?>'];
  out.push(`<testsuites name="vision-qc-report" ${attrs} time="0">`);
  out.push(`  <testsuite name="acceptance" ${attrs} skipped="${n('skipped')}" time="0">`);
  out.push(...cases.map((c) => c.xml));
  out.push('  </testsuite>', '</testsuites>', '');
  return out.join('\n');
}

// The list of checks, for --list-checks.
export function listChecksText() {
  const width = Math.max(...RULES.map((x) => x.id.length));
  const out = ['vision-qc-report checks', ''];
  for (const x of RULES) out.push(`  ${x.id.padEnd(width)}  ${x.severity.padEnd(7)}  ${x.kind.padEnd(7)}  ${x.summary}`);
  out.push('', `Every check is ${BEST}. A check of a file is about its columns, a check of a record is about one row, a check of a part is about one part across rows or across the two files, and a check of a metric compares a rate with a limit or looks at the size of the sample. The tool is ${NOT_A}.`, '');
  return out.join('\n');
}

export function listChecksMarkdown() {
  const out = ['# vision-qc-report checks', '', '| Check | Level | Kind | What it looks at |', '| --- | --- | --- | --- |'];
  for (const x of RULES) out.push(`| ${x.id} | ${x.severity} | ${x.kind} | ${md(x.summary)} |`);
  out.push('');
  return out.join('\n');
}

export function listChecksJson() {
  return `${JSON.stringify(RULES.map((x) => ({ id: x.id, severity: x.severity, kind: x.kind, summary: x.summary, fix: x.fix, own: x.own, cannot: x.cannot })), null, 2)}\n`;
}

export function explainText(rule) {
  const out = [`${rule.id}`, ''];
  out.push(`level: ${rule.severity}`, `kind: ${rule.kind}`, '');
  out.push(`what it looks at: ${rule.summary}`, '', `why it exists: ${rule.own}`, '', `what to change: ${rule.fix}`, '', `what it cannot see: ${rule.cannot}`, '');
  out.push(`This check is ${BEST}. The tool is ${NOT_A}.`, '');
  return out.join('\n');
}

export function explainMarkdown(rule) {
  const out = [`# ${md(rule.id)}`, ''];
  out.push(`- Level: ${rule.severity}`, `- Kind: ${rule.kind}`, '');
  out.push(`**What it looks at.** ${md(rule.summary)}`, '', `**Why it exists.** ${md(rule.own)}`, '', `**What to change.** ${md(rule.fix)}`, '', `**What it cannot see.** ${md(rule.cannot)}`, '');
  out.push(`This check is ${md(BEST)}.`, '');
  return out.join('\n');
}

export function explainJson(rule) {
  return `${JSON.stringify({ id: rule.id, severity: rule.severity, kind: rule.kind, summary: rule.summary, fix: rule.fix, own: rule.own, cannot: rule.cannot, note: `This check is ${BEST}.` }, null, 2)}\n`;
}
