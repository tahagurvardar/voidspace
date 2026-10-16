import type { FocusSession } from '@/types';

/**
 * Focus timer state machine.
 *
 * Elapsed time is derived from wall-clock timestamps — never from counting
 * interval ticks — so throttled background tabs, sleeping laptops and reloads
 * cannot make the timer drift. Every function is pure: callers pass `now`.
 *
 *   idle ──start──▶ running ──pause──▶ paused ──resume──▶ running
 *                     │  ▲                │
 *                     │  └──── reset ─────┴──▶ idle (+ "canceled" record)
 *                     └──(time is up)──▶ completed (+ "completed" record) ──dismiss──▶ idle
 *
 * Recovery after reload: see `recoverTimer`.
 */

export interface IdleState {
  status: 'idle';
  plannedSeconds: number;
}

interface ActiveBase {
  sessionId: string;
  plannedSeconds: number;
  /** When the session was first started. */
  startedAt: number;
  /** Focused milliseconds banked before the current running segment. */
  accumulatedMs: number;
  /** Last time the app was known to be alive with this session active (heartbeat). */
  lastSeenAt: number;
}

export interface RunningState extends ActiveBase {
  status: 'running';
  segmentStartedAt: number;
}

export interface PausedState extends ActiveBase {
  status: 'paused';
  pausedAt: number;
}

export interface CompletedState {
  status: 'completed';
  plannedSeconds: number;
  session: FocusSession;
}

export type TimerState = IdleState | RunningState | PausedState | CompletedState;

export interface Transition {
  state: TimerState;
  /** A finished session that must be persisted, if this transition produced one. */
  record?: FocusSession;
}

/** Sessions canceled before this much focused time are not worth recording. */
export const MIN_RECORDED_CANCEL_MS = 1000;
/**
 * If the app was gone (closed/crashed) for longer than this while a session was
 * running, the session is treated as interrupted. Browsers throttle background
 * timers to ~1/min, so the heartbeat gap of a merely-hidden tab stays well below.
 */
export const RECOVERY_GRACE_MS = 2 * 60 * 1000;

export function createIdle(plannedSeconds: number): IdleState {
  return { status: 'idle', plannedSeconds };
}

export function plannedMs(state: TimerState): number {
  return state.plannedSeconds * 1000;
}

/** Focused milliseconds so far, clamped to the planned duration. */
export function elapsedMs(state: TimerState, now: number): number {
  switch (state.status) {
    case 'idle':
      return 0;
    case 'completed':
      return state.session.actualFocusedSeconds * 1000;
    case 'paused':
      return Math.min(state.accumulatedMs, plannedMs(state));
    case 'running':
      return Math.min(state.accumulatedMs + Math.max(0, now - state.segmentStartedAt), plannedMs(state));
  }
}

export function remainingMs(state: TimerState, now: number): number {
  if (state.status === 'idle') return plannedMs(state);
  return Math.max(0, plannedMs(state) - elapsedMs(state, now));
}

/** 0..1 */
export function progress(state: TimerState, now: number): number {
  const total = plannedMs(state);
  return total === 0 ? 0 : elapsedMs(state, now) / total;
}

/** The instant a running session reaches its planned duration. */
export function endsAt(state: RunningState): number {
  return state.segmentStartedAt + (plannedMs(state) - state.accumulatedMs);
}

export function setPlannedSeconds(state: TimerState, plannedSeconds: number): TimerState {
  if (state.status !== 'idle' && state.status !== 'completed') return state;
  return createIdle(plannedSeconds);
}

export function start(state: TimerState, now: number, sessionId: string): Transition {
  if (state.status !== 'idle' && state.status !== 'completed') return { state };
  return {
    state: {
      status: 'running',
      sessionId,
      plannedSeconds: state.plannedSeconds,
      startedAt: now,
      segmentStartedAt: now,
      accumulatedMs: 0,
      lastSeenAt: now,
    },
  };
}

function complete(state: RunningState): Transition {
  const end = endsAt(state);
  const session: FocusSession = {
    id: state.sessionId,
    plannedDurationSeconds: state.plannedSeconds,
    actualFocusedSeconds: state.plannedSeconds,
    startedAt: state.startedAt,
    endedAt: end,
    status: 'completed',
  };
  return { state: { status: 'completed', plannedSeconds: state.plannedSeconds, session }, record: session };
}

