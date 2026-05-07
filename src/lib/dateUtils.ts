export function formatDeathDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

export function getTodayDateString(): string {
  const today = new Date();
  return today.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

export function getTodayKey(): string {
  const today = new Date();
  return today.toISOString().slice(0, 10);
}
