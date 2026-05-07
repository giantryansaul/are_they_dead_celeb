import { useState, useCallback, useEffect } from 'react';
import type { GameState, RowState, HintType } from '../types';
import { CELEBRITIES_PER_DAY, LOCAL_STORAGE_KEY_PREFIX } from '../lib/constants';
import { getTodayKey } from '../lib/dateUtils';

interface StoredState {
  date: string;
  rows: RowState[];
}

function makeInitialRows(): RowState[] {
  return Array.from({ length: CELEBRITIES_PER_DAY }, () => ({
    answered: false,
    correct: null,
    hintsUsed: [],
  }));
}

function loadFromStorage(): RowState[] | null {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY_PREFIX + getTodayKey());
    if (!raw) return null;
    const stored: StoredState = JSON.parse(raw);
    if (stored.date !== getTodayKey()) return null;
    return stored.rows;
  } catch {
    return null;
  }
}

function saveToStorage(rows: RowState[]) {
  try {
    const stored: StoredState = { date: getTodayKey(), rows };
    localStorage.setItem(LOCAL_STORAGE_KEY_PREFIX + getTodayKey(), JSON.stringify(stored));
  } catch {
    // localStorage unavailable — silently continue
  }
}

interface UseGameStateResult {
  gameState: GameState;
  submitAnswer: (index: number, guess: boolean) => void;
  useHint: (index: number, hint: HintType) => void;
}

export function useGameState(isAliveList: boolean[]): UseGameStateResult {
  const [rows, setRows] = useState<RowState[]>(() => loadFromStorage() ?? makeInitialRows());

  const allAnswered = rows.every(r => r.answered);

  useEffect(() => {
    if (rows.some(r => r.answered || r.hintsUsed.length > 0)) {
      saveToStorage(rows);
    }
  }, [rows]);

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
