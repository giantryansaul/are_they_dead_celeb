# Are They Dead? 💀

A daily celebrity guessing game. Five celebrities, one question each: are they alive or dead?

## How it works

Each day a new set of 5 celebrities is generated from TMDB's popular people list. For each celebrity you guess **Alive** or **Dead**. You can reveal hints before guessing — but each hint costs a point.

**Scoring per celebrity (max 8 points):**
- Correct guess: 3 points
- Each unused hint: +1 point (photo, birth year, known for ×3)

Results reset daily. Share your scorecard at the end.

## Stack

- React + TypeScript + Vite
- Tailwind CSS
- TMDB API (celebrity data)
- Wikidata (death date cross-check)
- Vercel (deployment)

## Development

```bash
npm install
npm run dev
```

## Regenerating celebrities

Requires a TMDB API key in `.env`:

```
TMDB_API_KEY=your_key_here
```

```bash
node --env-file=.env scripts/generate-daily.js
```

Pass `--seed-offset N` to get a different set for the same day.
