# Method

vision-qc-report is arithmetic on the pass and fail results of a vision station and the labels people gave the same parts, read
from two tables. This document says what each step reads, in which order the work is done, how each number is worked out, and
what each of the 22 checks looks at and cannot see. No standard sets any check; every one is a best practice of this tool, and
`--explain <id>` says so.

## The order of the work

1. **Read the two files** through the bounded reader: a regular file of at most 128 MB, UTF-8 or UTF-16, no link followed. A
   problem with either file is reported for both before anything is worked out.
2. **Read the labels.** Each row becomes a label, or a finding and no label. A row with the wrong number of cells, an empty needed
   cell, or a label that is not good or defect is left out and reported. A good part with a defect type has its type ignored and
   is reported.
3. **Read the results.** Each row becomes a result, or a finding and no result. A row with the wrong number of cells, an empty
   needed cell, a run that is not a whole number or a verdict that is not pass or fail is left out and reported. A score that is
   not a plain decimal is reported and read as no score.
4. **Search both files for keys and seeds** (`secret-in-file`). A cell that is shaped like one is read as empty, and its value is
   never shown.
5. **Settle the label of each part** (below).
6. **Check the run numbers of each part.** A run number used twice leaves the later row out. A gap, or a first run above 1, is
   reported and the rows are kept.
7. **Match the parts of the two files** and report the parts that have only one side.
8. **Count** the runs of every measured part and work out the rates.
9. **Compare the rates with the limits** exactly, and check the size of the sample.
10. **Write the report** in the format asked for, and exit `0`, `1` or `2`.

## The label of a part

A part may be labelled by more than one labeler. Each labeler gives one label to a part; a second row from the same labeler
(two rows with no labeler count as the same labeler) is a `label-duplicate`, and the later row is left out. Then:

- the votes are counted: the label with more votes is the label of the part;
- a tie between good and defect leaves the part out of every rate, and it is counted in a note;
- for a part labelled defect, the defect type with more votes among the defect votes is its type, a defect vote with no type
  does not vote, and a tie between types leaves the part with no type (it is counted in the escape rate and in the row
  `(no type)` of the matrix);
- a disagreement on the label or on the type is a `label-conflict` warning that names who said what, on which line, and what the
  rule decided.

The tool does not weigh the experience of a labeler. A majority of two against one is a majority.

## The numbers

Everything is a count of runs or of parts, and every rate is a count over a count, worked out with whole numbers.

- **Escape rate, per run.** Runs of defect parts that passed, over all runs of defect parts.
- **Escape rate, majority verdict.** Each defect part counts once, by the verdict of most of its runs. A part whose runs tie
  between pass and fail counts as an escape: a station that does not clearly reject a defect has not rejected it.
- **False reject rate, per run.** Runs of good parts that failed, over all runs of good parts.
- **False reject rate, majority verdict.** Each good part counts once. A part whose runs tie counts as a false reject: a station
  that does not clearly accept a good part has not accepted it.
- **Detection rate for each defect type.** Runs of parts labelled with the type that failed, over all their runs. With it, the
  share of those runs that the station named with the same type.
- **Confusion matrix.** One row for each labelled type (sorted by name), a row `(no type)` for defects with no type and a row
  `(good part)`; one column for each type that the labels or the station name (sorted by name), `(not named)` for a failed run
  with no type, and `passed`. Each cell is a count of runs. Types are compared without regard to case and runs of white space,
  and are shown as the labels spell them.
- **Repeatability.** Of the parts that have more than one run, the share whose runs all gave the same verdict. The parts whose
  runs disagreed are listed with their runs, in order, and the line of the first row (the first 1,000 are listed; the rest are
  counted). A part with one run is not counted either way.
- **Rates for each station**, when any row names one: the per-run escape rate and false reject rate of the rows of each station.
- **Threshold sweep**, with `--threshold-sweep`: for each distinct score of the runs of measured parts, the escape rate and the
  false reject rate if the station had failed every run with a score at or above it (at or below it with
  `--score-direction low`). The escape rate is over the runs of defect parts that have a score, and the false reject rate over
  the runs of good parts that have a score. A row is marked when both rates are within the limits, to help pick a threshold. The
  sweep lists at most 100,000 distinct scores; more is refused, and the message says to round the scores.

