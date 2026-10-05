# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

A daily Wordle-style game: five celebrities are shown, player guesses alive or dead for each. Five hints are available per celebrity (photo, birth year, three "known for" titles), each costing 1 point. Max score is 8 per celebrity (3 for correct + 5 unused hints). Results are shareable as a scorecard.

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

## Architecture

### Data pipeline

Two stages, sharing pure modules in `scripts/lib/` (unit-tested with `node:test`):

**1. Curating the pool (manual).** `scripts/build-celeb-list.js` queries Wikidata for actors with a TMDB ID who are dead or 50+, keeps US/UK citizens with ≥ 30 sitelinks plus anyone with ≥ 60 sitelinks, filters by 12-month en.wikipedia pageviews (≥ 1M/yr for US/UK, ≥ 2M/yr for others; tuned in `scripts/lib/candidates.js`), retrying transient failures, enriches from TMDB (photo, known-for), scores `trickiness` (`scripts/lib/trickiness.js`), and merges into `data/celeb-list.json`. New people arrive as `pending`. `status`, `notes` and `trickinessOverride` are human-owned and never overwritten. `npm run review` serves a local page for approving/rejecting; commit `data/celeb-list.json` afterwards. `trickiness` is computed at build time and drifts between builds. Don't make `npm run review` edits while `build-list` is running; the build re-reads the pool before merging so they are preserved, but avoid relying on it.

**2. Daily pick (CI).** `scripts/generate-daily.js` picks 5 from approved entries via `scripts/lib/picker.js`: 1–4 dead (seeded, weighted toward 2–3), alive picks must be 50+ today, draws weighted by trickiness, 30-day no-repeat window from `data/shown-history.json` with least-recently-shown fallback. Death dates are re-checked live (Wikidata, then TMDB). Fails (by design) while fewer than 5 approved entries are eligible, so approve entries on the branch before merging. Writes `public/data/celebrities.json` — the only artifact the frontend reads.

`data/` is deliberately outside `public/` so the pool (which reveals answers) is never deployed.

CI (`.github/workflows/deploy.yml`) runs stage 2 at 00:05 UTC daily, commits `public/data/celebrities.json` and `data/shown-history.json` to `main`, then triggers a Vercel deploy hook. Secrets needed: `TMDB_API_KEY`, `VERCEL_DEPLOY_HOOK`. Keep ≥ 75 approved alive and ≥ 75 approved dead for the 30-day window; the run logs a warning when below.

### Frontend (React + TypeScript + Vite)

Static SPA deployed to Vercel. The entire game runs client-side from the static JSON.

**Data flow:**
- `useCelebrities` fetches `/data/celebrities.json` once on mount → `Celebrity[]` + `generatedAt`
- `generatedAt` (ISO timestamp) is used as the `gameId` — game state is keyed to the day's data, not the local clock
- `useGameState(isAliveList, gameId)` manages per-row state (answered, correct, hintsUsed) with localStorage persistence keyed by `gameId`
- `GameBoard` composes these two hooks and renders five `CelebrityRow` components

**Scoring:** `src/lib/scoring.ts` — `calculateRowScore(correct, hintsUsed)` and `calculateTotalScore(rows[])`. Constants in `src/lib/constants.ts`.

**Component hierarchy:**
```
GameBoard (state orchestration)
  Header
  CelebrityRow × 5 (atoms: Badge, Button, HintIcon, ScoreIcon)
  ResultsModal (shown when allAnswered)
    ScoreRowSummary × 5
```

**Scorecard sharing:** `src/lib/scorecard.ts` generates the emoji grid copied to clipboard via `useClipboard`.

### Key files for the data shape

`src/types/index.ts` — `Celebrity`, `DailyData`, `HintType`, `RowState`, `GameState`, `GameResult`. Changes to `celebrities.json` shape must stay in sync with this file and `buildCelebrity()` in the generate script.

`data/celeb-list.json` (pool, `version: "2"`) — shape is produced by `build-celeb-list.js` and edited only through `scripts/lib/review-api.js`.
