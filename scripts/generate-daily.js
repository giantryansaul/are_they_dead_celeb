#!/usr/bin/env node
// Selects 5 celebrities from the curated list (public/data/celeb-list.json),
// cross-checks death dates via Wikidata, and writes public/data/celebrities.json.
//
// Usage: node --env-file=.env scripts/generate-daily.js
// Requires: TMDB_API_KEY in .env (see .env.example)

import { writeFileSync, readFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = join(__dirname, '..', 'public', 'data', 'celebrities.json');
const HISTORY_PATH = join(__dirname, '..', 'public', 'data', 'shown-history.json');
const CELEB_LIST_PATH = join(__dirname, '..', 'public', 'data', 'celeb-list.json');
const HISTORY_WINDOW_DAYS = 30;

const TMDB_KEY = process.env.TMDB_API_KEY;
if (!TMDB_KEY) {
  console.error('Error: TMDB_API_KEY not set. Copy .env.example to .env and add your key.');
  process.exit(1);
}

const TMDB_BASE = 'https://api.themoviedb.org/3';
const WIKIDATA_SPARQL = 'https://query.wikidata.org/sparql';

// Seed offset can be passed as CLI arg: node generate-daily.js --seed-offset 1
const seedOffset = (() => {
  const idx = process.argv.indexOf('--seed-offset');
  return idx !== -1 ? parseInt(process.argv[idx + 1], 10) || 0 : 0;
})();

function seededRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = Math.imul(s ^ (s >>> 16), 0x45d9f3b);
    s = Math.imul(s ^ (s >>> 16), 0x45d9f3b);
    s ^= s >>> 16;
    return (s >>> 0) / 0x100000000;
  };
}

function seededShuffle(arr, seed) {
  const rng = seededRandom(seed);
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function tmdbGet(path) {
  const sep = path.includes('?') ? '&' : '?';
  const res = await fetch(`${TMDB_BASE}${path}${sep}api_key=${TMDB_KEY}`);
  if (!res.ok) throw new Error(`TMDB ${path}: ${res.status} ${res.statusText}`);
  return res.json();
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function computeAge(birthDateStr, endDateStr) {
  const birth = new Date(birthDateStr);
  const end = new Date(endDateStr);
  let age = end.getFullYear() - birth.getFullYear();
  const m = end.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && end.getDate() < birth.getDate())) age--;
  return age;
}

async function wikidataDeathDate(tmdbId) {
  const query = `
    SELECT ?deathDate WHERE {
      ?item wdt:P4985 "${tmdbId}" .
      ?item wdt:P570 ?deathDate .
    } LIMIT 1`;
  try {
    const url = `${WIKIDATA_SPARQL}?query=${encodeURIComponent(query)}&format=json`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'AreTheyDeadGame/1.0 (educational; contact giantryansaul@gmail.com)' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const val = data.results?.bindings?.[0]?.deathDate?.value;
    return val ? val.slice(0, 10) : null;
  } catch {
    return null;
  }
}

async function fetchKnownFor(tmdbId) {
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

function loadCelebList() {
  const raw = readFileSync(CELEB_LIST_PATH, 'utf8');
  const data = JSON.parse(raw);
  const list = data.celebrities ?? [];
  if (list.length === 0) {
    console.error('Error: celeb-list.json is empty. Run npm run build-list to populate it.');
    process.exit(1);
  }
  return list;
}

function loadHistory() {
  try {
    const raw = readFileSync(HISTORY_PATH, 'utf8');
    const data = JSON.parse(raw);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - HISTORY_WINDOW_DAYS);
    return (data.shown ?? []).filter(e => new Date(e.date) >= cutoff);
  } catch {
    return [];
  }
}

function saveHistory(history, pickedIds) {
  const today = new Date().toISOString().slice(0, 10);
  const updated = [
    ...history.filter(e => e.date !== today),
    { date: today, ids: pickedIds },
  ];
  writeFileSync(HISTORY_PATH, JSON.stringify({ shown: updated }, null, 2));
}

