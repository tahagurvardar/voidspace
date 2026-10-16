import { Archive, PenLine, Sparkles, Timer, type LucideIcon } from 'lucide-react';
import type { AppMode } from '@/types';

export type NavMode = Exclude<AppMode, 'home' | 'archive'>;

export interface ModeInfo {
  id: Exclude<AppMode, 'home'>;
  label: string;
  /** One line under the card label: what the mode does, in plain words. */
  summary: string;
  /** Heading when the mode is open. */
  heading: string;
  icon: LucideIcon;
  shortcut: string;
}

export const MODES: Record<Exclude<AppMode, 'home'>, ModeInfo> = {
  clear: {
    id: 'clear',
    label: 'Clear',
    summary: 'Write a thought down. Keep it, or let it go.',
    heading: 'Put it somewhere safe, or let it go.',
    icon: PenLine,
    shortcut: '1',
  },
  focus: {
    id: 'focus',
    label: 'Focus',
    summary: 'Timed sessions from 15 to 50 minutes.',
    heading: 'One thing, for a set time.',
    icon: Timer,
    shortcut: '2',
  },
  explore: {
    id: 'explore',
    label: 'Explore',
    summary: 'Two small playgrounds for a creative break.',
    heading: 'A short break for your hands and eyes.',
    icon: Sparkles,
    shortcut: '3',
  },
  archive: {
    id: 'archive',
    label: 'Archive',
    summary: 'Saved thoughts and focus history.',
    heading: 'Everything you chose to keep.',
    icon: Archive,
    shortcut: '4',
  },
};

export const NAV_MODES: NavMode[] = ['clear', 'focus', 'explore'];

export function modeFromHash(hash: string): AppMode {
  const h = hash.replace(/^#/, '');
  return h === 'clear' || h === 'focus' || h === 'explore' || h === 'archive' ? h : 'home';
}
