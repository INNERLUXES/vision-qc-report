# escape-above-limit

- Level: error
- Kind: metric

**What it looks at.** the escape rate \(defect parts the station passed over all defect parts\), per run or by the majority verdict, is above --max-escape \(default 2 percent\), or cannot be measured because no defect part has a result; compared exactly

**Why it exists.** Failing a run on the escape rate is a best practice of this tool; no standard sets it; a defect that passes reaches the customer, and it is the rate an acceptance usually asks for first

**What to change.** Look at the defect parts the station passed, and the threshold or the lighting that let them through. Raise the limit only if the line can accept that rate.

**What it cannot see.** It counts the parts in the files. It does not know how many defects the line makes, what an escape costs, or whether the defect parts are the ones the line produces.

This check is a best practice of this tool; no standard sets it.