function selectFive(celebList, recentlyShownIds, dateSeed) {
  const excluded = new Set(recentlyShownIds);
  const available = celebList.filter(c => !excluded.has(c.tmdbId));

  if (recentlyShownIds.length > 0) {
    console.log(`Excluding ${recentlyShownIds.length} recently-shown IDs.`);
  }

  const easyPool  = seededShuffle(available.filter(c => c.difficulty === 'easy'),   dateSeed);
  const mediumPool = seededShuffle(available.filter(c => c.difficulty === 'medium'), dateSeed + 1);
  const hardPool  = seededShuffle(available.filter(c => c.difficulty === 'hard'),   dateSeed + 2);

  console.log(`Pools — easy: ${easyPool.length}, medium: ${mediumPool.length}, hard: ${hardPool.length}`);

  const picked = [];
  const usedIds = new Set();

  const targets = [
    { pool: easyPool,   want: 2, label: 'easy'   },
    { pool: mediumPool, want: 2, label: 'medium'  },
    { pool: hardPool,   want: 1, label: 'hard'    },
  ];

  for (const { pool, want, label } of targets) {
    let added = 0;
    for (const c of pool) {
      if (added >= want) break;
      picked.push(c);
      usedIds.add(c.tmdbId);
      added++;
    }
    if (added < want) {
      console.warn(`  Warning: ${label} pool only supplied ${added}/${want}.`);
    }
  }

  if (picked.length < 5) {
    const needed = 5 - picked.length;
    const fallback = seededShuffle(
      available.filter(c => !usedIds.has(c.tmdbId)),
      dateSeed + 3
    );
    console.warn(`  Fallback: drawing ${needed} from full pool.`);
    picked.push(...fallback.slice(0, needed));
  }

  return picked.slice(0, 5);
}

async function buildCelebrity(celebEntry) {
  const detail = await tmdbGet(`/person/${celebEntry.tmdbId}`);
  await sleep(60);

  const knownFor = await fetchKnownFor(celebEntry.tmdbId);
  await sleep(60);

  const isAlive = !detail.deathday;
  let deathDate = detail.deathday || null;

  if (!isAlive) {
    const wikiDate = await wikidataDeathDate(detail.id);
    if (wikiDate && wikiDate !== deathDate) {
      console.log(`  ${detail.name}: TMDB=${deathDate}, Wikidata=${wikiDate} → using Wikidata`);
      deathDate = wikiDate;
    } else if (!wikiDate) {
      console.log(`  ${detail.name}: no Wikidata match, keeping TMDB date (${deathDate})`);
    }
    await sleep(500);
  }

  return {
    id: detail.id,
    name: detail.name,
    popularity: Math.round(detail.popularity * 10) / 10,
    isAlive,
    birthYear: new Date(detail.birthday).getFullYear(),
    deathDate,
    deathAge: deathDate ? computeAge(detail.birthday, deathDate) : null,
    profilePath: detail.profile_path || null,
    knownFor,
  };
}

async function main() {
  const history = loadHistory();
  const recentlyShownIds = history.flatMap(e => e.ids);

  const today = new Date().toISOString().slice(0, 10);
  const dateSeed = today.split('-').reduce((acc, n) => acc * 100 + parseInt(n, 10), 0) + seedOffset;

  const celebList = loadCelebList();
  console.log(`Loaded ${celebList.length} celebrities from curated list.`);

  const five = selectFive(celebList, recentlyShownIds, dateSeed);

  console.log('\nFetching details and cross-checking death dates...');
  const celebrities = [];
  for (const celeb of five) {
    celebrities.push(await buildCelebrity(celeb));
  }

  const output = { generatedAt: new Date().toISOString(), celebrities };

  mkdirSync(join(__dirname, '..', 'public', 'data'), { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
  saveHistory(history, five.map(c => c.tmdbId));

  console.log(`\nWrote ${OUTPUT_PATH}`);
  celebrities.forEach((c, i) => {
    const status = c.isAlive
      ? 'alive'
      : `died ${c.deathDate} (age ${c.deathAge})`;
    console.log(`  ${i + 1}. ${c.name} (born ${c.birthYear}) — ${status}`);
  });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
