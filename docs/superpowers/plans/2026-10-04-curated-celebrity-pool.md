# Curated Celebrity Pool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace TMDB-trending daily picks with a human-approved pool of mostly US/UK, mostly 50+ celebrities sourced from Wikidata and en.wikipedia pageviews, scored for "trickiness", picked with a variable alive/dead split, and approved through a local review page.

**Architecture:** Pure logic lives in small ESM modules under `scripts/lib/` (dates, trickiness, picker, merge, candidates, review-api) with `node:test` unit tests. Thin I/O scripts (`build-celeb-list.js`, `generate-daily.js`, `review-server.js`) compose those modules with network clients in `scripts/lib/sources.js` and file helpers in `scripts/lib/files.js`. The pool and history move to an undeployed `data/` folder; the frontend and `public/data/celebrities.json` shape are unchanged.

**Tech Stack:** Node 22 (ESM, built-in `fetch`, `node:http`, `node:test`), Wikidata SPARQL, Wikimedia pageviews REST API, TMDB v3 API, vanilla HTML/JS for the review UI.

**Spec:** `docs/superpowers/specs/2026-10-04-curated-celebrity-pool-design.md`

## Global Constraints

- No new npm dependencies. Node built-ins only in `scripts/`.
- All script files are ESM (`package.json` has `"type": "module"`).
- Only API key is `TMDB_API_KEY`. Wikidata and Wikimedia requests send the `User-Agent` string `AreTheyDeadGame/1.0 (educational; contact giantryansaul@gmail.com)` (already used by the existing script).
- Alive celebrities under 50 (age as of the run date) are never pickable, even if approved.
- Dead count per day ∈ {1,2,3,4} with weights `{1: 0.15, 2: 0.35, 3: 0.35, 4: 0.15}`.
- History window: 30 days. Pool-health target: ≥ 75 approved alive and ≥ 75 approved dead.
- Human-owned pool fields — `status`, `notes`, `trickinessOverride` — are never overwritten by `build-list`.
- `status` ∈ `pending | approved | rejected`.
- `public/data/celebrities.json` shape (`DailyData` in `src/types/index.ts`) must not change.
- `data/celeb-list.json` and `data/shown-history.json` must NOT live under `public/`.
- Review server binds to `127.0.0.1:5174` only.
- Commit messages: Conventional Commits with a scope (this repo uses `script`, `data`, `ops`, `docs`), body wrapped at 72 chars, no `Co-authored-by`/`Made-with`, and end with:
  ```
  Agent-Tool: claude-code
  Agent-Model: <your model id>
  ```

## File Structure

| File | Responsibility |
|------|----------------|
| `scripts/lib/dates.js` | `ageOn`, `yearsSince`, `daysBetween`, `pageviewRange` |
| `scripts/lib/trickiness.js` | `ambiguity`, `fameFromPageviews`, `computeTrickiness`, `effectiveTrickiness` |
| `scripts/lib/picker.js` | Seeded RNG, eligibility, dead-count choice, history windowing, `pickDaily`, `poolHealth`, `recordShown` |
| `scripts/lib/merge.js` | `mergePool`, `sortPool`, `migrateLegacy` |
| `scripts/lib/candidates.js` | Wikidata row parsing + nationality/fame/age/pageview filters |
| `scripts/lib/review-api.js` | Validated, pure entry update for the review server |
| `scripts/lib/files.js` | Repo paths, `readJson`, `writeJsonAtomic` |
| `scripts/lib/sources.js` | TMDB, Wikidata SPARQL, Wikimedia pageviews clients |
| `scripts/lib/*.test.js` | Unit tests for the pure modules |
| `scripts/build-celeb-list.js` | Rewritten: candidate gathering → `data/celeb-list.json` |
| `scripts/generate-daily.js` | Rewritten: picker → `public/data/celebrities.json` |
| `scripts/review-server.js` | Local HTTP server for review |
| `scripts/review/index.html` | Review UI |
| `data/celeb-list.json` | Pool (moved from `public/data/`) |
| `data/shown-history.json` | History (moved from `public/data/`) |
| `.github/workflows/deploy.yml` | `git add` path update |
| `package.json` | `review`, `test:scripts` scripts |
| `CLAUDE.md` | Architecture docs |

---

### Task 0: Branch and baseline the in-progress work

The working tree has uncommitted, half-finished work by the user (curated list v1, `build-celeb-list.js`, picker changes). Baseline it on a feature branch so later rewrites produce readable diffs. **Confirm with the user before running the commit** — it is their work.

**Files:** none created.

- [ ] **Step 1: Create the feature branch**

```bash
git switch -c feat/curated-pool
```

- [ ] **Step 2: Commit the user's WIP as-is (after user confirms)**

```bash
git add scripts/build-celeb-list.js scripts/generate-daily.js package.json \
  .github/workflows/deploy.yml public/data/celeb-list.json \
  public/data/shown-history.json CLAUDE.md
git commit -F - <<'EOF'
chore(script): baseline in-progress curated list work

Snapshot of the v1 curated list and picker before the curated pool
redesign, so the rewrite diffs are reviewable.

Agent-Tool: claude-code
Agent-Model: <your model id>
EOF
```

Leave `.cursor/` untracked.

---

### Task 1: Date helpers and trickiness score

**Files:**
- Create: `scripts/lib/dates.js`
- Create: `scripts/lib/trickiness.js`
- Test: `scripts/lib/dates.test.js`, `scripts/lib/trickiness.test.js`
- Modify: `package.json` (scripts)

**Interfaces:**
- Produces:
  - `ageOn(birthDate: string, onDate: string): number` — whole years, ISO `YYYY-MM-DD` inputs
  - `yearsSince(date: string, today: string): number` — fractional years (365.25-day years)
  - `daysBetween(from: string, to: string): number` — fractional days `to − from`
  - `pageviewRange(today: string): { start: string, end: string }` — `YYYYMMDD` strings
  - `ambiguity({ birthDate, deathDate, today }): number` in [0,1]
  - `fameFromPageviews(views: number|null, allViews: (number|null)[]): number` in [0,1]
  - `computeTrickiness({ birthDate, deathDate, fame, today }): number` integer 0..100
  - `effectiveTrickiness(entry): number` — `trickinessOverride ?? trickiness ?? 0`

- [ ] **Step 1: Add the test script to `package.json`**

In `"scripts"`, add after `"build-list"`:

```json
    "review": "node scripts/review-server.js",
    "test:scripts": "node --test \"scripts/lib/*.test.js\""
```

(`review-server.js` is created in Task 7; the script entry is harmless until then.)

- [ ] **Step 2: Write the failing tests**

`scripts/lib/dates.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ageOn, yearsSince, daysBetween, pageviewRange } from './dates.js';

test('ageOn counts whole years, birthday-aware', () => {
  assert.equal(ageOn('1956-10-21', '2016-12-27'), 60);
  assert.equal(ageOn('2000-10-05', '2026-10-04'), 25);
  assert.equal(ageOn('2000-10-04', '2026-10-04'), 26);
});

test('yearsSince returns fractional years', () => {
  assert.ok(Math.abs(yearsSince('2016-10-04', '2026-10-04') - 10) < 0.01);
});

test('daysBetween returns days from first to second date', () => {
  assert.equal(daysBetween('2026-09-04', '2026-10-04'), 30);
});

test('pageviewRange covers the 12 full months before today', () => {
  assert.deepEqual(pageviewRange('2026-10-04'), { start: '20251001', end: '20261001' });
  assert.deepEqual(pageviewRange('2026-01-15'), { start: '20250101', end: '20260101' });
});
```

`scripts/lib/trickiness.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ambiguity, fameFromPageviews, computeTrickiness, effectiveTrickiness } from './trickiness.js';

const today = '2026-10-04';
const close = (actual, expected, eps = 0.01) =>
  assert.ok(Math.abs(actual - expected) < eps, `${actual} !≈ ${expected}`);

test('alive ambiguity: 0.2 at 50, 1.0 at 85+, linear between', () => {
  close(ambiguity({ birthDate: '1976-10-04', deathDate: null, today }), 0.2);
  close(ambiguity({ birthDate: '1941-10-04', deathDate: null, today }), 1.0);
  close(ambiguity({ birthDate: '1931-10-04', deathDate: null, today }), 1.0);
  close(ambiguity({ birthDate: '1958-10-04', deathDate: null, today }), 0.2 + 0.8 * (18 / 35));
});

test('dead ambiguity: 1.0 for a death today, ~0 at 25+ years', () => {
  close(ambiguity({ birthDate: '1950-01-01', deathDate: today, today }), 1.0);
  close(ambiguity({ birthDate: '1950-01-01', deathDate: '2001-10-04', today }), 0, 0.001);
  close(ambiguity({ birthDate: '1920-01-01', deathDate: '1977-08-16', today }), 0, 0.001);
});

test('dead ambiguity is halved when they would be over 95 today', () => {
  close(ambiguity({ birthDate: '1925-01-01', deathDate: '2026-04-04', today }), 0.49);
});

test('fameFromPageviews is a percentile rank; missing views score 0', () => {
  const all = [10, 100, 1000, 10000, null];
  assert.equal(fameFromPageviews(10000, all), 1);
  assert.equal(fameFromPageviews(10, all), 0.25);
  assert.equal(fameFromPageviews(null, all), 0);
  assert.equal(fameFromPageviews(0, all), 0);
});

test('computeTrickiness combines ambiguity and fame', () => {
  const old = { birthDate: '1941-10-04', deathDate: null, today };
  assert.equal(computeTrickiness({ ...old, fame: 1 }), 100);
  assert.equal(computeTrickiness({ ...old, fame: 0 }), 50);
  assert.equal(
    computeTrickiness({ birthDate: '1935-01-08', deathDate: '1977-08-16', fame: 1, today }),
    0,
  );
});

test('effectiveTrickiness prefers the override, including 0', () => {
  assert.equal(effectiveTrickiness({ trickiness: 40, trickinessOverride: null }), 40);
  assert.equal(effectiveTrickiness({ trickiness: 40, trickinessOverride: 0 }), 0);
  assert.equal(effectiveTrickiness({ trickiness: 40, trickinessOverride: 90 }), 90);
  assert.equal(effectiveTrickiness({}), 0);
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm run test:scripts`
Expected: FAIL — `Cannot find module '.../scripts/lib/dates.js'`

- [ ] **Step 4: Implement `scripts/lib/dates.js`**

```js
// Date helpers. All inputs are ISO dates (YYYY-MM-DD), interpreted as UTC.

const MS_PER_DAY = 86_400_000;

export function ageOn(birthDate, onDate) {
  const b = new Date(birthDate);
  const d = new Date(onDate);
  let age = d.getUTCFullYear() - b.getUTCFullYear();
  const m = d.getUTCMonth() - b.getUTCMonth();
  if (m < 0 || (m === 0 && d.getUTCDate() < b.getUTCDate())) age--;
  return age;
}

export function daysBetween(from, to) {
  return (Date.parse(to) - Date.parse(from)) / MS_PER_DAY;
}

export function yearsSince(date, today) {
  return daysBetween(date, today) / 365.25;
}

// The 12 full months before `today`, in the Wikimedia pageviews API's
// YYYYMMDD format. `end` is the first day of the current month so the
// monthly granularity includes the last full month.
export function pageviewRange(today) {
  const d = new Date(today);
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 12, 1));
  const fmt = x => x.toISOString().slice(0, 10).replaceAll('-', '');
  return { start: fmt(start), end: fmt(end) };
}
```

