import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  seededRandom, dateSeed, isEligible, chooseDeadCount, lastShownMap,
  pickDaily, poolHealth, recordShown,
} from './picker.js';

const today = '2026-10-04';

function person(id, { dead = false, born = '1940-01-01', status = 'approved', trickiness = 50 } = {}) {
  return {
    tmdbId: id, name: `P${id}`, status, birthDate: born,
    deathDate: dead ? '2024-01-01' : null, trickiness, trickinessOverride: null,
  };
}

function makePool(aliveCount, deadCount) {
  return [
    ...Array.from({ length: aliveCount }, (_, i) => person(i + 1)),
    ...Array.from({ length: deadCount }, (_, i) => person(1001 + i, { dead: true })),
  ];
}

const ids = list => list.map(e => e.tmdbId);
const deadIn = list => list.filter(e => e.deathDate).length;

test('dateSeed matches the legacy date seed', () => {
  assert.equal(dateSeed('2026-10-04'), 20261004);
  assert.equal(dateSeed('2026-10-04', 1), 20261005);
});

test('isEligible: approved only, never alive under 50', () => {
  assert.equal(isEligible(person(1), today), true);
  assert.equal(isEligible(person(1, { status: 'pending' }), today), false);
  assert.equal(isEligible(person(1, { born: '1990-01-01' }), today), false);
  assert.equal(isEligible(person(1, { born: '1990-01-01', dead: true }), today), true);
  assert.equal(isEligible(person(1, { born: '1976-10-04' }), today), true);
});

test('chooseDeadCount stays within 1..4 and hits every value', () => {
  const seen = new Set();
  for (let s = 0; s < 500; s++) seen.add(chooseDeadCount(seededRandom(s)));
  assert.deepEqual([...seen].sort(), [1, 2, 3, 4]);
});

test('lastShownMap keeps the window, drops today and old entries', () => {
  const history = [
    { date: '2026-09-01', ids: [1] },
    { date: '2026-09-10', ids: [2, 3] },
    { date: '2026-09-20', ids: [3] },
    { date: today, ids: [4] },
  ];
  const map = lastShownMap(history, today);
  assert.deepEqual([...map.entries()].sort(), [[2, '2026-09-10'], [3, '2026-09-20']]);
});

test('pickDaily is deterministic for a seed', () => {
  const pool = makePool(30, 30);
  const a = pickDaily({ pool, history: [], today, seed: 42 });
  const b = pickDaily({ pool, history: [], today, seed: 42 });
  assert.deepEqual(ids(a), ids(b));
});

test('pickDaily returns 5 unique picks with the seeded dead count', () => {
  const pool = makePool(30, 30);
  for (let seed = 0; seed < 200; seed++) {
    const picks = pickDaily({ pool, history: [], today, seed });
    assert.equal(picks.length, 5);
    assert.equal(new Set(ids(picks)).size, 5);
    assert.equal(deadIn(picks), chooseDeadCount(seededRandom(seed)));
  }
});

test('pickDaily never picks alive-under-50 or unapproved people', () => {
  const pool = [
    ...makePool(10, 10),
    ...Array.from({ length: 20 }, (_, i) => person(2001 + i, { born: '1995-01-01', trickiness: 100 })),
    ...Array.from({ length: 20 }, (_, i) => person(3001 + i, { status: 'pending', trickiness: 100 })),
  ];
  for (let seed = 0; seed < 100; seed++) {
    for (const p of pickDaily({ pool, history: [], today, seed })) {
      assert.ok(p.tmdbId < 2001, `picked ineligible ${p.tmdbId}`);
    }
  }
});

test('pickDaily excludes people shown in the last 30 days', () => {
  const pool = makePool(30, 30);
  const history = [{ date: '2026-09-29', ids: [1, 2, 3, 1001, 1002] }];
  for (let seed = 0; seed < 100; seed++) {
    const picked = ids(pickDaily({ pool, history, today, seed }));
    assert.ok(![1, 2, 3, 1001, 1002].some(id => picked.includes(id)));
  }
});

test('short dead pool reuses least-recently-shown dead first', () => {
  const pool = makePool(10, 3);
  const history = [
    { date: '2026-10-01', ids: [1001] },
    { date: '2026-09-20', ids: [1002] },
    { date: '2026-09-25', ids: [1003] },
  ];
  const byRecency = [1002, 1003, 1001];
  for (let seed = 0; seed < 100; seed++) {
    const want = Math.min(chooseDeadCount(seededRandom(seed)), 3);
    const picks = pickDaily({ pool, history, today, seed });
    const dead = ids(picks.filter(e => e.deathDate)).sort();
    assert.deepEqual(dead, byRecency.slice(0, want).sort());
    assert.equal(picks.length, 5);
  }
});

test('short dead pool fills the rest from alive', () => {
  const pool = makePool(10, 1);
  for (let seed = 0; seed < 50; seed++) {
    const picks = pickDaily({ pool, history: [], today, seed });
    assert.equal(picks.length, 5);
    assert.equal(deadIn(picks), 1);
    assert.equal(new Set(ids(picks)).size, 5);
  }
});

test('pickDaily throws with fewer than 5 eligible', () => {
  assert.throws(() => pickDaily({ pool: makePool(2, 2), history: [], today, seed: 1 }), /eligible/);
  assert.throws(() => pickDaily({ pool: [], history: [], today, seed: 1 }), /eligible/);
});

test('poolHealth counts eligible alive and dead', () => {
  const pool = [...makePool(3, 2), person(99, { born: '1995-01-01' }), person(98, { status: 'rejected' })];
  assert.deepEqual(poolHealth(pool, today), { alive: 3, dead: 2 });
});

test('recordShown replaces today and prunes entries outside the window', () => {
  const history = [
    { date: '2026-08-01', ids: [1] },
    { date: '2026-09-30', ids: [2] },
    { date: today, ids: [3] },
  ];
  assert.deepEqual(recordShown(history, today, [7, 8]), [
    { date: '2026-09-30', ids: [2] },
    { date: today, ids: [7, 8] },
  ]);
});
