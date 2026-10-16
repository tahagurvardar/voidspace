import { createStore, type StoreApi } from 'zustand/vanilla';
import type { FocusSession } from '@/types';
import { createId } from '@/lib/utils/id';
import * as machine from './timerMachine';
import type { TimerState, Transition } from './timerMachine';
import { clearFocusSnapshot, loadFocusSnapshot, saveFocusSnapshot } from './snapshotStorage';

export interface FocusStoreDeps {
  now: () => number;
  createSessionId: () => string;
  /** Persist a finished session. Must be idempotent per session id. */
  recordSession: (session: FocusSession) => Promise<void>;
  /** Fired once when a session reaches its planned end. */
  onComplete: (session: FocusSession) => void;
  /** Fired when persisting a record fails. */
  onError: (message: string) => void;
  loadSnapshot: () => TimerState | null;
  saveSnapshot: (state: TimerState) => boolean;
  clearSnapshot: () => void;
}

export interface FocusStoreState {
  timer: TimerState;
  hydrated: boolean;
  hydrate: (defaultMinutes: number) => void;
  start: () => void;
  pause: () => void;
  resume: () => void;
  reset: () => void;
  tick: () => void;
  heartbeat: () => void;
  dismiss: () => void;
  setPlannedMinutes: (minutes: number) => void;
  /** Adopt a state written by another tab. */
  adopt: (state: TimerState | null) => void;
}

export type FocusStore = StoreApi<FocusStoreState>;

export function createFocusStore(deps: FocusStoreDeps): FocusStore {
  return createStore<FocusStoreState>()((set, get) => {
    const commit = (t: Transition, opts: { notify?: boolean } = {}) => {
      const prev = get().timer;
      set({ timer: t.state });
      // Idle snapshots are kept too, so the chosen duration survives a reload.
      deps.saveSnapshot(t.state);
      if (t.record) {
        const record = t.record;
        deps.recordSession(record).catch((e: unknown) => {
          deps.onError(e instanceof Error ? e.message : 'Could not save the focus session.');
        });
        if (
          opts.notify !== false &&
          record.status === 'completed' &&
          prev.status === 'running' &&
          t.state.status === 'completed'
        ) {
          deps.onComplete(record);
        }
      }
    };

    return {
      timer: machine.createIdle(25 * 60),
      hydrated: false,

      hydrate: (defaultMinutes) => {
        const saved = deps.loadSnapshot();
        if (!saved) {
          set({ timer: machine.createIdle(defaultMinutes * 60), hydrated: true });
          return;
        }
        const recovered = machine.recoverTimer(saved, deps.now());
        set({ timer: saved, hydrated: true });
        // A session that finished during a quick reload still deserves its chime.
        commit(recovered, { notify: saved.status === 'running' });
      },

      start: () => commit(machine.start(get().timer, deps.now(), deps.createSessionId())),
      pause: () => commit(machine.pause(get().timer, deps.now())),
      resume: () => commit(machine.resume(get().timer, deps.now())),
      reset: () => commit(machine.reset(get().timer, deps.now())),

      tick: () => {
        const t = machine.tick(get().timer, deps.now());
        if (t.state !== get().timer) commit(t);
      },

      heartbeat: () => {
        const timer = get().timer;
        if (timer.status !== 'running' && timer.status !== 'paused') return;
        const next = machine.heartbeat(timer, deps.now());
        set({ timer: next });
        deps.saveSnapshot(next);
      },

      dismiss: () => {
        const timer = get().timer;
        if (timer.status !== 'completed') return;
        commit({ state: machine.createIdle(timer.plannedSeconds) });
      },

      setPlannedMinutes: (minutes) => {
        const timer = get().timer;
        const next = machine.setPlannedSeconds(timer, Math.round(minutes * 60));
        if (next !== timer) commit({ state: next });
      },

      adopt: (state) => {
        if (!state) {
          const planned = get().timer.plannedSeconds;
          set({ timer: machine.createIdle(planned) });
          return;
        }
        // Another tab already persisted any record; just mirror its state.
        set({ timer: state });
      },
    };
  });
}

export const defaultFocusDeps = (overrides: Partial<FocusStoreDeps> = {}): FocusStoreDeps => ({
  now: () => Date.now(),
  createSessionId: createId,
  recordSession: async () => {},
  onComplete: () => {},
  onError: () => {},
  loadSnapshot: loadFocusSnapshot,
  saveSnapshot: saveFocusSnapshot,
  clearSnapshot: clearFocusSnapshot,
  ...overrides,
});
