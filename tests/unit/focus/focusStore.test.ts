import { describe, expect, it, vi } from 'vitest';
import { createFocusStore, defaultFocusDeps } from '@/features/focus/focusStore';
import { RECOVERY_GRACE_MS, remainingMs, type TimerState } from '@/features/focus/timerMachine';
import type { FocusSession } from '@/types';

const MIN = 60_000;

/** A focus store wired to a controllable clock and in-memory persistence. */
function setup(saved: TimerState | null = null) {
  let now = Date.UTC(2026, 9, 15, 10, 0, 0);
  let snapshot: TimerState | null = saved;
  const records: FocusSession[] = [];
  const onComplete = vi.fn();
  let id = 0;
  const store = createFocusStore(
    defaultFocusDeps({
      now: () => now,
      createSessionId: () => `s${++id}`,
      recordSession: async (s) => {
        // Idempotent like the real repository.
        const i = records.findIndex((r) => r.id === s.id);
        if (i >= 0) records[i] = s;
        else records.push(s);
      },
      onComplete,
      loadSnapshot: () => snapshot,
      saveSnapshot: (s) => {
        snapshot = s;
        return true;
      },
      clearSnapshot: () => {
        snapshot = null;
      },
    }),
  );
  return {
    store,
    records,
    onComplete,
    advance: (ms: number) => {
      now += ms;
    },
    now: () => now,
    snapshot: () => snapshot,
  };
}

describe('focus store', () => {
  it('runs a full session: start → pause → resume → complete with an accurate record', async () => {
    const t = setup();
    t.store.getState().hydrate(25);
    t.store.getState().start();
    t.advance(10 * MIN);
    t.store.getState().pause();
    t.advance(30 * MIN); // paused time does not count
    t.store.getState().resume();
    t.advance(14 * MIN);
    t.store.getState().tick();
    expect(t.store.getState().timer.status).toBe('running');
    expect(remainingMs(t.store.getState().timer, t.now())).toBe(1 * MIN);
    t.advance(1 * MIN);
    t.store.getState().tick();
    await Promise.resolve();
    expect(t.store.getState().timer.status).toBe('completed');
    expect(t.records).toHaveLength(1);
    expect(t.records[0]).toMatchObject({ status: 'completed', actualFocusedSeconds: 1500, plannedDurationSeconds: 1500 });
    expect(t.onComplete).toHaveBeenCalledTimes(1);
  });

  it('reset records a canceled session and never calls onComplete', async () => {
    const t = setup();
    t.store.getState().hydrate(15);
    t.store.getState().start();
    t.advance(4 * MIN);
    t.store.getState().reset();
    await Promise.resolve();
    expect(t.store.getState().timer).toEqual({ status: 'idle', plannedSeconds: 900 });
    expect(t.records[0]).toMatchObject({ status: 'canceled', actualFocusedSeconds: 240 });
    expect(t.onComplete).not.toHaveBeenCalled();
  });

  it('background tab: a single late tick completes at the exact planned end', () => {
    const t = setup();
    t.store.getState().hydrate(25);
    const startedAt = t.now();
    t.store.getState().start();
    t.advance(37 * MIN); // no ticks while hidden
    t.store.getState().tick();
    const timer = t.store.getState().timer;
    expect(timer.status).toBe('completed');
    if (timer.status === 'completed') expect(timer.session.endedAt).toBe(startedAt + 25 * MIN);
  });

  it('persists every transition to the snapshot (reload source of truth)', () => {
    const t = setup();
    t.store.getState().hydrate(50);
    t.store.getState().start();
    expect(t.snapshot()?.status).toBe('running');
    t.store.getState().pause();
    expect(t.snapshot()?.status).toBe('paused');
  });

  it('reload recovery: a running session survives a quick reload', () => {
    const first = setup();
    first.store.getState().hydrate(25);
    first.store.getState().start();
    first.advance(5 * MIN);
    first.store.getState().heartbeat();
    const saved = first.snapshot();

    // The new page loads 3 seconds later.
    const reloaded = createFocusStore(
      defaultFocusDeps({ now: () => first.now() + 3000, loadSnapshot: () => saved, saveSnapshot: () => true }),
    );
    reloaded.getState().hydrate(25);
    expect(reloaded.getState().timer.status).toBe('running');
    expect(remainingMs(reloaded.getState().timer, first.now() + 3000)).toBe(20 * MIN - 3000);
  });

  it('reload recovery: an abandoned session becomes interrupted with partial credit', async () => {
    const first = setup();
    first.store.getState().hydrate(25);
    first.store.getState().start();
    first.advance(6 * MIN);
    first.store.getState().heartbeat();
    const saved = first.snapshot();

    const records: FocusSession[] = [];
    const reloaded = createFocusStore(
      defaultFocusDeps({
        now: () => first.now() + RECOVERY_GRACE_MS + 60 * MIN,
        loadSnapshot: () => saved,
        saveSnapshot: () => true,
        recordSession: async (s) => {
          records.push(s);
        },
      }),
    );
    reloaded.getState().hydrate(25);
    await Promise.resolve();
    expect(reloaded.getState().timer.status).toBe('idle');
    expect(records).toEqual([expect.objectContaining({ status: 'interrupted', actualFocusedSeconds: 360 })]);
  });

  it.each(['start', 'heartbeat'] as const)('reports snapshot failure on %s once until storage recovers', (failurePoint) => {
    let now = Date.UTC(2026, 9, 15);
    const onError = vi.fn();
    const saveSnapshot = vi.fn(() => true);
    const store = createFocusStore(
      defaultFocusDeps({ now: () => now, loadSnapshot: () => null, saveSnapshot, onError }),
    );
    store.getState().hydrate(25);
    if (failurePoint === 'start') saveSnapshot.mockReturnValue(false);
    store.getState().start();
    if (failurePoint === 'heartbeat') {
      expect(onError).not.toHaveBeenCalled();
      saveSnapshot.mockReturnValue(false);
      store.getState().heartbeat();
    }

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(expect.stringMatching(/reload|other tabs/i));
    now += MIN;
    store.getState().heartbeat();
    store.getState().pause();
    store.getState().resume();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(store.getState().timer.status).toBe('running');
    expect(remainingMs(store.getState().timer, now)).toBe(24 * MIN);

    saveSnapshot.mockReturnValue(true);
    store.getState().heartbeat();
    expect(onError).toHaveBeenCalledTimes(1);
    saveSnapshot.mockReturnValue(false);
    store.getState().pause();
    expect(onError).toHaveBeenCalledTimes(2);
    expect(store.getState().timer.status).toBe('paused');
  });

  it('reports persistence failures instead of losing them silently', async () => {
    const onError = vi.fn();
    const store = createFocusStore(
      defaultFocusDeps({
        now: (() => {
          let n = Date.UTC(2026, 9, 15);
          return () => (n += 10 * MIN);
        })(),
        loadSnapshot: () => null,
        saveSnapshot: () => true,
        recordSession: async () => {
          throw new Error('Disk full');
        },
        onError,
      }),
    );
    store.getState().hydrate(5);
    store.getState().start();
    store.getState().tick();
    await new Promise((r) => setTimeout(r, 0));
    expect(onError).toHaveBeenCalledWith('Disk full');
  });
});