- [ ] **Step 5: Implement `scripts/lib/trickiness.js`**

```js
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
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm run test:scripts`
Expected: PASS, all tests in both files.

- [ ] **Step 7: Commit**

```bash
git add package.json scripts/lib/dates.js scripts/lib/dates.test.js \
  scripts/lib/trickiness.js scripts/lib/trickiness.test.js
git commit -F - <<'EOF'
feat(script): add trickiness score and date helpers

Trickiness rates how hard the alive/dead call is from age, recency of
death and en.wikipedia fame. Adds a node:test runner script.

Agent-Tool: claude-code
Agent-Model: <your model id>
EOF
```

---

### Task 2: Daily picker

**Files:**
- Create: `scripts/lib/picker.js`
- Test: `scripts/lib/picker.test.js`

**Interfaces:**
- Consumes: `ageOn`, `daysBetween` (Task 1 `dates.js`); `effectiveTrickiness` (Task 1 `trickiness.js`)
- Produces:
  - Constants: `HISTORY_WINDOW_DAYS = 30`, `MIN_ALIVE_AGE = 50`, `MIN_HEALTHY_POOL = 75`, `DAILY_COUNT = 5`
  - `seededRandom(seed: number): () => number`
  - `seededShuffle(arr, seed: number): arr`
  - `dateSeed(today: string, offset = 0): number` — `'2026-10-04'` → `20261004 + offset`
  - `isEligible(entry, today): boolean`
  - `chooseDeadCount(rng): 1|2|3|4`
  - `lastShownMap(history, today): Map<number, string>` — tmdbId → most recent date within the window, excluding `today`'s entry
  - `pickDaily({ pool, history, today, seed, log? }): entry[]` — exactly 5 pool entries; throws `Error` if fewer than 5 eligible
  - `poolHealth(pool, today): { alive: number, dead: number }`
  - `recordShown(history, today, ids): history` — `history` is `{ date: string, ids: number[] }[]`
- Contract: the first `rng()` draw inside `pickDaily` is the dead-count draw, so `chooseDeadCount(seededRandom(seed))` predicts the dead count for `seed`.

- [ ] **Step 1: Write the failing tests**

`scripts/lib/picker.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  seededRandom, dateSeed, isEligible, chooseDeadCount, lastShownMap,
  pickDaily, poolHealth, recordShown,
} from './picker.js';

const today = '2026-10-04';

function person(id, { dead = false, born = '1940-01-01', status = 'approved', trickiness = 50 } = {}) {
  return {
    tmdbId: id, name: `P${id}`, status, birthDate: born,
    deathDate: dead ? '2024-01-01' : null, trickiness, trickinessOverride: null,
  };
}

function makePool(aliveCount, deadCount) {
  return [
    ...Array.from({ length: aliveCount }, (_, i) => person(i + 1)),
    ...Array.from({ length: deadCount }, (_, i) => person(1001 + i, { dead: true })),
  ];
}

const ids = list => list.map(e => e.tmdbId);
const deadIn = list => list.filter(e => e.deathDate).length;

test('dateSeed matches the legacy date seed', () => {
  assert.equal(dateSeed('2026-10-04'), 20261004);
  assert.equal(dateSeed('2026-10-04', 1), 20261005);
});

test('isEligible: approved only, never alive under 50', () => {
  assert.equal(isEligible(person(1), today), true);
  assert.equal(isEligible(person(1, { status: 'pending' }), today), false);
  assert.equal(isEligible(person(1, { born: '1990-01-01' }), today), false);
  assert.equal(isEligible(person(1, { born: '1990-01-01', dead: true }), today), true);
  assert.equal(isEligible(person(1, { born: '1976-10-04' }), today), true);
});

test('chooseDeadCount stays within 1..4 and hits every value', () => {
  const seen = new Set();
  for (let s = 0; s < 500; s++) seen.add(chooseDeadCount(seededRandom(s)));
  assert.deepEqual([...seen].sort(), [1, 2, 3, 4]);
});

test('lastShownMap keeps the window, drops today and old entries', () => {
  const history = [
    { date: '2026-09-01', ids: [1] },
    { date: '2026-09-10', ids: [2, 3] },
    { date: '2026-09-20', ids: [3] },
    { date: today, ids: [4] },
  ];
  const map = lastShownMap(history, today);
  assert.deepEqual([...map.entries()].sort(), [[2, '2026-09-10'], [3, '2026-09-20']]);
});

test('pickDaily is deterministic for a seed', () => {
  const pool = makePool(30, 30);
  const a = pickDaily({ pool, history: [], today, seed: 42 });
  const b = pickDaily({ pool, history: [], today, seed: 42 });
  assert.deepEqual(ids(a), ids(b));
});

test('pickDaily returns 5 unique picks with the seeded dead count', () => {
  const pool = makePool(30, 30);
  for (let seed = 0; seed < 200; seed++) {
    const picks = pickDaily({ pool, history: [], today, seed });
    assert.equal(picks.length, 5);
    assert.equal(new Set(ids(picks)).size, 5);
    assert.equal(deadIn(picks), chooseDeadCount(seededRandom(seed)));
  }
});

test('pickDaily never picks alive-under-50 or unapproved people', () => {
  const pool = [
    ...makePool(10, 10),
    ...Array.from({ length: 20 }, (_, i) => person(2001 + i, { born: '1995-01-01', trickiness: 100 })),
    ...Array.from({ length: 20 }, (_, i) => person(3001 + i, { status: 'pending', trickiness: 100 })),
  ];
  for (let seed = 0; seed < 100; seed++) {
    for (const p of pickDaily({ pool, history: [], today, seed })) {
      assert.ok(p.tmdbId < 2001, `picked ineligible ${p.tmdbId}`);
    }
  }
});

test('pickDaily excludes people shown in the last 30 days', () => {
  const pool = makePool(30, 30);
  const history = [{ date: '2026-09-29', ids: [1, 2, 3, 1001, 1002] }];
  for (let seed = 0; seed < 100; seed++) {
    const picked = ids(pickDaily({ pool, history, today, seed }));
    assert.ok(![1, 2, 3, 1001, 1002].some(id => picked.includes(id)));
  }
});

test('short dead pool reuses least-recently-shown dead first', () => {
  const pool = makePool(10, 3);
  const history = [
    { date: '2026-10-01', ids: [1001] },
    { date: '2026-09-20', ids: [1002] },
    { date: '2026-09-25', ids: [1003] },
  ];
  const byRecency = [1002, 1003, 1001];
  for (let seed = 0; seed < 100; seed++) {
    const want = Math.min(chooseDeadCount(seededRandom(seed)), 3);
    const picks = pickDaily({ pool, history, today, seed });
    const dead = ids(picks.filter(e => e.deathDate)).sort();
    assert.deepEqual(dead, byRecency.slice(0, want).sort());
    assert.equal(picks.length, 5);
  }
});

test('short dead pool fills the rest from alive', () => {
  const pool = makePool(10, 1);
  for (let seed = 0; seed < 50; seed++) {
    const picks = pickDaily({ pool, history: [], today, seed });
    assert.equal(picks.length, 5);
    assert.equal(deadIn(picks), 1);
    assert.equal(new Set(ids(picks)).size, 5);
  }
});

test('pickDaily throws with fewer than 5 eligible', () => {
  assert.throws(() => pickDaily({ pool: makePool(2, 2), history: [], today, seed: 1 }), /eligible/);
  assert.throws(() => pickDaily({ pool: [], history: [], today, seed: 1 }), /eligible/);
});

test('poolHealth counts eligible alive and dead', () => {
  const pool = [...makePool(3, 2), person(99, { born: '1995-01-01' }), person(98, { status: 'rejected' })];
  assert.deepEqual(poolHealth(pool, today), { alive: 3, dead: 2 });
});

test('recordShown replaces today and prunes entries outside the window', () => {
  const history = [
    { date: '2026-08-01', ids: [1] },
    { date: '2026-09-30', ids: [2] },
    { date: today, ids: [3] },
  ];
  assert.deepEqual(recordShown(history, today, [7, 8]), [
    { date: '2026-09-30', ids: [2] },
    { date: today, ids: [7, 8] },
  ]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:scripts`
Expected: FAIL — `Cannot find module '.../scripts/lib/picker.js'`

- [ ] **Step 3: Implement `scripts/lib/picker.js`**

```js
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:scripts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/picker.js scripts/lib/picker.test.js
git commit -F - <<'EOF'
feat(script): add seeded daily picker with variable dead count

Picks 1-4 dead per day weighted toward 2-3, draws by trickiness,
never picks alive people under 50, and falls back to
least-recently-shown entries when a pool runs short.

Agent-Tool: claude-code
Agent-Model: <your model id>
EOF
```

---

### Task 3: Pool merge and v1 migration

**Files:**
- Create: `scripts/lib/merge.js`
- Test: `scripts/lib/merge.test.js`

**Interfaces:**
- Consumes: `effectiveTrickiness` (Task 1)
- Produces:
  - `HUMAN_FIELDS = ['status', 'notes', 'trickinessOverride']`
  - `mergePool(existing: entry[], fresh: machineEntry[]): { celebrities: entry[], added: number, refreshed: number }`
  - `sortPool(entries): entry[]` — status order pending → approved → rejected, then effective trickiness desc, then name
  - `migrateLegacy(data): { existing: entry[], legacyIds: number[] }` — v1 (`version !== '2'`) yields no existing entries and all v1 `tmdbId`s as `legacyIds`

- [ ] **Step 1: Write the failing tests**

