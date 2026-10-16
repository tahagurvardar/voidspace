'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { AnimatePresence, LazyMotion, MotionConfig } from 'motion/react';
import * as m from 'motion/react-m';
import type { AppMode } from '@/types';
import { useAppStore } from '@/store/appStore';
import { coreStore } from '@/store/coreStore';
import { usePreferencesStore } from '@/store/preferencesStore';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { getDb } from '@/lib/storage/db';
import { toStorageError } from '@/lib/storage/errors';
import { cn } from '@/lib/utils/cn';
import { CoreAnchor, LivingCoreLayer } from '@/components/core/LivingCore';
import { Toasts } from '@/components/ui/Toasts';
import { ClearPanel } from '@/features/clear/ClearPanel';
import { FocusPanel } from '@/features/focus/FocusPanel';
import { useFocusRuntime } from '@/features/focus/focusInstance';
import { ArchivePanel } from '@/features/archive/ArchivePanel';
import { Header } from './Header';
import { ModeNav } from './ModeNav';
import { MODES, modeFromHash } from './modes';

// Not needed for first paint: loaded on demand.
const ExplorePanel = dynamic(() => import('@/features/explore/ExplorePanel').then((mod) => mod.ExplorePanel), {
  ssr: false,
  loading: () => <p className="text-sm text-ink-muted">Loading…</p>,
});
const SettingsDialog = dynamic(() => import('@/features/settings/SettingsDialog').then((mod) => mod.SettingsDialog), {
  ssr: false,
});

const loadMotionFeatures = () => import('./motionFeatures').then((mod) => mod.default);

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.getAttribute('role') === 'application'
  );
}

function ModePanel({ mode }: { mode: Exclude<AppMode, 'home'> }) {
  switch (mode) {
    case 'clear':
      return <ClearPanel />;
    case 'focus':
      return <FocusPanel />;
    case 'explore':
      return <ExplorePanel />;
    case 'archive':
      return <ArchivePanel />;
  }
}

/**
 * The single-route application. One persistent shell, one Living Core
 * (rendered once, following a single anchor element), and mode panels that swap
 * in place. The mode is mirrored to the URL hash so Back/Forward work; no note
 * content ever reaches the URL.
 */
