// The rates at every distinct score threshold. The score is the defect score of the station: a run fails when its score is at or
// above the threshold (direction "high"), or at or below it (direction "low"). For each distinct score of the runs, the escape
// rate is the share of the runs of defect parts that would pass (their score is on the passing side) and the false reject rate
// is the share of the runs of good parts that would fail. Everything is a whole number or a BigInt; the scores are put on one
// scale first.

import { LIMITS } from './data.js';
import { InputError } from './files.js';
import { rateAbove, rateOf } from './rate.js';
import { formatScore } from './score.js';

const ascending = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// defects and goods are the scores (BigInt, all on the same scale) of the runs of defect parts and of good parts. Returns the
// rows from the lowest threshold to the highest: { threshold, escapes, falseRejects, within }, where within says that both
// rates are within the limits (a rate with nothing to divide by is not within anything).
export function sweepThresholds({ defects, goods, scale, direction = 'high', maxEscape, maxFalseReject }) {
  const flip = direction === 'low' ? -1n : 1n;
  const d = defects.map((s) => s * flip).sort(ascending);
  const g = goods.map((s) => s * flip).sort(ascending);
  const distinct = [];
  for (const list of [d, g]) {
    for (let i = 0; i < list.length; i += 1) if (i === 0 || list[i] !== list[i - 1]) distinct.push(list[i]);
  }
  distinct.sort(ascending);
  const thresholds = distinct.filter((v, i) => i === 0 || v !== distinct[i - 1]);
  if (thresholds.length > LIMITS.maxThresholds) throw new InputError([`--threshold-sweep: the scores hold ${thresholds.length.toLocaleString('en-US')} different values, more than the ${LIMITS.maxThresholds.toLocaleString('en-US')} the sweep lists; round the scores and run again`]);
  const rows = [];
  let di = 0;
  let gi = 0;
  for (const t of thresholds) {
    while (di < d.length && d[di] < t) di += 1;
    while (gi < g.length && g[gi] < t) gi += 1;
    const escapes = rateOf(di, d.length);
    const falseRejects = rateOf(g.length - gi, g.length);
    const within = d.length > 0 && g.length > 0 && !rateAbove(di, d.length, maxEscape) && !rateAbove(g.length - gi, g.length, maxFalseReject);
    rows.push({ threshold: formatScore(t * flip, scale), escapes, falseRejects, within });
  }
  return direction === 'low' ? rows.reverse() : rows;
}
