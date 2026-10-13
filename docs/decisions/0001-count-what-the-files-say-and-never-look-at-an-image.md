# 1. Count what the files say, and never look at an image

## Status

Accepted

## Context

A vision station can be checked against a labelled set of parts in many ways. A tool could run the station, read the images,
compute its own score, or compare a model with the labels. Each of those makes the result depend on something the tool cannot
vouch for: which model, which light, which version of the software of the station. A team that has to accept a station needs the
last step only: what the station said about each part, what people said about the same part, and the count of where they differ.

## Decision

1. The tool reads two tables, the labels and the results, and does arithmetic on them. It never reads an image, never runs a
   station and never produces a verdict of its own.
2. A part is good or defect by its label, and passes or fails by the verdict in the results. There is no third label and no third
   verdict; a hold, a review and a rework are a fail, and the type says why.
3. The majority rule for labelers is a count of votes. The tool does not weigh the experience of a labeler, and a tie on good or
   defect leaves the part out of every rate and is said in the report.
4. A tie between pass and fail in the runs of one part counts against the station, on both sides: a station that does not clearly
   reject a defect has not rejected it, and one that does not clearly accept a good part has not accepted it.
5. The tool says plainly what it is not: not a formal measurement system analysis or gauge study, and not a certification. The
   numbers are only as good as the labels and the sample, and a small sample is a warning.

## Consequences

- The result is the same on every machine and every day, and is about the files, not about the station.
- A wrong label or a biased sample gives a wrong number, and the tool cannot see that. The documents say so.
- The tool does not compute a gauge study or a confidence interval, and does not say how many parts an acceptance needs.
