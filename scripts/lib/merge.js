// Merges freshly built machine data into the curated pool without ever
// touching the fields a human owns.

import { effectiveTrickiness } from './trickiness.js';

export const HUMAN_FIELDS = ['status', 'notes', 'trickinessOverride'];
const STATUS_ORDER = { pending: 0, approved: 1, rejected: 2 };

export function sortPool(entries) {
  return [...entries].sort((a, b) =>
    (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9) ||
    effectiveTrickiness(b) - effectiveTrickiness(a) ||
    a.name.localeCompare(b.name));
}

export function mergePool(existing, fresh) {
  const byId = new Map(existing.map(e => [e.tmdbId, e]));
  let added = 0;
  let refreshed = 0;
  for (const entry of fresh) {
    const prev = byId.get(entry.tmdbId);
    if (prev) {
      byId.set(entry.tmdbId, {
        ...entry,
        status: prev.status,
        notes: prev.notes ?? '',
        trickinessOverride: prev.trickinessOverride ?? null,
      });
      refreshed++;
    } else {
      byId.set(entry.tmdbId, { ...entry, status: 'pending', notes: '', trickinessOverride: null });
      added++;
    }
  }
  return { celebrities: sortPool([...byId.values()]), added, refreshed };
}

// v1 lists had auto-assigned difficulty and no review status, so nothing
// carries over except the ids, which are re-checked against the filters.
export function migrateLegacy(data) {
  const version = String(data.version ?? '1');
  if (version === '2') return { existing: data.celebrities ?? [], legacyIds: [] };
  if (version !== '1') throw new Error(`Unsupported celeb-list version: ${data.version}`);
  return { existing: [], legacyIds: (data.celebrities ?? []).map(e => e.tmdbId) };
}
