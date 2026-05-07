import type { Celebrity, HintType } from '../../types';
import { TMDB_IMAGE_BASE } from '../../lib/constants';

interface HintRevealProps {
  type: HintType;
  celebrity: Celebrity;
}

export function HintReveal({ type, celebrity }: HintRevealProps) {
  if (type === 'photo') {
    if (!celebrity.profilePath) return null;
    return (
      <div className="flex justify-center my-2">
        <img
          src={`${TMDB_IMAGE_BASE}${celebrity.profilePath}`}
          alt={`${celebrity.name} photo`}
          loading="lazy"
          className="h-32 w-auto rounded-lg shadow-md object-cover"
        />
      </div>
    );
  }

  return (
    <div className="flex justify-center my-2">
      <span className="text-sm text-gray-600 bg-gray-100 rounded-lg px-3 py-1">
        Born <span className="font-semibold">{celebrity.birthYear}</span>
      </span>
    </div>
  );
}
