'use client';

import dynamic from 'next/dynamic';
import { Component, useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { useStore } from 'zustand';
import { coreStore } from '@/store/coreStore';
import { useAppStore } from '@/store/appStore';
import { usePreferencesStore } from '@/store/preferencesStore';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { cn } from '@/lib/utils/cn';
import { CoreFallback } from './CoreFallback';
import { chooseCoreRenderMode, detectWebGL } from './webgl';

// Three.js + R3F are only downloaded when WebGL will actually be used.
const CoreScene = dynamic(() => import('./CoreScene'), { ssr: false, loading: () => null });

class SceneBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch(error: unknown) {
    console.warn('[voidspace] Living Core disabled, using static fallback:', error);
    this.props.onError();
  }
  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

const subscribeNoop = () => () => {};

let webglProbe: boolean | null = null;

/** WebGL availability, probed once per page load on the client (false during SSR). */
function useWebGLAvailable(): boolean {
  return useSyncExternalStore(
    subscribeNoop,
    () => {
      if (webglProbe === null) webglProbe = detectWebGL();
      return webglProbe;
    },
    () => false,
  );
}

function markWebglFailed() {
  coreStore.setState({ webglFailed: true, webglReady: false });
}

export function useCoreRenderMode() {
  const webglAvailable = useWebGLAvailable();
  const reducedMotion = useReducedMotion();
  const quality = usePreferencesStore((s) => s.prefs.graphicsQuality);
  const prefsLoaded = usePreferencesStore((s) => s.loaded);
  const webglFailed = useStore(coreStore, (s) => s.webglFailed);
  const mode = chooseCoreRenderMode({ webglAvailable, reducedMotion, quality, webglFailed });
  // Wait for stored preferences so we don't spin up WebGL for a user who chose "Static".
  return { mode: prefsLoaded ? mode : 'static', quality, reducedMotion, fail: markWebglFailed } as const;
}

/**
 * Global renderer layer. Mounted once by the app shell.
 */
export function LivingCoreLayer() {
  const { mode, quality, fail } = useCoreRenderMode();
  if (mode !== 'webgl') return null;
  return (
    <SceneBoundary onError={fail}>
      <CoreScene quality={quality} onFailure={fail} />
    </SceneBoundary>
  );
}

/**
 * Marks where the orb should appear. Shows the CSS orb until (and unless)
 * the WebGL scene is drawing.
 */
export function CoreAnchor({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const appMode = useAppStore((s) => s.mode);
  const webglReady = useStore(coreStore, (s) => s.webglReady);
  const { mode: renderMode, reducedMotion } = useCoreRenderMode();
  const showFallback = renderMode === 'static' || !webglReady;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    coreStore.setState({ anchorEl: el });
    return () => {
      if (coreStore.getState().anchorEl === el) coreStore.setState({ anchorEl: null });
    };
  }, []);

  return (
    <div
      ref={ref}
      className={cn('relative aspect-square', className)}
      data-testid="core-anchor"
      data-render-mode={renderMode}
      data-webgl-ready={renderMode === 'webgl' && webglReady ? 'true' : 'false'}
    >
      <div
        className={cn(
          'absolute inset-0 transition-opacity duration-700',
          showFallback ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      >
        <CoreFallback mode={appMode} animate={!reducedMotion} />
      </div>
    </div>
  );
}
