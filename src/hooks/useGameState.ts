import { useState, useCallback } from 'react';
import type { GameState, RowState, HintType } from '../types';
import { CELEBRITIES_PER_DAY } from '../lib/constants';

function makeInitialRows(): RowState[] {
  return Array.from({ length: CELEBRITIES_PER_DAY }, () => ({
    answered: false,
    correct: null,
    hintsUsed: [],
  }));
}

interface UseGameStateResult {
  gameState: GameState;
  submitAnswer: (index: number, guess: boolean) => void;
  useHint: (index: number, hint: HintType) => void;
}

export function useGameState(isAliveList: boolean[]): UseGameStateResult {
  const [rows, setRows] = useState<RowState[]>(makeInitialRows);

  const allAnswered = rows.every(r => r.answered);

  const submitAnswer = useCallback((index: number, guess: boolean) => {
    setRows(prev => {
      if (prev[index].answered) return prev;
      const next = [...prev];
      next[index] = {
        ...next[index],
        answered: true,
        correct: guess === isAliveList[index],
      };
      return next;
    });
  }, [isAliveList]);

  const useHint = useCallback((index: number, hint: HintType) => {
    setRows(prev => {
      const row = prev[index];
      if (row.answered || row.hintsUsed.includes(hint)) return prev;
      const next = [...prev];
      next[index] = { ...row, hintsUsed: [...row.hintsUsed, hint] };
      return next;
    });
  }, []);

  return { gameState: { rows, allAnswered }, submitAnswer, useHint };
}
