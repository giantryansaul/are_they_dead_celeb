import type { Celebrity, RowState, HintType } from '../../types';
import { Button } from '../atoms/Button';
import { HintReveal } from './HintReveal';
import { AnswerResult } from './AnswerResult';

interface CelebrityRowProps {
  celebrity: Celebrity;
  rowState: RowState;
  index: number;
  onAnswer: (index: number, guess: boolean) => void;
  onHint: (index: number, hint: HintType) => void;
}

export function CelebrityRow({ celebrity, rowState, index, onAnswer, onHint }: CelebrityRowProps) {
  const { answered, hintsUsed } = rowState;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
      <div className="flex items-center justify-between gap-4">
        <span className="font-semibold text-gray-900 text-lg">{celebrity.name}</span>

        {!answered && (
          <div className="flex items-center gap-2 flex-shrink-0">
            {celebrity.profilePath && (
              <Button
                variant="hint"
                onClick={() => onHint(index, 'photo')}
                disabled={hintsUsed.includes('photo')}
              >
                📸 Photo
              </Button>
            )}
            <Button
              variant="hint"
              onClick={() => onHint(index, 'birthYear')}
              disabled={hintsUsed.includes('birthYear')}
            >
              🎂 Birth Year
            </Button>
          </div>
        )}
      </div>

      {hintsUsed.includes('photo') && <HintReveal type="photo" celebrity={celebrity} />}
      {hintsUsed.includes('birthYear') && <HintReveal type="birthYear" celebrity={celebrity} />}

      {!answered ? (
        <div className="flex gap-3 mt-3">
          <Button variant="alive" onClick={() => onAnswer(index, true)}>
            Alive
          </Button>
          <Button variant="dead" onClick={() => onAnswer(index, false)}>
            Dead
          </Button>
        </div>
      ) : (
        <AnswerResult celebrity={celebrity} wasCorrect={!!rowState.correct} />
      )}
    </div>
  );
}
