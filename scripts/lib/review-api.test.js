import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyEntryUpdate, ReviewError } from './review-api.js';

const data = () => ({
  version: '2',
  celebrities: [
    { tmdbId: 1, name: 'A', status: 'pending', notes: '', trickinessOverride: null },
    { tmdbId: 2, name: 'B', status: 'pending', notes: '', trickinessOverride: null },
  ],
});

const rejectsWith = (status, fn) =>
  assert.throws(fn, err => err instanceof ReviewError && err.status === status);

test('applies a valid patch without mutating the input', () => {
  const input = data();
  const { data: out, entry } = applyEntryUpdate(input, 2, { status: 'approved', notes: 'yes', trickinessOverride: 70 });
  assert.deepEqual(entry, { tmdbId: 2, name: 'B', status: 'approved', notes: 'yes', trickinessOverride: 70 });
  assert.equal(out.celebrities[1], entry);
  assert.equal(out.version, '2');
  assert.equal(input.celebrities[1].status, 'pending');
});

test('trickinessOverride accepts null', () => {
  assert.equal(applyEntryUpdate(data(), 1, { trickinessOverride: null }).entry.trickinessOverride, null);
});

test('rejects invalid patches with 400', () => {
  rejectsWith(400, () => applyEntryUpdate(data(), 1, null));
  rejectsWith(400, () => applyEntryUpdate(data(), 1, []));
  rejectsWith(400, () => applyEntryUpdate(data(), 1, {}));
  rejectsWith(400, () => applyEntryUpdate(data(), 1, { name: 'hacked' }));
  rejectsWith(400, () => applyEntryUpdate(data(), 1, { status: 'maybe' }));
  rejectsWith(400, () => applyEntryUpdate(data(), 1, { notes: 5 }));
  rejectsWith(400, () => applyEntryUpdate(data(), 1, { trickinessOverride: 101 }));
  rejectsWith(400, () => applyEntryUpdate(data(), 1, { trickinessOverride: 4.5 }));
});

test('unknown id is a 404', () => {
  rejectsWith(404, () => applyEntryUpdate(data(), 99, { status: 'approved' }));
});
