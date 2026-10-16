/**
 * Domain types shared across features.
 * All timestamps are epoch milliseconds (UTC) so they index and compare cheaply.
 */

export const THOUGHT_CATEGORIES = ['idea', 'task', 'feeling', 'note'] as const;
export type ThoughtCategory = (typeof THOUGHT_CATEGORIES)[number];

export interface Thought {
  id: string;
  content: string;
  /** null means "uncategorised". */
  category: ThoughtCategory | null;
  createdAt: number;
  updatedAt: number;
}

export const FOCUS_SESSION_STATUSES = ['completed', 'canceled', 'interrupted'] as const;
/**
 * Status of a *finished* session record.
 * "paused" and "running" are live timer states and are never stored as records.
 */
export type FocusSessionStatus = (typeof FOCUS_SESSION_STATUSES)[number];

export interface FocusSession {
  id: string;
  plannedDurationSeconds: number;
  actualFocusedSeconds: number;
  startedAt: number;
  /** When the session ended — completion, cancellation, or the last moment it was known to be running. */
  endedAt: number;
  status: FocusSessionStatus;
}

export const MOTION_PREFERENCES = ['system', 'reduce', 'full'] as const;
export type MotionPreference = (typeof MOTION_PREFERENCES)[number];

export const GRAPHICS_QUALITIES = ['auto', 'high', 'low', 'static'] as const;
export type GraphicsQuality = (typeof GRAPHICS_QUALITIES)[number];

export interface Preferences {
  soundEnabled: boolean;
  /** 0..1 */
  volume: number;
  motionPreference: MotionPreference;
  graphicsQuality: GraphicsQuality;
  /** Minutes. */
  defaultFocusDuration: number;
  /** Play a chime when a focus session completes (only audible when sound is enabled). */
  focusChime: boolean;
}

export const DEFAULT_PREFERENCES: Preferences = {
  soundEnabled: false,
  volume: 0.6,
  motionPreference: 'system',
  graphicsQuality: 'auto',
  defaultFocusDuration: 25,
  focusChime: true,
};

export const APP_MODES = ['home', 'clear', 'focus', 'explore', 'archive'] as const;
export type AppMode = (typeof APP_MODES)[number];
