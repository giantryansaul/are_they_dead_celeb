# Curated Celebrity Pool — Design

**Date:** 2026-10-04
**Status:** Approved in brainstorming, pending spec review

## Problem

Daily celebrity sets are too easy, contain too many alive people, and
include too many foreign (and sometimes inappropriate) celebrities that
an American audience won't recognise. The daily runner pulls straight
from TMDB `/person/popular`, which reflects *this week's trending
people* — skewing young and international.

## Goals

1. Pool is mostly American or British actors, plus foreign actors who
   are very well known in the US.
2. The alive/dead call is hard: most picks are 50+. Alive people under
   50 are never shown. Dead people of any age are allowed.
3. Every celebrity is human-approved before players can see them.
4. Each celebrity carries a computed **trickiness** score that drives
   selection and review sorting.
5. The daily CI runner keeps working unattended, drawing from the
   approved pool.

## Non-goals

- Tracking how players actually scored per celebrity (needs a backend).
- Any change to the frontend or to the `celebrities.json` shape.
- Hosting the review tool anywhere other than the developer's machine.

## File layout

| Path | Deployed? | Purpose |
|------|-----------|---------|
| `public/data/celebrities.json` | yes | Today's 5 (unchanged shape) |
| `data/celeb-list.json` | **no** | The curated pool (moved from `public/data/`) |
| `data/shown-history.json` | **no** | 30-day repeat window (moved from `public/data/`) |
| `scripts/build-celeb-list.js` | — | Rewritten: candidate gathering |
| `scripts/generate-daily.js` | — | Updated: picker |
| `scripts/review-server.js` | — | New: local review server |
| `scripts/review/index.html` | — | New: review UI (vanilla HTML/JS) |
| `scripts/lib/trickiness.js` | — | New: pure scoring module |
| `scripts/lib/picker.js` | — | New: pure selection module |
| `scripts/lib/merge.js` | — | New: pure pool-merge module |
| `scripts/lib/*.test.js` | — | `node:test` unit tests |

Moving the two data files out of `public/` stops Vercel from serving
the full pool (which would reveal answers). `.github/workflows/deploy.yml`
`git add` paths are updated to `public/data/celebrities.json
data/shown-history.json`.

New npm scripts:

```
"build-list": "node --env-file=.env scripts/build-celeb-list.js",
"review":     "node scripts/review-server.js",
"test:scripts": "node --test scripts/lib/"
```

## Data model — `data/celeb-list.json`

```json
{
  "version": "2",
  "lastUpdated": "2026-10-04",
  "celebrities": [
    {
      "tmdbId": 4,
      "wikidataId": "Q873",
      "name": "Carrie Fisher",
      "status": "approved",
      "birthDate": "1956-10-21",
      "deathDate": "2016-12-27",
      "nationality": ["US"],
      "sitelinks": 98,
      "enPageviews": 412000,
      "profilePath": "/abc.jpg",
      "knownFor": ["Star Wars", "When Harry Met Sally...", "The Blues Brothers"],
      "trickiness": 41,
      "trickinessOverride": null,
      "notes": ""
    }
  ]
}
```

- `status`: `pending | approved | rejected`.
- **Human-owned fields** — `status`, `notes`, `trickinessOverride` —
  are never overwritten by `build-list`.
- **Machine-owned fields** — everything else — are refreshed on each
  `build-list` run.
