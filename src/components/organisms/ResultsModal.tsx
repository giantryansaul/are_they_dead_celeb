import type { RowState, Celebrity } from '../../types';
import { Button } from '../atoms/Button';
import { ScoreRowSummary } from '../molecules/ScoreRowSummary';
import { calculateTotalScore } from '../../lib/scoring';
import { buildScorecardString } from '../../lib/scorecard';
import { getTodayDateString } from '../../lib/dateUtils';
import { useClipboard } from '../../hooks/useClipboard';
import { CELEBRITIES_PER_DAY, MAX_SCORE_PER_ROW } from '../../lib/constants';

interface ResultsModalProps {
  rows: RowState[];
  celebrities: Celebrity[];
}

export function ResultsModal({ rows, celebrities }: ResultsModalProps) {
  const { copy, copied } = useClipboard();
  const total = calculateTotalScore(rows);
  const maxTotal = CELEBRITIES_PER_DAY * MAX_SCORE_PER_ROW;
  const dateStr = getTodayDateString();

  function handleCopy() {
    copy(buildScorecardString(dateStr, rows, celebrities));
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <h2 className="text-xl font-bold text-gray-900 text-center mb-1">Game Over!</h2>
        <p className="text-sm text-gray-500 text-center mb-4">{dateStr}</p>

        <div className="bg-gray-50 rounded-xl px-4 py-3 mb-4">
          <p className="text-center text-4xl font-bold text-gray-900">{total}</p>
          <p className="text-center text-sm text-gray-500">out of {maxTotal} points</p>
        </div>

        <div className="divide-y divide-gray-100 mb-5">
          {rows.map((row, i) => (
            <ScoreRowSummary key={i} rowState={row} celebrity={celebrities[i]} />
          ))}
        </div>

        <Button variant="copy" onClick={handleCopy}>
          {copied ? '✓ Copied!' : '📋 Copy Results'}
        </Button>
      </div>
    </div>
  );
}
