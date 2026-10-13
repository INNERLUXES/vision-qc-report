# Limits

vision-qc-report is arithmetic on the pass and fail results of a station and the labels of the same parts, read from two tables.
It never looks at an image. The numbers are only as good as the labels and the sample. It does not replace a formal measurement
system analysis or gauge study, and it is not a certification. This document says what that means: what the tool cannot see,
where the numbers can mislead, and the limits of the work it does.

## What a clean result means

A run with no finding at or above the fail-on level means that, in the two files, every row could be read, the parts of the two
files match, the escape rate, the false reject rate and repeatability are within the limits that were set, and the sample is not
below the size that was asked for. It does not mean that the station is good, that the line will see the same rates, or that
the station is accepted by anyone. The tool reports numbers against limits; the decision is a person's.

## What the numbers depend on

- **The labels.** The tool trusts them. If people called a good part a defect, the station gets a false reject for passing it, and
  if they called a defect good, the station gets credit for passing it. Labels from one person are one opinion; the majority rule
  counts votes and does not know who is right.
- **The sample.** A rate is the rate over the parts in the files. Ten defect parts with no escape do not show that the escape rate
  is low: they show that none of ten escaped. The `sample-small` warning asks for 30 of each side by default, and 30 is not a
  proof of anything either. The tool does not compute a confidence interval, and does not say how many parts an acceptance
  needs.
- **Whether the parts are the ones the line makes.** The tool cannot see how the parts were chosen. A set of obvious defects gives a
  low escape rate and says nothing about the faint ones, and a set of clean parts gives a low false reject rate and says nothing
  about the parts that vary.
- **Whether the runs are independent.** Three runs of one part in one fixture on one afternoon agree more than three runs on
  three days. The tool counts the runs it is given.

## What the tool is not

- **Not a measurement system analysis or a gauge study.** It does not compute gauge repeatability and reproducibility, bias,
  linearity or stability, and its repeatability is the share of parts whose runs gave the same verdict, which is a count and not
  a variance component. A formal study of an inspection system is a different piece of work, done by a person with the
  procedure of their own quality system.
- **Not a certification.** Nothing in the output says that a station meets a standard, a customer requirement or a regulation.
- **Not a look at the images.** It cannot tell why a part failed, whether the image was sharp, or whether a defect is in the field
  of view.
- **Not a model evaluation.** The score of a station is read as a number for the sweep. The tool does not know what produced it.

## What the tool cannot see

- **Names that differ.** `G-007` and `G007` are two parts, and one person under two names is two labelers. A part id that is
  written differently in the two files is reported as a result without a label and a label without a result.
- **A score that means something else.** The sweep reads a higher score as more defect-like (or lower, with
  `--score-direction low`). A station whose score is a confidence in "good" needs `--score-direction low`. The tool cannot tell
  which way a score points; the sweep with the wrong direction is a mirror image.
- **A threshold it did not see.** The sweep lists each distinct score as a threshold at which a run fails when its score is at or
  above it. If the station also uses other rules, the verdicts in the file are not a function of the score, and the sweep and the
  verdicts will not agree. The tool does not compare them.
- **A verdict that is not pass or fail.** A hold, a review and a rework must be written as a fail by whoever prepares the file.
- **Secrets in other shapes.** The search for keys and seeds knows a few shapes: a mnemonic of 12, 15, 18, 21 or 24 words of
  three to eight lowercase letters, an extended private key, a private key of 64 hex digits (a part id of 64 hex digits is read
  as a part id), a private key in WIF, and a column named for a key or a seed. It does not find a token, a password in a cell
  or a key of another shape. A cell shorter than 47 characters is not looked at.
- **Whether a row was lost.** The tool reports the rows that are in the file. It cannot tell a part that was never run from a row
  that was lost on the way into the file, except that a labelled part with no result is reported.

## Limits of the work

| What | Limit |
| --- | --- |
| size of a file | 128 MB |
| rows of a file | 1,200,000 (past it, the file is refused as unreadable) |
| columns of a file | 40 |
| cells of a file | 12,000,000 |
| characters in a cell | 20,000 |
| run number | 9,999,999 |
| digits of a score or a limit | 40 on each side of the point |
| different defect types, and different stations | 200 each (past it, the run stops with exit code `2`) |
| different scores in a sweep | 100,000 (past it, the run stops with exit code `2`) |
| findings of one check listed | 1,000 (the rest are counted and noted) |
| parts with disagreeing runs listed | 1,000 (the rest are counted) |

The reader of tables, the grouping of rows by part and the checks work through loops and maps; nothing calls itself, no pattern
is built from a file or an argument, and a million rows are read in a few seconds. A file past a limit is refused or noted, never
read in part without a word.
