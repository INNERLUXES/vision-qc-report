// The rates, exact. A rate is a count over a count, shown as a percent with a fixed number of decimals, rounded half up only when it
// is shown, and compared with a limit written as a decimal number of percent by cross multiplication with BigInt. No floating
// point number is used anywhere, so 1 of 50 is exactly 2 percent and 1 of 49 is above it.

import { compareDecimal, parseDecimal } from './decimal.js';

const HUNDRED = { int: 100n, scale: 0 };

// A limit given as text: a plain decimal from 0 to 100, as a decimal with its text; null when it is not one.
export function readPercent(text) {
  const d = parseDecimal(text);
  if (d === null || compareDecimal(d, HUNDRED) > 0) return null;
  return { ...d, text: `${text}` };
}

// A whole number of 0 to 999999999 given as text, or null.
export function readCount(text) {
  return /^[0-9]{1,9}$/.test(text) ? Number(text) : null;
}

// num / den as a percent with the given number of places, half up, such as "0.83"; null when den is zero.
export function percentFixed(num, den, places = 2) {
  const n = BigInt(num);
  const d = BigInt(den);
  if (d === 0n) return null;
  const q = (n * 100n * 10n ** BigInt(places) * 2n + d) / (d * 2n);
  const s = q.toString().padStart(places + 1, '0');
  return places === 0 ? s : `${s.slice(0, -places)}.${s.slice(-places)}`;
}

// A rate for a report: the counts and the percent (null when there is nothing to divide by).
export const rateOf = (count, of, places = 2) => ({ count, of, percent: percentFixed(count, of, places) });

// Whether num / den, as a percent, is above the limit (a decimal of percent), compared exactly. A rate with no denominator is
// not above anything.
export function rateAbove(num, den, limit) {
  if (BigInt(den) === 0n) return false;
  return BigInt(num) * 100n * 10n ** BigInt(limit.scale) > limit.int * BigInt(den);
}

// Whether num / den, as a percent, is below the limit, compared exactly.
export function rateBelow(num, den, limit) {
  if (BigInt(den) === 0n) return false;
  return BigInt(num) * 100n * 10n ** BigInt(limit.scale) < limit.int * BigInt(den);
}
