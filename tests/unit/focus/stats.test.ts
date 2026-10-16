import { describe, expect, it } from 'vitest';
import { computeFocusStats } from '@/features/focus/stats';
import type { FocusSession } from '@/types';

const NOW = new Date(2026, 9, 15, 15, 0, 0).getTime();
const YESTERDAY = new Date(2026, 9, 14, 15, 0, 0).getTime();

function session(partial: Partial<FocusSession>): FocusSession {
  return {
    id: Math.random().toString(36).slice(2),
    plannedDurationSeconds: 1500,
    actualFocusedSeconds: 1500,
    startedAt: NOW - 3_600_000,
    endedAt: NOW - 2_000_000,
    status: 'completed',
    ...partial,
  };
}

describe('computeFocusStats', () => {
  it('returns zeros when there is no history', () => {
    expect(computeFocusStats([], NOW)).toEqual({
      completedCount: 0,
      canceledCount: 0,
      interruptedCount: 0,
      completedSeconds: 0,
      totalFocusedSeconds: 0,
      todayCompletedSeconds: 0,
    });
  });

  it('only counts completed sessions toward completed minutes', () => {
    const stats = computeFocusStats(
      [
        session({}),
        session({ plannedDurationSeconds: 3000, actualFocusedSeconds: 3000, endedAt: YESTERDAY }),
        session({ status: 'canceled', actualFocusedSeconds: 600 }),
        session({ status: 'interrupted', actualFocusedSeconds: 120 }),
      ],
      NOW,
    );
    expect(stats.completedCount).toBe(2);
    expect(stats.canceledCount).toBe(1);
    expect(stats.interruptedCount).toBe(1);
    expect(stats.completedSeconds).toBe(4500);
    expect(stats.totalFocusedSeconds).toBe(5220);
    expect(stats.todayCompletedSeconds).toBe(1500);
  });
});
