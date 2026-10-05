// Turns Wikidata rows into candidates and decides who is worth reviewing.
// Thresholds are starting points, tuned after real build-list runs.

import { ageOn } from './dates.js';
import { MIN_ALIVE_AGE } from './picker.js';

export const MIN_SITELINKS = 30;
export const MIN_SITELINKS_FOREIGN = 60;
export const MIN_EN_PAGEVIEWS = 1_000_000;
export const MIN_EN_PAGEVIEWS_FOREIGN = 2_000_000;

const NATIONALITY_CODES = { Q30: 'US', Q145: 'GB' };
const CORE_NATIONALITIES = new Set(['US', 'GB']);

const value = (binding, key) => binding[key]?.value ?? null;

function parseNationality(raw) {
  if (!raw) return [];
  const codes = raw.split(';').filter(Boolean).map(pair => {
    const [qid, label] = pair.split('|');
    return NATIONALITY_CODES[qid] ?? label;
  });
  return [...new Set(codes)];
}

// Wikidata returns an IRI (.../genid/...) for "unknown value" dates.
const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;

export function parseWikidataRow(binding) {
  const tmdbId = Number(value(binding, 'tmdb'));
  const birth = value(binding, 'birthDate');
  if (!Number.isInteger(tmdbId) || tmdbId <= 0 || !ISO_DATE.test(birth ?? '')) return null;
  const death = value(binding, 'deathDate');
  return {
    wikidataId: value(binding, 'item').split('/').pop(),
    tmdbId,
    birthDate: birth.slice(0, 10),
    deathDate: ISO_DATE.test(death ?? '') ? death.slice(0, 10) : null,
    sitelinks: Number(value(binding, 'sitelinks') ?? 0),
    enTitle: value(binding, 'enTitle'),
    nationality: parseNationality(value(binding, 'citizenships')),
  };
}

export function qualifyPass(candidate) {
  const isCore = candidate.nationality.some(n => CORE_NATIONALITIES.has(n));
  if (isCore && candidate.sitelinks >= MIN_SITELINKS) return 'core';
  if (candidate.sitelinks >= MIN_SITELINKS_FOREIGN) return 'fame';
  return null;
}

export function passesAgeRule(candidate, today) {
  return Boolean(candidate.deathDate) || ageOn(candidate.birthDate, today) >= MIN_ALIVE_AGE;
}

export function passesPageviews(candidate, pass) {
  if (candidate.enPageviews == null) return true;
  const min = pass === 'core' ? MIN_EN_PAGEVIEWS : MIN_EN_PAGEVIEWS_FOREIGN;
  return candidate.enPageviews >= min;
}
