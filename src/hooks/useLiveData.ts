'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import type { FocusSession, Thought } from '@/types';
import { getDb } from '@/lib/storage/db';
import { toStorageError } from '@/lib/storage/errors';

export type LiveResult<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'error'; message: string };

type Settled<T> = { ok: true; data: T } | { ok: false; message: string };

function settle<T>(query: () => Promise<T>): () => Promise<Settled<T>> {
  return async () => {
    try {
      return { ok: true, data: await query() };
    } catch (e) {
      return { ok: false, message: toStorageError(e).message };
    }
  };
}

function toLive<T>(r: Settled<T> | undefined): LiveResult<T> {
  if (!r) return { status: 'loading' };
  return r.ok ? { status: 'ready', data: r.data } : { status: 'error', message: r.message };
}

/**
 * Live, newest-first list of thoughts. Updates automatically after any write —
 * including writes made in other tabs.
 */
export function useThoughts(): LiveResult<Thought[]> {
  const r = useLiveQuery(settle(() => getDb().thoughts.orderBy('createdAt').reverse().toArray()), []);
  return toLive(r);
}

/** Live, newest-first list of focus sessions. */
export function useFocusSessions(): LiveResult<FocusSession[]> {
  const r = useLiveQuery(settle(() => getDb().focusSessions.orderBy('startedAt').reverse().toArray()), []);
  return toLive(r);
}
