import type { RowState, Celebrity } from '../../types';
import { ScoreIcon } from '../atoms/ScoreIcon';
import { HintIcon } from '../atoms/HintIcon';
import { calculateRowScore } from '../../lib/scoring';
import { MAX_SCORE_PER_ROW } from '../../lib/constants';

interface ScoreRowSummaryProps {
  rowState: RowState;
  celebrity: Celebrity;
}

export function ScoreRowSummary({ rowState, celebrity }: ScoreRowSummaryProps) {
  const score = rowState.answered && rowState.correct !== null
    ? calculateRowScore(rowState.correct, rowState.hintsUsed.length)
    : 0;

  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <div className="flex items-center gap-1">
        <ScoreIcon correct={!!rowState.correct} />
        <HintIcon type="photo" used={rowState.hintsUsed.includes('photo')} />
        <HintIcon type="birthYear" used={rowState.hintsUsed.includes('birthYear')} />
        <HintIcon type="knownFor0" used={rowState.hintsUsed.includes('knownFor0')} />
        <HintIcon type="knownFor1" used={rowState.hintsUsed.includes('knownFor1')} />
        <HintIcon type="knownFor2" used={rowState.hintsUsed.includes('knownFor2')} />
      </div>
      <span className="text-sm text-atd-text-muted flex-1 truncate">{celebrity.name}</span>
      <span className="text-sm font-semibold text-atd-text tabular-nums">
        {score}/{MAX_SCORE_PER_ROW}
      </span>
    </div>
  );
}