A rate is shown as a percent with two decimals, rounded half up only when it is shown. It is compared with its limit exactly:
the limit is a decimal read from its characters, and the comparison is `count * 100 * 10^scale` against `limit * of`, with
BigInt. 1 of 50 is exactly 2 percent and is not above a limit of 2; 1 of 49 is above it.

## The limits

| Limit | Default | The run fails when |
| --- | --- | --- |
| `--max-escape` | 2 percent | the escape rate, per run or by majority verdict, is above it |
| `--max-false-reject` | 5 percent | the false reject rate, per run or by majority verdict, is above it |
| `--min-repeatability` | 95 percent | repeatability is below it |
| `--min-defects` | 30 | (a warning) fewer defect parts were measured |
| `--min-good` | 30 | (a warning) fewer good parts were measured |

A limit on a rate that cannot be measured is not met: with no defect part measured, the escape limit fails; with no good part,
the false reject limit fails. Repeatability cannot be measured when no part has more than one run: then it is skipped and noted
when `--min-repeatability` was not given, and fails when it was.

The defaults are the choice of this tool. They are not a standard and not advice; a line sets its own limits from what an escape
and a false reject cost it.

## The checks

Each check has a level (`error` or `warning`) and a kind: `file` (the columns of a file, or a file the reader cannot follow),
`record` (one row), `part` (one part across rows or across the two files) and `metric` (a rate against a limit, or the size of
the sample). `--list-checks` prints them, and `--explain <id>` says what a check looks at, what to change, why it exists and what
it cannot see.

| Check | What it looks at |
| --- | --- |
| `file-unreadable` | a file that is not a table the reader can follow, holds no rows, or lacks part_id and label (labels) or part_id and verdict (results) |
| `column-missing` | an optional column that the report can use: defect_type (either file), run (results), score (results, only with the sweep) |
| `column-unknown` | a column the tool does not read, with the nearest name |
| `column-duplicate` | a column written twice; only the first is read |
| `row-malformed` | a row with more or fewer cells than the header |
| `cell-missing` | an empty part_id, label, run (when the column is there) or verdict |
| `label-invalid` | a label that is not good or defect |
| `verdict-invalid` | a verdict that is not pass or fail |
| `run-invalid` | a run that is not a whole number from 1 to 9,999,999 |
| `score-invalid` | a score that is not a plain decimal |
| `secret-in-file` | a column named for a key or a seed, or a cell shaped like one |
| `defect-type-on-good` | a defect type on a part labelled good |
| `defect-type-missing` | a part labelled defect with no type, when the column is there |
| `label-duplicate` | the same labeler twice for a part |
| `label-conflict` | labelers who disagree; the majority rule decides |
| `run-sequence` | runs that do not go from 1 to n, or a run number used twice |
| `result-without-label` | a part with results and no label |
| `label-without-result` | a labelled part with no usable result |
| `escape-above-limit` | the escape rate above `--max-escape`, or not measurable |
| `false-reject-above-limit` | the false reject rate above `--max-false-reject`, or not measurable |
| `repeatability-below-limit` | repeatability below `--min-repeatability`, or not measurable when the limit was given |
| `sample-small` | fewer than `--min-defects` defect parts or `--min-good` good parts |

An error finding makes the run fail at the default `--fail-on error`. The warnings (`column-missing`, `defect-type-missing`,
`label-conflict`, `sample-small`) fail it only with `--fail-on warning`.

## What the formats show

Text and markdown show everything. JSON holds every number. SARIF shows only the findings that are in a file, with their line and
column: the findings about a rate have no place in a file and are left out. JUnit shows one test case for each limit: the escape
limit, the false reject limit and the repeatability limit, as a pass, a failure, a skip or, when a file could not be read, an
error.
