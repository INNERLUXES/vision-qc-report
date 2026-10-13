# vision-qc-report: examples/bad/labels.csv + examples/bad/results.csv

- Labels: examples/bad/labels.csv \(CSV, 30 lines, 1,023 bytes\)
- Results: examples/bad/results.csv \(CSV, 68 lines, 1,839 bytes\)
- Parts: 22 labelled \(10 good, 11 defect, 1 tied\), 20 measured \(10 good, 10 defect\)
- Runs: 58 runs of the measured parts; 67 rows in the results file, 5 left out
- Findings: 27 \(22 error, 5 warning\)
- Result: **FAIL - 22 findings at or above error \(22 error, 5 warning\)**

## Rates

| measure | count | rate | limit |
| --- | --- | --- | --- |
| escape rate, per run | 8 of 28 | 28.57% | at most 2% |
| escape rate, majority verdict | 3 of 10 | 30.00% | at most 2% |
| false reject rate, per run | 8 of 30 | 26.67% | at most 5% |
| false reject rate, majority verdict | 3 of 10 | 30.00% | at most 5% |
| repeatability | 13 of 20 | 65.00% | at least 95% |

A rate is a count over a count, shown as a percent with two decimals and compared with its limit exactly. Per run counts every result row; the majority verdict counts each part once, and a tie between pass and fail counts against the station. Repeatability is the share of the parts with more than one run whose runs all gave the same verdict.

## Defect types

| defect type | parts | runs | detected | detection rate | named as labelled |
| --- | --- | --- | --- | --- | --- |
| burr | 2 | 5 | 4 of 5 | 80.00% | 0 of 5 \(0.00%\) |
| dent | 2 | 5 | 4 of 5 | 80.00% | 0 of 5 \(0.00%\) |
| missing-hole | 2 | 6 | 4 of 6 | 66.67% | 0 of 6 \(0.00%\) |
| scratch | 3 | 9 | 5 of 9 | 55.56% | 0 of 9 \(0.00%\) |
| \(no type\) | 1 | 3 | 3 of 3 | 100.00% | n/a |

## Confusion matrix

In runs: the rows are what the labels say, the columns what the station reported.

| labelled \\ reported | burr | dent | missing-hole | scratch | \(not named\) | passed |
| --- | --- | --- | --- | --- | --- | --- |
| burr | 0 | 0 | 0 | 0 | 4 | 1 |
| dent | 0 | 0 | 0 | 0 | 4 | 1 |
| missing-hole | 0 | 0 | 0 | 0 | 4 | 2 |
| scratch | 0 | 0 | 0 | 0 | 5 | 4 |
| \(no type\) | 0 | 0 | 0 | 0 | 3 | 0 |
| \(good part\) | 0 | 0 | 0 | 0 | 8 | 22 |

## Parts where the runs disagreed

7 of 20 parts with more than one run.

| Part | Label | Runs | Where |
| --- | --- | --- | --- |
| B-G05 | good | run 1 fail, run 2 fail, run 3 pass | examples/bad/results.csv:14 |
| B-G06 | good | run 1 fail, run 2 pass, run 3 fail | examples/bad/results.csv:17 |
| B-G07 | good | run 1 pass, run 2 pass, run 3 fail | examples/bad/results.csv:20 |
| B-D03 | defect, dent | run 1 fail, run 2 fail, run 3 pass | examples/bad/results.csv:42 |
| B-D05 | defect, burr | run 1 fail, run 3 pass | examples/bad/results.csv:47 |
| B-D07 | defect, missing-hole | run 1 pass, run 2 fail, run 3 pass | examples/bad/results.csv:52 |
| B-D10 | defect, scratch | run 1 fail, run 2 fail, run 3 pass | examples/bad/results.csv:61 |

## Stations

| station | escape rate, per run | false reject rate, per run |
| --- | --- | --- |
| cell-1 | 4 of 14 \(28.57%\) | 5 of 15 \(33.33%\) |
| cell-2 | 4 of 14 \(28.57%\) | 3 of 15 \(20.00%\) |

## Acceptance limits

