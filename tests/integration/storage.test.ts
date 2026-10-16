import { beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, setDbForTesting, type VoidspaceDB } from '@/lib/storage/db';
import { createThoughtsRepository, filterThoughts } from '@/lib/storage/thoughtsRepository';
import { createFocusSessionsRepository } from '@/lib/storage/focusSessionsRepository';
import { createPreferencesRepository, normalizePreferences } from '@/lib/storage/preferencesRepository';
import { StorageError, toStorageError } from '@/lib/storage/errors';
import { DEFAULT_PREFERENCES, type FocusSession } from '@/types';
import { freshDb } from '../helpers';

let db: VoidspaceDB;
const repo = () => createThoughtsRepository(() => db);

beforeEach(async () => {
  db = await freshDb();
});

describe('thoughts repository', () => {
  it('creates and persists a thought with trimmed content', async () => {
    const t = await repo().create({ content: '  remember the milk  ', category: 'task' });
    expect(t.content).toBe('remember the milk');
    expect(await db.thoughts.get(t.id)).toEqual(t);
  });

  it('survives closing and reopening the database (a reload)', async () => {
    const t = await repo().create({ content: 'durable', category: null });
    const name = db.name;
    db.close();
    const reopened = createDatabase(name);
    await reopened.open();
    expect(await reopened.thoughts.get(t.id)).toEqual(t);
    reopened.close();
    setDbForTesting(null);
  });

  it('edits content and category and bumps updatedAt', async () => {
    const t = await repo().create({ content: 'draft', category: null }, 1_760_000_000_000);
    const u = await repo().update(t.id, { content: 'final', category: 'idea' }, 1_760_000_005_000);
    expect(u).toMatchObject({ id: t.id, content: 'final', category: 'idea', createdAt: t.createdAt });
    expect(u.updatedAt).toBe(1_760_000_005_000);
    expect((await db.thoughts.get(t.id))?.content).toBe('final');
  });

  it('deletes a thought', async () => {
    const t = await repo().create({ content: 'gone soon', category: null });
    await repo().remove(t.id);
    expect(await db.thoughts.get(t.id)).toBeUndefined();
  });

  it('rejects empty or oversized content without writing', async () => {
    await expect(repo().create({ content: '   ', category: null })).rejects.toBeInstanceOf(StorageError);
    await expect(repo().create({ content: 'x'.repeat(2001), category: null })).rejects.toThrow(/2000/);
    expect(await db.thoughts.count()).toBe(0);
  });

  it('rejects editing a thought that no longer exists', async () => {
    await expect(repo().update('missing', { content: 'x', category: null })).rejects.toThrow(/no longer exists/);
  });

  it('lists newest first', async () => {
    await repo().create({ content: 'old', category: null }, 1_760_000_000_000);
    await repo().create({ content: 'new', category: null }, 1_760_000_100_000);
    expect((await repo().list()).map((t) => t.content)).toEqual(['new', 'old']);
  });

  it('stores user text verbatim (it is rendered as text, never HTML)', async () => {
    const payload = '<img src=x onerror="alert(1)">';
    const t = await repo().create({ content: payload, category: null });
    expect((await db.thoughts.get(t.id))?.content).toBe(payload);
  });
});

describe('filterThoughts', () => {
  const base = { createdAt: 1, updatedAt: 1 };
  const list = [
    { ...base, id: 'a', content: 'Call the dentist', category: 'task' as const },
    { ...base, id: 'b', content: 'A song about rain', category: 'idea' as const },
  ];
  it('matches all terms case-insensitively, including category', () => {
    expect(filterThoughts(list, 'DENTIST').map((t) => t.id)).toEqual(['a']);
    expect(filterThoughts(list, 'idea rain').map((t) => t.id)).toEqual(['b']);
    expect(filterThoughts(list, 'rain dentist')).toEqual([]);
    expect(filterThoughts(list, '  ')).toHaveLength(2);
  });
});

describe('focus sessions repository', () => {
  const s: FocusSession = {
    id: 'sess-1',
    plannedDurationSeconds: 1500,
    actualFocusedSeconds: 1500,
    startedAt: 1_760_000_000_000,
    endedAt: 1_760_001_500_000,
    status: 'completed',
  };

  it('records idempotently by session id', async () => {
    const r = createFocusSessionsRepository(() => db);
    await r.record(s);
    await r.record(s);
    expect(await db.focusSessions.count()).toBe(1);
  });

  it('refuses inconsistent records (a "completed" session that was cut short)', async () => {
    const r = createFocusSessionsRepository(() => db);
    await expect(r.record({ ...s, actualFocusedSeconds: 100 })).rejects.toBeInstanceOf(StorageError);
  });
});

describe('preferences repository', () => {
  it('keeps mode shortcuts enabled for older settings and persists an opt-out', async () => {
    expect(normalizePreferences({ soundEnabled: true }).modeShortcutsEnabled).toBe(true);
    expect(normalizePreferences({ modeShortcutsEnabled: 'false' }).modeShortcutsEnabled).toBe(true);
    const r = createPreferencesRepository(() => db);
    await r.save({ ...DEFAULT_PREFERENCES, modeShortcutsEnabled: false });
    expect((await r.load()).modeShortcutsEnabled).toBe(false);
    expect((await db.preferences.get('preferences'))?.modeShortcutsEnabled).toBe(false);
  });

  it('returns defaults when nothing is stored, then round-trips', async () => {
    const r = createPreferencesRepository(() => db);
    expect(await r.load()).toEqual(DEFAULT_PREFERENCES);
    await r.save({ ...DEFAULT_PREFERENCES, soundEnabled: true, volume: 0.3 });
    expect(await r.load()).toMatchObject({ soundEnabled: true, volume: 0.3 });
  });

  it('drops invalid fields individually', () => {
    expect(normalizePreferences({ volume: 7, soundEnabled: true, graphicsQuality: 'ultra' })).toEqual({
      ...DEFAULT_PREFERENCES,
      soundEnabled: true,
    });
  });
});

describe('storage error mapping', () => {
  it('maps quota errors to a clear message', () => {
    const e = toStorageError({ name: 'QuotaExceededError' });
    expect(e.kind).toBe('quota');
    expect(e.message).toMatch(/out of storage/);
  });
  it('maps Dexie-wrapped quota errors', () => {
    expect(toStorageError({ name: 'AbortError', inner: { name: 'QuotaExceededError' } }).kind).toBe('quota');
  });
});
