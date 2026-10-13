// Scores as the results file writes them: a plain decimal with an optional minus sign, read from its characters into a whole
// number and a scale with BigInt and never through a floating point number. A number with an exponent, a plus sign, a thousands
// separator or more digits than the decimal reader allows is not read.

import { parseDecimal } from './decimal.js';

// The value of a score text: { int, scale } with value = int / 10^scale, or null when the text is not a plain decimal.
export function parseScore(raw) {
  const negative = raw.startsWith('-');
  const d = parseDecimal(negative ? raw.slice(1) : raw);
  if (d === null) return null;
  return { int: negative ? -d.int : d.int, scale: d.scale };
}

// All the scores on the same scale, as BigInt: { scale, ints } with the ints in the order of the input.
export function alignScores(scores) {
  let scale = 0;
  for (const s of scores) if (s.scale > scale) scale = s.scale;
  return { scale, ints: scores.map((s) => s.int * 10n ** BigInt(scale - s.scale)) };
}

// A score of a given scale in its shortest form: "0.5", "-2", "12.25".
export function formatScore(int, scale) {
  const negative = int < 0n;
  const s = (negative ? -int : int).toString().padStart(scale + 1, '0');
  const whole = scale === 0 ? s : s.slice(0, s.length - scale);
  const frac = scale === 0 ? '' : s.slice(s.length - scale).replace(/0+$/, '');
  return `${negative ? '-' : ''}${frac ? `${whole}.${frac}` : whole}`;
}