- Rejected entries stay in the file so they are never re-proposed.
- `nationality` holds ISO-ish codes derived from Wikidata P27
  (`US`, `GB`, or the country's label for others).
- `enPageviews`: total en.wikipedia pageviews over the trailing 12
  months; `null` if the lookup failed.
- Effective trickiness = `trickinessOverride ?? trickiness`.

## Candidate pipeline — `npm run build-list`

No new API keys. Wikidata SPARQL and the Wikimedia pageviews REST API
are keyless; requests send the existing descriptive `User-Agent`.
TMDB (`TMDB_API_KEY`) remains the only key.

1. **Wikidata query**, chunked by birth decade (the endpoint has a
   60 s timeout). Select humans (`P31 Q5`) with occupation actor
   (`P106` ∈ {Q33999, Q10800557, Q2405480, Q10798782}) that have a TMDB
   person ID (`P4985`), plus birth date (P569), death date (P570),
   citizenship (P27), en.wikipedia article title, and sitelink count
   (`wikibase:sitelinks`). Keep only people who are dead **or** born on
   or before today − 50 years.
2. **Two passes:**
   - *Core:* citizenship includes US (Q30) or UK (Q145), sitelinks ≥ 30.
   - *Fame:* any nationality, sitelinks ≥ 60.
3. **Pageviews:** for each candidate with an en.wikipedia article, fetch
   12 months of monthly views from
   `wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/{title}/monthly/{start}/{end}`.
   Drop candidates below `MIN_EN_PAGEVIEWS` (a constant, starting at
   100 000/yr, tuned after the first real run). Fame-pass candidates
   use a higher bar (`MIN_EN_PAGEVIEWS_FOREIGN`, starting at 500 000).
4. **TMDB enrichment** for survivors: `/person/{id}` (skip if `adult` or
   404) for `profilePath`; `/person/{id}/combined_credits` for top-3
   `knownFor` (same logic as today's `fetchKnownFor`, moved to a shared
   helper).
5. **Score** each entry with `trickiness.js` (fame percentile is
   computed across the whole candidate set).
6. **Merge** with the existing file via `merge.js`:
   - New `tmdbId` → add as `pending`.
   - Existing → refresh machine-owned fields, keep human-owned fields.
   - Existing entries not returned this run are kept untouched.
7. **One-time migration:** the current 340-entry `version: "1"` list is
   treated as existing entries with no status. Each is looked up by
   `tmdbId` through the same Wikidata/pageviews/TMDB steps; those that
   pass the filters become `pending`, the rest are dropped. The old
   `difficulty` field is removed.
8. Write atomically (temp file + rename), sorted by status then
   trickiness descending. Print a summary: new / refreshed / totals per
   status, approved alive vs dead.

All external calls are sequential with short sleeps, matching existing
scripts.

## Trickiness — `scripts/lib/trickiness.js`

Pure function: `computeTrickiness({ birthDate, deathDate, fame, today })
→ 0..100`, where `fame` ∈ [0,1].

- **Ambiguity** (0..1):
  - *Alive:* `0.2 + 0.8 × clamp((age − 50) / 35)` → 50 ⇒ 0.2, 85+ ⇒ 1.0.
  - *Dead:* `clamp(1 − yearsSinceDeath / 25)`; multiplied by 0.5 if the
    person would be over 95 today.
- **Fame:** log-scaled percentile of `enPageviews` within the pool
  (`fameFromPageviews(views, allViews)`, also exported). Missing
  pageviews ⇒ fame 0.
- **Score:** `round(100 × ambiguity × (0.5 + 0.5 × fame))`.

## Daily picker — `scripts/lib/picker.js` + `generate-daily.js`

Pure function: `pickDaily({ pool, history, today, seed }) → entry[5]`.

1. **Eligible** = `status === 'approved'` and not (alive and age < 50
   as of `today`).
2. **Dead count** chosen by seed from weights
   `{1: 0.15, 2: 0.35, 3: 0.35, 4: 0.15}`.
3. Split eligible into alive/dead pools. Exclude IDs shown in the last
   30 days. Within each pool, draw without replacement, weighted by
   effective trickiness (weight = `max(trickiness, 5)` so low scorers
   still appear occasionally).
4. **Shortfall fallback:** if a pool lacks enough non-recent entries,
   fill from that pool's recently-shown entries, least-recently-shown
   first, and log a warning. If still short, fill from the other pool
   and log a warning. If the eligible pool is empty, exit non-zero.
5. Final order of the 5 is seeded-shuffled so dead entries aren't
   clustered.
6. `generate-daily.js` then runs the existing live TMDB + Wikidata
   death-date check per pick (`buildCelebrity`). If an "alive" pick is
   now dead, `celebrities.json` reflects the truth; the pool entry is
   corrected on the next `build-list` run.
7. Log a pool-health line every run:
   `approved alive N / dead M (target ≥ 75 each)` and warn below target.

`--seed-offset` keeps working. `seededRandom`/`seededShuffle` move into
`picker.js` for testing.

## Review tool — `npm run review`

`scripts/review-server.js` uses only `node:http`/`node:fs`. Binds to
`127.0.0.1` on port 5174 and opens the browser.

**Endpoints**

- `GET /` → `scripts/review/index.html`
- `GET /api/pool` → contents of `data/celeb-list.json`
- `POST /api/entry/:tmdbId` with JSON body containing any of
  `{ status, notes, trickinessOverride }` → validates fields, updates
  that entry, writes atomically, returns the updated entry. Unknown
  fields or invalid status ⇒ 400; unknown id ⇒ 404.

**UI** (single HTML file, vanilla JS, no build step)

- Card: TMDB photo (`image.tmdb.org/t/p/w300`), name, born / age or
  died date / age at death, nationality, known-for titles, trickiness,
  yearly pageviews, links to TMDB and Wikipedia, notes field.
- Keyboard: **A** approve, **R** reject, **N** focus notes,
  **←/→** navigate, **Z** undo last decision. Approve/reject advance
  to the next pending card.
- Tabs: Pending / Approved / Rejected. Sort: trickiness, pageviews,
  name. Filter: all / alive / dead.
- Pool-health bar: approved alive and dead vs 75 target.

Decisions are persisted immediately; the user commits
`data/celeb-list.json` themselves.

## Error handling

| Failure | Behaviour |
|---------|-----------|
| Wikidata chunk timeout / 5xx | Retry once, then abort the run (no partial write) |
| Pageviews lookup fails | `enPageviews: null`, kept as pending, fame 0 |
| TMDB 404 / adult | Skip candidate, log |
| Review server write fails | 500 to UI, UI shows error, decision not marked |
| Daily: empty eligible pool | Exit non-zero; CI does not commit/deploy |
| Daily: pool short | Fallback per picker step 4, warn |

## Testing

`node:test`, no new dependencies, run via `npm run test:scripts`.

- `trickiness.test.js`: alive age curve endpoints, dead recency curve,
  over-95 halving, fame scaling, override precedence.
- `picker.test.js`: determinism for a fixed seed; dead count always
  1–4 and follows the seed; never returns alive-under-50 or
  non-approved; 30-day exclusion; shortfall fallback order; empty pool
  throws.
- `merge.test.js`: human-owned fields survive refresh; rejected never
  revert to pending; new IDs added as pending; v1 migration drops
  `difficulty`.

Manual verification: real `npm run build-list` run (tune pageview
thresholds from its output), then drive the review page in a browser,
approve a handful, and run `npm run generate` against the result.

## Documentation

Update `CLAUDE.md` architecture section: new data paths, `build-list`
and `review` commands, approval flow, trickiness, variable dead count.
