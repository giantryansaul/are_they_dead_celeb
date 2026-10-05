import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ambiguity, fameFromPageviews, computeTrickiness, effectiveTrickiness } from './trickiness.js';

const today = '2026-10-04';
const close = (actual, expected, eps = 0.01) =>
  assert.ok(Math.abs(actual - expected) < eps, `${actual} !≈ ${expected}`);

test('alive ambiguity: 0.2 at 50, 1.0 at 85+, linear between', () => {
  close(ambiguity({ birthDate: '1976-10-04', deathDate: null, today }), 0.2);
  close(ambiguity({ birthDate: '1941-10-04', deathDate: null, today }), 1.0);
  close(ambiguity({ birthDate: '1931-10-04', deathDate: null, today }), 1.0);
  close(ambiguity({ birthDate: '1958-10-04', deathDate: null, today }), 0.2 + 0.8 * (18 / 35));
});

test('dead ambiguity: 1.0 for a death today, ~0 at 25+ years', () => {
  close(ambiguity({ birthDate: '1950-01-01', deathDate: today, today }), 1.0);
  close(ambiguity({ birthDate: '1950-01-01', deathDate: '2001-10-04', today }), 0, 0.001);
  close(ambiguity({ birthDate: '1920-01-01', deathDate: '1977-08-16', today }), 0, 0.001);
});

test('dead ambiguity is halved when they would be over 95 today', () => {
  close(ambiguity({ birthDate: '1925-01-01', deathDate: '2026-04-04', today }), 0.49);
});

test('fameFromPageviews is a percentile rank; missing views score 0', () => {
  const all = [10, 100, 1000, 10000, null];
  assert.equal(fameFromPageviews(10000, all), 1);
  assert.equal(fameFromPageviews(10, all), 0.25);
  assert.equal(fameFromPageviews(null, all), 0);
  assert.equal(fameFromPageviews(0, all), 0);
});

test('computeTrickiness combines ambiguity and fame', () => {
  const old = { birthDate: '1941-10-04', deathDate: null, today };
  assert.equal(computeTrickiness({ ...old, fame: 1 }), 100);
  assert.equal(computeTrickiness({ ...old, fame: 0 }), 50);
  assert.equal(
    computeTrickiness({ birthDate: '1935-01-08', deathDate: '1977-08-16', fame: 1, today }),
    0,
  );
});

test('effectiveTrickiness prefers the override, including 0', () => {
  assert.equal(effectiveTrickiness({ trickiness: 40, trickinessOverride: null }), 40);
  assert.equal(effectiveTrickiness({ trickiness: 40, trickinessOverride: 0 }), 0);
  assert.equal(effectiveTrickiness({ trickiness: 40, trickinessOverride: 90 }), 90);
  assert.equal(effectiveTrickiness({}), 0);
});
