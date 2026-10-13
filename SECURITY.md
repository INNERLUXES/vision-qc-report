# Security

## Reporting a problem

Write to info@innerluxes.dev with the subject line "vision-qc-report security", or use private vulnerability reporting on this
repository. Please do not open a public issue for a vulnerability.

Include a small made-up pair of tables that shows the problem, the command you ran, what you expected and what happened. Use
made-up part ids, labels and verdicts, never the results of a real station or the name of a real company or product, and never
a real private key, seed or mnemonic, even an old one or one from a test network.

## Scope

The tool does arithmetic on the labels and the results in two tables. It never reads an image, the numbers are only as good as the
labels and the sample, it is not a measurement system analysis, and it is not a certification. In scope:

- an input that makes the tool show a private key, a seed or a mnemonic, or any part of one, in a report or an error message, in
  any format
- a key or a seed in one of the shapes docs/limits.md names that the tool does not report
- an input that makes the tool read a file other than the two it was given, or follow a symbolic link
- an input that makes the tool open a network connection, fetch a URL, write or sign anything, run any other program, or evaluate
  anything it reads
- an input that makes the tool write a file
- an input that makes the tool hang, take very long, exhaust the stack or use unbounded memory, such as a very large file, a
  million result rows, a hundred thousand parts with ten runs each, one part with a million runs, a cell of the longest length, a
  row of a million commas, long runs of quotes, thousands of different scores, or numbers with thousands of digits
- binary or invalid input that the tool reads as if it were a table
- a column written twice whose second column is read without a finding, a column the tool did not read that a check reports as
  fine, a misspelt column that is not reported, or a row of the wrong width that is read as if it were right
- a pair of tables that docs/method.md says is reported (a label or a verdict that is not one of two words, a run out of order or
  used twice, a part with only one side, labelers who disagree, a small sample) that the tool does not report
- a rate, a limit or a threshold that the tool works out in a way the text of the files does not say, so that a rate is not the
  exact value worked out from the rows, or a limit passes or fails because of a rounding
- a run that passes at a `--fail-on` level although the input holds a finding at that level that docs/method.md says is reported
- text from a file or a file name that rewrites the terminal through control or direction characters, is shown unescaped in the
  output, puts markup into the markdown report or breaks the XML of the JUnit report
- a name such as `__proto__` that changes how objects behave inside the tool

Out of scope: the forms docs/limits.md says the tool does not see, whether the labels are right or the sample represents the
line (a clean result says nothing about the station), secrets in shapes the search does not claim to know, who may change or
upload the files, and where your pipeline keeps the output.

Read [docs/threat-model.md](docs/threat-model.md) for the rest.
