import type { Celebrity } from '../../types';
import { formatDeathDate } from '../../lib/dateUtils';

interface AnswerResultProps {
  celebrity: Celebrity;
  wasCorrect: boolean;
}

export function AnswerResult({ celebrity, wasCorrect }: AnswerResultProps) {
  const resultColor = wasCorrect ? 'text-green-700' : 'text-red-700';

  return (
    <div className={`mt-2 text-sm font-medium ${resultColor}`}>
      {wasCorrect ? '✓ Correct! ' : '✗ Wrong! '}
      {celebrity.isAlive ? (
        <span className="text-gray-600 font-normal">Still alive (born {celebrity.birthYear})</span>
      ) : (
        <span className="text-gray-600 font-normal">
          Died {formatDeathDate(celebrity.deathDate!)} — age {celebrity.deathAge}
        </span>
      )}
    </div>
  );
}
