// Trickiness: how hard the alive/dead call is for a given celebrity,
// 0 (obvious) to 100 (very tricky). See the curated pool design spec.

import { ageOn, yearsSince } from './dates.js';

const ALIVE_FLOOR = 0.2;
const ALIVE_MIN_AGE = 50;
const ALIVE_SPAN_YEARS = 35; // ambiguity peaks at 85
const DEAD_FADE_YEARS = 25;
const OBVIOUSLY_DEAD_AGE = 95;

const clamp01 = x => Math.min(1, Math.max(0, x));

export function ambiguity({ birthDate, deathDate, today }) {
  if (!deathDate) {
    const age = ageOn(birthDate, today);
    return ALIVE_FLOOR + (1 - ALIVE_FLOOR) * clamp01((age - ALIVE_MIN_AGE) / ALIVE_SPAN_YEARS);
  }
  let a = clamp01(1 - yearsSince(deathDate, today) / DEAD_FADE_YEARS);
  if (ageOn(birthDate, today) > OBVIOUSLY_DEAD_AGE) a *= 0.5;
  return a;
}

// Percentile rank of `views` among positive values in `allViews`.
// (A percentile of log-views equals a percentile of views.)
export function fameFromPageviews(views, allViews) {
  if (views == null || views <= 0) return 0;
  const known = allViews.filter(v => v != null && v > 0);
  if (known.length === 0) return 0;
  return known.filter(v => v <= views).length / known.length;
}

export function computeTrickiness({ birthDate, deathDate, fame, today }) {
  return Math.round(100 * ambiguity({ birthDate, deathDate, today }) * (0.5 + 0.5 * fame));
}

export function effectiveTrickiness(entry) {
  return entry.trickinessOverride ?? entry.trickiness ?? 0;
}
