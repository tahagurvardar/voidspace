import Dexie, { type EntityTable } from 'dexie';
import type { FocusSession, Preferences, Thought } from '@/types';

export const DB_NAME = 'voidspace';

/** Single-row preferences record. */
export interface PreferencesRecord extends Preferences {
  key: 'preferences';
}

export type VoidspaceDB = Dexie & {
  thoughts: EntityTable<Thought, 'id'>;
  focusSessions: EntityTable<FocusSession, 'id'>;
  preferences: EntityTable<PreferencesRecord, 'key'>;
};

/**
 * Schema history. NEVER edit a published version in place — add a new
 * `db.version(n + 1)` with an `.upgrade()` that transforms existing rows.
 * Dexie runs pending upgrades in order inside a versionchange transaction,
 * so a failed upgrade aborts atomically and leaves the old data intact.
 *
 * v1 (VOIDSPACE 2.0.0): thoughts, focusSessions, preferences.
 */
export const SCHEMA_VERSIONS = {
  1: {
    thoughts: 'id, createdAt, updatedAt, category',
    focusSessions: 'id, startedAt, endedAt, status',
    preferences: 'key',
  },
} as const;

export const CURRENT_SCHEMA_VERSION = 1;

export function createDatabase(name: string = DB_NAME): VoidspaceDB {
  const db = new Dexie(name) as VoidspaceDB;
  db.version(1).stores(SCHEMA_VERSIONS[1]);
  return db;
}

let instance: VoidspaceDB | null = null;

/** Lazily created singleton. Only call from client code. */
export function getDb(): VoidspaceDB {
  if (!instance) instance = createDatabase();
  return instance;
}

/** Test helper: swap the singleton (e.g. for a uniquely named database). */
export function setDbForTesting(db: VoidspaceDB | null): void {
  instance = db;
}
