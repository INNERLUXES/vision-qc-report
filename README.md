# vision-qc-report

Check a vision inspection station against a labelled set of parts. Give it two tables: the labels that people gave a set of parts
(good, or defect and what kind), and the pass and fail results of the station on the same parts, with repeated runs if there are
any. It reports the escape rate (defect parts the station passed), the false reject rate (good parts it failed), a detection rate
and a confusion matrix for each defect type, and the parts where repeated runs disagreed; with a score column it lists the rates at
every score threshold, to help pick one. It fails the run when a limit you set is broken, so a station can be accepted on numbers.

**The tool never looks at an image: it reads two tables and does arithmetic on them. The numbers are only as good as the labels and
the sample. It does not replace a formal measurement system analysis or gauge study, and it is not a certification.** A clean run
means only that none of the problems of its checks were found in the two files and the rates are within the limits you set. Rates
on a small set mislead, and the tool says so plainly when the set is below 30 defect parts or 30 good parts. Every check is a best
practice of this tool: no standard sets any of them, and the reports say so. It reads the two files you give it and nothing else: it
contacts nothing over the network, runs nothing, needs no key, reads no clock and writes nothing.

The mistakes in an acceptance run tend to be the same: a threshold that catches every defect by failing half the good parts, a
rate worked out on ten defect parts, a part labelled twice with two different answers, results for parts nobody labelled, a station
that gives a different verdict on the second run, and a spreadsheet that was cleaned by hand. They get past a look at the totals and
are cheap to find with two files. This tool reads them on every build and points at the row.

- **Escape rate and false reject rate, exact.** Each is a count over a count, worked out per run and over the majority verdict of
  each part (a tie between pass and fail counts against the station), shown as a percent with two decimals and compared with its
  limit by cross multiplication with BigInt. 1 of 50 is exactly 2 percent; 1 of 49 is above it.
- **A matrix for each defect type.** The labelled type against the type the station named, with a column for failed runs that name
  no type and one for passed runs, and a row for the good parts. The detection rate of each type sits next to it.
- **Repeatability.** The share of the parts with more than one run whose runs all gave the same verdict, and the parts that did
  not, listed with their runs and their line.
- **A threshold sweep.** With `--threshold-sweep` and a `score` column, the escape rate and the false reject rate at every distinct
  score, sorted, with the rows that are within both limits marked.
- **Limits that fail a build.** `--max-escape`, `--max-false-reject` and `--min-repeatability`, plain decimals of percent. A limit
  on a rate that cannot be measured is not met.
- **Checks with ids.** Twenty-two checks, each marked as a check of a file, of a record, of a part or of a metric, each with what it
  looks at, what to change, why it is a check at all and what it cannot see. Each message says what was found and where, as
  file:line.
- **More than one labeler.** A part may be labelled by two people; the label with more votes wins, a tie leaves the part out, and
  every disagreement is a warning that says who said what.
- **A reader of its own.** The CSV and TSV reader keeps the line and column of every cell and refuses what it cannot follow. A row
  that cannot be read or used is an error and is counted as left out; it is never skipped without a word.
- **Keys and seeds, never echoed.** Both files are searched for a column named for a key or a seed and for cells shaped like one;
  only the place is reported, never the value.
- **Bounded work.** A million result rows, a hundred thousand parts with ten runs each, one part with a million runs and numbers of
  thousands of digits all end in good time.
- Reports as text, markdown, JSON, SARIF and JUnit XML (one test case for each limit), with an exit code for a pipeline: `0` no
  finding at or above the `--fail-on` level, `1` a finding at or above it, `2` usage or input error.
- Plain JavaScript, no dependencies, no clock and no network.

```
npm test
```

```
tests 206
pass 204
fail 0
skipped 2
```

These are the summary lines that `npm test` prints at the end on Windows. The skipped tests are the ones that need a symbolic link or
a device (a link to a file, and `/dev/null` named as a file); they are guarded with `process.platform`, run on Linux and macOS, and
none of them asserts a line. `npm run test:coverage` runs the same tests with coverage; their time limits are four times wider when
coverage is on.

## Quick start

Requires Node 22 or newer. There is nothing to install.