`scripts/lib/merge.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergePool, sortPool, migrateLegacy } from './merge.js';

const machine = (id, extra = {}) => ({
  tmdbId: id, name: `P${id}`, birthDate: '1940-01-01', deathDate: null, trickiness: 50, ...extra,
});

test('new ids are added as pending with empty human fields', () => {
  const { celebrities, added, refreshed } = mergePool([], [machine(1)]);
  assert.equal(added, 1);
  assert.equal(refreshed, 0);
  assert.deepEqual(celebrities[0], { ...machine(1), status: 'pending', notes: '', trickinessOverride: null });
});

test('refresh updates machine fields and keeps human fields', () => {
  const existing = [{ ...machine(1), status: 'approved', notes: 'great', trickinessOverride: 90 }];
  const { celebrities, refreshed } = mergePool(existing, [machine(1, { deathDate: '2026-09-01', trickiness: 80 })]);
  assert.equal(refreshed, 1);
  assert.equal(celebrities[0].deathDate, '2026-09-01');
  assert.equal(celebrities[0].trickiness, 80);
  assert.equal(celebrities[0].status, 'approved');
  assert.equal(celebrities[0].notes, 'great');
  assert.equal(celebrities[0].trickinessOverride, 90);
});

test('rejected entries stay rejected', () => {
  const existing = [{ ...machine(1), status: 'rejected', notes: '', trickinessOverride: null }];
  const { celebrities } = mergePool(existing, [machine(1)]);
  assert.equal(celebrities[0].status, 'rejected');
});

test('existing entries missing from fresh results are kept untouched', () => {
  const keep = { ...machine(2), status: 'approved', notes: 'x', trickinessOverride: null };
  const { celebrities } = mergePool([keep], [machine(1)]);
  assert.deepEqual(celebrities.find(e => e.tmdbId === 2), keep);
});

test('sortPool orders by status, then trickiness desc, then name', () => {
  const e = (id, status, trickiness, name) =>
    ({ tmdbId: id, status, trickiness, trickinessOverride: null, name });
  const sorted = sortPool([
    e(1, 'rejected', 99, 'A'), e(2, 'approved', 10, 'B'), e(3, 'pending', 20, 'C'),
    e(4, 'pending', 80, 'D'), e(5, 'pending', 80, 'Ab'),
  ]);
  assert.deepEqual(sorted.map(x => x.tmdbId), [5, 4, 3, 2, 1]);
});

test('migrateLegacy turns a v1 list into ids to re-check', () => {
  const v1 = { version: '1', celebrities: [{ tmdbId: 7, name: 'X', difficulty: 'hard', notes: 'directing' }] };
  assert.deepEqual(migrateLegacy(v1), { existing: [], legacyIds: [7] });
});

test('migrateLegacy passes v2 through', () => {
  const v2 = { version: '2', celebrities: [{ tmdbId: 7, status: 'approved' }] };
  assert.deepEqual(migrateLegacy(v2), { existing: v2.celebrities, legacyIds: [] });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:scripts`
Expected: FAIL — `Cannot find module '.../scripts/lib/merge.js'`

- [ ] **Step 3: Implement `scripts/lib/merge.js`**

```js
// Merges freshly built machine data into the curated pool without ever
// touching the fields a human owns.

import { effectiveTrickiness } from './trickiness.js';

export const HUMAN_FIELDS = ['status', 'notes', 'trickinessOverride'];
const STATUS_ORDER = { pending: 0, approved: 1, rejected: 2 };

export function sortPool(entries) {
  return [...entries].sort((a, b) =>
    (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9) ||
    effectiveTrickiness(b) - effectiveTrickiness(a) ||
    a.name.localeCompare(b.name));
}

export function mergePool(existing, fresh) {
  const byId = new Map(existing.map(e => [e.tmdbId, e]));
  let added = 0;
  let refreshed = 0;
  for (const entry of fresh) {
    const prev = byId.get(entry.tmdbId);
    if (prev) {
      byId.set(entry.tmdbId, {
        ...entry,
        status: prev.status,
        notes: prev.notes ?? '',
        trickinessOverride: prev.trickinessOverride ?? null,
      });
      refreshed++;
    } else {
      byId.set(entry.tmdbId, { ...entry, status: 'pending', notes: '', trickinessOverride: null });
      added++;
    }
  }
  return { celebrities: sortPool([...byId.values()]), added, refreshed };
}

// v1 lists had auto-assigned difficulty and no review status, so nothing
// carries over except the ids, which are re-checked against the filters.
export function migrateLegacy(data) {
  if (data.version === '2') return { existing: data.celebrities ?? [], legacyIds: [] };
  return { existing: [], legacyIds: (data.celebrities ?? []).map(e => e.tmdbId) };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:scripts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/merge.js scripts/lib/merge.test.js
git commit -F - <<'EOF'
feat(script): add pool merge that preserves review decisions

Machine fields refresh on each build; status, notes and trickiness
overrides are never overwritten. v1 lists migrate to ids to re-check.

Agent-Tool: claude-code
Agent-Model: <your model id>
EOF
```

---

### Task 4: Candidate parsing and filters

**Files:**
- Create: `scripts/lib/candidates.js`
- Test: `scripts/lib/candidates.test.js`

**Interfaces:**
- Consumes: `ageOn` (Task 1); `MIN_ALIVE_AGE` (Task 2)
- Produces:
  - Constants: `MIN_SITELINKS = 30`, `MIN_SITELINKS_FOREIGN = 60`, `MIN_EN_PAGEVIEWS = 100_000`, `MIN_EN_PAGEVIEWS_FOREIGN = 500_000`
  - `parseWikidataRow(binding): Candidate | null` where `Candidate = { wikidataId, tmdbId, birthDate, deathDate, sitelinks, enTitle, nationality: string[] }`
  - `qualifyPass(candidate): 'core' | 'fame' | null`
  - `passesAgeRule(candidate, today): boolean`
  - `passesPageviews(candidate & { enPageviews }, pass): boolean`
- The SPARQL bindings come from the query in Task 6, which selects `?item ?tmdb ?birthDate ?deathDate ?sitelinks ?enTitle ?citizenships`. `?citizenships` is `"Q30|United States;Q142|France"`.

- [ ] **Step 1: Write the failing tests**

`scripts/lib/candidates.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseWikidataRow, qualifyPass, passesAgeRule, passesPageviews } from './candidates.js';

const today = '2026-10-04';
const binding = (overrides = {}) => ({
  item: { value: 'http://www.wikidata.org/entity/Q873' },
  tmdb: { value: '4' },
  birthDate: { value: '1956-10-21T00:00:00Z' },
  deathDate: { value: '2016-12-27T00:00:00Z' },
  sitelinks: { value: '98' },
  enTitle: { value: 'Carrie Fisher' },
  citizenships: { value: 'Q30|United States of America' },
  ...overrides,
});

test('parseWikidataRow maps a full binding', () => {
  assert.deepEqual(parseWikidataRow(binding()), {
    wikidataId: 'Q873', tmdbId: 4, birthDate: '1956-10-21', deathDate: '2016-12-27',
    sitelinks: 98, enTitle: 'Carrie Fisher', nationality: ['US'],
  });
});

test('parseWikidataRow handles missing optionals and mixed nationality', () => {
  const c = parseWikidataRow(binding({
    deathDate: undefined, enTitle: undefined,
    citizenships: { value: 'Q145|United Kingdom;Q142|France;Q145|United Kingdom' },
  }));
  assert.equal(c.deathDate, null);
  assert.equal(c.enTitle, null);
  assert.deepEqual(c.nationality, ['GB', 'France']);
  assert.deepEqual(parseWikidataRow(binding({ citizenships: undefined })).nationality, []);
});

test('parseWikidataRow rejects non-numeric tmdb ids and missing birth dates', () => {
  assert.equal(parseWikidataRow(binding({ tmdb: { value: 'abc' } })), null);
  assert.equal(parseWikidataRow(binding({ birthDate: undefined })), null);
});

test('qualifyPass: US/UK at 30+ sitelinks is core, anyone at 60+ is fame', () => {
  assert.equal(qualifyPass({ nationality: ['US'], sitelinks: 30 }), 'core');
  assert.equal(qualifyPass({ nationality: ['GB', 'Ireland'], sitelinks: 45 }), 'core');
  assert.equal(qualifyPass({ nationality: ['US'], sitelinks: 29 }), null);
  assert.equal(qualifyPass({ nationality: ['France'], sitelinks: 59 }), null);
  assert.equal(qualifyPass({ nationality: ['France'], sitelinks: 60 }), 'fame');
  assert.equal(qualifyPass({ nationality: [], sitelinks: 100 }), 'fame');
});

test('passesAgeRule: dead at any age, alive only at 50+', () => {
  assert.equal(passesAgeRule({ birthDate: '1990-01-01', deathDate: '2020-01-01' }, today), true);
  assert.equal(passesAgeRule({ birthDate: '1990-01-01', deathDate: null }, today), false);
  assert.equal(passesAgeRule({ birthDate: '1976-10-04', deathDate: null }, today), true);
});

test('passesPageviews: per-pass thresholds; unknown views are kept', () => {
  assert.equal(passesPageviews({ enPageviews: 100_000 }, 'core'), true);
  assert.equal(passesPageviews({ enPageviews: 99_999 }, 'core'), false);
  assert.equal(passesPageviews({ enPageviews: 400_000 }, 'fame'), false);
  assert.equal(passesPageviews({ enPageviews: 500_000 }, 'fame'), true);
  assert.equal(passesPageviews({ enPageviews: null }, 'fame'), true);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:scripts`
Expected: FAIL — `Cannot find module '.../scripts/lib/candidates.js'`

- [ ] **Step 3: Implement `scripts/lib/candidates.js`**

```js
// Turns Wikidata rows into candidates and decides who is worth reviewing.
// Thresholds are starting points, tuned after real build-list runs.

import { ageOn } from './dates.js';
import { MIN_ALIVE_AGE } from './picker.js';

export const MIN_SITELINKS = 30;
export const MIN_SITELINKS_FOREIGN = 60;
export const MIN_EN_PAGEVIEWS = 100_000;
export const MIN_EN_PAGEVIEWS_FOREIGN = 500_000;

const NATIONALITY_CODES = { Q30: 'US', Q145: 'GB' };
const CORE_NATIONALITIES = new Set(['US', 'GB']);

const value = (binding, key) => binding[key]?.value ?? null;

function parseNationality(raw) {
  if (!raw) return [];
  const codes = raw.split(';').filter(Boolean).map(pair => {
    const [qid, label] = pair.split('|');
    return NATIONALITY_CODES[qid] ?? label;
  });
  return [...new Set(codes)];
}

export function parseWikidataRow(binding) {
  const tmdbId = Number(value(binding, 'tmdb'));
  const birth = value(binding, 'birthDate');
  if (!Number.isInteger(tmdbId) || tmdbId <= 0 || !birth) return null;
  return {
    wikidataId: value(binding, 'item').split('/').pop(),
    tmdbId,
    birthDate: birth.slice(0, 10),
    deathDate: value(binding, 'deathDate')?.slice(0, 10) ?? null,
    sitelinks: Number(value(binding, 'sitelinks') ?? 0),
    enTitle: value(binding, 'enTitle'),
    nationality: parseNationality(value(binding, 'citizenships')),
  };
}

export function qualifyPass(candidate) {
  const isCore = candidate.nationality.some(n => CORE_NATIONALITIES.has(n));
  if (isCore && candidate.sitelinks >= MIN_SITELINKS) return 'core';
  if (candidate.sitelinks >= MIN_SITELINKS_FOREIGN) return 'fame';
  return null;
}

export function passesAgeRule(candidate, today) {
  return Boolean(candidate.deathDate) || ageOn(candidate.birthDate, today) >= MIN_ALIVE_AGE;
}

export function passesPageviews(candidate, pass) {
  if (candidate.enPageviews == null) return true;
  const min = pass === 'core' ? MIN_EN_PAGEVIEWS : MIN_EN_PAGEVIEWS_FOREIGN;
  return candidate.enPageviews >= min;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:scripts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/candidates.js scripts/lib/candidates.test.js
git commit -F - <<'EOF'
feat(script): add Wikidata candidate parsing and filters

Core pass keeps US/UK actors with 30+ sitelinks; fame pass keeps any
nationality at 60+. Pageview thresholds gate US recognisability.

Agent-Tool: claude-code
Agent-Model: <your model id>
EOF
```

