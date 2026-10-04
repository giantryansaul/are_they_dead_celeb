# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

A daily Wordle-style game: five celebrities are shown, player guesses alive or dead for each. Five hints are available per celebrity (photo, birth year, three "known for" titles), each costing 1 point. Max score is 8 per celebrity (3 for correct + 5 unused hints). Results are shareable as a scorecard.

## Commands

```bash
npm run dev          # Vite dev server
npm run build        # tsc + vite build → dist/
npm run lint         # ESLint
npm run generate     # Regenerate public/data/celebrities.json (needs .env with TMDB_API_KEY)
```

To get a different set for the same day: `node --env-file=.env scripts/generate-daily.js --seed-offset 1`

## Architecture

### Data pipeline (Node, runs daily in CI)

`scripts/generate-daily.js` is the only backend code. It:
1. Fetches pages 1–4 of TMDB `/person/popular`, filters adult-flagged entries
2. Takes the top 60 by popularity and fetches full `/person/{id}` detail
3. Calls Wikidata SPARQL to cross-check death dates for any deceased picks (TMDB death dates can be wrong/missing)
4. Uses a date-seeded deterministic shuffle (`seededRandom` / `seededShuffle`) to pick 3 alive + 2 dead celebrities
5. Reads/writes `public/data/shown-history.json` to avoid repeating celebrities within a 30-day window
6. Writes `public/data/celebrities.json` — the only artifact the frontend reads

CI (`.github/workflows/deploy.yml`) runs this at 00:05 UTC daily, commits the JSON to `main`, then triggers a Vercel deploy hook. Secrets needed: `TMDB_API_KEY`, `VERCEL_DEPLOY_HOOK`.

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