export function AppShell() {
  const mode = useAppStore((s) => s.mode);
  const setMode = useAppStore((s) => s.setMode);
  const settingsOpen = useAppStore((s) => s.settingsOpen);
  const loadPrefs = usePreferencesStore((s) => s.load);
  const reducedMotion = useReducedMotion();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const userNavigated = useRef(false);
  const [storageProblem, setStorageProblem] = useState<string | null>(null);

  useFocusRuntime();

  // Boot: preferences + a storage availability check.
  useEffect(() => {
    void loadPrefs();
    getDb()
      .open()
      .catch((e: unknown) => setStorageProblem(toStorageError(e).message));
  }, [loadPrefs]);

  const navigate = useCallback(
    (next: AppMode) => {
      userNavigated.current = true;
      setMode(next);
      const hash = next === 'home' ? '' : `#${next}`;
      if (window.location.hash !== hash) {
        window.history.pushState(null, '', hash || window.location.pathname + window.location.search);
      }
    },
    [setMode],
  );

  // URL hash ⇄ mode.
  useEffect(() => {
    const sync = () => setMode(modeFromHash(window.location.hash));
    sync();
    window.addEventListener('popstate', sync);
    window.addEventListener('hashchange', sync);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener('hashchange', sync);
    };
  }, [setMode]);

  // Keep the core informed of the mode (outside React's render path).
  useEffect(() => {
    coreStore.setState({ mode });
  }, [mode]);

  // Move focus to the new heading after the user changes mode (screen readers announce it).
  useEffect(() => {
    if (!userNavigated.current) return;
    headingRef.current?.focus({ preventScroll: true });
  }, [mode]);

  // Global shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || settingsOpen) return;
      if (isEditable(e.target) || document.querySelector('dialog[open]')) return;
      const map: Record<string, AppMode> = { '1': 'clear', '2': 'focus', '3': 'explore', '4': 'archive', Escape: 'home' };
      const next = map[e.key];
      if (next && next !== useAppStore.getState().mode) {
        e.preventDefault();
        navigate(next);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate, settingsOpen]);

  // Pointer position for the core's Explore/home reactions (throttled to animation frames).
  useEffect(() => {
    let raf = 0;
    let x = 0;
    let y = 0;
    const onMove = (e: PointerEvent) => {
      x = (e.clientX / window.innerWidth) * 2 - 1;
      y = (e.clientY / window.innerHeight) * 2 - 1;
      if (!raf) {
        raf = requestAnimationFrame(() => {
          raf = 0;
          coreStore.setState({ pointer: { x, y } });
        });
      }
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const home = mode === 'home';
  const info = home ? null : MODES[mode];

  return (
    <LazyMotion features={loadMotionFeatures} strict>
    <MotionConfig reducedMotion={reducedMotion ? 'always' : 'never'}>
      <div
        className="relative flex h-dvh flex-col overflow-hidden bg-void"
        data-reduced-motion={reducedMotion ? 'true' : 'false'}
        data-mode={mode}
      >
        <a
          href="#main"
          className="sr-only z-50 rounded-md bg-surface px-3 py-2 focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
        >
          Skip to content
        </a>
        <LivingCoreLayer />
        <Header onNavigate={navigate} />

        {storageProblem && (
          <p role="alert" className="relative z-20 mx-4 rounded-lg border border-danger/40 bg-[#2a1220] px-4 py-2 text-sm text-[#ffd6df] sm:mx-6">
            {storageProblem}
          </p>
        )}

        <main
          id="main"
          className={cn(
            'relative z-10 flex min-h-0 flex-1',
            home
              ? 'flex-col items-center justify-center overflow-y-auto px-4'
              : 'vs-fade-bottom flex-col overflow-y-auto lg:flex-row lg:overflow-hidden',
          )}
        >
          {/* Stage: headline + the one Core anchor. It stays mounted across modes so the orb glides between layouts. */}
          <div
            className={cn(
              'flex shrink-0',
              home
                ? 'w-full max-w-3xl flex-col items-center text-center'
                : 'items-center gap-4 px-4 pt-1 pb-4 sm:px-6 lg:w-[clamp(18rem,30vw,30rem)] lg:flex-col lg:items-start lg:justify-center lg:gap-7 lg:pb-12 lg:pl-10 xl:pl-14',
            )}
          >
            {home && (
              <div className="flex flex-col items-center gap-2.5 sm:gap-3">
                <p className="vs-kicker">Welcome to your space</p>
                <h1
                  ref={headingRef}
                  tabIndex={-1}
                  className="text-[1.65rem] font-semibold tracking-tight text-ink outline-none sm:text-3xl xl:text-[2.125rem]"
                >
                  Make room for your mind.
                </h1>
              </div>
            )}

            <CoreAnchor
              className={cn(
                'shrink-0 transition-[width] duration-500 ease-out',
                home ? 'home-core my-1' : 'w-20 sm:w-24 lg:w-[min(100%,20rem)] 2xl:w-[min(100%,25rem)]',
              )}
            />

            {home && <p className="text-sm text-ink-muted sm:text-[0.9375rem]">Your thoughts. Your rhythm. Your universe.</p>}

            {info && (
              <div className="min-w-0">
                <p className="vs-kicker">{info.label}</p>
                <h1
                  ref={headingRef}
                  tabIndex={-1}
                  className="mt-1 text-lg font-semibold tracking-tight text-balance text-ink outline-none sm:text-xl lg:text-2xl 2xl:text-[1.75rem]"
                >
                  {info.heading}
                </h1>
                <p className="mt-1.5 hidden text-sm text-ink-muted lg:block">{info.summary}</p>
              </div>
            )}
          </div>

          {info && (
            <div className="vs-scroll min-h-0 flex-1 px-4 pb-14 sm:px-6 lg:flex lg:flex-col lg:overflow-y-auto lg:pt-6 lg:pr-10 lg:pb-16 xl:pr-14">
              <AnimatePresence mode="wait" initial={false}>
                <m.div
                  key={mode}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                  // my-auto centres short panels on tall screens; long ones scroll normally.
                  className="mx-auto w-full max-w-3xl lg:my-auto xl:max-w-4xl 2xl:max-w-5xl"
                >
                  <ModePanel mode={info.id} />
                </m.div>
              </AnimatePresence>
            </div>
          )}
        </main>

        <ModeNav mode={mode} onNavigate={navigate} />
        {settingsOpen && <SettingsDialog />}
        <Toasts />
      </div>
    </MotionConfig>
    </LazyMotion>
  );
}
