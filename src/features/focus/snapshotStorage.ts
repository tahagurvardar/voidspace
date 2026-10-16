import { z } from 'zod';
import { focusSessionSchema, idSchema, FOCUS_MAX_MINUTES, FOCUS_MIN_MINUTES } from '@/lib/validation/schemas';
import type { TimerState } from './timerMachine';

/**
 * The live timer is mirrored to localStorage (synchronous, survives reloads,
 * and fires `storage` events so other tabs stay in sync). Finished sessions
 * live in IndexedDB; this snapshot only holds the one in-progress timer.
 */
export const FOCUS_SNAPSHOT_KEY = 'voidspace.focus.v1';

const planned = z
  .number()
  .int()
  .min(FOCUS_MIN_MINUTES * 60)
  .max(FOCUS_MAX_MINUTES * 60);
const ts = z.number().finite().nonnegative();

const snapshotSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('idle'), plannedSeconds: planned }),
  z.object({
    status: z.literal('running'),
    sessionId: idSchema,
    plannedSeconds: planned,
    startedAt: ts,
    segmentStartedAt: ts,
    accumulatedMs: ts,
    lastSeenAt: ts,
  }),
  z.object({
    status: z.literal('paused'),
    sessionId: idSchema,
    plannedSeconds: planned,
    startedAt: ts,
    accumulatedMs: ts,
    pausedAt: ts,
    lastSeenAt: ts,
  }),
  z.object({ status: z.literal('completed'), plannedSeconds: planned, session: focusSessionSchema }),
]);

function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null; // Access can throw when storage is disabled.
  }
}

export function parseFocusSnapshot(raw: string | null): TimerState | null {
  if (!raw) return null;
  try {
    const parsed = snapshotSchema.safeParse(JSON.parse(raw));
    return parsed.success ? (parsed.data as TimerState) : null;
  } catch {
    return null;
  }
}

export function loadFocusSnapshot(): TimerState | null {
  return parseFocusSnapshot(storage()?.getItem(FOCUS_SNAPSHOT_KEY) ?? null);
}

/** Returns false if the snapshot could not be written (storage full or disabled). */
export function saveFocusSnapshot(state: TimerState): boolean {
  const s = storage();
  if (!s) return false;
  try {
    s.setItem(FOCUS_SNAPSHOT_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function clearFocusSnapshot(): void {
  try {
    storage()?.removeItem(FOCUS_SNAPSHOT_KEY);
  } catch {
    /* ignore */
  }
}
