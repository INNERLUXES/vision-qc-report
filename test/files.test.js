import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, symlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { FILE_LIMITS, InputError, checkFiles, decode, displayPath, locateInput, readInputText } from '../src/index.js';
import { ARGS, GOOD, bench, cli, run, table, withFiles } from './helpers.js';

test('decode: UTF-8 with and without a byte order mark, and UTF-16 in both byte orders', () => {
  assert.equal(decode(Buffer.from('a,b\n')), 'a,b\n');
  assert.equal(decode(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('"\u00e9"', 'utf16le')])), '"\u00e9"');
  const be = Buffer.from('a,b', 'utf16le').swap16();
  assert.equal(decode(Buffer.concat([Buffer.from([0xfe, 0xff]), be])), 'a,b');
});

test('decode: the byte order mark of UTF-8 is dropped', () => {
  assert.equal(decode(Buffer.from([0xef, 0xbb, 0xbf, 0x61, 0x62])), 'ab');
});

test('decode: a null byte, bytes that are not UTF-8, an odd number of UTF-16 bytes and a lone UTF-16 surrogate are refused', () => {
  assert.throws(() => decode(Buffer.from([0x61, 0x00, 0x62])), /null byte/);
  assert.throws(() => decode(Buffer.from([0xc3, 0x28])), /not valid UTF-8/);
  assert.throws(() => decode(Buffer.from([0xff, 0xfe, 0x61])), /odd number of bytes/);
  assert.throws(() => decode(Buffer.from([0xff, 0xfe, 0x00, 0xd8])), /not valid UTF-16/);
});

test('displayPath: relative with forward slashes inside the folder, and the whole path outside it', () => {
  const base = resolve('/work/project');
  assert.equal(displayPath(resolve(base, 'station/labels.csv'), base), 'station/labels.csv');
  const outside = resolve(base, '..', 'elsewhere', 'labels.csv');
  assert.ok(!displayPath(outside, base).includes('\\'));
  assert.ok(displayPath(outside, base).endsWith('elsewhere/labels.csv'));
});

test('locateInput: a file is read; a folder and a missing path are refused', async () => {
  await withFiles({ 'a/labels.csv': GOOD['labels.csv'] }, async (dir) => {
    assert.equal(await locateInput('a/labels.csv', dir), resolve(dir, 'a/labels.csv'));
    await assert.rejects(locateInput('a', dir), /is a folder; give the records file/);
    await assert.rejects(locateInput('missing.csv', dir), /does not exist/);
    await assert.rejects(locateInput('a/labels.csv/x', dir), /does not exist/);
  });
});

test('absolute paths are used as they are, with resolve() and not a join', async () => {
  await withFiles(GOOD, async (dir) => {
    const r = await cli([resolve(dir, 'labels.csv'), resolve(dir, 'results.csv')], process.cwd());
    assert.equal(r.code, 0, r.err);
  });
});

test('a file over the size limit is refused before it is read, and the limit is in the error', async () => {
  await withFiles(GOOD, async (dir) => {
    await assert.rejects(checkFiles({ labelsPath: 'labels.csv', resultsPath: 'results.csv', version: '0', base: dir, limits: { maxBytes: 100 } }), (e) => e instanceof InputError && /larger than 100 bytes/.test(e.message));
  });
  assert.ok(FILE_LIMITS.maxBytes >= 1024 * 1024);
});

test('a problem with each file is reported, so a run that cannot read both says so for both', async () => {
  const r = await run({}, ['nolabels.csv', 'noresults.csv']);
  assert.equal(r.code, 2);
  assert.match(r.err, /no result, the input has problems:\n {2}nolabels\.csv: does not exist\n {2}noresults\.csv: does not exist/);
  assert.equal(r.out, '');
  const one = await run({ 'labels.csv': GOOD['labels.csv'] }, ['labels.csv', 'noresults.csv']);
  assert.match(one.err, /a problem:\n {2}noresults\.csv: does not exist/);
});

test('the same file given as both inputs is refused', async () => {
  const r = await run(GOOD, ['labels.csv', 'labels.csv']);
  assert.equal(r.code, 2);
  assert.match(r.err, /the labels file and the results file are the same file/);
  const other = await run(GOOD, ['labels.csv', './labels.csv']);
  assert.match(other.err, /the same file/);
});

test('a binary file, and bytes that are not UTF-8, are an input error with exit code 2 and no report', async () => {
  const bin = await run({ ...GOOD, 'labels.csv': Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]) }, ARGS);
  assert.equal(bin.code, 2);
  assert.match(bin.err, /labels.csv: holds a null byte/);
  assert.equal(bin.out, '');
  const bad = await run({ ...GOOD, 'results.csv': Buffer.from([0x61, 0xc3, 0x28, 0x62]) }, ARGS);
  assert.equal(bad.code, 2);
  assert.match(bad.err, /results.csv: is not valid UTF-8/);
});

test('an empty file, and a file that is not a table, are an error finding, not a pass', async () => {
  const r = await run({ ...GOOD, 'labels.csv': '' }, ARGS);
  assert.equal(r.code, 1);
  assert.match(r.out, /ERROR {4}file-unreadable +labels\.csv:1\n/);
  assert.match(r.out, /The labels file is not a table the reader can follow: The file holds no text to read as a table/);
  assert.match(r.out, /\nparts: no rate was worked out because a file could not be read\n/);
  assert.match(r.out, /note: no rate was worked out because a file could not be read/);
  const open = await run({ ...GOOD, 'results.csv': 'part_id,verdict\nq1,"5\n' }, ARGS);
  assert.equal(open.code, 1);
  assert.match(open.out, /The results file is not a table the reader can follow: The quote that opens the cell was never closed; the file ends inside it\. Nothing was worked out\./);
  const header = await run({ ...GOOD, 'results.csv': 'part_id,verdict\n' }, ARGS);
  assert.equal(header.code, 1);
  assert.match(header.out, /The results file holds a header and no rows/);
  const semicolons = await run({ ...GOOD, 'labels.csv': 'part_id;label\nG1;good\n' }, ARGS);
  assert.match(semicolons.out, /separated by semicolons/);
});