---

### Task 5: File helpers, API clients, and moving data out of `public/`

**Files:**
- Create: `scripts/lib/files.js`
- Create: `scripts/lib/sources.js`
- Move: `public/data/celeb-list.json` → `data/celeb-list.json`
- Move: `public/data/shown-history.json` → `data/shown-history.json`
- Modify: `.github/workflows/deploy.yml` (commit step `git add` line)

**Interfaces:**
- Consumes: `pageviewRange` (Task 1)
- Produces:
  - `files.js`: `CELEB_LIST_PATH`, `HISTORY_PATH`, `DAILY_PATH`, `REVIEW_HTML_PATH` (absolute paths); `readJson(path, fallback?)` (returns `fallback` only on `ENOENT` when given, otherwise throws); `writeJsonAtomic(path, data)` (2-space JSON + trailing newline, temp file + rename)
  - `sources.js`: `USER_AGENT`; `sleep(ms)`; `tmdbGet(path)` (throws `Error` with `.status` on HTTP failure, throws if `TMDB_API_KEY` unset); `fetchKnownFor(tmdbId): Promise<string[]>`; `wikidataDeathDate(tmdbId): Promise<string|null>`; `sparql(query): Promise<binding[]>` (retries once after 5 s, then throws); `fetchEnPageviews(title, today): Promise<number|null>` (404 → 0, other failure → null)

The old `build-celeb-list.js` and `generate-daily.js` still point at `public/data/` after this task. Both are rewritten in Tasks 6 and 9; don't patch them here.

- [ ] **Step 1: Create `scripts/lib/files.js`**

```js
// Repo paths and JSON file helpers shared by the scripts.

import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export const CELEB_LIST_PATH = join(ROOT, 'data', 'celeb-list.json');
export const HISTORY_PATH = join(ROOT, 'data', 'shown-history.json');
export const DAILY_PATH = join(ROOT, 'public', 'data', 'celebrities.json');
export const REVIEW_HTML_PATH = join(ROOT, 'scripts', 'review', 'index.html');

export function readJson(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    if (fallback !== undefined && err.code === 'ENOENT') return fallback;
    throw err;
  }
}

export function writeJsonAtomic(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
  renameSync(tmp, path);
}
```

- [ ] **Step 2: Create `scripts/lib/sources.js`**

`fetchKnownFor` and `wikidataDeathDate` move here unchanged from the current `scripts/generate-daily.js`.

```js
// Network clients: TMDB, Wikidata SPARQL, Wikimedia pageviews.

import { pageviewRange } from './dates.js';

const TMDB_BASE = 'https://api.themoviedb.org/3';
const WIKIDATA_SPARQL = 'https://query.wikidata.org/sparql';
const PAGEVIEWS_BASE =
  'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user';
export const USER_AGENT = 'AreTheyDeadGame/1.0 (educational; contact giantryansaul@gmail.com)';

export function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

export async function tmdbGet(path) {
  const key = process.env.TMDB_API_KEY;
  if (!key) throw new Error('TMDB_API_KEY not set. Copy .env.example to .env and add your key.');
  const sep = path.includes('?') ? '&' : '?';
  const res = await fetch(`${TMDB_BASE}${path}${sep}api_key=${key}`);
  if (!res.ok) {
    const err = new Error(`TMDB ${path}: ${res.status} ${res.statusText}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export async function fetchKnownFor(tmdbId) {
  try {
    const data = await tmdbGet(`/person/${tmdbId}/combined_credits`);
    const credits = [...(data.cast ?? []), ...(data.crew ?? [])];
    const seen = new Set();
    return credits
      .filter(c => !c.adult)
      .sort((a, b) => (b.vote_count ?? 0) - (a.vote_count ?? 0))
      .filter(c => {
        const title = c.media_type === 'tv' ? c.name : c.title;
        if (!title || seen.has(title)) return false;
        seen.add(title);
        return true;
      })
      .slice(0, 3)
      .map(c => (c.media_type === 'tv' ? c.name : c.title));
  } catch {
    return [];
  }
}

export async function wikidataDeathDate(tmdbId) {
  const query = `
    SELECT ?deathDate WHERE {
      ?item wdt:P4985 "${tmdbId}" .
      ?item wdt:P570 ?deathDate .
    } LIMIT 1`;
  try {
    const url = `${WIKIDATA_SPARQL}?query=${encodeURIComponent(query)}&format=json`;
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) return null;
    const data = await res.json();
    const val = data.results?.bindings?.[0]?.deathDate?.value;
    return val ? val.slice(0, 10) : null;
  } catch {
    return null;
  }
}

