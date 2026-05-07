import type { HintType } from '../../types';

interface HintIconProps {
  type: HintType;
  used: boolean;
}

const icons: Record<HintType, string> = {
  photo: '📸',
  birthYear: '🎂',
};

export function HintIcon({ type, used }: HintIconProps) {
  if (!used) return <span className="inline-block w-5">⬜</span>;
  return <span role="img" aria-label={`${type} hint used`}>{icons[type]}</span>;
}
