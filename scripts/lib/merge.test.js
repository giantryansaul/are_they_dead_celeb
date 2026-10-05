import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergePool, sortPool, migrateLegacy } from './merge.js';

const machine = (id, extra = {}) => ({
  tmdbId: id, name: `P${id}`, birthDate: '1940-01-01', deathDate: null, trickiness: 50, ...extra,
});

test('new ids are added as pending with empty human fields', () => {
  const { celebrities, added, refreshed } = mergePool([], [machine(1)]);
  assert.equal(added, 1);
  assert.equal(refreshed, 0);
  assert.deepEqual(celebrities[0], { ...machine(1), status: 'pending', notes: '', trickinessOverride: null });
});

test('refresh updates machine fields and keeps human fields', () => {
  const existing = [{ ...machine(1), status: 'approved', notes: 'great', trickinessOverride: 90 }];
  const { celebrities, refreshed } = mergePool(existing, [machine(1, { deathDate: '2026-09-01', trickiness: 80 })]);
  assert.equal(refreshed, 1);
  assert.equal(celebrities[0].deathDate, '2026-09-01');
  assert.equal(celebrities[0].trickiness, 80);
  assert.equal(celebrities[0].status, 'approved');
  assert.equal(celebrities[0].notes, 'great');
  assert.equal(celebrities[0].trickinessOverride, 90);
});

test('rejected entries stay rejected', () => {
  const existing = [{ ...machine(1), status: 'rejected', notes: '', trickinessOverride: null }];
  const { celebrities } = mergePool(existing, [machine(1)]);
  assert.equal(celebrities[0].status, 'rejected');
});

test('existing entries missing from fresh results are kept untouched', () => {
  const keep = { ...machine(2), status: 'approved', notes: 'x', trickinessOverride: null };
  const { celebrities } = mergePool([keep], [machine(1)]);
  assert.deepEqual(celebrities.find(e => e.tmdbId === 2), keep);
});

test('sortPool orders by status, then trickiness desc, then name', () => {
  const e = (id, status, trickiness, name) =>
    ({ tmdbId: id, status, trickiness, trickinessOverride: null, name });
  const sorted = sortPool([
    e(1, 'rejected', 99, 'A'), e(2, 'approved', 10, 'B'), e(3, 'pending', 20, 'C'),
    e(4, 'pending', 80, 'D'), e(5, 'pending', 80, 'Ab'),
  ]);
  assert.deepEqual(sorted.map(x => x.tmdbId), [5, 4, 3, 2, 1]);
});

test('migrateLegacy turns a v1 list into ids to re-check', () => {
  const v1 = { version: '1', celebrities: [{ tmdbId: 7, name: 'X', difficulty: 'hard', notes: 'directing' }] };
  assert.deepEqual(migrateLegacy(v1), { existing: [], legacyIds: [7] });
});

test('migrateLegacy passes v2 through', () => {
  const v2 = { version: '2', celebrities: [{ tmdbId: 7, status: 'approved' }] };
  assert.deepEqual(migrateLegacy(v2), { existing: v2.celebrities, legacyIds: [] });
});

test('migrateLegacy treats numeric version 2 as v2', () => {
  const v2 = { version: 2, celebrities: [{ tmdbId: 7, status: 'approved' }] };
  assert.deepEqual(migrateLegacy(v2), { existing: v2.celebrities, legacyIds: [] });
});

test('migrateLegacy treats a missing version as v1', () => {
  assert.deepEqual(migrateLegacy({ celebrities: [{ tmdbId: 3 }] }), { existing: [], legacyIds: [3] });
});

test('migrateLegacy throws on unknown versions', () => {
  assert.throws(() => migrateLegacy({ version: '3', celebrities: [] }), /Unsupported celeb-list version: 3/);
});
