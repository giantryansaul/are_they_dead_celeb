import { getTodayDateString } from '../../lib/dateUtils';
import { CELEBRITIES_PER_DAY, MAX_SCORE_PER_ROW } from '../../lib/constants';

interface HeaderProps {
  score: number;
  answeredCount: number;
}

export function Header({ score, answeredCount }: HeaderProps) {
  const maxScore = CELEBRITIES_PER_DAY * MAX_SCORE_PER_ROW;

  return (
    <header className="bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Are They Dead?</h1>
          <p className="text-sm text-gray-500">{getTodayDateString()}</p>
        </div>
        {answeredCount > 0 && (
          <div className="text-right">
            <p className="text-2xl font-bold text-gray-900">{score}</p>
            <p className="text-xs text-gray-500">of {maxScore} pts</p>
          </div>
        )}
      </div>
    </header>
  );
}
