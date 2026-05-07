import { useEffect, useState } from 'react';
import { getTodayDateString } from '../../lib/dateUtils';
import { CELEBRITIES_PER_DAY, MAX_SCORE_PER_ROW } from '../../lib/constants';

interface HeaderProps {
  score: number;
  answeredCount: number;
}

export function Header({ score, answeredCount }: HeaderProps) {
  const maxScore = CELEBRITIES_PER_DAY * MAX_SCORE_PER_ROW;
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      if (window.scrollY > 10) setScrolled(true);
      else if (window.scrollY === 0) setScrolled(false);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header className="sticky top-0 z-40 bg-[#1A1F26] border-b border-atd-border">
      <div
        className={`max-w-2xl mx-auto px-4 text-center transition-[padding] duration-200 ease-out ${
          scrolled ? 'pt-2 pb-2' : 'pt-8 pb-6'
        }`}
      >
        <h1
          className={`font-bold tracking-tight text-atd-text transition-[font-size] duration-200 ease-out ${
            scrolled ? 'text-2xl sm:text-3xl' : 'text-4xl sm:text-6xl'
          }`}
        >
          Are They Dead?{' '}
          <span className="text-atd-amber drop-shadow-[0_0_12px_rgba(229,181,103,0.35)]">💀</span>
        </h1>
        <p
          className={`uppercase tracking-[0.2em] text-atd-text-muted overflow-hidden transition-[opacity,margin,font-size] duration-200 ease-out ${
            scrolled ? 'mt-0 text-[0px] opacity-0 h-0' : 'mt-2 text-sm opacity-100 h-auto'
          }`}
        >
          {getTodayDateString()}
        </p>
        {answeredCount > 0 && (
          <div
            className={`inline-flex items-baseline gap-1 bg-atd-surface-2 border border-atd-border transition-[margin,padding] duration-200 ease-out ${
              scrolled ? 'mt-1 px-3 py-1' : 'mt-3 px-5 py-2'
            }`}
          >
            <span
              className={`font-bold text-atd-amber tabular-nums transition-[font-size] duration-200 ease-out ${
                scrolled ? 'text-2xl' : 'text-4xl'
              }`}
            >
              {score}
            </span>
            <span className="text-sm text-atd-text-muted">/ {maxScore}</span>
          </div>
        )}
      </div>
    </header>
  );
}
