# 4. Do the rates exactly, and bound the work

## Status

Accepted

## Context

A build that fails on a rate must fail for the same reason every time. A rate computed as a floating point number and compared
with a limit can land on either side of it: 7 of 100 times 100 is 7.000000000000001 in a double, which is above 7 percent, and 29
of 100 times 100 is 28.999999999999996, which is below 29. A tool that reads files it does not control can also be made to work for a very long time, or to run out of memory
or stack, by a file that is only large or oddly shaped: a million result rows, a part with a million runs, a score of thousands of
digits.

## Decision

1. A rate is two whole numbers, a count and the count it is over (a count of rows is far inside the range a double holds
   exactly, and every percent and every comparison is done with BigInt). A limit is read from its characters as a plain decimal from 0 to 100 (at most 40
   digits on each side of the point) and the two are compared by cross multiplication, with no floating point number and no
   rounding. A rate is rounded to two decimals, half up, only when it is shown.
2. A score is read from its characters into a whole number and a scale with BigInt, put on one scale for the sweep, and compared as
   a whole number. A score with an exponent, a plus sign or a separator is not read.
3. The work is bounded and no function calls itself. The reader of tables has limits of rows, columns, cells and cell length; the
   rows of the results are kept as columns of numbers and grouped by part with a counting sort; the number of different defect
   types, stations and scores is bounded; at most 1,000 findings of one check and 1,000 disagreeing parts are listed, and the rest
   are counted and noted.
4. A file past a limit is refused or noted. It is never read in part without a word.
5. Hostile tests (a million result rows, a hundred thousand parts with ten runs each, one part with a million runs, cells of the
   longest length, numbers of thousands of digits) check the time, with limits that widen under coverage.

## Consequences

- The same files and options give the same rates on every machine, and a rate on the line is decided exactly.
- A very large set may need to be checked in parts; the message says so, and the rates of the parts are not the rate of the whole.
- The limits are in docs/limits.md, and changing one is a change to the tool and to its tests.
