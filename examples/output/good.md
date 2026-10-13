# vision-qc-report: examples/good/labels.csv + examples/good/results.csv

- Labels: examples/good/labels.csv \(CSV, 88 lines, 3,023 bytes\)
- Results: examples/good/results.csv \(CSV, 241 lines, 7,798 bytes\)
- Parts: 80 labelled \(40 good, 40 defect\), 80 measured \(40 good, 40 defect\)
- Runs: 240 runs of the measured parts; 240 rows in the results file, 0 left out
- Findings: 0
- Result: **PASS - no finding at or above error**

## Rates

| measure | count | rate | limit |
| --- | --- | --- | --- |
| escape rate, per run | 1 of 120 | 0.83% | at most 2% |
| escape rate, majority verdict | 0 of 40 | 0.00% | at most 2% |
| false reject rate, per run | 2 of 120 | 1.67% | at most 5% |
| false reject rate, majority verdict | 0 of 40 | 0.00% | at most 5% |
| repeatability | 77 of 80 | 96.25% | at least 95% |

A rate is a count over a count, shown as a percent with two decimals and compared with its limit exactly. Per run counts every result row; the majority verdict counts each part once, and a tie between pass and fail counts against the station. Repeatability is the share of the parts with more than one run whose runs all gave the same verdict.

## Defect types

| defect type | parts | runs | detected | detection rate | named as labelled |
| --- | --- | --- | --- | --- | --- |
| burr | 9 | 27 | 27 of 27 | 100.00% | 25 of 27 \(92.59%\) |
| dent | 10 | 30 | 29 of 30 | 96.67% | 27 of 30 \(90.00%\) |
| missing-hole | 9 | 27 | 27 of 27 | 100.00% | 26 of 27 \(96.30%\) |
| scratch | 12 | 36 | 36 of 36 | 100.00% | 34 of 36 \(94.44%\) |

## Confusion matrix

In runs: the rows are what the labels say, the columns what the station reported.

| labelled \\ reported | burr | dent | missing-hole | scratch | \(not named\) | passed |
| --- | --- | --- | --- | --- | --- | --- |
| burr | 25 | 1 | 0 | 0 | 1 | 0 |
| dent | 0 | 27 | 0 | 1 | 1 | 1 |
| missing-hole | 1 | 0 | 26 | 0 | 0 | 0 |
| scratch | 1 | 1 | 0 | 34 | 0 | 0 |
| \(good part\) | 0 | 1 | 0 | 1 | 0 | 118 |

## Parts where the runs disagreed

3 of 80 parts with more than one run.

| Part | Label | Runs | Where |
| --- | --- | --- | --- |
| BRK-G012 | good | run 1 fail, run 2 pass, run 3 pass | examples/good/results.csv:35 |
| BRK-G031 | good | run 1 pass, run 2 pass, run 3 fail | examples/good/results.csv:92 |
| BRK-D017 | defect, dent | run 1 fail, run 2 pass, run 3 fail | examples/good/results.csv:170 |

## Stations

| station | escape rate, per run | false reject rate, per run |
| --- | --- | --- |
| cell-1 | 1 of 60 \(1.67%\) | 1 of 60 \(1.67%\) |
| cell-2 | 0 of 60 \(0.00%\) | 1 of 60 \(1.67%\) |

## Acceptance limits

| limit | status | detail |
| --- | --- | --- |
| escape rate at most 2 percent | pass | 0.83 percent per run \(1 of 120 runs of defect parts passed\), 0.00 percent by majority verdict \(0 of 40 defect parts\) |
| false reject rate at most 5 percent | pass | 1.67 percent per run \(2 of 120 runs of good parts failed\), 0.00 percent by majority verdict \(0 of 40 good parts\) |
| repeatability at least 95 percent | pass | 96.25 percent \(77 of 80 parts with more than one run gave the same verdict every time\) |

## Findings

None.

This report is arithmetic on the labels and the results in the two files. It never looks at an image. The numbers are only as good as the labels and the sample. It does not replace a formal measurement system analysis or gauge study, and it is not a certification.
