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
    await sleep(100);
  }
  console.log();
  const nullViews = candidates.filter(c => c.enPageviews == null).length;
  const popular = candidates.filter(c => existingIds.has(c.tmdbId) || passesPageviews(c, c.pass));
  console.log(`After pageview filter: ${popular.length} (null pageviews: ${nullViews} of ${candidates.length})`);

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

  // Re-read: decisions saved through the review UI during this run must survive.
  const { existing: latest } = migrateLegacy(
    readJson(CELEB_LIST_PATH, { version: '2', celebrities: [] }),
  );
  const startStatus = new Map(existing.map(e => [e.tmdbId, e.status]));
  const changed = latest.length !== existing.length ||
    latest.some(e => startStatus.get(e.tmdbId) !== e.status);
  if (changed) {
    console.log(`Pool changed during the run (${existing.length} -> ${latest.length} entries or statuses edited); merging into the fresh copy.`);
  }

  const { celebrities, added, refreshed } = mergePool(latest, fresh);
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
