import { beforeEach, describe, expect, it } from 'vitest';
import type { VoidspaceDB } from '@/lib/storage/db';
import {
  BACKUP_FORMAT_VERSION,
  applyImport,
  deleteAllData,
  exportBackup,
  parseBackup,
  planImport,
} from '@/lib/storage/backup';
import { FOCUS_SNAPSHOT_KEY } from '@/features/focus/snapshotStorage';
import type { Thought } from '@/types';
import { freshDb } from '../helpers';

let db: VoidspaceDB;
beforeEach(async () => {
  db = await freshDb();
});

const T = 1_760_000_000_000;
const thought = (id: string, content: string, updatedAt = T): Thought => ({
  id,
  content,
  category: null,
  createdAt: T,
  updatedAt,
});

function backupText(data: object, extra: object = {}) {
  return JSON.stringify({
    app: 'voidspace',
    formatVersion: 1,
    exportedAt: new Date(T).toISOString(),
    data: { thoughts: [], focusSessions: [], ...data },
    ...extra,
  });
}

describe('export', () => {
  it('produces a versioned document that parses back losslessly', async () => {
    await db.thoughts.add(thought('a', 'hello'));
    await db.focusSessions.add({
      id: 's',
      plannedDurationSeconds: 900,
      actualFocusedSeconds: 300,
      startedAt: T,
      endedAt: T + 300_000,
      status: 'canceled',
    });
    const backup = await exportBackup(db, new Date(T));
    expect(backup.formatVersion).toBe(BACKUP_FORMAT_VERSION);
    const reparsed = parseBackup(JSON.stringify(backup));
    expect(reparsed.data.thoughts).toEqual([thought('a', 'hello')]);
    expect(reparsed.data.focusSessions).toHaveLength(1);
  });
});

describe('parseBackup rejects invalid input', () => {
  it.each([
    ['not JSON', '{oops', /not valid JSON/],
    ['another app', JSON.stringify({ app: 'other', formatVersion: 1 }), /not a VOIDSPACE backup/],
    ['a newer format', backupText({}, { formatVersion: 99 }), /newer version/],
    ['empty content', backupText({ thoughts: [thought('a', '   ')] }), /invalid data/],
    ['a bad timestamp', backupText({ thoughts: [{ ...thought('a', 'x'), createdAt: -5 }] }), /invalid data/],
    ['an unknown category', backupText({ thoughts: [{ ...thought('a', 'x'), category: 'evil' }] }), /invalid data/],
    ['an unsafe id', backupText({ thoughts: [thought('../../x', 'x')] }), /invalid data/],
    ['duplicate ids', backupText({ thoughts: [thought('a', 'x'), thought('a', 'y')] }), /duplicate/],
    [
      'a fake completion',
      backupText({
        focusSessions: [
          { id: 's', plannedDurationSeconds: 1500, actualFocusedSeconds: 10, startedAt: T, endedAt: T + 1, status: 'completed' },
        ],
      }),
      /invalid data/,
    ],
  ])('%s', (_label, text, message) => {
    expect(() => parseBackup(text)).toThrow(message);
  });

  it('strips unknown fields', () => {
    const parsed = parseBackup(backupText({ thoughts: [{ ...thought('a', 'x'), injected: '<script>' }] }));
    expect(parsed.data.thoughts[0]).not.toHaveProperty('injected');
  });
});

describe('import conflict handling', () => {
  beforeEach(async () => {
    await db.thoughts.bulkAdd([thought('same', 'same'), thought('conflict', 'local version', T + 10)]);
  });

  const incoming = () =>
    parseBackup(
      backupText({
        thoughts: [thought('same', 'same'), thought('conflict', 'imported version', T + 5), thought('fresh', 'new')],
      }),
    );

  it('plans without writing', async () => {
    const plan = await planImport(incoming(), db);
    expect(plan.thoughts).toEqual({ new: 1, conflicting: 1, identical: 1 });
    expect(await db.thoughts.count()).toBe(2);
  });

  it('keep-newer keeps the local copy when it was edited more recently', async () => {
    const r = await applyImport(incoming(), { strategy: 'keep-newer', includePreferences: false }, db);
    expect(r.thoughtsWritten).toBe(1);
    expect((await db.thoughts.get('conflict'))?.content).toBe('local version');
    expect(await db.thoughts.get('fresh')).toBeDefined();
  });

  it('replace overwrites conflicts with the imported copy', async () => {
    await applyImport(incoming(), { strategy: 'replace', includePreferences: false }, db);
    expect((await db.thoughts.get('conflict'))?.content).toBe('imported version');
  });

  it('keep-existing only adds new items', async () => {
    const r = await applyImport(incoming(), { strategy: 'keep-existing', includePreferences: false }, db);
    expect(r.thoughtsWritten).toBe(1);
    expect((await db.thoughts.get('conflict'))?.content).toBe('local version');
  });

  it('never removes local data that is absent from the backup', async () => {
    await db.thoughts.add(thought('local-only', 'mine'));
    await applyImport(incoming(), { strategy: 'replace', includePreferences: false }, db);
    expect(await db.thoughts.get('local-only')).toBeDefined();
  });

  it('applies preferences only when asked', async () => {
    const b = parseBackup(backupText({ preferences: { soundEnabled: true } }));
    await applyImport(b, { strategy: 'keep-newer', includePreferences: false }, db);
    expect(await db.preferences.get('preferences')).toBeUndefined();
    await applyImport(b, { strategy: 'keep-newer', includePreferences: true }, db);
    expect((await db.preferences.get('preferences'))?.soundEnabled).toBe(true);
  });
});

describe('deleteAllData', () => {
  it('clears every table and the in-progress timer', async () => {
    await db.thoughts.add(thought('a', 'x'));
    window.localStorage.setItem(FOCUS_SNAPSHOT_KEY, '{}');
    await deleteAllData(db);
    expect(await db.thoughts.count()).toBe(0);
    expect(window.localStorage.getItem(FOCUS_SNAPSHOT_KEY)).toBeNull();
  });
});