```
git clone https://github.com/INNERLUXES/vision-qc-report.git
cd vision-qc-report
node bin/vision-qc-report.js examples/bad/labels.csv examples/bad/results.csv
```

Or without a clone, in your own project:

```
npx --yes github:INNERLUXES/vision-qc-report labels.csv results.csv --max-escape 1 --min-repeatability 98
```

To see the rates at every score threshold of the good example:

```
node bin/vision-qc-report.js examples/good/labels.csv examples/good/results.csv --threshold-sweep
```

To see why a check exists, what it cannot see and what to change:

```
node bin/vision-qc-report.js --explain escape-above-limit
node bin/vision-qc-report.js --list-checks
```

To show each limit as a test in a build system:

```
node bin/vision-qc-report.js labels.csv results.csv --format junit > junit.xml
```

`examples/` holds two made-up stations. The good one, in `examples/good`, is a stamped-bracket inspection station with 40 good and
40 defect parts, three runs each, and four defect types (scratch, dent, missing-hole, burr). It has two labelers on a few parts, a
score and a station for every run, one escape, two false rejects and three parts where the runs disagree, and it passes every
default limit and every check at error, warning and info level. The bad one, in `examples/bad`, is a small set that holds a
mistake of every check but `file-unreadable`, which fires only on a file the reader cannot follow: a column the tool does not read
and one written twice, a results file without a `defect_type` column, a mnemonic that is made up in a note, a good part with a
defect type and a defect with none, a row too short, an empty part id, a label of "maybe", a verdict of "maybe", a run of "two", a
score of "1e-1", a part labelled twice by one labeler, three labelers who disagree and two who tie, runs numbered 1 and 3 and run 2
written twice, a result for a part nobody labelled and a label with no result, and it breaks the escape limit, the false reject
limit and the repeatability limit on a sample of ten parts of each kind.

## Usage

```
vision-qc-report <labels file> <results file> [options]
vision-qc-report --list-checks
vision-qc-report --explain <id>
```

```
--format <name>            text, markdown, json, sarif or junit (default: text)
--json                     the same as --format json
--max-escape <percent>     the highest escape rate that is accepted, from 0 to 100 (default: 2)
--max-false-reject <percent>
                           the highest false reject rate that is accepted, from 0 to 100 (default: 5)
--min-repeatability <percent>
                           the lowest share of the parts with more than one run that gave one verdict every time (default: 95)
--min-defects <number>     the fewest defect parts a sample should hold before its rates are trusted (default: 30)
--min-good <number>        the fewest good parts a sample should hold (default: 30)
--threshold-sweep          list the escape rate and the false reject rate at every distinct score of the results file
--score-direction <name>   high (a run fails at or above the threshold, the default) or low (at or below it)
--min-severity <level>     the lowest level of a finding that is shown: info, warning, error (default: info)
--fail-on <level>          the lowest level of a finding that fails the run: info, warning, error (default: error)
--list-checks              list the checks with their level and kind, and exit
--explain <id>             explain one check: what it looks at, what to change, what it cannot see, and exit
--help                     show the usage
--version                  show the version
```

[docs/inputs.md](docs/inputs.md) lists every column of both files, how the parts of the two files are matched, and a short pair of
files that passes every check. The path in the report is relative to the folder you run the command in, with forward slashes on
every system, followed by the line.

The report of the bad example starts with what was read, the findings in one line, and the rates against their limits:

```
vision-qc-report: examples/bad/labels.csv + examples/bad/results.csv
labels: examples/bad/labels.csv (CSV, 30 lines, 1,023 bytes)
results: examples/bad/results.csv (CSV, 68 lines, 1,839 bytes)
parts: 22 labelled (10 good, 11 defect, 1 tied), 20 measured (10 good, 10 defect)
runs: 58 runs of the measured parts; 67 rows in the results file, 5 left out
findings: 27 (22 error, 5 warning)

Rates

  measure                              count     rate    limit
  escape rate, per run                 8 of 28   28.57%  at most 2%
  escape rate, majority verdict        3 of 10   30.00%  at most 2%
  false reject rate, per run           8 of 30   26.67%  at most 5%
  false reject rate, majority verdict  3 of 10   30.00%  at most 5%
  repeatability                        13 of 20  65.00%  at least 95%
```

