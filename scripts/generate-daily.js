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

  const birthday = entry.birthDate || detail.birthday;
  if (!birthday) {
    throw new Error(`${detail.name ?? entry.name} (tmdb ${entry.tmdbId}): no birth date`);
  }
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

  const deadCount = celebrities.filter(c => !c.isAlive).length;
  if (deadCount < 1 || deadCount > 4) {
    console.warn(`  ⚠ Live death checks changed the dead count to ${deadCount}`);
  }

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
