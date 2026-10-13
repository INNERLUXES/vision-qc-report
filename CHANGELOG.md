# Changes

## 1.0.0

First release.

- Checks a vision inspection station against a labelled set of parts. Reads two tables (CSV or TSV, a header row and one row for
  each label or each result): the labels people gave the parts and the pass and fail results of the station on the same parts. It
  never reads an image. The numbers are only as good as the labels and the sample; the tool is arithmetic on what the files say,
  it does not replace a formal measurement system analysis or gauge study, and it is not a certification. It contacts nothing over
  the network, runs nothing, needs no key, follows no symbolic link, reads no clock and writes nothing to disk.
- Columns that the tool names itself (no standard fixes them), documented in docs/inputs.md. Labels: `part_id`, `label`,
  `defect_type`, `labeler` and `note`. Results: `part_id`, `run`, `verdict`, `defect_type`, `score` and `station`. A column is
  found by its name with case and separators ignored.
- The escape rate (defect parts the station passed over all defect parts) and the false reject rate (good parts it failed over all
  good parts), each per run and over the majority verdict of each part, where a tie between pass and fail counts against the
  station; the detection rate and the confusion matrix for each defect type, with a column for failed runs that name no type and
  one for passed runs; repeatability, with the parts whose runs disagreed listed with their runs; and the rates for each station.
- `--threshold-sweep`: the escape rate and the false reject rate at every distinct score of the results, sorted, with the rows that
  are within both limits marked, and `--score-direction` for a score that points the other way.
- Acceptance limits `--max-escape` (default 2 percent), `--max-false-reject` (default 5 percent) and `--min-repeatability`
  (default 95 percent), each a plain decimal checked against its range, compared exactly; the run fails when one is broken. A limit
  on a rate that cannot be measured is not met. `--min-defects` and `--min-good` (default 30 each) set the sample size below
  which a warning says plainly that rates on so few parts mislead.
- Exact arithmetic with BigInt for every rate, limit and score, rounded half up to two decimals only when shown. No floating point
  number is used anywhere.
- Several labelers for one part, with a majority rule that is said in the report: the label with more votes wins, a tie between
  good and defect leaves the part out of every rate, and the type with more votes wins among the defect votes.
- A strict reader of CSV and TSV of its own, with no dependency and no recursion, with the line and column of every cell; the
  bounded reading of a file and the decimal reader of the sibling tools. The results are kept as columns of numbers, so a million
  rows are read in a few seconds.
- A search for keys and seeds in every column name and every long cell of both files, with the shapes of the sibling tools: each
  one found is an error whose value is left out of every check and never shown.
- Twenty-two checks in two levels, each marked as a check of a file, of a record, of a part or of a metric, each a best practice
  of the tool and saying so: `file-unreadable`, `column-missing`, `column-unknown`, `column-duplicate`, `row-malformed`,
  `cell-missing`, `label-invalid`, `verdict-invalid`, `run-invalid`, `score-invalid`, `secret-in-file`, `defect-type-on-good`,
  `defect-type-missing`, `label-duplicate`, `label-conflict`, `run-sequence`, `result-without-label`, `label-without-result`,
  `escape-above-limit`, `false-reject-above-limit`, `repeatability-below-limit` and `sample-small`.
- Reports as text, markdown, JSON, SARIF 2.1.0 (for the findings that are in a file, with line and column) and JUnit XML (one test
  case for each acceptance limit); `--min-severity`, `--fail-on`, `--list-checks` and `--explain <id>` with what a check looks at,
  why it exists, what to change and what it cannot see. Exit code `0` when no finding is at or above the fail-on level, `1` when
  one is, `2` for a usage or input error, with no result.
- Made-up examples: a stamped-bracket station with 40 good and 40 defect parts, three runs each, that passes every default limit,
  and one with a mistake of every check but `file-unreadable` that breaks every limit, with their real output in all formats, a
  threshold sweep, the list of checks and the explanation of a check.
- Release packages come with a CycloneDX SBOM, SHA-256 checksums and a build provenance attestation, after the SSDF gate of the
  repository.
