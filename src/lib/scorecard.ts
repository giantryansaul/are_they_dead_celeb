import type { RowState, Celebrity } from '../types';
import { calculateRowScore, calculateTotalScore } from './scoring';
import { CELEBRITIES_PER_DAY, MAX_SCORE_PER_ROW } from './constants';

function rowEmojis(row: RowState): string {
  const correct = row.correct ? '🟩' : '🟥';
  const photo = row.hintsUsed.includes('photo') ? '📸' : '⬜';
  const birth = row.hintsUsed.includes('birthYear') ? '🎂' : '⬜';
  return `${correct}${photo}${birth}`;
}

export function buildScorecardString(
  dateStr: string,
  rows: RowState[],
  celebrities: Celebrity[],
): string {
  const total = calculateTotalScore(rows);
  const maxTotal = CELEBRITIES_PER_DAY * MAX_SCORE_PER_ROW;

  const header = `Are They Dead? - ${dateStr} - ${total}/${maxTotal}`;
  const lines = rows.map((row, i) => {
    const score = row.answered && row.correct !== null
      ? calculateRowScore(row.correct, row.hintsUsed.length)
      : 0;
    return `${rowEmojis(row)} ${score}/${MAX_SCORE_PER_ROW}  ${celebrities[i]?.name ?? ''}`;
  });

  return [header, ...lines].join('\n');
}
