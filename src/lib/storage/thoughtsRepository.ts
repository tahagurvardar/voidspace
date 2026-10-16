import type { Thought, ThoughtCategory } from '@/types';
import { createId } from '@/lib/utils/id';
import { thoughtCategorySchema, thoughtContentSchema, firstIssueMessage } from '@/lib/validation/schemas';
import { getDb, type VoidspaceDB } from './db';
import { StorageError, guard } from './errors';

export interface ThoughtInput {
  content: string;
  category: ThoughtCategory | null;
}

function validate(input: ThoughtInput): ThoughtInput {
  const content = thoughtContentSchema.safeParse(input.content);
  if (!content.success) throw new StorageError('validation', firstIssueMessage(content.error));
  const category = thoughtCategorySchema.safeParse(input.category);
  if (!category.success) throw new StorageError('validation', 'Unknown category.');
  return { content: content.data, category: category.data };
}

/**
 * Persistence for thoughts. The only module that writes the `thoughts` table
 * (besides backup import, which goes through its own validated transaction).
 */
export function createThoughtsRepository(db: () => VoidspaceDB = getDb) {
  return {
    async create(input: ThoughtInput, now: number = Date.now()): Promise<Thought> {
      const valid = validate(input);
      const thought: Thought = { id: createId(), ...valid, createdAt: now, updatedAt: now };
      await guard(() => db().thoughts.add(thought));
      return thought;
    },

    async update(id: string, input: ThoughtInput, now: number = Date.now()): Promise<Thought> {
      const valid = validate(input);
      return guard(() =>
        db().transaction('rw', db().thoughts, async () => {
          const existing = await db().thoughts.get(id);
          if (!existing) throw new StorageError('validation', 'That thought no longer exists.');
          const updated: Thought = { ...existing, ...valid, updatedAt: Math.max(now, existing.createdAt) };
          await db().thoughts.put(updated);
          return updated;
        }),
      );
    },

    async remove(id: string): Promise<void> {
      await guard(() => db().thoughts.delete(id));
    },

    async get(id: string): Promise<Thought | undefined> {
      return guard(() => db().thoughts.get(id));
    },

    /** Newest first. */
    async list(): Promise<Thought[]> {
      return guard(() => db().thoughts.orderBy('createdAt').reverse().toArray());
    },

    async count(): Promise<number> {
      return guard(() => db().thoughts.count());
    },
  };
}

export const thoughtsRepository = createThoughtsRepository();

/** Case-insensitive search over content and category name. Pure; used by Clear and Archive. */
export function filterThoughts(thoughts: readonly Thought[], query: string): Thought[] {
  const q = query.trim().toLocaleLowerCase();
  if (!q) return [...thoughts];
  const terms = q.split(/\s+/);
  return thoughts.filter((t) => {
    const haystack = `${t.content} ${t.category ?? ''}`.toLocaleLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}
