import type { FocusSession } from '@/types';
import { focusSessionSchema, firstIssueMessage } from '@/lib/validation/schemas';
import { getDb, type VoidspaceDB } from './db';
import { StorageError, guard } from './errors';

export function createFocusSessionsRepository(db: () => VoidspaceDB = getDb) {
  return {
    /**
     * Idempotent: records are keyed by the timer's session id, so recording the same
     * finished session twice (two tabs, or a retry after reload) never double counts.
     */
    async record(session: FocusSession): Promise<void> {
      const parsed = focusSessionSchema.safeParse(session);
      if (!parsed.success) throw new StorageError('validation', firstIssueMessage(parsed.error));
      await guard(() => db().focusSessions.put(parsed.data));
    },

    /** Newest first. */
    async list(): Promise<FocusSession[]> {
      return guard(() => db().focusSessions.orderBy('startedAt').reverse().toArray());
    },

    async remove(id: string): Promise<void> {
      await guard(() => db().focusSessions.delete(id));
    },
  };
}

export const focusSessionsRepository = createFocusSessionsRepository();
