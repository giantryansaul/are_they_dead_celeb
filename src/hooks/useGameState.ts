import { useState, useCallback, useEffect } from 'react';
import type { GameState, RowState, HintType } from '../types';
import { CELEBRITIES_PER_DAY, LOCAL_STORAGE_KEY_PREFIX } from '../lib/constants';

interface StoredState {
  gameId: string;
  rows: RowState[];
}

function makeInitialRows(): RowState[] {
  return Array.from({ length: CELEBRITIES_PER_DAY }, () => ({
    answered: false,
    correct: null,
    hintsUsed: [],
  }));
}

function loadFromStorage(gameId: string): RowState[] | null {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY_PREFIX + gameId);
    if (!raw) return null;
    const stored: StoredState = JSON.parse(raw);
    if (stored.gameId !== gameId) return null;
    return stored.rows;
  } catch {
    return null;
  }
}

function saveToStorage(gameId: string, rows: RowState[]) {
  try {
    const stored: StoredState = { gameId, rows };
    localStorage.setItem(LOCAL_STORAGE_KEY_PREFIX + gameId, JSON.stringify(stored));
  } catch {
    // localStorage unavailable — silently continue
  }
}

interface UseGameStateResult {
  gameState: GameState;
  submitAnswer: (index: number, guess: boolean) => void;
  useHint: (index: number, hint: HintType) => void;
  resetGame: () => void;
}

export function useGameState(isAliveList: boolean[], gameId: string | null): UseGameStateResult {
  const [rows, setRows] = useState<RowState[]>(makeInitialRows);

  useEffect(() => {
    if (!gameId) return;
    const saved = loadFromStorage(gameId);
    if (saved) setRows(saved);
  }, [gameId]);

  const allAnswered = rows.every(r => r.answered);

  useEffect(() => {
    if (!gameId) return;
    if (rows.some(r => r.answered || r.hintsUsed.length > 0)) {
      saveToStorage(gameId, rows);
    }
  }, [gameId, rows]);

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

  const resetGame = useCallback(() => {
    if (gameId) {
      try {
        localStorage.removeItem(LOCAL_STORAGE_KEY_PREFIX + gameId);
      } catch {
        // ignore
      }
    }
    setRows(makeInitialRows());
  }, [gameId]);

  return { gameState: { rows, allAnswered }, submitAnswer, useHint, resetGame };
}
