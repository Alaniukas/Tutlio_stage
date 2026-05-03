import { useState, useEffect, useCallback } from 'react';

function readIds(key: string | undefined): Set<string> {
  if (!key) return new Set();
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((x): x is string => typeof x === 'string'));
  } catch {
    return new Set();
  }
}

function writeIds(key: string | undefined, ids: Set<string>) {
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify([...ids]));
  } catch {
    /* ignore */
  }
}

/** Persist dismissed dashboard row ids (localStorage JSON array). */
export function useDismissibleDashboardItemIds(storageKey: string | undefined) {
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!storageKey) {
      setDismissedIds(new Set());
      setReady(true);
      return;
    }
    setDismissedIds(readIds(storageKey));
    setReady(true);
  }, [storageKey]);

  const dismiss = useCallback(
    (id: string) => {
      if (!storageKey || !id) return;
      setDismissedIds((prev) => {
        if (prev.has(id)) return prev;
        const next = new Set(prev);
        next.add(id);
        writeIds(storageKey, next);
        return next;
      });
    },
    [storageKey],
  );

  const restoreAll = useCallback(() => {
    if (!storageKey) return;
    setDismissedIds(new Set());
    try {
      localStorage.removeItem(storageKey);
    } catch {
      /* ignore */
    }
  }, [storageKey]);

  return { dismissedIds, dismiss, restoreAll, ready };
}
