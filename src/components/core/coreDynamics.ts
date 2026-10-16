import type { AppMode } from '@/types';
import type { CoreSignal } from '@/store/coreStore';

/**
 * Pure description of how the Living Core behaves. Kept separate from the
 * Three.js renderer so it can be unit tested and reasoned about on its own.
 */
export interface CoreTargets {
  /** Radians per second of the ring system's slow spin. */
  spin: number;
  /** Breathing amplitude (fraction of radius). */
  breath: number;
  /** Breathing period in seconds. */
  breathPeriod: number;
  /** 0 = violet, 1 = cooler electric blue. */
  coolness: number;
  /** Ring opacity. */
  rings: number;
  /** How strongly the core tilts toward the pointer (radians at the edge). */
  pointerTilt: number;
}

export function coreTargets(mode: AppMode, focusRunning: boolean): CoreTargets {
  switch (mode) {
    case 'focus':
      return {
        spin: focusRunning ? 0.012 : 0.03,
        breath: focusRunning ? 0.012 : 0.016,
        breathPeriod: focusRunning ? 11 : 9,
        coolness: focusRunning ? 0.85 : 0.55,
        rings: focusRunning ? 0.4 : 0.6,
        pointerTilt: 0,
      };
    case 'explore':
      return { spin: 0.1, breath: 0.022, breathPeriod: 6, coolness: 0.25, rings: 0.85, pointerTilt: 0.45 };
    case 'archive':
      return { spin: 0.05, breath: 0.016, breathPeriod: 8, coolness: 0.35, rings: 0.7, pointerTilt: 0 };
    case 'clear':
      return { spin: 0.06, breath: 0.018, breathPeriod: 7, coolness: 0.1, rings: 0.75, pointerTilt: 0 };
    case 'home':
    default:
      return { spin: 0.07, breath: 0.02, breathPeriod: 7, coolness: 0, rings: 0.8, pointerTilt: 0.12 };
  }
}

/** Signal envelopes return 0..1 strength for a signal of the given age (seconds). */
export const SIGNAL_DURATION_S: Record<CoreSignal['kind'], number> = {
  save: 1.4,
  release: 1.1,
  complete: 2.6,
};

export function signalEnvelope(kind: CoreSignal['kind'], ageSeconds: number): number {
  const d = SIGNAL_DURATION_S[kind];
  if (ageSeconds < 0 || ageSeconds >= d) return 0;
  const attack = kind === 'complete' ? 0.25 : 0.12;
  if (ageSeconds < attack) return ageSeconds / attack;
  const t = (ageSeconds - attack) / (d - attack);
  return (1 - t) * (1 - t);
}

/** Frame-rate independent exponential smoothing. */
export function damp(current: number, target: number, rate: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}
