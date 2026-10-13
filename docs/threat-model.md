# Threat model

vision-qc-report is arithmetic on the pass and fail results of a station and the labels of the same parts, read from two tables.
It never looks at an image, it does not replace a formal measurement system analysis or gauge study, and it is not a
certification. This document is about the tool itself: what it touches, what a hostile or careless file can try, and what stops
it.

## What the tool touches

- It reads the labels file and the results file named on the command line. Nothing else is opened, and no path, address or text
  written in a cell is looked up, opened or followed.
- It writes the report to standard output and its errors to standard error. It writes nothing to disk.
- It opens no network connection, fetches no URL, follows no symbolic link, runs nothing it reads, evaluates nothing and reads no
  clock and no locale.

## What the input may hold

The two files come from a person, from a colleague, or from a system run that saved what a station said. In a pipeline that checks
every pull request, they can come from whoever sent the pull request. Through the files, a person can try to, or a careless run
can:

- put a key or a seed phrase in a note or a column, so that the tool copies it into a pipeline log, a pull request comment or a
  code scanning upload;
- make the tool read outside the files: a link named on the command line, a folder, an address given as the path;
- exhaust the memory, the stack or the time: files of many megabytes, a million rows, a hundred thousand parts with ten runs each,
  one part with a million runs, a cell of the longest length and one past it, a row of a million commas, quotes in long runs,
  scores and limits of thousands of digits, a million different station names, a million different scores;
- move the result: a column written twice so that two readers see two values, a misspelt column that hides a column, a row that
  is skipped without a word so that a rate falls, a part labelled twice so that the later label wins, a run numbered twice so
  that a verdict counts double, a part id written two ways so that a part drops out of a rate;
- slip in something that is not text: a binary file, bytes that are not valid UTF-8 or UTF-16;
- rewrite the terminal or break the output: control characters, escape sequences, direction controls and line separators in a
  part id, a defect type, a station or a file name;
- hide markup in the markdown report: a link, a table separator or a tag in a part id or a defect type;
- change how objects behave: a part, a labeler, a defect type or a station named `__proto__`, `constructor` or `toString`.

## What could go wrong, and what stops it

| Risk | Control |
| --- | --- |
| A key or a seed in a file is copied into the output | A column named for a key or a seed and a cell shaped like one are found by the search of the sibling tools; the cell is read as empty and only its place is reported, never its value. A test puts each shape in each file and checks every format for the value |
| A row is skipped quietly and a rate changes | Every row that cannot be read or used is an error finding at its line (`row-malformed`, `cell-missing`, `label-invalid`, `verdict-invalid`, `run-invalid`, `label-duplicate`, `run-sequence`) and is counted in the summary; the run fails at the default `--fail-on` |
| A misspelt column hides a column | A column the tool does not read is a `column-unknown` error with the nearest name; a column written twice is a `column-duplicate` error |
| A part drops out of a rate unseen | A result with no label is a `result-without-label` error and a label with no result is a `label-without-result` error; a part left out because its labelers tie is counted in a note |
| A rate with nothing behind it passes | A limit on a rate that cannot be measured is not met; a small sample is a `sample-small` warning that says plainly that so few parts mislead |
| A link makes the tool read a file it was not given | The path is checked with `lstat` and a link is refused by name; the file is opened with `O_NOFOLLOW` where the system has it, and its type and size are taken from the open handle. A test puts a link in the folder |
| The tool reaches a server or runs something | No module of the network or of child processes is imported, nothing is evaluated, and a path that looks like an address is refused. A test checks the imports of src |
| The memory, the stack or the time is exhausted | Each file has a size limit checked on the open handle before it is read; the reader of tables keeps limits and works through a loop; rows are grouped by a counting sort; the results are kept as columns of numbers, not as objects; no function calls itself; the number of different types, stations and scores is bounded. Tests with the shapes above check the time, with limits that widen under coverage only |
| A pattern built from the input runs for ever | No regular expression is built from a file or from an argument |
| A limit is compared through a rounded number | Rates are two whole numbers (BigInt); a limit is a decimal read from its characters and compared by cross multiplication; rounding happens only when a rate is shown |
| A binary file or bytes in another encoding are read as text | A null byte in UTF-8, an odd number of bytes in UTF-16 and bytes that are not valid make the file an input error with exit code `2` and no report |
| Text from a file rewrites the terminal | Every text from the input goes through `safeText`, which replaces control, line separator and direction characters and caps the length. A test puts escapes and direction controls in a part id and a defect type, in every format |
| Markup in a part id changes the markdown report | The markdown report escapes the characters markdown gives a meaning to. A test writes a link, a bar and a tag into a part id |
| The XML report is not well formed | The JUnit report holds only fixed names, the numbers of the limits and the messages of the findings about a rate, none of which holds text from the input; it escapes the five characters of XML anyway. A test puts those characters into part ids |
| `__proto__` changes how objects behave | Names are kept in `Map` and `Set` objects and compared with the names the tool reads; no object is built with a key from a file. A test uses `__proto__`, `constructor` and `toString` as parts, labelers, types and stations |
| The time of the run changes the result | No clock is read, so the same files and options give the same report on every day, and the JUnit report records no time |
| A device or a pipe hangs the tool | A path that is not a regular file is refused before it is read |
| The tool leaves files behind | Nothing is written to disk; there is no cache, no temporary file and no log. A test checks that a run leaves the folder as it was |

## Out of scope

Whether the labels are right, whether the sample is the line, the shapes docs/limits.md says the tool does not see, how the
station produced its verdicts, who may change or upload the files, and where your pipeline keeps the output.
