import { createStore } from 'zustand/vanilla';
import type { AppMode } from '@/types';

/**
 * Non-React channel between the app and the Living Core renderer.
 * The 3D scene reads this with `coreStore.getState()` inside its frame loop,
 * so signals and pointer movement never trigger React renders.
 */
export type CoreSignalKind = 'save' | 'release' | 'complete';

export interface CoreSignal {
  kind: CoreSignalKind;
  /** performance.now() timestamp when the signal fired. */
  at: number;
  /** Monotonic id, so repeated signals of the same kind are distinguishable. */
  seq: number;
}

export interface CoreState {
  mode: AppMode;
  signal: CoreSignal | null;
  /** DOM element the orb should cover; its rect is read once per frame by the renderer. */
  anchorEl: HTMLElement | null;
  /** True once the WebGL scene has drawn its first frame (the CSS orb then fades out). */
  webglReady: boolean;
  /** Set when the WebGL scene crashed or lost its context; the static core takes over for the session. */
  webglFailed: boolean;
  /** Normalised pointer position (-1..1) for Explore mode reactions. */
  pointer: { x: number; y: number };
  /** True while the user is focusing; the core calms down. */
  focusRunning: boolean;
}

let seq = 0;

export const coreStore = createStore<CoreState>()(() => ({
  mode: 'home',
  signal: null,
  anchorEl: null,
  webglReady: false,
  webglFailed: false,
  pointer: { x: 0, y: 0 },
  focusRunning: false,
}));

export function emitCoreSignal(kind: CoreSignalKind): void {
  const at = typeof performance !== 'undefined' ? performance.now() : Date.now();
  coreStore.setState({ signal: { kind, at, seq: ++seq } });
}
