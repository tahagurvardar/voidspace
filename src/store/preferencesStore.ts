import { create } from 'zustand';
import { DEFAULT_PREFERENCES, type Preferences } from '@/types';
import { preferencesRepository } from '@/lib/storage/preferencesRepository';
import { soundEngine } from '@/lib/audio/soundEngine';

interface PreferencesState {
  prefs: Preferences;
  loaded: boolean;
  /** Last persistence error message, if saving failed. */
  error: string | null;
  load: () => Promise<void>;
  update: (patch: Partial<Preferences>) => Promise<void>;
  /** Replace in-memory state without persisting (e.g. after an import or data deletion). */
  hydrate: (prefs: Preferences) => void;
}

export const usePreferencesStore = create<PreferencesState>()((set, get) => ({
  prefs: DEFAULT_PREFERENCES,
  loaded: false,
  error: null,
  load: async () => {
    try {
      const prefs = await preferencesRepository.load();
      set({ prefs, loaded: true, error: null });
    } catch (e) {
      set({ loaded: true, error: e instanceof Error ? e.message : 'Could not load settings.' });
    }
    soundEngine.configure(get().prefs);
  },
  update: async (patch) => {
    const prefs = { ...get().prefs, ...patch };
    // Apply immediately so the interface responds even if storage is slow or unavailable.
    set({ prefs });
    soundEngine.configure(prefs);
    try {
      await preferencesRepository.save(prefs);
      set({ error: null });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Could not save settings.' });
      throw e;
    }
  },
  hydrate: (prefs) => {
    set({ prefs });
    soundEngine.configure(prefs);
  },
}));
