'use client';

import { usePreferencesStore } from '@/store/preferencesStore';
import type { MotionPreference } from '@/types';
import { useMediaQuery } from './useMediaQuery';

export function resolveReducedMotion(preference: MotionPreference, systemPrefersReduced: boolean): boolean {
  if (preference === 'reduce') return true;
  if (preference === 'full') return false;
  return systemPrefersReduced;
}

/** True when motion should be minimised — from the in-app setting, or the OS setting when set to "system". */
export function useReducedMotion(): boolean {
  const preference = usePreferencesStore((s) => s.prefs.motionPreference);
  const system = useMediaQuery('(prefers-reduced-motion: reduce)');
  return resolveReducedMotion(preference, system);
}
