# Inputs

vision-qc-report reads two tables. The first holds the labels that people gave a set of parts. The second holds the pass and
fail results of an inspection station on the same parts. The tool never reads an image and never runs the station: it only
reads the two tables. This document lists the formats, every column of both files, how the parts of the two files are matched,
and a short pair of files that passes every check.

## Two tables, in CSV or TSV

Each file is a header row and one row for each label or each result. The delimiter is a tab when the first line has tabs
outside quotes and at least as many as commas, else a comma. A cell that holds a comma, a tab, a quote or a line end is written
in double quotes, with a quote inside it written as two. A first line separated by semicolons is refused with a message.

Both files are read as UTF-8 (a byte order mark is dropped) or as UTF-16 with a byte order mark, with LF, CRLF or CR line ends.
A file that holds a null byte, is not valid text, is a link, a folder or a device, or is larger than 128 MB, is refused with
exit code `2` and no report. A table has at most 1,200,000 rows, 40 columns, 12,000,000 cells, and 20,000 characters in a cell.

A column is found by its name with case and separators ignored: `Part ID`, `part-id` and `part_id` are one column. A column the
tool does not read is reported (`column-unknown`) with the nearest name; a column written twice is reported
(`column-duplicate`) and only the first is read.

## The labels file

The labels are what people decided about each part: good, or defect and what kind. Two or more people may label the same part,
each in a row of their own.

| Column | Needed | What it holds |
| --- | --- | --- |
| `part_id` | yes | the name of the part; the same text as in the results file, compared without regard to case and runs of white space |
| `label` | yes | `good` or `defect`, in any case; nothing else |
| `defect_type` | no | the kind of defect (scratch, dent, missing-hole, burr), for a part labelled defect; empty on a good part. Without the column there are no rates for each defect type (`column-missing`) |
| `labeler` | no | who gave the label; an empty cell is a labeler with no name. A labeler gives one label to a part |
| `note` | no | free text for the reader; it is kept and never compared |

When two labelers disagree, the majority rule decides (docs/method.md): the label with more votes wins, a tie between good and
defect leaves the part out of every rate, and among the defect votes the type with more votes wins and a tie leaves the part with
no type. Every disagreement is a `label-conflict` warning.

## The results file

The results are what the station decided about each part, one row for each run. A part may be run more than once; the runs
of one part are what repeatability is made of.

| Column | Needed | What it holds |
| --- | --- | --- |
| `part_id` | yes | the name of the part, the same as in the labels file |
| `run` | no | the number of the run on this part: 1, 2, 3 and so on, each once, without a gap. Without the column every row is run 1 (`column-missing`), and a part with more than one row is reported by `run-sequence` |
| `verdict` | yes | `pass` or `fail`, in any case; nothing else. A reject, a rework and a hold are a fail |
| `defect_type` | no | the kind of defect the station named, on a fail. On a pass it is ignored. Without the column the matrix names no reported type (`column-missing`) |
| `score` | no | the defect score of the station for this run: a plain decimal such as `0.82` or `-1.5`, with an optional minus sign, no exponent, no plus sign and no thousands separator. It is used by `--threshold-sweep`, and is asked for only then |
| `station` | no | the station, camera or line that produced the row; the report adds a table of rates for each station when any row names one |

A run with a score is read as a defect score: a higher score means a part more likely to be a defect, and the station fails a
part when its score is at or above its threshold. `--score-direction low` reads it the other way. The tool does not run the
station and does not know its threshold; the sweep lists what each threshold would have given.

## How the two files are matched

Parts are matched by `part_id` as text, without regard to case and runs of white space: `g-007` and ` G-007 ` are one part.
Nothing else is guessed: `G-007` and `G007` are two parts.

- A part in the results with no label is reported (`result-without-label`) and is in no rate.
- A labelled part with no usable result row is reported (`label-without-result`) and is in no rate.
- A part whose labelers tie on good or defect is left out of every rate and counted in a note.
- Every other part is measured: its runs count in the rates.

## What a row needs

A row with the wrong number of cells, an empty needed cell, a label that is not good or defect, a verdict that is not pass or
fail, or a run that is not a whole number from 1 to 9,999,999 is reported and left out. A score that is not a plain decimal is
reported and the row is read without it. Nothing is skipped without a word: every row that is left out is a finding with its
file and line, and is counted in the summary.

## A short pair of files

Two good parts and two defect parts, each run twice. Run with `--min-defects 0 --min-good 0`, because four parts are too few
for the sample-size warning (it asks for 30 of each). The pair passes every check at every level.

Labels:

```csv
part_id,label,defect_type,labeler,note
G1,good,,ann,
G2,good,,ann,
D1,defect,scratch,ann,
D1,defect,scratch,bob,
D2,defect,dent,ann,
```

Results:

```csv
part_id,run,verdict,defect_type,score,station
G1,1,pass,,0.10,cell-1
G1,2,pass,,0.12,cell-1
G2,1,pass,,0.20,cell-2
G2,2,pass,,0.18,cell-2
D1,1,fail,scratch,0.90,cell-1
D1,2,fail,scratch,0.85,cell-1
D2,1,fail,dent,0.70,cell-2
D2,2,fail,dent,0.75,cell-2
```