The report goes on with the detection rate and the matrix of each defect type, the parts where the runs disagreed and the rates of
each station. The three limits, as the report shows them:

```
Acceptance limits

  limit                                status  detail
  escape rate at most 2 percent        fail    28.57 percent per run (8 of 28 runs of defect parts passed), 30.00 percent by majority verdict (3 of 10 defect parts)
  false reject rate at most 5 percent  fail    26.67 percent per run (8 of 30 runs of good parts failed), 30.00 percent by majority verdict (3 of 10 good parts)
  repeatability at least 95 percent    fail    65.00 percent (13 of 20 parts with more than one run gave the same verdict every time)
```

Then the table of checks with the number of findings of each, and the findings, errors first, each with what to change. Two of them,
as the report shows them:

```
  ERROR    run-sequence               examples/bad/results.csv:47
           The run numbers of the part "B-D05" do not go from 1 to n: the runs of the part are 1 and 3, and run 2 is missing (runs go from 1 to the number of runs without a gap).
           fix: Number the runs of each part 1 to n once each. If a run was repeated by mistake, take the extra row out.
```

```
  WARNING  label-conflict             examples/bad/labels.csv:14
           The labelers of the part "B-D03" disagree: inspector-a says defect (dent) on line 14, inspector-b says good on line 25 and inspector-c says defect (dent) on line 26. The majority label is defect, with the type dent.
           fix: Look at the part again with both labelers and settle the label. The rates depend on it.
```

The end of the report holds the notes, if any, the notice and the result:

```
note: 1 result row was left out because a run number was used twice for a part

This report is arithmetic on the labels and the results in the two files. It never looks at an image. The numbers are only as good as the labels and the sample. It does not replace a formal measurement system analysis or gauge study, and it is not a certification.

RESULT: FAIL - 22 findings at or above error (22 error, 5 warning)
```

The good example passes. Its rates, and the last lines of its report:

```
vision-qc-report: examples/good/labels.csv + examples/good/results.csv
labels: examples/good/labels.csv (CSV, 88 lines, 3,023 bytes)
results: examples/good/results.csv (CSV, 241 lines, 7,798 bytes)
parts: 80 labelled (40 good, 40 defect), 80 measured (40 good, 40 defect)
runs: 240 runs of the measured parts; 240 rows in the results file, 0 left out
findings: 0

Rates

  measure                              count     rate    limit
  escape rate, per run                 1 of 120  0.83%   at most 2%
  escape rate, majority verdict        0 of 40   0.00%   at most 2%
  false reject rate, per run           2 of 120  1.67%   at most 5%
  false reject rate, majority verdict  0 of 40   0.00%   at most 5%
  repeatability                        77 of 80  96.25%  at least 95%
```

```
  none

This report is arithmetic on the labels and the results in the two files. It never looks at an image. The numbers are only as good as the labels and the sample. It does not replace a formal measurement system analysis or gauge study, and it is not a certification.

RESULT: PASS - no finding at or above error
```

The output of both examples in all five formats, a threshold sweep, the list of checks, and the explanation of a check are saved in
`examples/output`.

## How the files are read

1. The paths are resolved against the folder you run the command in. A link, a folder, a device or a file over 128 MB is refused,
   and so is a file that is not UTF-8 (or UTF-16 with a byte order mark) or holds a null byte, with exit code `2` and no report. A
   problem with either file is reported for both.
2. Each file is read as CSV, or as TSV when its first line has tabs, whatever the name of the file. The table reader keeps the line
   and column of every cell, follows double quotes and a line end inside a quoted cell, and refuses a quote that is never closed,
   text after a closing quote and a first line separated by semicolons.
3. A column is found by its name with case and separators ignored. A column the tool does not read is an error with the nearest
   name, a column written twice is an error, and a row with the wrong number of cells, an empty needed cell, a label that is not
   good or defect, a verdict that is not pass or fail or a run that is not a whole number is left out, reported and counted.
4. The label of each part is settled by the majority rule when more than one labeler labelled it. Parts are matched across the two
   files by name, without regard to case and runs of white space.
