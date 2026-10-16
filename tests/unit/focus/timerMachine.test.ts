import { describe, expect, it } from 'vitest';
import {
  RECOVERY_GRACE_MS,
  createIdle,
  elapsedMs,
  endsAt,
  heartbeat,
  pause,
  recoverTimer,
  remainingMs,
  reset,
  resume,
  setPlannedSeconds,
  start,
  tick,
  type RunningState,
  type TimerState,
} from '@/features/focus/timerMachine';

const T0 = Date.UTC(2026, 9, 15, 9, 0, 0);
const MIN = 60_000;
const twentyFive = createIdle(25 * 60);

function running(at = T0): RunningState {
  const s = start(twentyFive, at, 'session-1').state;
  if (s.status !== 'running') throw new Error('expected running');
  return s;
}

describe('timer machine — basic lifecycle', () => {
  it('starts with the full planned duration remaining', () => {
    const s = running();
    expect(remainingMs(s, T0)).toBe(25 * MIN);
    expect(remainingMs(s, T0 + 10 * MIN)).toBe(15 * MIN);
  });

  it('pause freezes elapsed time and resume continues from it', () => {
    const s = running();
    const paused = pause(s, T0 + 5 * MIN).state;
    expect(paused.status).toBe('paused');
    // An hour in the paused state counts for nothing.
    expect(elapsedMs(paused, T0 + 65 * MIN)).toBe(5 * MIN);
    const resumed = resume(paused, T0 + 65 * MIN).state;
    expect(resumed.status).toBe('running');
    expect(remainingMs(resumed, T0 + 65 * MIN)).toBe(20 * MIN);
    expect(remainingMs(resumed, T0 + 75 * MIN)).toBe(10 * MIN);
  });

  it('completes exactly at the planned end and records the planned duration', () => {
    const s = running();
    expect(tick(s, T0 + 25 * MIN - 1).state.status).toBe('running');
    const t = tick(s, T0 + 25 * MIN);
    expect(t.state.status).toBe('completed');
    expect(t.record).toEqual({
      id: 'session-1',
      plannedDurationSeconds: 1500,
      actualFocusedSeconds: 1500,
      startedAt: T0,
      endedAt: T0 + 25 * MIN,
      status: 'completed',
    });
  });

  it('completion time accounts for pauses', () => {
    let s: TimerState = running();
    s = pause(s, T0 + 10 * MIN).state;
    s = resume(s, T0 + 30 * MIN).state;
    expect(endsAt(s as RunningState)).toBe(T0 + 45 * MIN);
    const done = tick(s, T0 + 46 * MIN);
    expect(done.record?.endedAt).toBe(T0 + 45 * MIN);
    expect(done.record?.actualFocusedSeconds).toBe(1500);
  });

  it('reset of an active session records a cancellation, never a completion', () => {
    const s = running();
    const r = reset(s, T0 + 7 * MIN + 400);
    expect(r.state).toEqual(createIdle(1500));
    expect(r.record?.status).toBe('canceled');
    expect(r.record?.actualFocusedSeconds).toBe(7 * 60);
  });

  it('reset of a paused session credits only the focused time', () => {
    const paused = pause(running(), T0 + 3 * MIN).state;
    const r = reset(paused, T0 + 90 * MIN);
    expect(r.record?.status).toBe('canceled');
    expect(r.record?.actualFocusedSeconds).toBe(180);
  });

  it('does not record trivially short cancellations', () => {
    const r = reset(running(), T0 + 500);
    expect(r.record).toBeUndefined();
  });

  it('a reset after the end has passed records the completion (it is not lost)', () => {
    const r = reset(running(), T0 + 30 * MIN);
    expect(r.state.status).toBe('idle');
    expect(r.record?.status).toBe('completed');
  });

  it('ignores invalid transitions', () => {
    const idle = createIdle(900);
    expect(pause(idle, T0).state).toBe(idle);
    expect(resume(idle, T0).state).toBe(idle);
    const s = running();
    expect(start(s, T0 + 1, 'other').state).toBe(s);
    expect(setPlannedSeconds(s, 300)).toBe(s);
    expect(setPlannedSeconds(idle, 300)).toEqual(createIdle(300));
  });
});

describe('timer machine — background tabs', () => {
  it('stays accurate when ticks are delayed or skipped entirely', () => {
    const s = running();
    // A throttled tab may not tick for minutes; one late tick sees the true remaining time.
    expect(remainingMs(s, T0 + 17 * MIN + 30_000)).toBe(7 * MIN + 30_000);
    const late = tick(s, T0 + 40 * MIN);
    expect(late.state.status).toBe('completed');
    expect(late.record?.endedAt).toBe(T0 + 25 * MIN);
  });
});

describe('timer machine — reload recovery', () => {
  it('a quick reload keeps the session running with correct remaining time', () => {
    const s = heartbeat(running(), T0 + 10 * MIN);
    const r = recoverTimer(s, T0 + 10 * MIN + 5_000);
    expect(r.state.status).toBe('running');
    expect(r.record).toBeUndefined();
    expect(remainingMs(r.state, T0 + 10 * MIN + 5_000)).toBe(15 * MIN - 5_000);
  });

  it('completes at the exact end if it elapsed during a short reload', () => {
    const s = heartbeat(running(), T0 + 25 * MIN - 1000);
    const r = recoverTimer(s, T0 + 25 * MIN + 30_000);
    expect(r.state.status).toBe('completed');
    expect(r.record?.endedAt).toBe(T0 + 25 * MIN);
  });

  it('marks a session abandoned longer than the grace period as interrupted', () => {
    const s = heartbeat(running(), T0 + 8 * MIN);
    const r = recoverTimer(s, T0 + 8 * MIN + RECOVERY_GRACE_MS + 1);
    expect(r.state.status).toBe('idle');
    expect(r.record?.status).toBe('interrupted');
    expect(r.record?.actualFocusedSeconds).toBe(8 * 60);
    expect(r.record?.endedAt).toBe(T0 + 8 * MIN);
  });

  it('an abandoned session that had already reached its end while alive is completed', () => {
    const s = heartbeat(running(), T0 + 25 * MIN + 1000);
    const r = recoverTimer(s, T0 + 5 * 60 * MIN);
    expect(r.record?.status).toBe('completed');
  });

  it('paused sessions stay paused across reloads, regardless of the gap', () => {
    const p = pause(running(), T0 + 12 * MIN).state;
    const r = recoverTimer(p, T0 + 3 * 24 * 60 * MIN);
    expect(r.state.status).toBe('paused');
    expect(remainingMs(r.state, T0 + 3 * 24 * 60 * MIN)).toBe(13 * MIN);
  });

  it('re-emits a completion record so an unsaved completion is persisted after reload', () => {
    const done = tick(running(), T0 + 26 * MIN);
    const r = recoverTimer(done.state, T0 + 27 * MIN);
    expect(r.record).toEqual(done.record);
  });
});
