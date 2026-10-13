# 2. Read tables with a reader of our own, and never show a secret

## Status

Accepted

## Context

The labels and the results are spreadsheets. Spreadsheets arrive with a comma or a tab between the cells, a line end inside a
note, a quote in the middle of a cell, a byte order mark, two columns of the same name and a row with a cell too few. A reader
that guesses turns those into numbers that look right. A tool that reads files from people it does not control also reads a note
that someone pasted a recovery phrase into, and a report that quotes that note copies the phrase into a log.

## Decision

1. The files are read with a reader of tables of our own, the one the sibling tools use, with the bounded reading of a file, the
   decimal reader and the search for keys and seeds kept unchanged. It follows RFC 4180 quoting with a comma or a tab, keeps the
   line and column of every cell, works through a loop with no recursion and no pattern built from the text, and refuses what it
   cannot follow: a quote inside an unquoted cell, text after a closing quote, a quote never closed, a cell that is too long, a
   header that is too wide, a file with too many cells or too many rows.
2. A row the reader can follow but the tool cannot use is a finding and is left out: a cell too few, an empty needed cell, a
   label or a verdict that is not one of two words, a run that is not a number. A column the tool does not read, or reads twice,
   is a finding too.
3. Every column and every long cell is searched for the shapes of a seed phrase or a private key. A value that is found is read
   as empty and its place is the only thing that reaches a report; no message names it. A part id of 64 hex digits is a part id.
4. Text from the files is cleaned before it reaches a report: control characters, line separators and direction controls are
   replaced, and the length is capped. The markdown report escapes what markdown gives a meaning to.

## Consequences

- The tool is slower to forgive than a spreadsheet program. A file with a stray quote is refused with the line and the column.
- A secret in a shape the search does not know is not found. docs/limits.md lists the shapes.
- Nothing from the file reaches the XML of the JUnit report.
