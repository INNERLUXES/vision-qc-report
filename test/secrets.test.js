import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SECRET_KEYS, cellAt, findSecrets, isSecretKey, readTable, secretShape } from '../src/index.js';
import { ARGS, GOOD, bench, labelsOf, lineOf, resultsOf, run } from './helpers.js';

// The values are built from repeated characters and made-up words, so that no file of the repository holds anything that could
// be a real key or seed.
const MNEMONIC = Array.from({ length: 12 }, (_, i) => `word${'abcdefghijkl'[i]}`.replace(/\d/g, '')).join(' ');
const HEX = 'cd34'.repeat(16);

test('secretShape: a mnemonic, an extended key, a key in hex and a key in WIF, and nothing for ordinary text', () => {
  assert.equal(secretShape(MNEMONIC), 'a mnemonic');
  assert.equal(secretShape(HEX), 'a private key in hex');
  assert.equal(secretShape(`0x${HEX}`), 'a private key in hex');
  assert.equal(secretShape(`xprv${'1'.repeat(100)}`), 'an extended private key');
  assert.equal(secretShape(`5${'1'.repeat(50)}`), 'a private key in WIF');
  assert.equal(secretShape('hairline scratch near the flange of the bracket'), null);
  assert.equal(secretShape(HEX.slice(1)), null);
  assert.equal(secretShape('a'.repeat(5000)), null, 'text past 4000 characters is not looked at');
});

test('isSecretKey: names that stand for a seed or a key, with case and separators ignored', () => {
  for (const name of ['mnemonic', 'Seed Phrase', 'private_key', 'PASSWORD', 'secret-key', 'xprv']) assert.equal(isSecretKey(name), true, name);
  for (const name of ['part_id', 'defect_type', 'note', 'verdict']) assert.equal(isSecretKey(name), false, name);
  assert.ok(SECRET_KEYS.includes('mnemonic'));
});

test('findSecrets: a column named for a key and a long cell shaped like one are marked, with their line and column, and no value in the message', () => {
  const text = `part_id,password,note\nG1,x,short\nG2,y,${HEX}\n`;
  const t = readTable(text);
  const found = findSecrets(t, cellAt);
  assert.deepEqual(found.map((f) => [f.line, f.column]), [[1, 9], [3, 6]]);
  assert.ok(found.every((f) => !f.message.includes(HEX)));
  assert.ok(t.secretColumns.has(1));
  assert.ok(t.rows[1].secrets.has(2));
  assert.deepEqual(findSecrets(readTable(`part_id,note\nG1,${HEX}\n`), cellAt, new Set([1])), []);
});

test('a mnemonic in a note of the labels file is a secret-in-file error with its place; the value is in no format', async () => {
  const labels = labelsOf([['G1', 'good', '', 'a', MNEMONIC], ['D1', 'defect', 'scratch', 'a', '']]);
  const results = resultsOf([['G1', '1', 'pass', '', '', ''], ['D1', '1', 'fail', 'scratch', '', '']]);
  const files = { 'labels.csv': labels, 'results.csv': results };
  const text = await run(files, [...ARGS, '--min-defects', '0', '--min-good', '0']);
  assert.match(text.out, new RegExp(`ERROR {4}secret-in-file +labels\\.csv:${lineOf(labels, 'G1')}\\n`));
  assert.match(text.out, /Labels file: A cell of the column "note" is shaped like a mnemonic\. The tool never reads a seed or a key, and the value is not shown\./);
  for (const format of ['text', 'markdown', 'json', 'sarif', 'junit']) {
    const r = await run(files, [...ARGS, '--format', format, '--min-defects', '0', '--min-good', '0']);
    assert.ok(!r.out.includes('wordb') && !r.out.includes(MNEMONIC), format);
  }
});

test('a key in hex in a note of the results file is found; a part id of 64 hex digits is a part id', async () => {
  const labels = labelsOf([[HEX, 'good', '', '', ''], ['D1', 'defect', 'scratch', '', '']]);
  const results = resultsOf([[HEX, '1', 'pass', '', '', ''], ['D1', '1', 'fail', 'scratch', '', `${HEX}`]]);
  const r = await run({ 'labels.csv': labels, 'results.csv': results }, [...ARGS, '--min-defects', '0', '--min-good', '0']);
  const found = r.out.split('\n').filter((l) => l.includes('secret-in-file') && l.startsWith('  ERROR'));
  assert.equal(found.length, 1, 'only the station cell');
  assert.match(found[0], new RegExp(`results\\.csv:${lineOf(results, 'D1')}`));
  assert.ok(!r.out.includes(HEX));
  assert.match(r.out, /parts: 2 labelled \(1 good, 1 defect\), 2 measured/);
});

test('a column named for a key is a finding of its own, and the values under it are left out as if they were empty', async () => {
  const b = bench({ good: 2, defect: 2 });
  const labels = b.labels.replace('part_id,label,defect_type,labeler,note', 'part_id,label,defect_type,labeler,password').replace(/\n(G1),good,,,/, '\n$1,good,,,hunter2');
  const r = await run({ 'labels.csv': labels, 'results.csv': b.results }, [...ARGS, '--min-defects', '0', '--min-good', '0']);
  assert.match(r.out, /secret-in-file +labels\.csv:1\n/);
  assert.match(r.out, /The file holds the column "password"|Labels file: The file holds the column "password"/);
  assert.ok(!r.out.includes('hunter2'));
  assert.match(r.out, /parts: 4 labelled/);
});

test('a clean pair of files has no secret-in-file finding', async () => {
  const r = await run(GOOD, ARGS);
  assert.doesNotMatch(r.out, /\n {2}ERROR +secret-in-file/);
  assert.match(r.out, /secret-in-file +error +record +0/);
});
