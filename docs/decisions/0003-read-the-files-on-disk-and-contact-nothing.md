# 3. Read the files on disk, and contact nothing

## Status

Accepted

## Context

A tool that checks a station could fetch the images, call the software of the station, look a part up in a database of the plant
or ask a service for the drawing. That would need the network and often a key, would make the result depend on the state of
other systems at the moment of the run, would send part numbers to a third party, and would let a file in a pull request make the
pipeline reach any address it names.

What an acceptance needs first is a count that can be repeated: the same files give the same numbers. The files are on disk.

## Decision

1. The tool reads the two files it is given, and nothing else. It contacts nothing over the network, fetches nothing, needs no
   key, runs no program and sends no data anywhere. It cannot write, submit or approve anything.
2. A path that looks like an address is refused. A symbolic link, a folder and a device are refused. A file that is not text, or
   is too large, is refused with exit code `2` and no report.
3. The tool reads no clock and no locale. Nothing in a count needs the date, so no option gives it one, and the same files give the
   same report on every day. The JUnit report records every time as 0.
4. The tool writes only to standard output and standard error. It keeps no cache, no log and no temporary file.
5. A part id, a note or a station written in a cell is text. It is never looked up, opened or followed.

## Consequences

- The tool is usable in a pipeline that has no network, and a hostile file cannot make it reach anything.
- The tool does not know what a part is, where it was made or what the drawing says. The checks work from the two files alone, and
  docs/limits.md says what is not seen.
