import { useEffect, useState } from 'react';
import { useCelebrities } from '../../hooks/useCelebrities';
import { useGameState } from '../../hooks/useGameState';
import { calculateTotalScore } from '../../lib/scoring';
import { CelebrityRow } from '../molecules/CelebrityRow';
import { ResultsModal } from './ResultsModal';
import { Header } from './Header';
import { CELEBRITIES_PER_DAY, MAX_SCORE_PER_ROW } from '../../lib/constants';

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="bg-atd-surface border border-atd-border p-2 animate-pulse"
        >
          <div className="grid grid-cols-[1fr_1.4fr_1fr] gap-2">
            <div className="h-[16rem] sm:h-[24rem] bg-atd-surface-2" />
            <div className="h-[16rem] sm:h-[24rem] bg-atd-surface-2" />
            <div className="h-[16rem] sm:h-[24rem] bg-atd-surface-2" />
          </div>
          <div className="grid grid-cols-3 gap-2 mt-2">
            <div className="h-20 bg-atd-surface-2" />
            <div className="h-20 bg-atd-surface-2" />
            <div className="h-20 bg-atd-surface-2" />
          </div>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <div className="h-14 bg-atd-surface-2" />
            <div className="h-14 bg-atd-surface-2" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function GameBoard() {
  const { celebrities, loading, error } = useCelebrities();
  const { gameState, submitAnswer, useHint, resetGame } = useGameState(
    celebrities.map(c => c.isAlive),
  );

  const score = calculateTotalScore(gameState.rows);
  const answeredCount = gameState.rows.filter(r => r.answered).length;
  const maxScore = CELEBRITIES_PER_DAY * MAX_SCORE_PER_ROW;

  const [modalDismissed, setModalDismissed] = useState(false);
  useEffect(() => {
    if (!gameState.allAnswered) setModalDismissed(false);
  }, [gameState.allAnswered]);

  const showModal = gameState.allAnswered && celebrities.length > 0 && !modalDismissed;
  const showBottomScore = gameState.allAnswered && celebrities.length > 0 && modalDismissed;

  return (
    <>
      <Header score={score} answeredCount={answeredCount} />

      <main className={`max-w-2xl mx-auto px-2 sm:px-4 py-6 ${showBottomScore ? 'pb-24' : ''}`}>
        {loading && <LoadingSkeleton />}

        {error && (
          <div className="bg-atd-surface border border-atd-red/40 p-6 text-center">
            <p className="text-atd-red font-medium">Failed to load today's celebrities</p>
            <p className="text-atd-red/70 text-sm mt-1">{error}</p>
          </div>
        )}

        {!loading && !error && (
          <div className="space-y-3">
            {celebrities.map((celebrity, i) => (
              <CelebrityRow
                key={celebrity.id}
                celebrity={celebrity}
                rowState={gameState.rows[i]}
                index={i}
                onAnswer={submitAnswer}
                onHint={useHint}
              />
            ))}
          </div>
        )}
      </main>

      {showModal && (
        <ResultsModal
          rows={gameState.rows}
          celebrities={celebrities}
          onReset={resetGame}
          onClose={() => setModalDismissed(true)}
        />
      )}

      {showBottomScore && (
        <button
          onClick={() => setModalDismissed(false)}
          className="fixed bottom-0 inset-x-0 z-30 bg-[#1A1F26] border-t border-atd-border py-3 px-4 text-center hover:bg-atd-surface-2 transition-colors cursor-pointer"
        >
          <span className="text-atd-text-muted text-xs uppercase tracking-widest mr-3">
            Final Score
          </span>
          <span className="text-3xl font-bold text-atd-amber tabular-nums align-middle">
            {score}
          </span>
          <span className="text-atd-text-muted text-sm ml-1">/ {maxScore}</span>
          <span className="text-atd-text-dim text-xs ml-3">tap to view details</span>
        </button>
      )}
    </>
  );
}
