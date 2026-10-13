// The columns of the two files. The names and the types are this tool's own choice: no standard fixes them. A column is found by
// its name with case and separators ignored.

export const normalizeName = (text) => text.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

// needed: the file cannot be read without the column. soft: the column is optional, and a file without it is read with a warning
// that says what is lost; soft 'sweep' means the warning is given only when --threshold-sweep is asked for.
export const LABEL_FIELDS = [
  { name: 'part_id', needed: true, summary: 'the name of the part, the same in both files (compared without regard to case and runs of white space)' },
  { name: 'label', needed: true, summary: 'good or defect: what the people who looked at the part decided' },
  { name: 'defect_type', needed: false, soft: true, summary: 'the kind of defect, for a part labelled defect (scratch, dent); empty on a good part' },
  { name: 'labeler', needed: false, summary: 'who gave the label; two labelers may label the same part' },
  { name: 'note', needed: false, summary: 'free text for the reader; kept, never compared' }
];

export const RESULT_FIELDS = [
  { name: 'part_id', needed: true, summary: 'the name of the part, the same as in the labels file' },
  { name: 'run', needed: false, soft: true, summary: 'the number of the run of the station on this part, from 1, without gaps; without the column every row is run 1' },
  { name: 'verdict', needed: true, summary: 'pass or fail: what the station decided' },
  { name: 'defect_type', needed: false, soft: true, summary: 'the kind of defect the station named, on a fail' },
  { name: 'score', needed: false, soft: 'sweep', summary: 'the defect score of the station for this run, a plain decimal, used by --threshold-sweep' },
  { name: 'station', needed: false, summary: 'the station, camera or line that produced the row' }
];

export const LABEL_NAMES = LABEL_FIELDS.map((f) => f.name);
export const RESULT_NAMES = RESULT_FIELDS.map((f) => f.name);

// The number of edits (insert, delete, replace) between two short texts, capped.
export function editDistance(a, b) {
  const x = a.slice(0, 60);
  const y = b.slice(0, 60);
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i += 1) {
    const cur = [i];
    for (let j = 1; j <= y.length; j += 1) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[y.length];
}

// The name nearest to a text, within two edits, or null.
export function nearest(text, names) {
  let best = null;
  let bestDistance = 3;
  for (const n of names) {
    const d = editDistance(text, n);
    if (d < bestDistance) {
      best = n;
      bestDistance = d;
    }
  }
  return best;
}
