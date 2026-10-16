import type { FocusSession } from '@/types';
import { startOfLocalDay } from '@/lib/utils/time';

export interface FocusStats {
  completedCount: number;
  canceledCount: number;
  interruptedCount: number;
  /** Sum of planned durations of completed sessions. */
  completedSeconds: number;
  /** Focused time across all sessions, including partial (canceled/interrupted) ones. */
  totalFocusedSeconds: number;
  /** Completed focus seconds for sessions that ended today (local time). */
  todayCompletedSeconds: number;
}

/** Derives statistics purely from stored session records. */
export function computeFocusStats(sessions: readonly FocusSession[], now: number = Date.now()): FocusStats {
  const today = startOfLocalDay(now);
  const stats: FocusStats = {
    completedCount: 0,
    canceledCount: 0,
    interruptedCount: 0,
    completedSeconds: 0,
    totalFocusedSeconds: 0,
    todayCompletedSeconds: 0,
  };
  for (const s of sessions) {
    stats.totalFocusedSeconds += s.actualFocusedSeconds;
    if (s.status === 'completed') {
      stats.completedCount++;
      stats.completedSeconds += s.actualFocusedSeconds;
      if (s.endedAt >= today) stats.todayCompletedSeconds += s.actualFocusedSeconds;
    } else if (s.status === 'canceled') {
      stats.canceledCount++;
    } else {
      stats.interruptedCount++;
    }
  }
  return stats;
}
