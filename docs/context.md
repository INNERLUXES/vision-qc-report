# Context

This document says what checking an inspection station against a labelled set of parts is good for, and where it misleads. It is
background for reading the reports, not a claim that the tool makes a station better.

## What a labelled set is

A vision station looks at a part and says pass or fail. Before it goes on the line, someone has to know how often it is right.
The usual way is a set of parts that people have already judged: good parts, and defect parts of the kinds the line makes
(a scratch, a dent, a missing hole, a burr). Run the station on the set, save its verdict for each part, and compare the verdicts
with the labels. Running the same part more than once shows whether the station gives the same answer twice.

vision-qc-report is the last step only. It does not run the station and does not look at an image. It reads the labels and the
results that are already saved, and does the counting: how many defect parts the station passed (escapes), how many good parts it
failed (false rejects), how the defect types were told apart, and which parts gave different verdicts on different runs. That
makes the counting cheap, exact, repeatable and the same on every machine, which is what an acceptance record needs. It also makes
it narrow.

## The two rates

- **Escape rate.** A defect that passes reaches the customer, or the next process. It is the rate that an acceptance usually asks
  about first.
- **False reject rate.** A good part that fails is scrap or rework, and a line that waits on a false reject loses time. A station
  can be given a low escape rate by failing everything, so the two rates are read together.

Moving the threshold of a station moves one rate against the other. The threshold sweep lists both rates at each distinct score of
the results, so that the trade is visible before a threshold is chosen.

## Where counting helps

- **A number to accept on.** "No escape in the set" is a statement about the set; "0.83 percent of runs of defect parts passed, 1
  of 120" is a number that can be compared with a limit and kept in a record.
- **A per-type view.** A station that finds scratches and misses burrs has an escape rate that hides it. The detection rate and
  the matrix for each defect type show which kind is the problem, and which kinds the station confuses.
- **Repeatability.** A station that passes a part once and fails it the next time is not measuring the part. The parts where the
  runs disagreed are the ones to look at: position in the fixture, light, a score close to the threshold.
- **A build that fails.** A result with an exit code and a JUnit or SARIF report can stop a change to a model, a light or a
  threshold that makes a rate worse.

## Where it misleads

- **Labels are opinions.** The tool counts against the labels it is given. Parts that labelers disagree on are the hard parts,
  and they move the rates. The report warns about the disagreements and applies a majority rule; it cannot say who is right.
- **A small sample.** Ten defect parts with no escape are not a low escape rate. One part moves a rate by many points. The
  `sample-small` warning asks for at least 30 of each side by default; that number is a convention of this tool and not a
  promise of anything.
- **A sample that is not the line.** The tool cannot see how the parts were chosen. Defects that are staged for the test are
  usually easier than the ones the line makes.
- **Runs that are not independent.** Three runs of one part, one after the other, in one fixture, agree more than three runs on
  three shifts.
- **Per-run and per-part rates differ.** A rate over runs counts a part that was run ten times ten times. The report shows both
  the per-run rate and the rate over the majority verdict of each part, and a limit is checked against both.
- **It is not a measurement system analysis.** A formal study of an inspection system looks at repeatability and
  reproducibility, bias and stability with a procedure and a designed set of parts. This tool does arithmetic on the files it is
  given and does not replace that study, and nothing it prints is a certification.

## Using it well

Keep the set small, labelled by more than one person, and reviewed; include the faint defects, not only the obvious ones; run each
part more than once, on more than one shift; keep the verdicts in the file exactly as the station returned them; set the limits
from what an escape and a false reject cost the line, and write them down; and treat a failing run as a question for a person,
who decides whether the station, the labels or the set is wrong.
