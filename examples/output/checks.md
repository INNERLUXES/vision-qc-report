# vision-qc-report checks

| Check | Level | Kind | What it looks at |
| --- | --- | --- | --- |
| file-unreadable | error | file | a file is not a table the reader can follow \(a quote never closed, text after a closing quote, a cell too long, semicolons for commas\), holds a header and no rows, or lacks a needed column \(part\_id and label in the labels file, part\_id and verdict in the results file\); no rate was worked out |
| column-missing | warning | file | a column the tool can use is not in the header: defect\_type in either file \(no rates for each defect type, or a matrix that names nothing\), run in the results file \(every row is read as run 1\), or score in the results file when --threshold-sweep is asked for; the file is still read |
| column-unknown | error | file | a column the tool does not read, often a misspelt name; nothing under it was checked |
| column-duplicate | error | file | two columns of one file with the same name once case and separators are ignored; only the first is read |
| row-malformed | error | record | a row with more or fewer cells than the header; the row was left out |
| cell-missing | error | record | a cell that every row needs is empty: part\_id or label in the labels file, part\_id, run \(when the column is there\) or verdict in the results file; the row was left out |
| label-invalid | error | record | a label that is not good or defect \(written in any case\); the row was left out |
| verdict-invalid | error | record | a verdict that is not pass or fail \(written in any case\); the row was left out |
| run-invalid | error | record | a run that is not a whole number from 1 to 9,999,999; the row was left out |
| score-invalid | error | record | a score that is not a plain decimal such as 0.82 or -1.5 \(no exponent, no plus sign, no thousands separator, at most 40 digits on each side of the point\); the row is read without its score |
| secret-in-file | error | record | a column named for a key or a seed, or a long cell shaped like a mnemonic, an extended private key, a private key in hex or a key in WIF \(a part\_id of 64 hex digits is read as a part id\); the value is left out of every check and never shown |
| defect-type-on-good | error | record | a part labelled good that also has a defect type; the type is ignored |
| defect-type-missing | warning | record | a part labelled defect with no defect type \(when the labels file has the column\); it counts in the escape rate and in no defect type |
| label-duplicate | error | part | a part labelled twice by the same labeler \(two rows with no labeler count as the same labeler\); the later row was left out |
| label-conflict | warning | part | two or more labelers disagree on a part, on good or defect or on the defect type; the majority rule decides \(docs/method.md\), and a tie on good or defect leaves the part out of every rate |
| run-sequence | error | part | the runs of a part do not go from 1 to n without a gap, or a run number is used twice for a part \(the later row was left out\) |
| result-without-label | error | part | a part has rows in the results file and no label in the labels file; it is in no rate |
| label-without-result | error | part | a part is labelled and has no usable row in the results file; it is in no rate \(a part whose labelers tie is not reported here\) |
| escape-above-limit | error | metric | the escape rate \(defect parts the station passed over all defect parts\), per run or by the majority verdict, is above --max-escape \(default 2 percent\), or cannot be measured because no defect part has a result; compared exactly |
| false-reject-above-limit | error | metric | the false reject rate \(good parts the station failed over all good parts\), per run or by the majority verdict, is above --max-false-reject \(default 5 percent\), or cannot be measured because no good part has a result; compared exactly |
| repeatability-below-limit | error | metric | the share of the parts with more than one run whose runs all gave the same verdict is below --min-repeatability \(default 95 percent\), or cannot be measured when the limit was given and no part has more than one run; compared exactly |
| sample-small | warning | metric | fewer than --min-defects defect parts \(default 30\) or fewer than --min-good good parts \(default 30\) were measured; a rate on so few parts misleads |
