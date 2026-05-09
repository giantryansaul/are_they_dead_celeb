import { useState, useEffect } from 'react';
import type { DailyData, Celebrity } from '../types';

interface UseCelebritiesResult {
  celebrities: Celebrity[];
  generatedAt: string | null;
  loading: boolean;
  error: string | null;
}

export function useCelebrities(): UseCelebritiesResult {
  const [celebrities, setCelebrities] = useState<Celebrity[]>([]);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/data/celebrities.json')
      .then(res => {
        if (!res.ok) throw new Error(`Failed to load celebrity data (${res.status})`);
        return res.json() as Promise<DailyData>;
      })
      .then(data => {
        setCelebrities(data.celebrities);
        setGeneratedAt(data.generatedAt);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  return { celebrities, generatedAt, loading, error };
}
