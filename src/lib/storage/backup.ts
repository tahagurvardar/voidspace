import { z } from 'zod';
import type { FocusSession, Preferences, Thought } from '@/types';
import {
  firstIssueMessage,
  focusSessionSchema,
  partialPreferencesSchema,
  thoughtSchema,
} from '@/lib/validation/schemas';
import { getDb, type VoidspaceDB } from './db';
import { StorageError, guard } from './errors';
import { normalizePreferences } from './preferencesRepository';
import { clearFocusSnapshot } from '@/features/focus/snapshotStorage';

export const BACKUP_APP_ID = 'voidspace';
export const BACKUP_FORMAT_VERSION = 1;
/** Hard cap on imported file size; protects against freezing the tab on huge input. */
export const MAX_BACKUP_BYTES = 5 * 1024 * 1024;
const MAX_ITEMS = 50_000;

export interface BackupV1 {
  app: typeof BACKUP_APP_ID;
  formatVersion: 1;
  exportedAt: string;
  data: {
    thoughts: Thought[];
    focusSessions: FocusSession[];
    preferences?: Partial<Preferences>;
  };
}

const backupEnvelopeSchema = z.object({
  app: z.literal(BACKUP_APP_ID, { message: 'This file is not a VOIDSPACE backup.' }),
  formatVersion: z.number().int().positive(),
});

const backupV1Schema = z.object({
  app: z.literal(BACKUP_APP_ID),
  formatVersion: z.literal(1),
  exportedAt: z.string().max(64),
  data: z.object({
    thoughts: z.array(thoughtSchema).max(MAX_ITEMS),
    focusSessions: z.array(focusSessionSchema).max(MAX_ITEMS),
    preferences: partialPreferencesSchema.optional(),
  }),
});

/**
 * Format migrations: each entry upgrades a parsed backup from version N to N+1.
 * Only version 1 exists today; future formats register `2: (v1) => v2` here and
 * bump BACKUP_FORMAT_VERSION, so older backup files keep importing.
 */
const FORMAT_MIGRATIONS: Record<number, (input: unknown) => unknown> = {};

export type ConflictStrategy = 'keep-newer' | 'keep-existing' | 'replace';

export interface ImportPlan {
  backup: BackupV1;
  thoughts: { new: number; conflicting: number; identical: number };
  focusSessions: { new: number; conflicting: number; identical: number };
  hasPreferences: boolean;
}

export interface ImportResult {
  thoughtsWritten: number;
  focusSessionsWritten: number;
  skipped: number;
  preferencesApplied: boolean;
}

export async function exportBackup(db: VoidspaceDB = getDb(), now: Date = new Date()): Promise<BackupV1> {
  return guard(() =>
    db.transaction('r', db.thoughts, db.focusSessions, db.preferences, async () => {
      const [thoughts, focusSessions, prefsRow] = await Promise.all([
        db.thoughts.orderBy('createdAt').toArray(),
        db.focusSessions.orderBy('startedAt').toArray(),
        db.preferences.get('preferences'),
      ]);
      return {
        app: BACKUP_APP_ID,
        formatVersion: BACKUP_FORMAT_VERSION,
        exportedAt: now.toISOString(),
        data: { thoughts, focusSessions, preferences: normalizePreferences(prefsRow) },
      } satisfies BackupV1;
    }),
  );
}

