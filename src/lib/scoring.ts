import { POINTS_CORRECT, POINTS_PER_UNUSED_HINT, MAX_HINTS } from './constants';
import type { RowState } from '../types';

export function calculateRowScore(correct: boolean, hintsUsed: number): number {
  if (!correct) return 0;
  const unusedHints = MAX_HINTS - hintsUsed;
  return POINTS_CORRECT + unusedHints * POINTS_PER_UNUSED_HINT;
}

export function calculateTotalScore(rows: RowState[]): number {
  return rows.reduce((sum, row) => {
    if (!row.answered || row.correct === null) return sum;
    return sum + calculateRowScore(row.correct, row.hintsUsed.length);
  }, 0);
}
