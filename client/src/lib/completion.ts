import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { usePrefs } from './store';

type CompletionKind = 'task' | 'shopping';

/**
 * Keep a checked row in place until the device's preferred completion moment.
 * Pending completion is intentionally local: a second tap cancels it, changing
 * screens commits it, and a timer can commit it without making the row jump at
 * the instant the checkbox is touched.
 */
export function useDeferredCompletion(kind: CompletionKind, id: number, done: boolean) {
  const prefs = usePrefs();
  const qc = useQueryClient();
  const [pending, setPending] = useState(false);
  const [busy, setBusy] = useState(false);
  const pendingRef = useRef(false);
  const timer = useRef<number | undefined>(undefined);

  const invalidate = useCallback(() => {
    const roots = kind === 'task' ? ['tasks', 'project', 'projects', 'summary'] : ['shopping', 'project', 'projects', 'summary'];
    roots.forEach((root) => qc.invalidateQueries({ queryKey: [root] }));
  }, [kind, qc]);

  const complete = useCallback(async () => {
    if (!pendingRef.current) return;
    pendingRef.current = false;
    setPending(false);
    setBusy(true);
    try {
      if (kind === 'task') await api.completeTask(id);
      else await api.checkShoppingItem(id);
      invalidate();
    } finally {
      setBusy(false);
    }
  }, [id, invalidate, kind]);

  useEffect(() => {
    window.clearTimeout(timer.current);
    if (pending && prefs.completionMode === 'delay') {
      timer.current = window.setTimeout(() => void complete(), prefs.completionDelaySeconds * 1000);
    }
    return () => window.clearTimeout(timer.current);
  }, [complete, pending, prefs.completionDelaySeconds, prefs.completionMode]);

  // Navigating away/unmounting commits a pending check, including "on screen" mode.
  useEffect(
    () => () => {
      if (!pendingRef.current) return;
      pendingRef.current = false;
      const request = kind === 'task' ? api.completeTask(id) : api.checkShoppingItem(id);
      request.then(invalidate).catch(() => {});
    },
    [id, invalidate, kind],
  );

  const toggle = async () => {
    if (busy) return;
    if (done) {
      setBusy(true);
      try {
        if (kind === 'task') await api.reopenTask(id);
        else await api.uncheckShoppingItem(id);
        invalidate();
      } finally {
        setBusy(false);
      }
      return;
    }
    if (pendingRef.current) {
      pendingRef.current = false;
      setPending(false);
      return;
    }
    if (prefs.completionMode === 'instant') {
      pendingRef.current = true;
      await complete();
      return;
    }
    pendingRef.current = true;
    setPending(true);
  };

  return { checked: done || pending, pending, busy, toggle };
}
