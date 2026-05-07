interface ScoreIconProps {
  correct: boolean;
}

export function ScoreIcon({ correct }: ScoreIconProps) {
  return <span role="img" aria-label={correct ? 'correct' : 'wrong'}>{correct ? '🟩' : '🟥'}</span>;
}
