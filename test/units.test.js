import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BEST, DEFAULTS, GOOD_ROW, KINDS, LEVELS, NOT_NAMED, NOTICE, NOT_A, NO_TYPE, PASSED, LABEL_FIELDS, LABEL_NAMES, RESULT_FIELDS, RESULT_NAMES, atOrAbove, createCollector, decide, editDistance, flat, grouped, list, listText, nameKey, nearest, normalizeName, plural, safeText, show } from '../src/index.js';

test('safeText: control characters, line separators and direction controls become a space, and the length is capped', () => {
  assert.equal(safeText('a\u001b[31mb'), 'a [31mb');
  assert.equal(safeText('a\u202eb\u2028c\u2029d\u200fe\u2066f\u2069g'), 'a b c d e f g');
  assert.equal(safeText('tab\tand\nnew\rline'), 'tab and new line');
  assert.equal(safeText('a\u007fb\u0085c\u009fd'), 'a b c d');
  assert.equal(safeText('x'.repeat(400)).length, 300);
  assert.equal(safeText('x'.repeat(400)).slice(-3), '...');
  assert.equal(safeText('abcdef', 5), 'ab...');
  assert.equal(safeText(12), '12');
  assert.equal(safeText('caf\u00e9'), 'caf\u00e9');
});

test('flat: runs of white space become one space', () => {
  assert.equal(flat(' a \n\n b\t c '), 'a b c');
});

test('show is safeText with a short length', () => {
  assert.equal(show('a\u001bb'), 'a b');
  assert.equal(show('x'.repeat(100)).length, 60);
});

test('nameKey: case, white space and Unicode forms do not make another name', () => {
  assert.equal(nameKey('  BRK-G001 '), 'brk-g001');
  assert.equal(nameKey('a   b\t\nc'), 'a b c');
  assert.equal(nameKey('\uff21\uff22'), 'ab', 'full-width letters');
  assert.equal(nameKey('cafe\u0301'), nameKey('caf\u00e9'), 'a combining accent');
  assert.notEqual(nameKey('G-007'), nameKey('G007'));
});

test('list and listText: a, a and b, a b and c, and "and N more" past the limit', () => {
  assert.equal(list([]), '');
  assert.equal(list(['a']), 'a');
  assert.equal(list(['a', 'b']), 'a and b');
  assert.equal(list(['a', 'b', 'c']), 'a, b and c');
  assert.equal(list(['a', 'b', 'c', 'd'], 2), 'a, b and 2 more');
  assert.equal(list(Array.from({ length: 3500 }, (_, i) => String(i)), 1), '0 and 3,499 more');
  assert.equal(listText(['a', 'b', 'c', 'd', 'e'], 3), 'a, b, c and 2 more');
  assert.equal(listText(['a', 'b']), 'a and b');
});

test('grouped and plural: numbers with a comma, and the singular for one', () => {
  assert.equal(grouped(1234567), '1,234,567');
  assert.equal(plural(1, 'part'), '1 part');
  assert.equal(plural(2, 'part'), '2 parts');
  assert.equal(plural(0, 'box', 'boxes'), '0 boxes');
  assert.equal(plural(1500, 'byte'), '1,500 bytes');
});

test('createCollector keeps the first 1,000 findings of a check and counts the rest', () => {
  const c = createCollector();
  for (let i = 0; i < 1005; i += 1) c.add('a-check', { file: 'labels', line: i + 1, column: 1 }, 'm', 's');
  c.add('b-check', {}, 'm');
  assert.equal(c.findings.filter((f) => f.id === 'a-check').length, 1000);
  assert.equal(c.omitted.get('a-check'), 5);
  assert.equal(c.omitted.has('b-check'), false);
  assert.deepEqual(c.findings.at(-1), { id: 'b-check', file: null, line: null, column: null, message: 'm', subject: null });
});

test('normalizeName: case and separators are ignored', () => {
  assert.equal(normalizeName('Part ID'), 'part_id');
  assert.equal(normalizeName(' defect-type '), 'defect_type');
  assert.equal(normalizeName('__Run__'), 'run');
  assert.equal(normalizeName(''), '');
  assert.equal(normalizeName('N\u00b0'), 'n');
});

test('editDistance and nearest: a name within two edits, else none', () => {
  assert.equal(editDistance('kitten', 'sitting'), 3);
  assert.equal(editDistance('', 'abc'), 3);
  assert.equal(nearest('defect_typ', LABEL_NAMES), 'defect_type');
  assert.equal(nearest('lable', LABEL_NAMES), 'label');
  assert.equal(nearest('inspector', LABEL_NAMES), null);
  assert.equal(nearest('stations', RESULT_NAMES), 'station');
  assert.equal(nearest('verdicts', RESULT_NAMES), 'verdict');
});

test('the columns: part_id and label are needed in the labels, part_id and verdict in the results, and the rest are soft or free', () => {
  assert.deepEqual(LABEL_FIELDS.filter((f) => f.needed).map((f) => f.name), ['part_id', 'label']);
  assert.deepEqual(RESULT_FIELDS.filter((f) => f.needed).map((f) => f.name), ['part_id', 'verdict']);
  assert.deepEqual(LABEL_FIELDS.filter((f) => f.soft).map((f) => f.name), ['defect_type']);
  assert.deepEqual(RESULT_FIELDS.filter((f) => f.soft).map((f) => f.name), ['run', 'defect_type', 'score']);
  assert.equal(RESULT_FIELDS.find((f) => f.name === 'score').soft, 'sweep');
  for (const f of [...LABEL_FIELDS, ...RESULT_FIELDS]) assert.ok(f.summary.length > 20, f.name);
});

test('atOrAbove and decide: the result of a run follows the fail-on level', () => {
  assert.equal(atOrAbove('error', 'warning'), true);
  assert.equal(atOrAbove('info', 'warning'), false);
  assert.equal(atOrAbove('warning', 'warning'), true);
  assert.deepEqual(decide({ error: 0, warning: 0, info: 0 }, 'error'), { pass: true, failOn: 'error', text: 'PASS - no finding at or above error' });
  assert.equal(decide({ error: 0, warning: 2, info: 0 }, 'error').text, 'PASS - no finding at or above error (2 warning)');
  assert.equal(decide({ error: 0, warning: 2, info: 0 }, 'warning').text, 'FAIL - 2 findings at or above warning (2 warning)');
  assert.equal(decide({ error: 1, warning: 0, info: 3 }, 'info').text, 'FAIL - 4 findings at or above info (1 error, 3 info)');
  assert.equal(decide({ error: 1, warning: 0, info: 0 }, 'error').text, 'FAIL - 1 finding at or above error (1 error)');
});

test('the constants: levels, kinds, the labels of the matrix, the defaults and the notices', () => {
  assert.deepEqual(LEVELS, ['info', 'warning', 'error']);
  assert.deepEqual(KINDS, ['file', 'record', 'part', 'metric']);
  assert.deepEqual([GOOD_ROW, NO_TYPE, NOT_NAMED, PASSED], ['(good part)', '(no type)', '(not named)', 'passed']);
  assert.deepEqual(DEFAULTS, { maxEscape: '2', maxFalseReject: '5', minRepeatability: '95', minDefects: '30', minGood: '30' });
  assert.match(BEST, /no standard sets it/);
  assert.match(NOTICE, /It never looks at an image\./);
  assert.match(NOTICE, /The numbers are only as good as the labels and the sample\./);
  assert.match(NOTICE, /It does not replace a formal measurement system analysis or gauge study, and it is not a certification\./);
  assert.match(NOT_A, /not a certification/);
});
