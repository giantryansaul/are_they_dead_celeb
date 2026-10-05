// Date helpers. All inputs are ISO dates (YYYY-MM-DD), interpreted as UTC.

const MS_PER_DAY = 86_400_000;

export function ageOn(birthDate, onDate) {
  const b = new Date(birthDate);
  const d = new Date(onDate);
  let age = d.getUTCFullYear() - b.getUTCFullYear();
  const m = d.getUTCMonth() - b.getUTCMonth();
  if (m < 0 || (m === 0 && d.getUTCDate() < b.getUTCDate())) age--;
  return age;
}

export function daysBetween(from, to) {
  return (Date.parse(to) - Date.parse(from)) / MS_PER_DAY;
}

export function yearsSince(date, today) {
  return daysBetween(date, today) / 365.25;
}

// The 12 full months before `today`, in the Wikimedia pageviews API's
// YYYYMMDD format. `end` is the last day of the previous month; using the
// first of the current month would pull in a 13th, partial month.
export function pageviewRange(today) {
  const d = new Date(today);
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 0));
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 12, 1));
  const fmt = x => x.toISOString().slice(0, 10).replaceAll('-', '');
  return { start: fmt(start), end: fmt(end) };
}