test('a file that lacks a needed column is an error finding that stops the rates, in each file', async () => {
  const noLabel = await run({ ...GOOD, 'labels.csv': 'part_id,defect_type\nG1,\n' }, ARGS);
  assert.equal(noLabel.code, 1);
  assert.match(noLabel.out, /The header of the labels file has no "label" column, which every row needs\. Nothing was worked out\./);
  const noVerdict = await run({ ...GOOD, 'results.csv': 'part_id,run\nG1,1\n' }, ARGS);
  assert.match(noVerdict.out, /The header of the results file has no "verdict" column/);
  const both = await run({ ...GOOD, 'results.csv': 'run\n1\n' }, ARGS);
  assert.match(both.out, /has no "part_id" and "verdict" column/);
  assert.doesNotMatch(both.out, /\nRates\n/);
});

test('UTF-8 with a byte order mark and UTF-16 with one give the same report as the plain files', async () => {
  const b = bench({ good: 3, defect: 3, runs: 2, escapes: ['D1:2'] });
  const plain = { 'labels.csv': `${b.labels}G9,good,,,caf\u00e9\n`, 'results.csv': `${b.results}G9,1,pass,,,\n` };
  const withBom = (t) => Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(t)]);
  const le = (t) => Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(t, 'utf16le')]);
  const be = (t) => Buffer.concat([Buffer.from([0xfe, 0xff]), Buffer.from(t, 'utf16le').swap16()]);
  const shape = (r) => r.out.split('\n').filter((l) => !/^(labels|results): /.test(l)).join('\n');
  const base = await run(plain, ARGS);
  for (const encode of [withBom, le, be]) {
    const r = await run({ 'labels.csv': encode(plain['labels.csv']), 'results.csv': encode(plain['results.csv']) }, ARGS);
    assert.equal(shape(r), shape(base));
  }
});

test('LF, CRLF and CR line ends give the same report', async () => {
  const b = bench({ good: 3, defect: 3, runs: 2, escapes: ['D1:2'] });
  const base = await run({ 'labels.csv': b.labels, 'results.csv': b.results }, ARGS);
  for (const end of ['\r\n', '\r']) {
    const r = await run({ 'labels.csv': b.labels.replace(/\n/g, end), 'results.csv': b.results.replace(/\n/g, end) }, ARGS);
    assert.equal(r.out.replace(/\(CSV, \d+ lines, [\d,]+ bytes\)/g, ''), base.out.replace(/\(CSV, \d+ lines, [\d,]+ bytes\)/g, ''));
  }
});

test('a file with another extension is still read as a table, and a file with tabs as TSV', async () => {
  const b = bench({ good: 2, defect: 2 });
  const r = await run({ 'labels.txt': b.labels, 'results.txt': b.results }, ['labels.txt', 'results.txt', '--min-defects', '0', '--min-good', '0']);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /\nlabels: labels\.txt \(CSV, /);
  const tabs = await run({ 'labels.tsv': b.labels.replace(/,/g, '\t'), 'results.tsv': b.results.replace(/,/g, '\t') }, ['labels.tsv', 'results.tsv', '--min-defects', '0', '--min-good', '0']);
  assert.equal(tabs.code, 0, tabs.out);
  assert.match(tabs.out, /\nlabels: labels\.tsv \(TSV, /);
  assert.match(tabs.out, /\nresults: results\.tsv \(TSV, /);
  assert.match((await run({ 'l.csv': table(['part_id', 'label'], [['G1', 'good']]), 'r.csv': table(['part_id', 'verdict'], [['G1', 'pass']]) }, ['l.csv', 'r.csv', '--min-good', '0', '--min-defects', '0'])).out, /\nlabels: l\.csv \(CSV, 2 lines, /);
});

test('a symbolic link is refused by name, not followed', { skip: process.platform === 'win32' ? 'creating symbolic links needs a privilege on Windows' : false }, async () => {
  await withFiles({ 'real/labels.csv': GOOD['labels.csv'], 'real/results.csv': GOOD['results.csv'] }, async (dir) => {
    await mkdir(resolve(dir, 'linked'));
    await symlink(resolve(dir, 'real/labels.csv'), resolve(dir, 'linked/labels.csv'));
    const r = await cli(['linked/labels.csv', 'real/results.csv'], dir);
    assert.equal(r.code, 2);
    assert.match(r.err, /symbolic link/);
    const c = await cli(['real/labels.csv', 'linked/labels.csv'], dir);
    assert.equal(c.code, 2);
    assert.match(c.err, /symbolic link/);
  });
});

test('a device is refused as not a regular file', { skip: process.platform === 'win32' ? 'there is no /dev/null on Windows' : false }, async () => {
  const r = await cli(['/dev/null', '/dev/null'], process.cwd());
  assert.equal(r.code, 2);
  assert.match(r.err, /not a regular file/);
});

test('readInputText reads a file through a handle and reports its size in bytes', async () => {
  await withFiles({ 'labels.csv': 'caf\u00e9\n' }, async (dir) => {
    const r = await readInputText(resolve(dir, 'labels.csv'), dir);
    assert.equal(r.text, 'caf\u00e9\n');
    assert.equal(r.bytes, 6);
  });
});
