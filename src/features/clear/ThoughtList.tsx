'use client';

import { useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import type { Thought } from '@/types';
import { thoughtsRepository } from '@/lib/storage/thoughtsRepository';
import { formatDateTime } from '@/lib/utils/time';
import { useAppStore } from '@/store/appStore';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { categoryMeta } from './categories';
import { CategoryDot } from './CategoryPicker';
import { ThoughtEditForm } from './ThoughtEditForm';

const PAGE = 30;

/** Accessible list of thoughts with inline edit and confirmed delete. */
export function ThoughtList({
  thoughts,
  emptyMessage,
  label,
}: {
  thoughts: readonly Thought[];
  emptyMessage: string;
  label: string;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Thought | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const toast = useAppStore((s) => s.toast);

  if (thoughts.length === 0) {
    return <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-ink-muted">{emptyMessage}</p>;
  }

  const visible = thoughts.slice(0, limit);

  return (
    <>
      <ul className="flex flex-col gap-2" aria-label={label}>
        {visible.map((t) => {
          const meta = categoryMeta(t.category);
          const editing = editingId === t.id;
          return (
            <li key={t.id} className="vs-surface px-4 py-3" data-testid="thought-item">
              {editing ? (
                <ThoughtEditForm thought={t} onDone={() => setEditingId(null)} />
              ) : (
                <div className="flex items-start gap-3">
                  <CategoryDot color={meta.color} className="mt-2 size-2" />
                  <div className="min-w-0 flex-1">
                    <p className="whitespace-pre-wrap break-words text-[0.9375rem] leading-relaxed text-ink">{t.content}</p>
                    <p className="mt-1.5 text-xs text-ink-faint">
                      {t.category ? `${meta.label}, ` : ''}
                      <time dateTime={new Date(t.createdAt).toISOString()}>{formatDateTime(t.createdAt)}</time>
                      {t.updatedAt > t.createdAt && ' (edited)'}
                    </p>
                  </div>
                  <div className="-mr-2 -mt-1 flex shrink-0">
                    <button
                      type="button"
                      className="vs-icon-btn"
                      aria-label={`Edit thought: ${t.content.slice(0, 40)}`}
                      onClick={() => setEditingId(t.id)}
                    >
                      <Pencil size={16} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="vs-icon-btn hover:!text-danger"
                      aria-label={`Delete thought: ${t.content.slice(0, 40)}`}
                      onClick={() => setPendingDelete(t)}
                    >
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {thoughts.length > limit && (
        <button type="button" className="vs-btn vs-btn-quiet mt-2 self-center" onClick={() => setLimit((l) => l + PAGE)}>
          Show {Math.min(PAGE, thoughts.length - limit)} more
        </button>
      )}
      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete this thought?"
        description="It will be removed from this device permanently. This can't be undone."
        confirmLabel="Delete thought"
        onCancel={() => setPendingDelete(null)}
        onConfirm={async () => {
          if (!pendingDelete) return;
          try {
            await thoughtsRepository.remove(pendingDelete.id);
            toast('Thought deleted.');
          } catch (e) {
            toast(e instanceof Error ? e.message : 'Could not delete the thought.', 'error');
          }
          setPendingDelete(null);
        }}
      />
    </>
  );
}
