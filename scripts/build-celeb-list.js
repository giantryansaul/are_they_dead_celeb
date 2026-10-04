#!/usr/bin/env node
// Builds/refreshes public/data/celeb-list.json from TMDB popular people.
// Run manually: npm run build-list
// Existing entries (including manual difficulty overrides) are preserved.
//
// Usage: node --env-file=.env scripts/build-celeb-list.js
// Requires: TMDB_API_KEY in .env

import { writeFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = join(__dirname, '..', 'public', 'data', 'celeb-list.json');

const TMDB_KEY = process.env.TMDB_API_KEY;
if (!TMDB_KEY) {
  console.error('Error: TMDB_API_KEY not set. Copy .env.example to .env and add your key.');
  process.exit(1);
}

const TMDB_BASE = 'https://api.themoviedb.org/3';
const PAGES_TO_FETCH = 25;
const MIN_POPULARITY_FOR_NON_ENGLISH = 20;

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

function assignDifficulty(birthday, deathday, popularity) {
  const birthYear = new Date(birthday).getFullYear();
  const currentYear = new Date().getFullYear();
  const hardMin = currentYear - 90;
  const hardMax = currentYear - 60;

  if (birthYear >= hardMin && birthYear <= hardMax) return 'hard';
  if (birthYear > currentYear - 46) return 'easy'; // born after ~1980

  if (deathday) {
    const deathAge = computeAge(birthday, deathday);
    if (deathAge <= 45 && popularity > 30) return 'easy';
  }

  return 'medium';
}

function hasAdultKnownFor(person) {
  return (person.known_for ?? []).some(kf => kf.adult === true);
}

function isRecognizableToAmericanAudience(person) {
  const knownFor = person.known_for ?? [];
  const hasEnglishWork = knownFor.some(kf => kf.original_language === 'en');
  return hasEnglishWork || person.popularity >= MIN_POPULARITY_FOR_NON_ENGLISH;
}

async function fetchAllCandidates() {
  console.log(`Fetching popular people from TMDB (pages 1–${PAGES_TO_FETCH})...`);
  const pages = await Promise.all(
    Array.from({ length: PAGES_TO_FETCH }, (_, i) =>
      tmdbGet(`/person/popular?page=${i + 1}`)
    )
  );
  const all = pages.flatMap(p => p.results);
  console.log(`  Raw candidates: ${all.length}`);

  let filtered = all.filter(p => !p.adult);
  console.log(`  After person-level adult filter: ${filtered.length} (removed ${all.length - filtered.length})`);

  const beforeAdult = filtered.length;
  filtered = filtered.filter(p => !hasAdultKnownFor(p));
  console.log(`  After known_for adult filter: ${filtered.length} (removed ${beforeAdult - filtered.length})`);

  const beforeIntl = filtered.length;
  filtered = filtered.filter(p => isRecognizableToAmericanAudience(p));
  console.log(`  After international recognizability filter: ${filtered.length} (removed ${beforeIntl - filtered.length})`);

  return filtered;
}

async function fetchDetails(candidates) {
  console.log(`\nFetching person details for ${candidates.length} candidates...`);
  const results = [];
  for (const person of candidates) {
    try {
      const detail = await tmdbGet(`/person/${person.id}`);
      if (detail.adult || !detail.birthday) {
        process.stdout.write('x');
        await sleep(60);
        continue;
      }
      detail._popularity = person.popularity;
      detail._knownForDept = detail.known_for_department;
      detail._deathday = detail.deathday;
      results.push(detail);
      process.stdout.write('.');
      await sleep(60);
    } catch (err) {
      console.warn(`\n  Skipping ${person.name}: ${err.message}`);
    }
  }
  console.log();
  return results;
}

function loadExisting() {
  try {
    const raw = readFileSync(OUTPUT_PATH, 'utf8');
    const data = JSON.parse(raw);
    const map = new Map();
    for (const entry of (data.celebrities ?? [])) {
      map.set(entry.tmdbId, entry);
    }
    return map;
  } catch {
    return new Map();
  }
}

async function main() {
  const existing = loadExisting();
  console.log(`Existing entries: ${existing.size}`);

  const candidates = await fetchAllCandidates();
  const details = await fetchDetails(candidates);

  let added = 0;
  const merged = new Map(existing);

  for (const person of details) {
    if (merged.has(person.id)) continue; // preserve manual edits

    const difficulty = assignDifficulty(person.birthday, person._deathday, person._popularity);
    const entry = { tmdbId: person.id, name: person.name, difficulty };

    // editorial notes — helps during manual review
    if (person._deathday) {
      const deathAge = computeAge(person.birthday, person._deathday);
      if (deathAge <= 45) entry.notes = 'young death';
    }
    if (person._knownForDept && person._knownForDept !== 'Acting') {
      const dept = person._knownForDept.toLowerCase();
      entry.notes = entry.notes ? `${entry.notes}; ${dept}` : dept;
    }

    merged.set(person.id, entry);
    added++;
  }

  const diffOrder = { hard: 0, medium: 1, easy: 2 };
  const sorted = [...merged.values()].sort((a, b) => {
    const d = diffOrder[a.difficulty] - diffOrder[b.difficulty];
    return d !== 0 ? d : a.name.localeCompare(b.name);
  });

  const counts = { easy: 0, medium: 0, hard: 0 };
  for (const e of sorted) counts[e.difficulty]++;

  writeFileSync(OUTPUT_PATH, JSON.stringify({
    version: '1',
    lastUpdated: new Date().toISOString().slice(0, 10),
    celebrities: sorted,
  }, null, 2));

  console.log(`\nWrote ${OUTPUT_PATH}`);
  console.log(`Total: ${sorted.length} (${added} new) — easy: ${counts.easy}, medium: ${counts.medium}, hard: ${counts.hard}`);
  if (counts.hard < 30) {
    console.warn(`  ⚠ Hard pool is low (${counts.hard}). Consider manually adding notable 60–90 year olds.`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