5. The runs of each part are checked, the rates are worked out from the runs of the measured parts, and each rate is compared with
   its limit exactly.

[docs/method.md](docs/method.md) says what each step reads and how each number is worked out, and [docs/inputs.md](docs/inputs.md)
lists the columns.

## What it checks

| Check | Level | Kind | What it reports |
| --- | --- | --- | --- |
| `file-unreadable` | error | file | a file is not a table the reader can follow (a quote never closed, text after a closing quote, a cell too long, semicolons for commas), holds a header and no rows, or lacks a needed column (part_id and label in the labels file, part_id and verdict in the results file); no rate was worked out |
| `column-missing` | warning | file | a column the tool can use is not in the header: defect_type in either file (no rates for each defect type, or a matrix that names nothing), run in the results file (every row is read as run 1), or score in the results file when --threshold-sweep is asked for; the file is still read |
| `column-unknown` | error | file | a column the tool does not read, often a misspelt name; nothing under it was checked |
| `column-duplicate` | error | file | two columns of one file with the same name once case and separators are ignored; only the first is read |
| `row-malformed` | error | record | a row with more or fewer cells than the header; the row was left out |
| `cell-missing` | error | record | a cell that every row needs is empty: part_id or label in the labels file, part_id, run (when the column is there) or verdict in the results file; the row was left out |
| `label-invalid` | error | record | a label that is not good or defect (written in any case); the row was left out |
| `verdict-invalid` | error | record | a verdict that is not pass or fail (written in any case); the row was left out |
| `run-invalid` | error | record | a run that is not a whole number from 1 to 9,999,999; the row was left out |
| `score-invalid` | error | record | a score that is not a plain decimal such as 0.82 or -1.5 (no exponent, no plus sign, no thousands separator, at most 40 digits on each side of the point); the row is read without its score |
| `secret-in-file` | error | record | a column named for a key or a seed, or a long cell shaped like a mnemonic, an extended private key, a private key in hex or a key in WIF (a part_id of 64 hex digits is read as a part id); the value is left out of every check and never shown |
| `defect-type-on-good` | error | record | a part labelled good that also has a defect type; the type is ignored |
| `defect-type-missing` | warning | record | a part labelled defect with no defect type (when the labels file has the column); it counts in the escape rate and in no defect type |
| `label-duplicate` | error | part | a part labelled twice by the same labeler (two rows with no labeler count as the same labeler); the later row was left out |
| `label-conflict` | warning | part | two or more labelers disagree on a part, on good or defect or on the defect type; the majority rule decides (docs/method.md), and a tie on good or defect leaves the part out of every rate |
| `run-sequence` | error | part | the runs of a part do not go from 1 to n without a gap, or a run number is used twice for a part (the later row was left out) |
| `result-without-label` | error | part | a part has rows in the results file and no label in the labels file; it is in no rate |
| `label-without-result` | error | part | a part is labelled and has no usable row in the results file; it is in no rate (a part whose labelers tie is not reported here) |
| `escape-above-limit` | error | metric | the escape rate (defect parts the station passed over all defect parts), per run or by the majority verdict, is above --max-escape (default 2 percent), or cannot be measured because no defect part has a result; compared exactly |
| `false-reject-above-limit` | error | metric | the false reject rate (good parts the station failed over all good parts), per run or by the majority verdict, is above --max-false-reject (default 5 percent), or cannot be measured because no good part has a result; compared exactly |
| `repeatability-below-limit` | error | metric | the share of the parts with more than one run whose runs all gave the same verdict is below --min-repeatability (default 95 percent), or cannot be measured when the limit was given and no part has more than one run; compared exactly |
| `sample-small` | warning | metric | fewer than --min-defects defect parts (default 30) or fewer than --min-good good parts (default 30) were measured; a rate on so few parts misleads |

A check of a file is about the columns of a file or a file the reader cannot follow, a check of a record is about one row, a check
of a part is about one part across rows or across the two files, and a check of a metric compares a rate with a limit or looks at the
size of the sample. Each check is a best practice of this tool and says so in its reason (`--explain <id>`). Errors make the run
fail by default; warnings are things a reader should see before trusting the rates. [docs/method.md](docs/method.md) describes every
check with what it cannot see.

