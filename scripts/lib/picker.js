// Daily selection from the approved pool. Pure and seeded: the same pool,
// history, date and seed always produce the same five picks.

import { ageOn, daysBetween } from './dates.js';
import { effectiveTrickiness } from './trickiness.js';

export const HISTORY_WINDOW_DAYS = 30;
export const MIN_ALIVE_AGE = 50;
export const MIN_HEALTHY_POOL = 75;
export const DAILY_COUNT = 5;
const DEAD_COUNT_WEIGHTS = [[1, 0.15], [2, 0.35], [3, 0.35], [4, 0.15]];
const MIN_PICK_WEIGHT = 5;

export function seededRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = Math.imul(s ^ (s >>> 16), 0x45d9f3b);
    s = Math.imul(s ^ (s >>> 16), 0x45d9f3b);
    s ^= s >>> 16;
    return (s >>> 0) / 0x100000000;
  };
}

export function seededShuffle(arr, seed) {
  const rng = seededRandom(seed);
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function dateSeed(today, offset = 0) {
  return today.split('-').reduce((acc, n) => acc * 100 + parseInt(n, 10), 0) + offset;
}

export function isEligible(entry, today) {
  if (entry.status !== 'approved' || !entry.birthDate) return false;
  return Boolean(entry.deathDate) || ageOn(entry.birthDate, today) >= MIN_ALIVE_AGE;
}

function weightedIndex(rng, weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r < 0) return i;
  }
  return weights.length - 1;
}

export function chooseDeadCount(rng) {
  return DEAD_COUNT_WEIGHTS[weightedIndex(rng, DEAD_COUNT_WEIGHTS.map(([, w]) => w))][0];
}

export function lastShownMap(history, today) {
  const map = new Map();
  for (const { date, ids } of history) {
    if (date === today || daysBetween(date, today) >= HISTORY_WINDOW_DAYS) continue;
    for (const id of ids) {
      if (!map.has(id) || map.get(id) < date) map.set(id, date);
    }
  }
  return map;
}

function drawWeighted(rng, pool, n) {
  const remaining = [...pool];
  const out = [];
  while (out.length < n && remaining.length > 0) {
    const weights = remaining.map(e => Math.max(effectiveTrickiness(e), MIN_PICK_WEIGHT));
    out.push(remaining.splice(weightedIndex(rng, weights), 1)[0]);
  }
  return out;
}

// Never-shown first, then least-recently-shown; tmdbId breaks ties.
function byStaleness(lastShown) {
  return (a, b) =>
    (lastShown.get(a.tmdbId) ?? '').localeCompare(lastShown.get(b.tmdbId) ?? '') ||
    a.tmdbId - b.tmdbId;
}

export function pickDaily({ pool, history, today, seed, log = () => {} }) {
  const eligible = pool.filter(e => isEligible(e, today));
  if (eligible.length < DAILY_COUNT) {
    throw new Error(`Only ${eligible.length} eligible approved celebrities; need ${DAILY_COUNT}.`);
  }

  const rng = seededRandom(seed);
  const deadCount = chooseDeadCount(rng);
  const lastShown = lastShownMap(history, today);
  const want = { dead: deadCount, alive: DAILY_COUNT - deadCount };
  const groups = {
    dead: eligible.filter(e => e.deathDate),
    alive: eligible.filter(e => !e.deathDate),
  };

  const picked = [];
  for (const side of ['dead', 'alive']) {
    const fresh = groups[side].filter(e => !lastShown.has(e.tmdbId));
    const drawn = drawWeighted(rng, fresh, want[side]);
    if (drawn.length < want[side]) {
      const reused = groups[side]
        .filter(e => lastShown.has(e.tmdbId))
        .sort(byStaleness(lastShown))
        .slice(0, want[side] - drawn.length);
      log(`${side} pool short: reusing ${reused.length} recently-shown`);
      drawn.push(...reused);
    }
    picked.push(...drawn);
  }

  if (picked.length < DAILY_COUNT) {
    const used = new Set(picked.map(e => e.tmdbId));
    const filler = eligible
      .filter(e => !used.has(e.tmdbId))
      .sort(byStaleness(lastShown))
      .slice(0, DAILY_COUNT - picked.length);
    log(`filling ${filler.length} from the other pool`);
    picked.push(...filler);
  }

  return seededShuffle(picked, seed + 1);
}

export function poolHealth(pool, today) {
  const eligible = pool.filter(e => isEligible(e, today));
  const dead = eligible.filter(e => e.deathDate).length;
  return { alive: eligible.length - dead, dead };
}

export function recordShown(history, today, ids) {
  return [
    ...history.filter(e => e.date !== today && daysBetween(e.date, today) < HISTORY_WINDOW_DAYS),
    { date: today, ids },
  ];
}
