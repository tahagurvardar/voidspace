import { create } from 'zustand';
import type { AppMode } from '@/types';

export type ToastTone = 'info' | 'success' | 'error';
export interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

interface AppState {
  mode: AppMode;
  settingsOpen: boolean;
  /** Thought id the Archive should select when it opens (e.g. after "View in archive"). */
  archiveFocusId: string | null;
  toasts: Toast[];
  setMode: (mode: AppMode) => void;
  openSettings: () => void;
  closeSettings: () => void;
  showInArchive: (thoughtId: string) => void;
  consumeArchiveFocus: () => string | null;
  toast: (message: string, tone?: ToastTone) => void;
  dismissToast: (id: number) => void;
}

let toastId = 0;

export const useAppStore = create<AppState>()((set, get) => ({
  mode: 'home',
  settingsOpen: false,
  archiveFocusId: null,
  toasts: [],
  setMode: (mode) => set({ mode }),
  openSettings: () => set({ settingsOpen: true }),
  closeSettings: () => set({ settingsOpen: false }),
  showInArchive: (thoughtId) => set({ archiveFocusId: thoughtId, mode: 'archive' }),
  consumeArchiveFocus: () => {
    const id = get().archiveFocusId;
    if (id) set({ archiveFocusId: null });
    return id;
  },
  toast: (message, tone = 'info') => {
    const id = ++toastId;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, message, tone }] }));
    if (typeof window !== 'undefined') {
      window.setTimeout(() => get().dismissToast(id), tone === 'error' ? 8000 : 4000);
    }
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
