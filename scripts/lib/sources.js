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
  const url = `${PAGEVIEWS_BASE}/${article}/monthly/${start}/${end}`;
  const MAX_RETRIES = 3;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let retryAfterMs = 1000 * 2 ** attempt; // 1s, 2s, 4s
    try {
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
      if (res.status === 404) return 0;
      if (res.ok) {
        const data = await res.json();
        return (data.items ?? []).reduce((sum, item) => sum + item.views, 0);
      }
      if (res.status !== 429 && res.status < 500) return null;
      const header = Number(res.headers.get('retry-after'));
      if (Number.isFinite(header) && header > 0) retryAfterMs = header * 1000;
    } catch {
      // network error: fall through to retry
    }
    if (attempt < MAX_RETRIES) await sleep(retryAfterMs);
  }
  return null;
}