export async function sparql(query) {
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await sleep(5000);
    try {
      const res = await fetch(WIKIDATA_SPARQL, {
        method: 'POST',
        headers: {
          'User-Agent': USER_AGENT,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/sparql-results+json',
        },
        body: new URLSearchParams({ query }),
      });
      if (res.ok) return (await res.json()).results.bindings;
      lastErr = new Error(`Wikidata SPARQL: ${res.status} ${res.statusText}`);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

// Total en.wikipedia user pageviews over the last 12 full months.
// 404 means the API has no data for the article, so it counts as 0.
export async function fetchEnPageviews(title, today) {
  const { start, end } = pageviewRange(today);
  const article = encodeURIComponent(title.replaceAll(' ', '_'));
  try {
    const res = await fetch(`${PAGEVIEWS_BASE}/${article}/monthly/${start}/${end}`, {
      headers: { 'User-Agent': USER_AGENT },
    });
    if (res.status === 404) return 0;
    if (!res.ok) return null;
    const data = await res.json();
    return (data.items ?? []).reduce((sum, item) => sum + item.views, 0);
  } catch {
    return null;
  }
}
```

- [ ] **Step 3: Live smoke test the pageviews range**

Run:

```bash
node -e "
import('./scripts/lib/dates.js').then(async ({ pageviewRange }) => {
  const { start, end } = pageviewRange(new Date().toISOString().slice(0, 10));
  const url = 'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/Carrie_Fisher/monthly/' + start + '/' + end;
  const data = await (await fetch(url, { headers: { 'User-Agent': 'AreTheyDeadGame/1.0' } })).json();
  console.log(data.items.length, data.items[0].timestamp, data.items.at(-1).timestamp);
});"
```

Expected: `12` items, first timestamp in the month 12 months ago, last in last month. If the count is 11 or 13, adjust `end` in `pageviewRange` (e.g. use the last day of the previous month), update the `pageviewRange` test expectations to match, and re-run `npm run test:scripts`.

- [ ] **Step 4: Live smoke test the clients**

Run:

```bash
node --env-file=.env -e "
import('./scripts/lib/sources.js').then(async s => {
  console.log('pageviews', await s.fetchEnPageviews('Carrie Fisher', new Date().toISOString().slice(0, 10)));
  console.log('death', await s.wikidataDeathDate(4));
  console.log('knownFor', await s.fetchKnownFor(4));
  console.log('sparql rows', (await s.sparql('SELECT ?x WHERE { wd:Q873 wdt:P4985 ?x }')).length);
});"
```

Expected: a pageview number in the hundreds of thousands or more, `death 2016-12-27`, three titles including a Star Wars film, `sparql rows 1`.

- [ ] **Step 5: Move the data files and update CI**

```bash
mkdir -p data
git mv public/data/celeb-list.json data/celeb-list.json
git mv public/data/shown-history.json data/shown-history.json
```

In `.github/workflows/deploy.yml`, change the commit step line

```yaml
          git add public/data/celebrities.json public/data/shown-history.json
```

to

```yaml
          git add public/data/celebrities.json data/shown-history.json
```

Run: `ls public/data` — Expected: only `celebrities.json`.

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/files.js scripts/lib/sources.js data .github/workflows/deploy.yml
git commit -F - <<'EOF'
feat(script): add shared API clients and move pool out of public

The pool and history no longer ship to Vercel, so players can't read
answers from /data/celeb-list.json. Adds Wikidata SPARQL and Wikimedia
pageview clients alongside the existing TMDB helpers.

Agent-Tool: claude-code
Agent-Model: <your model id>
EOF
```

---

### Task 6: Rewrite `build-celeb-list.js` and run it for real

**Files:**
- Modify (full rewrite): `scripts/build-celeb-list.js`
- Modify: `data/celeb-list.json` (generated)
- Possibly modify: `scripts/lib/candidates.js` constants (threshold tuning)

**Interfaces:**
- Consumes: `CELEB_LIST_PATH`, `readJson`, `writeJsonAtomic` (Task 5); `sparql`, `tmdbGet`, `fetchKnownFor`, `fetchEnPageviews`, `sleep` (Task 5); `parseWikidataRow`, `qualifyPass`, `passesAgeRule`, `passesPageviews`, `MIN_SITELINKS` (Task 4); `computeTrickiness`, `fameFromPageviews` (Task 1); `mergePool`, `migrateLegacy` (Task 3); `poolHealth` (Task 2)
- Produces: `data/celeb-list.json` v2:
  `{ version: '2', lastUpdated, celebrities: [{ tmdbId, wikidataId, name, enTitle, birthDate, deathDate, nationality, sitelinks, enPageviews, profilePath, knownFor, trickiness, status, notes, trickinessOverride }] }`

- [ ] **Step 1: Replace `scripts/build-celeb-list.js`**

```js
#!/usr/bin/env node
// Builds/refreshes data/celeb-list.json. Candidates come from Wikidata
// (US/UK actors, plus globally famous ones), filtered by en.wikipedia
// pageviews and enriched from TMDB. Review decisions (status, notes,
// trickinessOverride) are never overwritten.
//
// Usage: node --env-file=.env scripts/build-celeb-list.js
// Requires: TMDB_API_KEY in .env

import { CELEB_LIST_PATH, readJson, writeJsonAtomic } from './lib/files.js';
import { sparql, tmdbGet, fetchKnownFor, fetchEnPageviews, sleep } from './lib/sources.js';
import {
  parseWikidataRow, qualifyPass, passesAgeRule, passesPageviews, MIN_SITELINKS,
} from './lib/candidates.js';
import { computeTrickiness, fameFromPageviews } from './lib/trickiness.js';
import { mergePool, migrateLegacy } from './lib/merge.js';
import { poolHealth } from './lib/picker.js';

if (!process.env.TMDB_API_KEY) {
  console.error('Error: TMDB_API_KEY not set. Copy .env.example to .env and add your key.');
  process.exit(1);
}

// actor, film actor, television actor, voice actor
const ACTOR_OCCUPATIONS = 'wd:Q33999 wd:Q10800557 wd:Q10798782 wd:Q2405480';
const FIRST_BIRTH_DECADE = 1900;
const ID_BATCH = 100;

const SELECT = `
SELECT ?item ?tmdb (SAMPLE(?birth) AS ?birthDate) (SAMPLE(?death) AS ?deathDate)
       (SAMPLE(?sl) AS ?sitelinks) (SAMPLE(?title) AS ?enTitle)
       (GROUP_CONCAT(DISTINCT ?citPair; separator=";") AS ?citizenships)`;

const OPTIONALS = `
  OPTIONAL { ?item wdt:P570 ?death . }
  OPTIONAL {
    ?item wdt:P27 ?cit .
    ?cit rdfs:label ?citLabel .
    FILTER(LANG(?citLabel) = "en")
    BIND(CONCAT(STRAFTER(STR(?cit), "entity/"), "|", ?citLabel) AS ?citPair)
  }
  OPTIONAL {
    ?article schema:about ?item ;
             schema:isPartOf <https://en.wikipedia.org/> ;
             schema:name ?title .
  }`;

function decadeQuery(from) {
  return `${SELECT} WHERE {
  VALUES ?occ { ${ACTOR_OCCUPATIONS} }
  ?item wdt:P106 ?occ ;
        wdt:P31 wd:Q5 ;
        wdt:P4985 ?tmdb ;
        wdt:P569 ?birth ;
        wikibase:sitelinks ?sl .
  FILTER(?sl >= ${MIN_SITELINKS})
  FILTER(?birth >= "${from}-01-01T00:00:00Z"^^xsd:dateTime &&
         ?birth <  "${from + 10}-01-01T00:00:00Z"^^xsd:dateTime)
  ${OPTIONALS}
} GROUP BY ?item ?tmdb`;
}

function idQuery(tmdbIds) {
  return `${SELECT} WHERE {
  VALUES ?tmdb { ${tmdbIds.map(id => `"${id}"`).join(' ')} }
  ?item wdt:P4985 ?tmdb ;
        wdt:P569 ?birth ;
        wikibase:sitelinks ?sl .
  ${OPTIONALS}
} GROUP BY ?item ?tmdb`;
}

async function fetchCandidateRows(today, recheckIds) {
  const rows = [];
  const lastDecade = Math.floor(Number(today.slice(0, 4)) / 10) * 10;
  for (let from = FIRST_BIRTH_DECADE; from <= lastDecade; from += 10) {
    const chunk = await sparql(decadeQuery(from));
    console.log(`  Born ${from}s: ${chunk.length} rows`);
    rows.push(...chunk);
    await sleep(1000);
  }
  for (let i = 0; i < recheckIds.length; i += ID_BATCH) {
    const chunk = await sparql(idQuery(recheckIds.slice(i, i + ID_BATCH)));
    console.log(`  Re-check batch ${i / ID_BATCH + 1}: ${chunk.length} rows`);
    rows.push(...chunk);
    await sleep(1000);
  }
  return rows;
}

function dedupe(rows) {
  const byId = new Map();
  for (const row of rows) {
    const c = parseWikidataRow(row);
    if (c && !byId.has(c.tmdbId)) byId.set(c.tmdbId, c);
  }
  return [...byId.values()];
}

async function enrich(candidates) {
  const enriched = [];
  for (const c of candidates) {
    try {
      const detail = await tmdbGet(`/person/${c.tmdbId}`);
      await sleep(60);
      if (detail.adult) {
        process.stdout.write('x');
        continue;
      }
      const knownFor = await fetchKnownFor(c.tmdbId);
      await sleep(60);
      enriched.push({ ...c, name: detail.name, profilePath: detail.profile_path || null, knownFor });
      process.stdout.write('.');
    } catch (err) {
      console.warn(`\n  Skipping ${c.enTitle ?? c.tmdbId}: ${err.message}`);
    }
  }
  console.log();
  return enriched;
}

async function main() {
  const today = new Date().toISOString().slice(0, 10);
  const { existing, legacyIds } = migrateLegacy(
    readJson(CELEB_LIST_PATH, { version: '2', celebrities: [] }),
  );
  const existingIds = new Set(existing.map(e => e.tmdbId));
  console.log(`Existing entries: ${existing.length}; v1 ids to re-check: ${legacyIds.length}`);

  console.log('Querying Wikidata...');
  const all = dedupe(await fetchCandidateRows(today, [...existingIds, ...legacyIds]));
  const candidates = all
    .map(c => ({ ...c, pass: qualifyPass(c) }))
    .filter(c => existingIds.has(c.tmdbId) || (c.pass && passesAgeRule(c, today)));
  console.log(`Candidates after nationality/fame/age filters: ${candidates.length}`);

  console.log('Fetching en.wikipedia pageviews...');
  for (const c of candidates) {
    c.enPageviews = c.enTitle ? await fetchEnPageviews(c.enTitle, today) : null;
    process.stdout.write('.');
    await sleep(50);
  }
  console.log();
  const popular = candidates.filter(c => existingIds.has(c.tmdbId) || passesPageviews(c, c.pass));
  console.log(`After pageview filter: ${popular.length}`);

  console.log('Enriching from TMDB...');
  const enriched = await enrich(popular);

  const allViews = enriched.map(c => c.enPageviews);
  const fresh = enriched.map(c => ({
    tmdbId: c.tmdbId,
    wikidataId: c.wikidataId,
    name: c.name,
    enTitle: c.enTitle,
    birthDate: c.birthDate,
    deathDate: c.deathDate,
    nationality: c.nationality,
    sitelinks: c.sitelinks,
    enPageviews: c.enPageviews,
    profilePath: c.profilePath,
    knownFor: c.knownFor,
    trickiness: computeTrickiness({
      birthDate: c.birthDate,
      deathDate: c.deathDate,
      fame: fameFromPageviews(c.enPageviews, allViews),
      today,
    }),
  }));

  const { celebrities, added, refreshed } = mergePool(existing, fresh);
  writeJsonAtomic(CELEB_LIST_PATH, { version: '2', lastUpdated: today, celebrities });

  const byStatus = { pending: 0, approved: 0, rejected: 0 };
  for (const e of celebrities) byStatus[e.status]++;
  const pendingDead = celebrities.filter(e => e.status === 'pending' && e.deathDate).length;
  const health = poolHealth(celebrities, today);
  console.log(`\nWrote ${CELEB_LIST_PATH}`);
  console.log(`  ${celebrities.length} total — ${added} new, ${refreshed} refreshed`);
  console.log(`  pending ${byStatus.pending} (${pendingDead} dead), approved ${byStatus.approved}, rejected ${byStatus.rejected}`);
  console.log(`  approved & pickable: alive ${health.alive}, dead ${health.dead} (target ≥ 75 each)`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Run it against the real APIs**

Run: `npm run build-list` (expect 10–30 minutes; mostly pageview and TMDB calls)
Expected: one `Born 19x0s: N rows` line per decade with no SPARQL errors, then a summary. `data/celeb-list.json` has `"version": "2"`.

If a decade query fails twice with a timeout, split that decade into two 5-year halves in `fetchCandidateRows` (loop step `5` instead of `10` and change `from + 10` in `decadeQuery` to `from + 5`), then re-run.

- [ ] **Step 3: Sanity-check the output and tune thresholds**

Run:

```bash
node -e "
const d = JSON.parse(require('fs').readFileSync('data/celeb-list.json', 'utf8'));
const p = d.celebrities.filter(e => e.status === 'pending');
const nat = {}; p.forEach(e => (e.nationality.length ? e.nationality : ['?']).forEach(n => nat[n] = (nat[n] || 0) + 1));
console.log('pending', p.length, 'dead', p.filter(e => e.deathDate).length);
console.log('top nationalities', Object.entries(nat).sort((a, b) => b[1] - a[1]).slice(0, 8));
console.log('top 15 trickiness', p.slice(0, 15).map(e => e.name + ' ' + e.trickiness));
console.log('bottom 10 pageviews', [...p].sort((a, b) => (a.enPageviews ?? 0) - (b.enPageviews ?? 0)).slice(0, 10).map(e => e.name + ' ' + e.enPageviews));"
```

Tune `scripts/lib/candidates.js` constants and re-run Step 2 until:
- pending is between ~300 and ~1500 (too many → raise `MIN_EN_PAGEVIEWS`; too few → lower it),
- pending dead ≥ 150 (if not, lower `MIN_EN_PAGEVIEWS` first),
- US + GB make up ≥ 75% of pending,
- the bottom-10-by-pageviews names are still people a US audience might recognise; if not, raise `MIN_EN_PAGEVIEWS`.

If a constant changes, re-run `npm run test:scripts` and update `candidates.test.js` expectations that reference the old numbers.

- [ ] **Step 4: Verify review decisions survive a rebuild**

```bash
node -e "
const fs = require('fs'); const f = 'data/celeb-list.json';
const d = JSON.parse(fs.readFileSync(f, 'utf8'));
d.celebrities[0].status = 'rejected'; d.celebrities[0].notes = 'merge-check';
fs.writeFileSync(f, JSON.stringify(d, null, 2) + '\n');
console.log('marked', d.celebrities[0].tmdbId);"
npm run build-list
node -e "
const d = JSON.parse(require('fs').readFileSync('data/celeb-list.json', 'utf8'));
console.log(d.celebrities.filter(e => e.notes === 'merge-check').map(e => [e.tmdbId, e.status]));"
```

Expected: the marked id is printed with `'rejected'`. Then set that entry back to `pending` with empty `notes` (same `node -e` edit pattern) so the user reviews it fresh.

- [ ] **Step 5: Commit**

```bash
git add scripts/build-celeb-list.js scripts/lib/candidates.js scripts/lib/candidates.test.js data/celeb-list.json
git commit -F - <<'EOF'
feat(script): source candidate pool from Wikidata and pageviews

Replaces TMDB trending with Wikidata actors (US/UK core pass plus a
high-fame foreign pass), gated by en.wikipedia pageviews and the
alive-50+ rule. Migrates the v1 list; all entries start pending.

Agent-Tool: claude-code
Agent-Model: <your model id>
EOF
```

---

### Task 7: Review server and update API

**Files:**
- Create: `scripts/lib/review-api.js`
- Test: `scripts/lib/review-api.test.js`
- Create: `scripts/review-server.js`
- Create: `scripts/review/index.html` (placeholder only, replaced in Task 8)

**Interfaces:**
- Consumes: `CELEB_LIST_PATH`, `REVIEW_HTML_PATH`, `readJson`, `writeJsonAtomic` (Task 5)
- Produces:
  - `class ReviewError extends Error { status: number }`
  - `applyEntryUpdate(data, tmdbId: number, patch): { data, entry }` — pure, doesn't mutate input; throws `ReviewError(400)` for invalid patch, `ReviewError(404)` for unknown id
  - HTTP: `GET /` (HTML), `GET /api/pool` (whole pool JSON), `POST /api/entry/:tmdbId` → `200 { entry }` or `4xx/500 { error }`

- [ ] **Step 1: Write the failing tests**

`scripts/lib/review-api.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyEntryUpdate, ReviewError } from './review-api.js';

const data = () => ({
  version: '2',
  celebrities: [
    { tmdbId: 1, name: 'A', status: 'pending', notes: '', trickinessOverride: null },
    { tmdbId: 2, name: 'B', status: 'pending', notes: '', trickinessOverride: null },
  ],
});

const rejectsWith = (status, fn) =>
  assert.throws(fn, err => err instanceof ReviewError && err.status === status);

test('applies a valid patch without mutating the input', () => {
  const input = data();
  const { data: out, entry } = applyEntryUpdate(input, 2, { status: 'approved', notes: 'yes', trickinessOverride: 70 });
  assert.deepEqual(entry, { tmdbId: 2, name: 'B', status: 'approved', notes: 'yes', trickinessOverride: 70 });
  assert.equal(out.celebrities[1], entry);
  assert.equal(out.version, '2');
  assert.equal(input.celebrities[1].status, 'pending');
});

test('trickinessOverride accepts null', () => {
  assert.equal(applyEntryUpdate(data(), 1, { trickinessOverride: null }).entry.trickinessOverride, null);
});

test('rejects invalid patches with 400', () => {
  rejectsWith(400, () => applyEntryUpdate(data(), 1, null));
  rejectsWith(400, () => applyEntryUpdate(data(), 1, []));
  rejectsWith(400, () => applyEntryUpdate(data(), 1, {}));
  rejectsWith(400, () => applyEntryUpdate(data(), 1, { name: 'hacked' }));
  rejectsWith(400, () => applyEntryUpdate(data(), 1, { status: 'maybe' }));
  rejectsWith(400, () => applyEntryUpdate(data(), 1, { notes: 5 }));
  rejectsWith(400, () => applyEntryUpdate(data(), 1, { trickinessOverride: 101 }));
  rejectsWith(400, () => applyEntryUpdate(data(), 1, { trickinessOverride: 4.5 }));
});

test('unknown id is a 404', () => {
  rejectsWith(404, () => applyEntryUpdate(data(), 99, { status: 'approved' }));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:scripts`
Expected: FAIL — `Cannot find module '.../scripts/lib/review-api.js'`

- [ ] **Step 3: Implement `scripts/lib/review-api.js`**

```js
// Validated updates to a single pool entry, used by the review server.

const STATUSES = ['pending', 'approved', 'rejected'];
const EDITABLE_FIELDS = ['status', 'notes', 'trickinessOverride'];

export class ReviewError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function validatePatch(patch) {
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) {
    throw new ReviewError(400, 'Body must be a JSON object');
  }
  const keys = Object.keys(patch);
  if (keys.length === 0) throw new ReviewError(400, 'No fields to update');
  const unknown = keys.filter(k => !EDITABLE_FIELDS.includes(k));
  if (unknown.length) throw new ReviewError(400, `Unknown fields: ${unknown.join(', ')}`);
  if ('status' in patch && !STATUSES.includes(patch.status)) {
    throw new ReviewError(400, `status must be one of ${STATUSES.join(', ')}`);
  }
  if ('notes' in patch && typeof patch.notes !== 'string') {
    throw new ReviewError(400, 'notes must be a string');
  }
  if ('trickinessOverride' in patch) {
    const v = patch.trickinessOverride;
    if (v !== null && !(Number.isInteger(v) && v >= 0 && v <= 100)) {
      throw new ReviewError(400, 'trickinessOverride must be null or an integer 0-100');
    }
  }
}

export function applyEntryUpdate(data, tmdbId, patch) {
  validatePatch(patch);
  const current = (data.celebrities ?? []).find(e => e.tmdbId === tmdbId);
  if (!current) throw new ReviewError(404, `No entry with tmdbId ${tmdbId}`);
  const entry = { ...current, ...patch };
  return {
    data: { ...data, celebrities: data.celebrities.map(e => (e === current ? entry : e)) },
    entry,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:scripts`
Expected: PASS.

- [ ] **Step 5: Create `scripts/review-server.js`**

```js
#!/usr/bin/env node
// Local-only review UI for data/celeb-list.json. Never deployed.
//
// Usage: npm run review   → http://127.0.0.1:5174

import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { exec } from 'node:child_process';
import { CELEB_LIST_PATH, REVIEW_HTML_PATH, readJson, writeJsonAtomic } from './lib/files.js';
import { applyEntryUpdate, ReviewError } from './lib/review-api.js';

const HOST = '127.0.0.1';
const PORT = 5174;
const MAX_BODY_BYTES = 10_000;

function send(res, status, body, type = 'application/json') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new ReviewError(413, 'Body too large'));
        req.destroy();
      } else {
        chunks.push(chunk);
      }
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function handle(req, res) {
  const { pathname } = new URL(req.url, `http://${HOST}`);

  if (req.method === 'GET' && pathname === '/') {
    return send(res, 200, readFileSync(REVIEW_HTML_PATH, 'utf8'), 'text/html; charset=utf-8');
  }
  if (req.method === 'GET' && pathname === '/api/pool') {
    return send(res, 200, readJson(CELEB_LIST_PATH));
  }
  const match = pathname.match(/^\/api\/entry\/(\d+)$/);
  if (req.method === 'POST' && match) {
    const raw = await readBody(req);
    let patch;
    try {
      patch = JSON.parse(raw);
    } catch {
      throw new ReviewError(400, 'Body must be JSON');
    }
    const { data, entry } = applyEntryUpdate(readJson(CELEB_LIST_PATH), Number(match[1]), patch);
    writeJsonAtomic(CELEB_LIST_PATH, data);
    return send(res, 200, { entry });
  }
  send(res, 404, { error: 'Not found' });
}

createServer((req, res) => {
  handle(req, res).catch(err => {
    const status = err instanceof ReviewError ? err.status : 500;
    if (status === 500) console.error(err);
    send(res, status, { error: err.message });
  });
}).listen(PORT, HOST, () => {
  const url = `http://${HOST}:${PORT}`;
  console.log(`Review UI: ${url}  (Ctrl+C to stop)`);
  const opener =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start ""' : 'xdg-open';
  exec(`${opener} ${url}`, () => {});
});
```

- [ ] **Step 6: Create a placeholder `scripts/review/index.html`**

```html
<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Celebrity Review</title></head>
<body><p>Review UI placeholder.</p></body></html>
```

- [ ] **Step 7: Smoke test the server**

Run the server in the background: `node scripts/review-server.js` (background it; the browser-open failure is ignored). Then:

```bash
curl -s http://127.0.0.1:5174/ | head -3
curl -s http://127.0.0.1:5174/api/pool | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const d=JSON.parse(s);console.log(d.version,d.celebrities.length)})"
curl -s -w ' %{http_code}\n' -X POST -d '{"status":"maybe"}' http://127.0.0.1:5174/api/entry/1
curl -s -w ' %{http_code}\n' -X POST -d 'not json' http://127.0.0.1:5174/api/entry/1
curl -s -w ' %{http_code}\n' -X POST -d '{"status":"pending"}' http://127.0.0.1:5174/api/entry/999999999
ID=$(node -e "console.log(JSON.parse(require('fs').readFileSync('data/celeb-list.json','utf8')).celebrities[0].tmdbId)")
curl -s -w ' %{http_code}\n' -X POST -d '{"status":"pending"}' http://127.0.0.1:5174/api/entry/$ID
git diff --stat data/celeb-list.json
```

Expected: placeholder HTML; `2 <count>`; `{"error":"status must be one of ..."} 400`; `{"error":"Body must be JSON"} 400`; `404`; `{"entry":{...}} 200`; no diff in `data/celeb-list.json` (no-op write produces identical bytes). Stop the server.

- [ ] **Step 8: Commit**

```bash
git add scripts/lib/review-api.js scripts/lib/review-api.test.js scripts/review-server.js scripts/review/index.html
git commit -F - <<'EOF'
feat(script): add local review server for the celebrity pool

Serves the pool on 127.0.0.1:5174 and persists validated status,
notes and trickiness override edits atomically.

Agent-Tool: claude-code
Agent-Model: <your model id>
EOF
```

---

### Task 8: Review UI

**Files:**
- Modify (full replace): `scripts/review/index.html`

**Interfaces:**
- Consumes: `GET /api/pool`, `POST /api/entry/:tmdbId` (Task 7); pool entry fields from Task 6
- Produces: the review page. Keyboard: **A** approve, **R** reject, **N** focus notes, **←/→** navigate, **Z** undo, **Esc** leave a text field.

- [ ] **Step 1: Replace `scripts/review/index.html`**

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Celebrity Review</title>
<style>
  :root {
    --bg: #111418; --panel: #1b2027; --field: #262c35; --line: #333b46;
    --text: #e8eaed; --muted: #9aa3ad; --accent: #7cc4ff;
    --ok: #5fd38d; --bad: #ff7a7a; --warn: #f2c94c;
  }
  * { box-sizing: border-box; }
  body { margin: 0; font: 15px/1.45 system-ui, sans-serif; background: var(--bg); color: var(--text); }
  header {
    position: sticky; top: 0; z-index: 1; display: flex; flex-wrap: wrap; gap: 10px;
    align-items: center; padding: 12px 16px; background: var(--panel); border-bottom: 1px solid var(--line);
  }
  button, select, input, textarea {
    font: inherit; color: var(--text); background: var(--field);
    border: 1px solid var(--line); border-radius: 6px; padding: 6px 10px;
  }
  button { cursor: pointer; }
  .tabs button[aria-pressed="true"] { border-color: var(--accent); color: var(--accent); }
  .health { margin-left: auto; display: flex; gap: 14px; color: var(--muted); }
  .health b.low { color: var(--warn); }
  .health b.ok { color: var(--ok); }
  main { max-width: 860px; margin: 24px auto; padding: 0 16px; }
  .error { background: #4a1f1f; color: #ffd6d6; padding: 8px 12px; border-radius: 6px; margin-bottom: 12px; }
  .empty { color: var(--muted); text-align: center; padding: 48px 0; }
  .card { display: grid; grid-template-columns: 220px 1fr; gap: 20px; background: var(--panel); border-radius: 10px; padding: 20px; }
  .card img, .card .noimg { width: 220px; aspect-ratio: 2 / 3; object-fit: cover; border-radius: 8px; background: var(--field); }
  .noimg { display: grid; place-items: center; color: var(--muted); }
  @media (max-width: 640px) {
    .card { grid-template-columns: 1fr; }
    .card img, .card .noimg { width: 100%; max-width: 260px; }
    .health { margin-left: 0; }
  }
  h2 { margin: 0; font-size: 26px; }
  .muted { color: var(--muted); }
  .alive { color: var(--ok); } .dead { color: var(--bad); }
  .badge { display: inline-block; padding: 1px 8px; border-radius: 999px; font-size: 12px; background: var(--field); border: 1px solid var(--line); }
  .badge.warn { color: var(--warn); border-color: var(--warn); }
  .stats { display: flex; flex-wrap: wrap; gap: 20px; margin: 14px 0; }
  .stats b { display: block; font-size: 22px; }
  .known { margin: 6px 0 12px; padding-left: 18px; }
  .links a { color: var(--accent); margin-right: 14px; }
  label { display: block; margin-top: 12px; color: var(--muted); font-size: 13px; }
  textarea { width: 100%; min-height: 56px; resize: vertical; }
  input[type="number"] { width: 90px; }
  .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
  .actions .approve { border-color: var(--ok); color: var(--ok); }
  .actions .reject { border-color: var(--bad); color: var(--bad); }
  footer { text-align: center; color: var(--muted); font-size: 13px; padding: 16px; }
  kbd { background: var(--field); border: 1px solid var(--line); border-radius: 4px; padding: 0 5px; }
</style>
</head>
<body>
<header>
  <div class="tabs" id="tabs">
    <button data-tab="pending">Pending</button>
    <button data-tab="approved">Approved</button>
    <button data-tab="rejected">Rejected</button>
  </div>
  <select id="sort" aria-label="Sort">
    <option value="trickiness">Sort: trickiness</option>
    <option value="pageviews">Sort: pageviews</option>
    <option value="name">Sort: name</option>
  </select>
  <select id="filter" aria-label="Filter">
    <option value="all">All</option>
    <option value="alive">Alive</option>
    <option value="dead">Dead</option>
  </select>
  <span class="muted" id="position"></span>
  <div class="health" id="health"></div>
</header>
<main id="main"><p class="empty">Loading…</p></main>
<footer>
  <kbd>A</kbd> approve · <kbd>R</kbd> reject · <kbd>N</kbd> notes · <kbd>←</kbd>/<kbd>→</kbd> navigate · <kbd>Z</kbd> undo · <kbd>Esc</kbd> leave field
</footer>
<script>
const TODAY = new Date().toISOString().slice(0, 10);
const HEALTH_TARGET = 75;
const MIN_ALIVE_AGE = 50;
const state = { pool: [], tab: 'pending', sort: 'trickiness', filter: 'all', index: 0, undo: [], error: '' };

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const effective = e => e.trickinessOverride ?? e.trickiness ?? 0;
const fmtNum = n => (n == null ? '—' : n.toLocaleString());

function ageOn(birth, on) {
  const b = new Date(birth), d = new Date(on);
  let age = d.getUTCFullYear() - b.getUTCFullYear();
  const m = d.getUTCMonth() - b.getUTCMonth();
  if (m < 0 || (m === 0 && d.getUTCDate() < b.getUTCDate())) age--;
  return age;
}

const pickable = e => e.status === 'approved' && (e.deathDate || ageOn(e.birthDate, TODAY) >= MIN_ALIVE_AGE);

function visible() {
  const compare = {
    trickiness: (a, b) => effective(b) - effective(a),
    pageviews: (a, b) => (b.enPageviews ?? -1) - (a.enPageviews ?? -1),
    name: () => 0,
  }[state.sort];
  return state.pool
    .filter(e => e.status === state.tab)
    .filter(e => state.filter === 'all' || (state.filter === 'dead') === Boolean(e.deathDate))
    .sort((a, b) => compare(a, b) || a.name.localeCompare(b.name));
}

function current() {
  const list = visible();
  state.index = Math.max(0, Math.min(state.index, list.length - 1));
  return { list, entry: list[state.index] };
}

async function save(tmdbId, patch) {
  const res = await fetch(`/api/entry/${tmdbId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || res.statusText);
  state.pool[state.pool.findIndex(e => e.tmdbId === tmdbId)] = body.entry;
  return body.entry;
}

async function decide(status) {
  const { entry } = current();
  if (!entry || entry.status === status) return;
  const previous = entry.status;
  try {
    await save(entry.tmdbId, { status });
    state.undo.push({ tmdbId: entry.tmdbId, status: previous });
    state.error = '';
  } catch (err) {
    state.error = `Save failed: ${err.message}`;
  }
  render();
}

async function undo() {
  const last = state.undo.pop();
  if (!last) return;
  try {
    await save(last.tmdbId, { status: last.status });
    state.tab = last.status;
    state.index = visible().findIndex(e => e.tmdbId === last.tmdbId);
    state.error = '';
  } catch (err) {
    state.undo.push(last);
    state.error = `Undo failed: ${err.message}`;
  }
  render();
}

async function saveField(patch) {
  const { entry } = current();
  if (!entry) return;
  try {
    await save(entry.tmdbId, patch);
    state.error = '';
  } catch (err) {
    state.error = `Save failed: ${err.message}`;
  }
  render();
}

function renderHealth() {
  const approved = state.pool.filter(pickable);
  const dead = approved.filter(e => e.deathDate).length;
  const alive = approved.length - dead;
  const cls = n => (n >= HEALTH_TARGET ? 'ok' : 'low');
  const counts = { pending: 0, approved: 0, rejected: 0 };
  state.pool.forEach(e => counts[e.status]++);
  $('health').innerHTML =
    `<span>Pickable alive <b class="${cls(alive)}">${alive}</b>/${HEALTH_TARGET}</span>` +
    `<span>Pickable dead <b class="${cls(dead)}">${dead}</b>/${HEALTH_TARGET}</span>`;
  document.querySelectorAll('#tabs button').forEach(b => {
    b.setAttribute('aria-pressed', String(b.dataset.tab === state.tab));
    b.textContent = `${b.dataset.tab[0].toUpperCase()}${b.dataset.tab.slice(1)} (${counts[b.dataset.tab]})`;
  });
}

function renderCard(e) {
  const dead = Boolean(e.deathDate);
  const age = ageOn(e.birthDate, TODAY);
  const life = dead
    ? `<span class="dead">Dead</span> · born ${esc(e.birthDate)} · died ${esc(e.deathDate)} at ${ageOn(e.birthDate, e.deathDate)}`
    : `<span class="alive">Alive</span> · born ${esc(e.birthDate)} · age ${age}`;
  const underAge = !dead && age < MIN_ALIVE_AGE
    ? ' <span class="badge warn">under 50 — never picked</span>' : '';
  const photo = e.profilePath
    ? `<img src="https://image.tmdb.org/t/p/w300${esc(e.profilePath)}" alt="">`
    : '<div class="noimg">No photo</div>';
  const wiki = e.enTitle
    ? `<a href="https://en.wikipedia.org/wiki/${encodeURIComponent(e.enTitle.replaceAll(' ', '_'))}" target="_blank" rel="noopener">Wikipedia</a>` : '';
  const known = (e.knownFor ?? []).map(t => `<li>${esc(t)}</li>`).join('') || '<li class="muted">No credits</li>';
  return `
    <article class="card">
      ${photo}
      <div>
        <h2>${esc(e.name)}</h2>
        <div>${life}${underAge}</div>
        <div class="muted">${esc((e.nationality ?? []).join(', ') || 'Nationality unknown')}</div>
        <div class="stats">
          <div><span class="muted">Trickiness</span><b>${effective(e)}${e.trickinessOverride != null ? '*' : ''}</b></div>
          <div><span class="muted">en.wiki views / yr</span><b>${fmtNum(e.enPageviews)}</b></div>
          <div><span class="muted">Sitelinks</span><b>${fmtNum(e.sitelinks)}</b></div>
        </div>
        <div class="muted">Known for</div>
        <ul class="known">${known}</ul>
        <div class="links">
          <a href="https://www.themoviedb.org/person/${e.tmdbId}" target="_blank" rel="noopener">TMDB</a>${wiki}
        </div>
        <label for="notes">Notes</label>
        <textarea id="notes">${esc(e.notes)}</textarea>
        <label for="override">Trickiness override (blank = computed ${e.trickiness ?? 0})</label>
        <input id="override" type="number" min="0" max="100" step="1" value="${e.trickinessOverride ?? ''}">
        <div class="actions">
          <button class="approve" data-action="approve">Approve (A)</button>
          <button class="reject" data-action="reject">Reject (R)</button>
          <button data-action="pending">Back to pending</button>
        </div>
      </div>
    </article>`;
}

function render() {
  renderHealth();
  const { list, entry } = current();
  $('position').textContent = list.length ? `${state.index + 1} / ${list.length}` : '0 / 0';
  const error = state.error ? `<div class="error">${esc(state.error)}</div>` : '';
  $('main').innerHTML = error + (entry ? renderCard(entry) : `<p class="empty">Nothing ${esc(state.tab)} here.</p>`);
  if (!entry) return;
  $('notes').addEventListener('change', ev => saveField({ notes: ev.target.value }));
  $('override').addEventListener('change', ev => {
    const raw = ev.target.value.trim();
    saveField({ trickinessOverride: raw === '' ? null : Math.round(Number(raw)) });
  });
}

document.addEventListener('click', ev => {
  const tab = ev.target.closest('[data-tab]');
  if (tab) { state.tab = tab.dataset.tab; state.index = 0; render(); return; }
  const action = ev.target.closest('[data-action]')?.dataset.action;
  if (action === 'approve') decide('approved');
  if (action === 'reject') decide('rejected');
  if (action === 'pending') decide('pending');
});

$('sort').addEventListener('change', ev => { state.sort = ev.target.value; state.index = 0; render(); });
$('filter').addEventListener('change', ev => { state.filter = ev.target.value; state.index = 0; render(); });

document.addEventListener('keydown', ev => {
  const typing = ['TEXTAREA', 'INPUT', 'SELECT'].includes(document.activeElement?.tagName);
  if (typing) {
    if (ev.key === 'Escape') document.activeElement.blur();
    return;
  }
  if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
  const key = ev.key.toLowerCase();
  if (key === 'a') decide('approved');
  else if (key === 'r') decide('rejected');
  else if (key === 'z') undo();
  else if (key === 'n') { ev.preventDefault(); $('notes')?.focus(); }
  else if (ev.key === 'ArrowRight') { state.index++; render(); }
  else if (ev.key === 'ArrowLeft') { state.index--; render(); }
});

fetch('/api/pool')
  .then(res => res.json())
  .then(data => { state.pool = data.celebrities ?? []; render(); })
  .catch(err => { state.error = `Could not load pool: ${err.message}`; render(); });
</script>
</body>
</html>
```

- [ ] **Step 2: Drive it in a browser**

Start `node scripts/review-server.js` in the background. Using the chrome-devtools MCP tools (`new_page` / `navigate_page` to `http://127.0.0.1:5174`, `take_screenshot`, `press_key`, `take_snapshot`):

1. Screenshot: header shows tab counts and pickable alive/dead `0/75`, card shows photo, name, alive/dead line, trickiness, pageviews, known-for.
2. Note the first card's name, press `a`. The position counter's total drops by 1 and the card changes. Check that `data/celeb-list.json` shows that person as `"approved"`.
3. Press `z`. The Pending tab is active again with that person shown; the file shows `"pending"`.
4. Press `→` twice, `←` once; the counter goes 1 → 3 → 2.
5. Press `n`, type `test note`, press `Esc`. Check the file has that note, then clear it in the UI and press `Esc` again.
6. Switch filter to Dead: every card shows "Dead". Sort by name: the order is alphabetical.
7. `emulate` / `resize_page` to 390×844: the card stacks with no horizontal scroll.
8. Check `list_console_messages`: no errors.

Confirm `git diff data/celeb-list.json` is empty after the undo/clear steps. Stop the server.

- [ ] **Step 3: Commit**

```bash
git add scripts/review/index.html
git commit -F - <<'EOF'
feat(script): add keyboard-driven celebrity review page

Cards show photo, life dates, trickiness, pageviews and credits;
A/R/Z/N/arrow keys approve, reject, undo, annotate and navigate.

Agent-Tool: claude-code
Agent-Model: <your model id>
EOF
```

---

### Task 9: Rewrite `generate-daily.js` to use the picker

**Files:**
- Modify (full rewrite): `scripts/generate-daily.js`

**Interfaces:**
- Consumes: `CELEB_LIST_PATH`, `HISTORY_PATH`, `DAILY_PATH`, `readJson`, `writeJsonAtomic` (Task 5); `tmdbGet`, `fetchKnownFor`, `wikidataDeathDate`, `sleep` (Task 5); `pickDaily`, `dateSeed`, `poolHealth`, `recordShown`, `MIN_HEALTHY_POOL` (Task 2); `ageOn` (Task 1)
- Produces: `public/data/celebrities.json` in the unchanged `DailyData` shape; `data/shown-history.json` as `{ shown: [{ date, ids }] }`. CLI flags: `--seed-offset N`, `--pool PATH` (read an alternate pool file), `--dry-run` (print picks, write nothing).

- [ ] **Step 1: Replace `scripts/generate-daily.js`**

```js
#!/usr/bin/env node
// Picks today's 5 from the approved pool (data/celeb-list.json), checks
// death dates live via TMDB + Wikidata, and writes
// public/data/celebrities.json.
//
// Usage: node --env-file=.env scripts/generate-daily.js [--seed-offset N] [--pool PATH] [--dry-run]
// Requires: TMDB_API_KEY in .env (see .env.example)

import { CELEB_LIST_PATH, HISTORY_PATH, DAILY_PATH, readJson, writeJsonAtomic } from './lib/files.js';
import { tmdbGet, fetchKnownFor, wikidataDeathDate, sleep } from './lib/sources.js';
import { pickDaily, dateSeed, poolHealth, recordShown, MIN_HEALTHY_POOL } from './lib/picker.js';
import { ageOn } from './lib/dates.js';

if (!process.env.TMDB_API_KEY) {
  console.error('Error: TMDB_API_KEY not set. Copy .env.example to .env and add your key.');
  process.exit(1);
}

function argValue(flag) {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
}

const seedOffset = parseInt(argValue('--seed-offset') ?? '0', 10) || 0;
const poolPath = argValue('--pool') ?? CELEB_LIST_PATH;
const dryRun = process.argv.includes('--dry-run');

async function buildCelebrity(entry) {
  const detail = await tmdbGet(`/person/${entry.tmdbId}`);
  await sleep(60);
  const knownFor = await fetchKnownFor(entry.tmdbId);
  await sleep(60);
  const wikiDate = await wikidataDeathDate(entry.tmdbId);
  await sleep(500);

  // Wikidata is the most reliable source; TMDB and the pool are fallbacks.
  const deathDate = wikiDate ?? detail.deathday ?? entry.deathDate ?? null;
  if (wikiDate && detail.deathday && wikiDate !== detail.deathday) {
    console.log(`  ${detail.name}: TMDB=${detail.deathday}, Wikidata=${wikiDate} → using Wikidata`);
  }
  if (deathDate && !entry.deathDate) {
    console.log(`  ${detail.name}: pool says alive but died ${deathDate}; next build-list will update the pool`);
  }

  const birthday = detail.birthday ?? entry.birthDate;
  return {
    id: detail.id,
    name: detail.name,
    popularity: Math.round((detail.popularity ?? 0) * 10) / 10,
    isAlive: !deathDate,
    birthYear: Number(birthday.slice(0, 4)),
    deathDate,
    deathAge: deathDate ? ageOn(birthday, deathDate) : null,
    profilePath: detail.profile_path || null,
    knownFor,
  };
}

async function main() {
  const today = new Date().toISOString().slice(0, 10);
  const pool = readJson(poolPath).celebrities ?? [];
  const history = readJson(HISTORY_PATH, { shown: [] }).shown ?? [];

  const health = poolHealth(pool, today);
  console.log(`Pool health: approved alive ${health.alive} / dead ${health.dead} (target ≥ ${MIN_HEALTHY_POOL} each)`);
  if (health.alive < MIN_HEALTHY_POOL || health.dead < MIN_HEALTHY_POOL) {
    console.warn('  ⚠ Below target — approve more with npm run review.');
  }

  const picks = pickDaily({
    pool,
    history,
    today,
    seed: dateSeed(today, seedOffset),
    log: msg => console.warn(`  ⚠ ${msg}`),
  });

  console.log('\nFetching details and checking death dates...');
  const celebrities = [];
  for (const entry of picks) celebrities.push(await buildCelebrity(entry));

  console.log();
  celebrities.forEach((c, i) => {
    const status = c.isAlive ? 'alive' : `died ${c.deathDate} (age ${c.deathAge})`;
    console.log(`  ${i + 1}. ${c.name} (born ${c.birthYear}) — ${status}`);
  });

  if (dryRun) {
    console.log('\n--dry-run: nothing written.');
    return;
  }
  writeJsonAtomic(DAILY_PATH, { generatedAt: new Date().toISOString(), celebrities });
  writeJsonAtomic(HISTORY_PATH, { shown: recordShown(history, today, picks.map(e => e.tmdbId)) });
  console.log(`\nWrote ${DAILY_PATH}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Verify it fails loudly with no approvals**

Run: `node --env-file=.env scripts/generate-daily.js --dry-run; echo "exit $?"`
Expected (assuming the user hasn't approved anyone yet): `Pool health: approved alive 0 / dead 0`, then `Error: Only 0 eligible approved celebrities; need 5.` and `exit 1`.

- [ ] **Step 3: Dry-run against a fully approved scratch copy**

```bash
SCRATCH=$(mktemp -d)
node -e "
const fs = require('fs');
const d = JSON.parse(fs.readFileSync('data/celeb-list.json', 'utf8'));
d.celebrities.forEach(e => e.status = 'approved');
fs.writeFileSync(process.argv[1], JSON.stringify(d));" "$SCRATCH/pool.json"
for o in 0 1 2; do node --env-file=.env scripts/generate-daily.js --pool "$SCRATCH/pool.json" --seed-offset $o --dry-run; done
git status --short public/data data
```

Expected for each run: 5 picks; 1–4 marked `died`; no alive pick with birth year after `currentYear − 50`; different sets across offsets; `--dry-run: nothing written.`; `git status` shows no changes under `public/data` or `data`.

- [ ] **Step 4: Confirm the frontend still builds against the unchanged shape**

Run: `npm run build && npm run lint`
Expected: both succeed.

- [ ] **Step 5: Commit**

```bash
git add scripts/generate-daily.js
git commit -F - <<'EOF'
feat(script): generate daily set from the approved pool

Uses the seeded picker (1-4 dead, trickiness-weighted, 50+ alive
only), logs pool health, and fails the run when fewer than five
approved celebrities are eligible. Adds --pool and --dry-run flags.

Agent-Tool: claude-code
Agent-Model: <your model id>
EOF
```

---

### Task 10: Documentation and final verification

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update `CLAUDE.md`**

Replace the `## Commands` block with:

````markdown
## Commands

```bash
npm run dev           # Vite dev server
npm run build         # tsc + vite build → dist/
npm run lint          # ESLint
npm run test:scripts  # node:test unit tests for scripts/lib
npm run build-list    # Refresh the candidate pool in data/celeb-list.json (needs .env with TMDB_API_KEY)
npm run review        # Local review UI at http://127.0.0.1:5174 — approve/reject candidates
npm run generate      # Regenerate public/data/celebrities.json from approved pool
```

To get a different set for the same day: `node --env-file=.env scripts/generate-daily.js --seed-offset 1`
To preview without writing: add `--dry-run`. To test against another pool file: `--pool path/to/pool.json`.
````

Replace the `### Data pipeline (Node, runs daily in CI)` section with:

```markdown
### Data pipeline

Two stages, sharing pure modules in `scripts/lib/` (unit-tested with `node:test`):

**1. Curating the pool (manual).** `scripts/build-celeb-list.js` queries Wikidata for actors with a TMDB ID who are dead or 50+, keeps US/UK citizens with ≥ 30 sitelinks plus anyone with ≥ 60 sitelinks, filters by 12-month en.wikipedia pageviews (`scripts/lib/candidates.js` thresholds), enriches from TMDB (photo, known-for), scores `trickiness` (`scripts/lib/trickiness.js`), and merges into `data/celeb-list.json`. New people arrive as `pending`. `status`, `notes` and `trickinessOverride` are human-owned and never overwritten. `npm run review` serves a local page for approving/rejecting; commit `data/celeb-list.json` afterwards.

**2. Daily pick (CI).** `scripts/generate-daily.js` picks 5 from approved entries via `scripts/lib/picker.js`: 1–4 dead (seeded, weighted toward 2–3), alive picks must be 50+ today, draws weighted by trickiness, 30-day no-repeat window from `data/shown-history.json` with least-recently-shown fallback. Death dates are re-checked live (Wikidata, then TMDB). Fails if fewer than 5 approved entries are eligible. Writes `public/data/celebrities.json` — the only artifact the frontend reads.

`data/` is deliberately outside `public/` so the pool (which reveals answers) is never deployed.

CI (`.github/workflows/deploy.yml`) runs stage 2 at 00:05 UTC daily, commits `public/data/celebrities.json` and `data/shown-history.json` to `main`, then triggers a Vercel deploy hook. Secrets needed: `TMDB_API_KEY`, `VERCEL_DEPLOY_HOOK`. Keep ≥ 75 approved alive and ≥ 75 approved dead for the 30-day window; the run logs a warning when below.
```

In `### Key files for the data shape`, append:

```markdown
`data/celeb-list.json` (pool, `version: "2"`) — shape is produced by `build-celeb-list.js` and edited only through `scripts/lib/review-api.js`.
```

- [ ] **Step 2: Full verification**

Run:

```bash
npm run test:scripts
npm run build
npm run lint
ls public/data
git status --short
```

Expected: all tests pass; build and lint succeed; `public/data` contains only `celebrities.json`; working tree clean apart from this task's `CLAUDE.md` edit and the untracked `.cursor/`.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -F - <<'EOF'
docs(docs): document curated pool pipeline and review flow

Agent-Tool: claude-code
Agent-Model: <your model id>
EOF
```

- [ ] **Step 4: Hand off to the user**

Tell the user:
- the pending count (alive/dead) from the last `build-list` run and the final thresholds,
- to run `npm run review`, approve until both pickable counts reach 75, and commit `data/celeb-list.json`,
- that CI will fail the daily run until at least 5 are approved, so merge only after reviewing,
- the branch name `feat/curated-pool` is ready to merge or PR when they're done.
