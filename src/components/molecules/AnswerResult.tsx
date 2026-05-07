import type { Celebrity } from '../../types';
import { formatDeathDate } from '../../lib/dateUtils';

interface AnswerResultProps {
  celebrity: Celebrity;
  wasCorrect: boolean;
}

export function AnswerResult({ celebrity, wasCorrect }: AnswerResultProps) {
  return (
    <div className="mx-2 mb-2 bg-atd-surface-2 px-4 py-3 text-center">
      <span
        className={`text-base font-bold ${wasCorrect ? 'text-atd-green' : 'text-atd-red'}`}
      >
        {wasCorrect ? '✓ Correct' : '✗ Wrong'}
      </span>
      <p className="text-sm text-atd-text-muted mt-1">
        {celebrity.isAlive
          ? `Still alive (born ${celebrity.birthYear})`
          : `Died ${formatDeathDate(celebrity.deathDate!)} — age ${celebrity.deathAge}`}
      </p>
    </div>
  );
}