| limit | status | detail |
| --- | --- | --- |
| escape rate at most 2 percent | fail | 28.57 percent per run \(8 of 28 runs of defect parts passed\), 30.00 percent by majority verdict \(3 of 10 defect parts\) |
| false reject rate at most 5 percent | fail | 26.67 percent per run \(8 of 30 runs of good parts failed\), 30.00 percent by majority verdict \(3 of 10 good parts\) |
| repeatability at least 95 percent | fail | 65.00 percent \(13 of 20 parts with more than one run gave the same verdict every time\) |

## Findings

| Level | Check | Where | Message |
| --- | --- | --- | --- |
| error | column-unknown | examples/bad/labels.csv:1 | The column "inspector" of the labels file is not a column the tool reads. Nothing under it is checked. Fix: Correct the name to a column of docs/inputs.md, or take the column out of the file. |
| error | column-duplicate | examples/bad/labels.csv:1 | The column "Label" of the labels file has the same name as column 2 once case and separators are ignored; only the first is read. Fix: Take the second column out, or rename it. |
| error | column-unknown | examples/bad/results.csv:1 | The column "status" of the results file is not a column the tool reads. Nothing under it is checked. Fix: Correct the name to a column of docs/inputs.md, or take the column out of the file. |
| error | column-duplicate | examples/bad/results.csv:1 | The column "Run" of the results file has the same name as column 2 once case and separators are ignored; only the first is read. Fix: Take the second column out, or rename it. |
| error | secret-in-file | examples/bad/labels.csv:3 | Labels file: A cell of the column "note" is shaped like a mnemonic. The tool never reads a seed or a key, and the value is not shown. Fix: Treat the value as exposed if it is real: take it out of the file and out of every place the file was copied to. If it is made up, change it. |
| error | defect-type-on-good | examples/bad/labels.csv:6 | The part "B-G05" is labelled good but has the defect type "scratch". The type is ignored; one of the two cells is wrong. Fix: Decide which cell is wrong: take the type out, or change the label to defect. |
| error | row-malformed | examples/bad/labels.csv:28 | The row on line 28 of the labels file has 3 cells but the header has 7; the row was left out. Fix: Put a cell with a comma, a tab or a line end inside double quotes, and give every row one cell for each column of the header. |
| error | cell-missing | examples/bad/labels.csv:29 | The row on line 29 of the labels file has no value under "part\_id", which every row needs; the row was left out. Fix: Fill the cell. A part that was not inspected has no row; it does not get an empty verdict. |
| error | label-invalid | examples/bad/labels.csv:30 | The label of the part "B-X02" is "maybe", which is not good or defect; the row was left out. Fix: Write good or defect. Put what kind of defect it is in defect\_type, and a doubt in note. |
| error | score-invalid | examples/bad/results.csv:13 | The score of the part "B-G04" is "1e-1", which is not a plain decimal such as 0.82 or -1.5 \(no exponent, no plus sign, no separator, at most 40 digits on each side of the point\); the row is read without its score. Fix: Write the score as a plain decimal with a point. |
| error | row-malformed | examples/bad/results.csv:32 | The row on line 32 of the results file has 3 cells but the header has 7; the row was left out. Fix: Put a cell with a comma, a tab or a line end inside double quotes, and give every row one cell for each column of the header. |
| error | cell-missing | examples/bad/results.csv:33 | The row on line 33 of the results file has no value under "verdict", which every row needs; the row was left out. Fix: Fill the cell. A part that was not inspected has no row; it does not get an empty verdict. |
| error | verdict-invalid | examples/bad/results.csv:34 | The verdict of the part "B-G02" is "maybe", which is not pass or fail; the row was left out. Fix: Write pass or fail. A reject, a rework and a hold are a fail; put the reason in defect\_type. |
| error | run-invalid | examples/bad/results.csv:35 | The run of the part "B-G03" is "two", which is not a whole number from 1 to 9,999,999; the row was left out. Fix: Number the runs of a part 1, 2, 3 and so on. |
| error | label-without-result | examples/bad/labels.csv:22 | The part "B-D11" is labelled defect but has no usable row in the results file, so it is in no rate. Fix: Add the result of the station for the part, or take the label out if the part was never inspected. |
| error | label-duplicate | examples/bad/labels.csv:24 | The part "B-D02" is labelled again by the labeler "inspector-a"; the row on line 13 already labels it. The later row was left out. Fix: Keep one row for each part and labeler. Two different labelers may label the same part; give each their name in labeler. |
| error | run-sequence | examples/bad/results.csv:47 | The run numbers of the part "B-D05" do not go from 1 to n: the runs of the part are 1 and 3, and run 2 is missing \(runs go from 1 to the number of runs without a gap\). Fix: Number the runs of each part 1 to n once each. If a run was repeated by mistake, take the extra row out. |
| error | run-sequence | examples/bad/results.csv:67 | The run numbers of the part "B-D04" do not go from 1 to n: run 2 is on line 46 and again on line 67, and the later row was left out. Fix: Number the runs of each part 1 to n once each. If a run was repeated by mistake, take the extra row out. |
| error | result-without-label | examples/bad/results.csv:68 | The part "B-Z99" has 1 row in the results file and no label in the labels file, so it is in no rate. Fix: Label the part, or take its rows out of the results file. Check that the part ids are written the same way in both files. |
| error | escape-above-limit | rates | The escape rate is 28.57 percent per run \(8 of 28 runs of defect parts passed\), 30.00 percent by majority verdict \(3 of 10 defect parts\); the limit is 2 percent and the rate is above it per run and by majority verdict. Fix: Look at the defect parts the station passed, and the threshold or the lighting that let them through. Raise the limit only if the line can accept that rate. |
| error | false-reject-above-limit | rates | The false reject rate is 26.67 percent per run \(8 of 30 runs of good parts failed\), 30.00 percent by majority verdict \(3 of 10 good parts\); the limit is 5 percent and the rate is above it per run and by majority verdict. Fix: Look at the good parts the station failed, and the threshold that rejects them. Raise the limit only if the line can accept the scrap and rework. |
| error | repeatability-below-limit | rates | Repeatability is 65.00 percent \(13 of 20 parts with more than one run gave the same verdict every time\); the minimum is 95 percent. 7 parts had runs that disagreed. Fix: Look at the parts listed in the report where the runs disagreed: part position, lighting, a score close to the threshold. Run the same parts again after a change. |
| warning | column-missing | examples/bad/results.csv:1 | The results file has no "defect\_type" column, so the confusion matrix cannot name what the station reported; a failed run of a defect part counts as "\(not named\)". Fix: Add the column if the station or the labelers have the information \(docs/inputs.md\), or leave it out on purpose and accept what the warning says is lost. |
| warning | defect-type-missing | examples/bad/labels.csv:20 | The part "B-D09" is labelled defect and has no defect type, so it is counted in the escape rate but in no defect type. Fix: Give the defect a type, or accept that it has none. |
| warning | label-conflict | examples/bad/labels.csv:14 | The labelers of the part "B-D03" disagree: inspector-a says defect \(dent\) on line 14, inspector-b says good on line 25 and inspector-c says defect \(dent\) on line 26. The majority label is defect, with the type dent. Fix: Look at the part again with both labelers and settle the label. The rates depend on it. |
| warning | label-conflict | examples/bad/labels.csv:23 | The labelers of the part "B-D12" disagree: inspector-a says defect \(burr\) on line 23 and inspector-b says good on line 27. The votes tie, so the part is left out of every rate. Fix: Look at the part again with both labelers and settle the label. The rates depend on it. |
| warning | sample-small | rates | Only 10 defect parts \(at least 30 asked for\) and 10 good parts \(at least 30 asked for\) were measured. Rates on so few parts mislead: one defect part is 10.00 percent of the defect parts and one good part is 10.00 percent of the good parts, so one part moves a rate by that much, and no escape among a handful of defect parts does not show that the escape rate is low. Measure more parts before accepting the station on these numbers. Fix: Measure more parts before accepting a station on these numbers, or lower the minimum if the sample is small on purpose and say so. |

Note: 1 part was left out of every rate because the labelers tied on good or defect

Note: 1 result row was left out because a run number was used twice for a part

This report is arithmetic on the labels and the results in the two files. It never looks at an image. The numbers are only as good as the labels and the sample. It does not replace a formal measurement system analysis or gauge study, and it is not a certification.
