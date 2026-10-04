import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ageOn, yearsSince, daysBetween, pageviewRange } from './dates.js';

test('ageOn counts whole years, birthday-aware', () => {
  assert.equal(ageOn('1956-10-21', '2016-12-27'), 60);
  assert.equal(ageOn('2000-10-05', '2026-10-04'), 25);
  assert.equal(ageOn('2000-10-04', '2026-10-04'), 26);
});

test('yearsSince returns fractional years', () => {
  assert.ok(Math.abs(yearsSince('2016-10-04', '2026-10-04') - 10) < 0.01);
});

test('daysBetween returns days from first to second date', () => {
  assert.equal(daysBetween('2026-09-04', '2026-10-04'), 30);
});

test('pageviewRange covers the 12 full months before today', () => {
  assert.deepEqual(pageviewRange('2026-10-04'), { start: '20251001', end: '20260930' });
  assert.deepEqual(pageviewRange('2026-01-15'), { start: '20250101', end: '20251231' });
});
