import { useState, useCallback } from 'react';

interface UseClipboardResult {
  copy: (text: string) => void;
  copied: boolean;
}

export function useClipboard(): UseClipboardResult {
  const [copied, setCopied] = useState(false);

  const copy = useCallback((text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, []);

  return { copy, copied };
}
