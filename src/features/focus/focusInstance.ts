'use client';

import { useEffect } from 'react';
import { useStore } from 'zustand';
import { focusSessionsRepository } from '@/lib/storage/focusSessionsRepository';
import { soundEngine } from '@/lib/audio/soundEngine';
import { coreStore, emitCoreSignal } from '@/store/coreStore';
import { useAppStore } from '@/store/appStore';
import { usePreferencesStore } from '@/store/preferencesStore';
import { formatClock } from '@/lib/utils/time';
import { createFocusStore, defaultFocusDeps, type FocusStoreState } from './focusStore';
import { FOCUS_SNAPSHOT_KEY, parseFocusSnapshot } from './snapshotStorage';
import { endsAt, remainingMs } from './timerMachine';

/** The app-wide focus timer. It lives outside React so it keeps running in any mode. */
export const focusStore = createFocusStore(
  defaultFocusDeps({
    recordSession: (s) => focusSessionsRepository.record(s),
    onComplete: () => {
      emitCoreSignal('complete');
      const { prefs } = usePreferencesStore.getState();
      if (prefs.focusChime) soundEngine.play('complete');
      useAppStore.getState().toast('Focus session complete.', 'success');
    },
    onError: (message) => useAppStore.getState().toast(message, 'error'),
  }),
);

export function useFocus<T>(selector: (s: FocusStoreState) => T): T {
  return useStore(focusStore, selector);
}

const HEARTBEAT_MS = 5000;

/**
 * Drives the timer: hydration, completion detection (also when the tab returns
 * from the background), heartbeats for reload recovery, cross-tab sync and the
 * document title. Mount exactly once.
 */
export function useFocusRuntime(): void {
  const prefsLoaded = usePreferencesStore((s) => s.loaded);
  const timer = useStore(focusStore, (s) => s.timer);
  const hydrated = useStore(focusStore, (s) => s.hydrated);

  useEffect(() => {
    if (!prefsLoaded || focusStore.getState().hydrated) return;
    focusStore.getState().hydrate(usePreferencesStore.getState().prefs.defaultFocusDuration);
  }, [prefsLoaded]);

  // Completion detection: a timeout aimed at the exact end, plus a slow safety tick.
  useEffect(() => {
    if (timer.status !== 'running') return;
    const delay = Math.max(0, endsAt(timer) - Date.now());
    const end = window.setTimeout(() => focusStore.getState().tick(), delay + 20);
    const safety = window.setInterval(() => focusStore.getState().tick(), 1000);
    const beat = window.setInterval(() => focusStore.getState().heartbeat(), HEARTBEAT_MS);
    return () => {
      window.clearTimeout(end);
      window.clearInterval(safety);
      window.clearInterval(beat);
    };
  }, [timer]);

  // Background tabs: evaluate immediately on return, and record a heartbeat on hide.
  useEffect(() => {
    const onVisibility = () => {
      focusStore.getState().tick();
      focusStore.getState().heartbeat();
    };
    const onPageHide = () => focusStore.getState().heartbeat();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, []);

  // Cross-tab sync: another tab started, paused or finished the timer.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== FOCUS_SNAPSHOT_KEY) return;
      focusStore.getState().adopt(parseFocusSnapshot(e.newValue));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Let the core calm down while focusing.
  useEffect(() => {
    coreStore.setState({ focusRunning: timer.status === 'running' });
  }, [timer.status]);

  // Remaining time in the tab title while a session is active.
  useEffect(() => {
    if (!hydrated) return;
    const base = 'VOIDSPACE';
    if (timer.status !== 'running' && timer.status !== 'paused') {
      document.title = base;
      return;
    }
    const update = () => {
      const t = focusStore.getState().timer;
      const label = t.status === 'paused' ? 'Paused' : 'Focus';
      document.title = `${formatClock(remainingMs(t, Date.now()))} · ${label} — ${base}`;
    };
    update();
    const id = window.setInterval(update, 1000);
    return () => {
      window.clearInterval(id);
      document.title = base;
    };
  }, [timer.status, hydrated]);
}
