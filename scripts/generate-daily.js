#!/usr/bin/env node
// Fetches 5 celebrities from TMDB, cross-checks death dates via Wikidata,
// and writes public/data/celebrities.json.
//
// Usage: node --env-file=.env scripts/generate-daily.js
// Requires: TMDB_API_KEY in .env (see .env.example)

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = join(__dirname, '..', 'public', 'data', 'celebrities.json');

const TMDB_KEY = process.env.TMDB_API_KEY;
if (!TMDB_KEY) {
  console.error('Error: TMDB_API_KEY not set. Copy .env.example to .env and add your key.');
  process.exit(1);
}

const TMDB_BASE = 'https://api.themoviedb.org/3';
const WIKIDATA_SPARQL = 'https://query.wikidata.org/sparql';
const CANDIDATES_TO_DETAIL = 40;

async function tmdbGet(path) {
  const res = await fetch(`${TMDB_BASE}${path}`, {
    headers: { Authorization: `Bearer ${TMDB_KEY}` },
  });
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
    // Wikidata returns full ISO datetime: "1977-08-16T00:00:00Z"
    return val ? val.slice(0, 10) : null;
  } catch {
    return null;
  }
}

async function fetchCandidates() {
  console.log('Fetching popular people from TMDB (pages 1-2)...');
  const [p1, p2] = await Promise.all([
    tmdbGet('/person/popular?page=1'),
    tmdbGet('/person/popular?page=2'),
  ]);
  return [...p1.results, ...p2.results];
}

async function fetchDetails(candidates) {
  const sorted = [...candidates].sort((a, b) => b.popularity - a.popularity);
  const top = sorted.slice(0, CANDIDATES_TO_DETAIL);
  console.log(`Fetching details for top ${top.length} candidates...`);

  const results = [];
  for (const person of top) {
    try {
      const detail = await tmdbGet(`/person/${person.id}`);
      results.push(detail);
      process.stdout.write('.');
      await sleep(60); // ~16 req/s, well under 50/s limit
    } catch (err) {
      console.warn(`\n  Skipping ${person.name}: ${err.message}`);
    }
  }
  console.log();
  return results;
}

function pickFive(details) {
  const withBirth = details.filter(p => p.birthday && p.name);
  const alive = withBirth.filter(p => !p.deathday).sort((a, b) => b.popularity - a.popularity);
  const dead = withBirth.filter(p => !!p.deathday).sort((a, b) => b.popularity - a.popularity);

  console.log(`Candidates with birth date: ${withBirth.length} (${alive.length} alive, ${dead.length} dead)`);

  // Target ~2-3 alive, 2-3 dead. Ensure at least 2 of each if available.
  const picked = [
    ...alive.slice(0, 3),
    ...dead.slice(0, 2),
  ];

  if (picked.length < 5) {
    const ids = new Set(picked.map(p => p.id));
    const extra = withBirth
      .filter(p => !ids.has(p.id))
      .sort((a, b) => b.popularity - a.popularity);
    picked.push(...extra.slice(0, 5 - picked.length));
  }

  return picked
    .sort((a, b) => b.popularity - a.popularity)
    .slice(0, 5);
}

async function buildCelebrity(person) {
  const isAlive = !person.deathday;
  let deathDate = person.deathday || null;

  if (!isAlive) {
    const wikiDate = await wikidataDeathDate(person.id);
    if (wikiDate && wikiDate !== deathDate) {
      console.log(`  ${person.name}: TMDB=${deathDate}, Wikidata=${wikiDate} → using Wikidata`);
      deathDate = wikiDate;
    } else if (!wikiDate) {
      console.log(`  ${person.name}: no Wikidata match, keeping TMDB date (${deathDate})`);
    }
    await sleep(500); // Wikidata courtesy delay
  }

  return {
    id: person.id,
    name: person.name,
    popularity: Math.round(person.popularity * 10) / 10,
    isAlive,
    birthYear: new Date(person.birthday).getFullYear(),
    deathDate,
    deathAge: deathDate ? computeAge(person.birthday, deathDate) : null,
    profilePath: person.profile_path || null,
  };
}

async function main() {
  const candidates = await fetchCandidates();
  const details = await fetchDetails(candidates);
  const five = pickFive(details);

  console.log('\nCross-checking death dates with Wikidata...');
  const celebrities = [];
  for (const person of five) {
    celebrities.push(await buildCelebrity(person));
  }

  const output = { generatedAt: new Date().toISOString(), celebrities };

  mkdirSync(join(__dirname, '..', 'public', 'data'), { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));

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
