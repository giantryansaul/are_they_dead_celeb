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
  onReset: () => void;
  onClose: () => void;
}

export function ResultsModal({ rows, celebrities, onReset, onClose }: ResultsModalProps) {
  const { copy, copied } = useClipboard();
  const total = calculateTotalScore(rows);
  const maxTotal = CELEBRITIES_PER_DAY * MAX_SCORE_PER_ROW;
  const dateStr = getTodayDateString();

  function handleCopy() {
    copy(buildScorecardString(dateStr, rows, celebrities));
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative bg-[#232932] border border-atd-border w-full max-w-sm p-6">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center text-atd-text-muted hover:text-atd-text hover:bg-atd-bg transition-colors text-xl leading-none cursor-pointer"
        >
          ×
        </button>

        <h2 className="text-xl font-bold text-atd-text text-center mb-1">Game Over!</h2>
        <p className="text-sm text-atd-text-muted text-center mb-4">{dateStr}</p>

        <div className="bg-atd-bg px-4 py-3 mb-4">
          <p className="text-center text-5xl font-bold text-atd-amber tabular-nums">{total}</p>
          <p className="text-center text-sm text-atd-text-muted">out of {maxTotal} points</p>
        </div>

        <div className="divide-y divide-atd-border mb-5">
          {rows.map((row, i) => (
            <ScoreRowSummary key={i} rowState={row} celebrity={celebrities[i]} />
          ))}
        </div>

        <Button variant="copy" onClick={handleCopy} fullWidth>
          {copied ? '✓ Copied!' : '📋 Copy Results'}
        </Button>

        {import.meta.env.DEV && (
          <button
            onClick={onReset}
            className="mt-3 w-full text-xs text-atd-text-dim hover:text-atd-text-muted underline"
          >
            [debug] Reset game
          </button>
        )}
      </div>
    </div>
  );
}
