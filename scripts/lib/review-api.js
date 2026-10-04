// Validated updates to a single pool entry, used by the review server.

const STATUSES = ['pending', 'approved', 'rejected'];
const EDITABLE_FIELDS = ['status', 'notes', 'trickinessOverride'];

export class ReviewError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function validatePatch(patch) {
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) {
    throw new ReviewError(400, 'Body must be a JSON object');
  }
  const keys = Object.keys(patch);
  if (keys.length === 0) throw new ReviewError(400, 'No fields to update');
  const unknown = keys.filter(k => !EDITABLE_FIELDS.includes(k));
  if (unknown.length) throw new ReviewError(400, `Unknown fields: ${unknown.join(', ')}`);
  if ('status' in patch && !STATUSES.includes(patch.status)) {
    throw new ReviewError(400, `status must be one of ${STATUSES.join(', ')}`);
  }
  if ('notes' in patch && typeof patch.notes !== 'string') {
    throw new ReviewError(400, 'notes must be a string');
  }
  if ('trickinessOverride' in patch) {
    const v = patch.trickinessOverride;
    if (v !== null && !(Number.isInteger(v) && v >= 0 && v <= 100)) {
      throw new ReviewError(400, 'trickinessOverride must be null or an integer 0-100');
    }
  }
}

export function applyEntryUpdate(data, tmdbId, patch) {
  validatePatch(patch);
  const current = (data.celebrities ?? []).find(e => e.tmdbId === tmdbId);
  if (!current) throw new ReviewError(404, `No entry with tmdbId ${tmdbId}`);
  const entry = { ...current, ...patch };
  return {
    data: { ...data, celebrities: data.celebrities.map(e => (e === current ? entry : e)) },
    entry,
  };
}