/** Advances time: completes a running session whose end has passed. */
export function tick(state: TimerState, now: number): Transition {
  if (state.status !== 'running') return { state };
  if (now >= endsAt(state)) return complete(state);
  return { state };
}

export function pause(state: TimerState, now: number): Transition {
  const ticked = tick(state, now);
  if (ticked.state.status !== 'running') return ticked;
  const s = ticked.state;
  return {
    state: {
      status: 'paused',
      sessionId: s.sessionId,
      plannedSeconds: s.plannedSeconds,
      startedAt: s.startedAt,
      accumulatedMs: elapsedMs(s, now),
      pausedAt: now,
      lastSeenAt: now,
    },
  };
}

export function resume(state: TimerState, now: number): Transition {
  if (state.status !== 'paused') return { state };
  return {
    state: {
      status: 'running',
      sessionId: state.sessionId,
      plannedSeconds: state.plannedSeconds,
      startedAt: state.startedAt,
      accumulatedMs: state.accumulatedMs,
      segmentStartedAt: now,
      lastSeenAt: now,
    },
  };
}

/**
 * Stops the current session. An active session becomes a "canceled" record
 * (never "completed"); a completed one is simply dismissed.
 */
export function reset(state: TimerState, now: number): Transition {
  const ticked = tick(state, now);
  const s = ticked.state;
  if (s.status === 'idle') return { state: s };
  if (s.status === 'completed') {
    // If the tick just completed it, the completion still has to be recorded.
    return { state: createIdle(s.plannedSeconds), record: ticked.record };
  }
  const focused = elapsedMs(s, now);
  const idle = createIdle(s.plannedSeconds);
  if (focused < MIN_RECORDED_CANCEL_MS) return { state: idle };
  return {
    state: idle,
    record: {
      id: s.sessionId,
      plannedDurationSeconds: s.plannedSeconds,
      actualFocusedSeconds: Math.floor(focused / 1000),
      startedAt: s.startedAt,
      endedAt: now,
      status: 'canceled',
    },
  };
}

/** Records that the app is alive; used to tell a reload from an abandoned session. */
export function heartbeat(state: TimerState, now: number): TimerState {
  if (state.status !== 'running' && state.status !== 'paused') return state;
  return { ...state, lastSeenAt: Math.max(state.lastSeenAt, now) };
}

/**
 * Restores a persisted timer after a reload or a reopened tab.
 *
 * - paused: stays paused (paused time never counts).
 * - running, and the app was alive recently (gap ≤ grace): it keeps running; if
 *   the end passed meanwhile it completes at its exact end time.
 * - running, but the app was gone longer than the grace period: the session is
 *   "interrupted", credited only with the time up to the last heartbeat — unless
 *   the session had already reached its end while the app was still alive.
 * - completed: the completion record is re-emitted (idempotent write) so a
 *   completion that failed to persist before the reload is not lost.
 */
export function recoverTimer(saved: TimerState, now: number, graceMs: number = RECOVERY_GRACE_MS): Transition {
  switch (saved.status) {
    case 'idle':
      return { state: saved };
    case 'completed':
      return { state: saved, record: saved.session };
    case 'paused':
      return { state: { ...saved, lastSeenAt: now } };
    case 'running': {
      const gap = now - saved.lastSeenAt;
      if (gap <= graceMs) {
        const t = tick(saved, now);
        return t.state.status === 'running' ? { state: heartbeat(t.state, now) } : t;
      }
      if (saved.lastSeenAt >= endsAt(saved)) return complete(saved);
      const focused = elapsedMs(saved, saved.lastSeenAt);
      return {
        state: createIdle(saved.plannedSeconds),
        record: {
          id: saved.sessionId,
          plannedDurationSeconds: saved.plannedSeconds,
          actualFocusedSeconds: Math.floor(focused / 1000),
          startedAt: saved.startedAt,
          endedAt: Math.max(saved.lastSeenAt, saved.startedAt),
          status: 'interrupted',
        },
      };
    }
  }
}