## What is not checked

- Whether a label is right. The tool counts against the labels in the file; a good part labelled defect gives the station a false
  reject for passing it.
- Whether the sample is the line. A set of staged defects is easier than the faint ones the line makes, and a pass rate on it is
  the rate on that set.
- How many parts an acceptance needs. The warning asks for 30 of each kind by default; that number is a convention and not a proof,
  and the tool computes no confidence interval.
- Anything in the images: why a part failed, whether the picture was sharp, whether a defect was in the field of view.
- Whether the runs are independent, and whether the part was moved between runs.
- Whether the verdicts follow the scores. The sweep reads the scores as a defect score and does not compare them with the verdicts.
- Gauge repeatability and reproducibility, bias, linearity or stability. This is not a measurement system analysis.
- Secrets of shapes other than the few it knows (docs/limits.md), and anything outside the two files.

## Formats

`--format text` (the default) is for a terminal. `--format markdown` is for a job summary or a pull request and escapes what markdown
gives a meaning to. `--json` (or `--format json`) gives one object with the files, the counts, every rate with its counts, the types
and the matrix, the parts where the runs disagreed, the stations, the sweep, the limits with their status, every check with its
number of findings, every finding with its id, level, kind, file, line, column, message, fix and subject, the notes and the result.
`--format sarif` gives SARIF 2.1.0 for code scanning, with one result for each finding that is in a file and its line and column.
`--format junit` gives JUnit XML: one test suite, `acceptance`, with one test case for each limit (a failure carries the numbers); no
time is recorded, because the tool reads no clock. `--list-checks` lists the checks in text, markdown or JSON, and `--explain <id>`
explains one check in the same three forms.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | no finding at or above the `--fail-on` level (default `error`) |
| `1` | a finding at or above the `--fail-on` level |
| `2` | a usage error, or an input the tool cannot read at all (no result) |

A finding below `--min-severity` is not shown but still counts for the result.

## Limits

Each file is read whole, up to 128 MB. A table has at most 1,200,000 rows, 40 columns, 12,000,000 cells and 20,000 characters in a
cell; a file past the rows is refused. At most 200 different defect types and 200 different stations, and 100,000 different scores in
a sweep, are read; past that the run stops with exit code `2`. At most 1,000 findings of one check are listed, and the rest are
counted and noted. The reader, the grouping of rows and the checks work through loops and maps and nothing calls itself.
[docs/limits.md](docs/limits.md) says what the tool cannot see.

## Architecture

| File | What it does |
| --- | --- |
| `src/files.js` | the bounded reading of a file: a regular file, no link, UTF-8 or UTF-16 |
| `src/csv.js` | the CSV and TSV reader with the line and column of every cell |
| `src/read.js` | the columns of the two files, the labels and the results as rows and as columns of numbers |
| `src/analyze.js` | the label of each part, the join of the two files, the counts, the matrix and the stations |
| `src/rate.js`, `src/decimal.js`, `src/score.js` | the rates, the limits and the scores as exact numbers with BigInt |
| `src/sweep.js` | the rates at every distinct score |
| `src/secrets.js` | the search for keys and seeds in both files |
| `src/rules.js`, `src/data.js`, `src/fields.js`, `src/collect.js` | the checks with their levels, fixes and reasons, the notice and the columns |
| `src/check.js`, `src/report.js`, `src/cli.js` | a run, the limits, the formats and the command line |

## Where the ideas come from

Running a station on parts that people have already judged, and counting the parts it passed that were defects and the parts it
failed that were good, is the usual way to learn how an inspection station behaves before it goes on the line, and repeated runs of
the same part are the usual way to see whether it gives the same answer twice. No standard sets the checks or the default limits of
this tool, and the tool quotes none. [docs/context.md](docs/context.md) says what counting against labels is good for and where it
misleads.

## Background

This tool is one of the small open source checks that INNERLUXES publishes next to its work on image analysis. If you are planning a vision system and want to know how it is built, tested and put on a line, the page [Machine Vision Systems and Software Development Services](https://innerluxes.dev/image-analysis/machine-vision) covers that work and points to this tool.

## License

MIT. See [LICENSE](LICENSE).