export function backupFileName(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `voidspace-backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}

/**
 * Parses and validates untrusted backup text. Throws StorageError('validation')
 * with a specific message; never writes anything.
 */
export function parseBackup(text: string): BackupV1 {
  if (text.length > MAX_BACKUP_BYTES) {
    throw new StorageError('validation', 'This file is larger than 5 MB and cannot be a VOIDSPACE backup.');
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new StorageError('validation', 'This file is not valid JSON.');
  }
  const envelope = backupEnvelopeSchema.safeParse(raw);
  if (!envelope.success) throw new StorageError('validation', firstIssueMessage(envelope.error));

  let version = envelope.data.formatVersion;
  if (version > BACKUP_FORMAT_VERSION) {
    throw new StorageError(
      'validation',
      `This backup was made by a newer version of VOIDSPACE (format ${version}). Update the app to import it.`,
    );
  }
  let current: unknown = raw;
  while (version < BACKUP_FORMAT_VERSION) {
    const migrate = FORMAT_MIGRATIONS[version];
    if (!migrate) throw new StorageError('validation', `Backup format ${version} is not supported.`);
    current = migrate(current);
    version += 1;
  }

  const parsed = backupV1Schema.safeParse(current);
  if (!parsed.success) {
    throw new StorageError('validation', `The backup contains invalid data — ${firstIssueMessage(parsed.error)}`);
  }
  const ids = new Set<string>();
  for (const t of parsed.data.data.thoughts) {
    if (ids.has(t.id)) throw new StorageError('validation', 'The backup contains duplicate thought IDs.');
    ids.add(t.id);
  }
  ids.clear();
  for (const s of parsed.data.data.focusSessions) {
    if (ids.has(s.id)) throw new StorageError('validation', 'The backup contains duplicate session IDs.');
    ids.add(s.id);
  }
  return parsed.data as BackupV1;
}

function sameThought(a: Thought, b: Thought): boolean {
  return a.content === b.content && a.category === b.category && a.updatedAt === b.updatedAt;
}

function sameSession(a: FocusSession, b: FocusSession): boolean {
  return (
    a.status === b.status &&
    a.actualFocusedSeconds === b.actualFocusedSeconds &&
    a.plannedDurationSeconds === b.plannedDurationSeconds &&
    a.startedAt === b.startedAt &&
    a.endedAt === b.endedAt
  );
}

/** Dry run: tells the user what an import would do before anything is written. */
export async function planImport(backup: BackupV1, db: VoidspaceDB = getDb()): Promise<ImportPlan> {
  return guard(async () => {
    const existingThoughts = await db.thoughts.bulkGet(backup.data.thoughts.map((t) => t.id));
    const existingSessions = await db.focusSessions.bulkGet(backup.data.focusSessions.map((s) => s.id));
    const thoughts = { new: 0, conflicting: 0, identical: 0 };
    backup.data.thoughts.forEach((t, i) => {
      const e = existingThoughts[i];
      if (!e) thoughts.new++;
      else if (sameThought(e, t)) thoughts.identical++;
      else thoughts.conflicting++;
    });
    const focusSessions = { new: 0, conflicting: 0, identical: 0 };
    backup.data.focusSessions.forEach((s, i) => {
      const e = existingSessions[i];
      if (!e) focusSessions.new++;
      else if (sameSession(e, s)) focusSessions.identical++;
      else focusSessions.conflicting++;
    });
    return { backup, thoughts, focusSessions, hasPreferences: !!backup.data.preferences };
  });
}

function resolve<T extends { updatedAt?: number; endedAt?: number }>(
  existing: T | undefined,
  incoming: T,
  strategy: ConflictStrategy,
): boolean {
  if (!existing) return true;
  if (strategy === 'replace') return true;
  if (strategy === 'keep-existing') return false;
  const a = existing.updatedAt ?? existing.endedAt ?? 0;
  const b = incoming.updatedAt ?? incoming.endedAt ?? 0;
  return b > a;
}

/**
 * Applies a validated backup in ONE transaction: either everything is written or nothing is.
 * Existing data that is not in the backup is never removed.
 */
export async function applyImport(
  backup: BackupV1,
  options: { strategy: ConflictStrategy; includePreferences: boolean },
  db: VoidspaceDB = getDb(),
): Promise<ImportResult> {
  return guard(() =>
    db.transaction('rw', db.thoughts, db.focusSessions, db.preferences, async () => {
      const existingThoughts = await db.thoughts.bulkGet(backup.data.thoughts.map((t) => t.id));
      const thoughtWrites = backup.data.thoughts.filter((t, i) => {
        const e = existingThoughts[i];
        if (e && sameThought(e, t)) return false;
        return resolve(e, t, options.strategy);
      });
      const existingSessions = await db.focusSessions.bulkGet(backup.data.focusSessions.map((s) => s.id));
      const sessionWrites = backup.data.focusSessions.filter((s, i) => {
        const e = existingSessions[i];
        if (e && sameSession(e, s)) return false;
        return resolve(e, s, options.strategy);
      });
      await db.thoughts.bulkPut(thoughtWrites);
      await db.focusSessions.bulkPut(sessionWrites);
      let preferencesApplied = false;
      if (options.includePreferences && backup.data.preferences) {
        const current = normalizePreferences(await db.preferences.get('preferences'));
        await db.preferences.put({
          key: 'preferences',
          ...normalizePreferences({ ...current, ...backup.data.preferences }),
        });
        preferencesApplied = true;
      }
      return {
        thoughtsWritten: thoughtWrites.length,
        focusSessionsWritten: sessionWrites.length,
        skipped:
          backup.data.thoughts.length -
          thoughtWrites.length +
          (backup.data.focusSessions.length - sessionWrites.length),
        preferencesApplied,
      };
    }),
  );
}

/** Permanently deletes every VOIDSPACE record on this device, including an in-progress timer. */
export async function deleteAllData(db: VoidspaceDB = getDb()): Promise<void> {
  await guard(() =>
    db.transaction('rw', db.thoughts, db.focusSessions, db.preferences, async () => {
      await db.thoughts.clear();
      await db.focusSessions.clear();
      await db.preferences.clear();
    }),
  );
  clearFocusSnapshot();
}
