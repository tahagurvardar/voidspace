import { DEFAULT_PREFERENCES, type Preferences } from '@/types';
import { partialPreferencesSchema } from '@/lib/validation/schemas';
import { getDb, type VoidspaceDB } from './db';
import { guard } from './errors';

/**
 * Merges whatever valid fields are stored over the defaults.
 * Invalid fields are dropped individually instead of discarding everything.
 */
export function normalizePreferences(raw: unknown): Preferences {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_PREFERENCES };
  const result: Preferences = { ...DEFAULT_PREFERENCES };
  const shape = partialPreferencesSchema.shape;
  for (const key of Object.keys(shape) as Array<keyof Preferences>) {
    const parsed = shape[key].safeParse((raw as Record<string, unknown>)[key]);
    if (parsed.success && parsed.data !== undefined) {
      (result as unknown as Record<string, unknown>)[key] = parsed.data;
    }
  }
  return result;
}

export function createPreferencesRepository(db: () => VoidspaceDB = getDb) {
  return {
    async load(): Promise<Preferences> {
      const row = await guard(() => db().preferences.get('preferences'));
      return normalizePreferences(row);
    },

    async save(prefs: Preferences): Promise<void> {
      const valid = normalizePreferences(prefs);
      await guard(() => db().preferences.put({ key: 'preferences', ...valid }));
    },
  };
}

export const preferencesRepository = createPreferencesRepository();
