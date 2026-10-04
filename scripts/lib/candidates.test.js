import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseWikidataRow, qualifyPass, passesAgeRule, passesPageviews } from './candidates.js';

const today = '2026-10-04';
const binding = (overrides = {}) => ({
  item: { value: 'http://www.wikidata.org/entity/Q873' },
  tmdb: { value: '4' },
  birthDate: { value: '1956-10-21T00:00:00Z' },
  deathDate: { value: '2016-12-27T00:00:00Z' },
  sitelinks: { value: '98' },
  enTitle: { value: 'Carrie Fisher' },
  citizenships: { value: 'Q30|United States of America' },
  ...overrides,
});

test('parseWikidataRow maps a full binding', () => {
  assert.deepEqual(parseWikidataRow(binding()), {
    wikidataId: 'Q873', tmdbId: 4, birthDate: '1956-10-21', deathDate: '2016-12-27',
    sitelinks: 98, enTitle: 'Carrie Fisher', nationality: ['US'],
  });
});

test('parseWikidataRow handles missing optionals and mixed nationality', () => {
  const c = parseWikidataRow(binding({
    deathDate: undefined, enTitle: undefined,
    citizenships: { value: 'Q145|United Kingdom;Q142|France;Q145|United Kingdom' },
  }));
  assert.equal(c.deathDate, null);
  assert.equal(c.enTitle, null);
  assert.deepEqual(c.nationality, ['GB', 'France']);
  assert.deepEqual(parseWikidataRow(binding({ citizenships: undefined })).nationality, []);
});

test('parseWikidataRow rejects non-numeric tmdb ids and missing birth dates', () => {
  assert.equal(parseWikidataRow(binding({ tmdb: { value: 'abc' } })), null);
  assert.equal(parseWikidataRow(binding({ birthDate: undefined })), null);
});

test('qualifyPass: US/UK at 30+ sitelinks is core, anyone at 60+ is fame', () => {
  assert.equal(qualifyPass({ nationality: ['US'], sitelinks: 30 }), 'core');
  assert.equal(qualifyPass({ nationality: ['GB', 'Ireland'], sitelinks: 45 }), 'core');
  assert.equal(qualifyPass({ nationality: ['US'], sitelinks: 29 }), null);
  assert.equal(qualifyPass({ nationality: ['France'], sitelinks: 59 }), null);
  assert.equal(qualifyPass({ nationality: ['France'], sitelinks: 60 }), 'fame');
  assert.equal(qualifyPass({ nationality: [], sitelinks: 100 }), 'fame');
});

test('passesAgeRule: dead at any age, alive only at 50+', () => {
  assert.equal(passesAgeRule({ birthDate: '1990-01-01', deathDate: '2020-01-01' }, today), true);
  assert.equal(passesAgeRule({ birthDate: '1990-01-01', deathDate: null }, today), false);
  assert.equal(passesAgeRule({ birthDate: '1976-10-04', deathDate: null }, today), true);
});

test('passesPageviews: per-pass thresholds; unknown views are kept', () => {
  assert.equal(passesPageviews({ enPageviews: 1_000_000 }, 'core'), true);
  assert.equal(passesPageviews({ enPageviews: 999_999 }, 'core'), false);
  assert.equal(passesPageviews({ enPageviews: 1_999_999 }, 'fame'), false);
  assert.equal(passesPageviews({ enPageviews: 2_000_000 }, 'fame'), true);
  assert.equal(passesPageviews({ enPageviews: null }, 'fame'), true);
});
