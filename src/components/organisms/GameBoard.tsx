import { useCelebrities } from '../../hooks/useCelebrities';
import { useGameState } from '../../hooks/useGameState';
import { calculateTotalScore } from '../../lib/scoring';
import { CelebrityRow } from '../molecules/CelebrityRow';
import { ResultsModal } from './ResultsModal';
import { Header } from './Header';

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-48 mb-3" />
          <div className="flex gap-2">
            <div className="h-9 bg-gray-200 rounded w-20" />
            <div className="h-9 bg-gray-200 rounded w-20" />
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

  return (
    <>
      <Header score={score} answeredCount={answeredCount} />

      <main className="max-w-2xl mx-auto px-4 py-6">
        {loading && <LoadingSkeleton />}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
            <p className="text-red-700 font-medium">Failed to load today's celebrities</p>
            <p className="text-red-500 text-sm mt-1">{error}</p>
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

      {gameState.allAnswered && celebrities.length > 0 && (
        <ResultsModal rows={gameState.rows} celebrities={celebrities} onReset={resetGame} />
      )}
    </>
  );
}
