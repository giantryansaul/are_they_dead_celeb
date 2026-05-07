import { useState } from 'react';
import type { Celebrity, RowState, HintType } from '../../types';
import { Button } from '../atoms/Button';
import { AnswerResult } from './AnswerResult';
import { TMDB_IMAGE_BASE } from '../../lib/constants';

interface CelebrityRowProps {
  celebrity: Celebrity;
  rowState: RowState;
  index: number;
  onAnswer: (index: number, guess: boolean) => void;
  onHint: (index: number, hint: HintType) => void;
}

const boxBase =
  'bg-atd-surface-2 flex flex-col items-center justify-center text-center h-[16rem] sm:h-[24rem] p-3 select-none overflow-hidden';

const knownForBoxBase =
  'bg-atd-surface-2 flex flex-col items-center justify-center text-center h-[5rem] sm:h-[6rem] p-2 select-none overflow-hidden';

const lockedDecoration =
  'border border-dashed border-atd-border-strong hover:bg-atd-surface hover:border-atd-amber transition-colors active:scale-[0.98] cursor-pointer';

export function CelebrityRow({ celebrity, rowState, index, onAnswer, onHint }: CelebrityRowProps) {
  const { answered, hintsUsed } = rowState;
  const [imgError, setImgError] = useState(false);

  const photoRevealed = hintsUsed.includes('photo') || answered;
  const yearRevealed = hintsUsed.includes('birthYear') || answered;

  return (
    <div className="bg-atd-surface border border-atd-border overflow-hidden">
      {/* Row 1: Name | Photo | Birth Year */}
      <div className="grid grid-cols-[1fr_1.4fr_1fr] gap-1.5 sm:gap-2 p-2 pb-1">
        {/* Name */}
        <div className={boxBase}>
          <span className="text-xs uppercase tracking-widest text-atd-text-muted mb-2">
            Celebrity
          </span>
          <span className="text-base sm:text-2xl font-bold text-atd-text leading-tight break-words">
            {celebrity.name}
          </span>
        </div>

        {/* Photo */}
        {!celebrity.profilePath ? (
          <div className={`${boxBase} text-atd-text-dim`}>
            <span className="text-3xl mb-1 opacity-60">📸</span>
            <span className="text-xs uppercase tracking-widest">No photo</span>
          </div>
        ) : photoRevealed ? (
          <div className={`${boxBase} p-0 ring-1 ring-atd-border`}>
            {imgError ? (
              <div className="text-atd-text-dim text-xs">No photo</div>
            ) : (
              <img
                src={`${TMDB_IMAGE_BASE}${celebrity.profilePath}`}
                alt={celebrity.name}
                loading="lazy"
                className="w-full h-full object-cover"
                onError={() => setImgError(true)}
              />
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => onHint(index, 'photo')}
            className={`${boxBase} ${lockedDecoration}`}
          >
            <span className="text-4xl mb-2">📸</span>
            <span className="text-xs uppercase tracking-widest text-atd-text-muted">Photo</span>
            <span className="text-[11px] text-atd-text-dim mt-1">Tap to reveal · −1 pt</span>
          </button>
        )}

        {/* Birth Year */}
        {yearRevealed ? (
          <div className={boxBase}>
            <span className="text-xs uppercase tracking-widest text-atd-text-muted mb-2">Born</span>
            <span className="text-5xl sm:text-7xl font-extrabold text-atd-amber tabular-nums leading-none drop-shadow-[0_0_18px_rgba(229,181,103,0.25)]">
              {celebrity.birthYear}
            </span>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => onHint(index, 'birthYear')}
            className={`${boxBase} ${lockedDecoration}`}
          >
            <span className="text-4xl mb-2">🎂</span>
            <span className="text-xs uppercase tracking-widest text-atd-text-muted">Birth Year</span>
            <span className="text-[11px] text-atd-text-dim mt-1">Tap to reveal · −1 pt</span>
          </button>
        )}
      </div>

      {/* Row 2: Known For 1 | 2 | 3 */}
      <div className="grid grid-cols-3 gap-1.5 sm:gap-2 px-2 pb-2">
        {[0, 1, 2].map(idx => {
          const hintType = `knownFor${idx}` as HintType;
          const title = celebrity.knownFor[idx];
          const revealed = hintsUsed.includes(hintType) || answered;

          if (!title) {
            return (
              <div key={idx} className={`${knownForBoxBase} text-atd-text-dim opacity-50`}>
                <span className="text-xl">🎬</span>
              </div>
            );
          }

          if (revealed) {
            return (
              <div key={idx} className={knownForBoxBase}>
                <span className="text-sm sm:text-base font-semibold text-atd-text leading-snug break-words px-1">
                  {title}
                </span>
              </div>
            );
          }

          return (
            <button
              key={idx}
              type="button"
              onClick={() => onHint(index, hintType)}
              className={`${knownForBoxBase} ${lockedDecoration}`}
            >
              <span className="text-2xl">🎬</span>
              <span className="text-[10px] uppercase tracking-widest text-atd-text-muted mt-1">
                Known For {idx + 1}
              </span>
              <span className="text-[10px] text-atd-text-dim">Tap · −1 pt</span>
            </button>
          );
        })}
      </div>

      {!answered ? (
        <div className="grid grid-cols-2 gap-2 p-2 pt-0">
          <Button variant="alive" fullWidth onClick={() => onAnswer(index, true)}>
            Alive
          </Button>
          <Button variant="dead" fullWidth onClick={() => onAnswer(index, false)}>
            Dead
          </Button>
        </div>
      ) : (
        <AnswerResult celebrity={celebrity} wasCorrect={!!rowState.correct} />
      )}
    </div>
  );
}
