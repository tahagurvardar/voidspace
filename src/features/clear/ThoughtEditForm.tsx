'use client';

import { useId, useState } from 'react';
import type { Thought, ThoughtCategory } from '@/types';
import { thoughtsRepository } from '@/lib/storage/thoughtsRepository';
import { THOUGHT_MAX_LENGTH } from '@/lib/validation/schemas';
import { useAppStore } from '@/store/appStore';
import { CategoryPicker } from './CategoryPicker';

/** Inline editor for an existing thought (used by Clear and Archive). */
export function ThoughtEditForm({
  thought,
  onDone,
  autoFocus = true,
}: {
  thought: Thought;
  onDone: (updated?: Thought) => void;
  autoFocus?: boolean;
}) {
  const [content, setContent] = useState(thought.content);
  const [category, setCategory] = useState<ThoughtCategory | null>(thought.category);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useAppStore((s) => s.toast);
  const fieldId = useId();
  const errorId = useId();

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const updated = await thoughtsRepository.update(thought.id, { content, category });
      toast('Changes saved.', 'success');
      onDone(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save changes.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          void submit();
        }
      }}
    >
      <label htmlFor={fieldId} className="text-xs text-ink-muted">
        Edit thought
      </label>
      <textarea
        id={fieldId}
        className="vs-input min-h-28 resize-y leading-relaxed"
        value={content}
        maxLength={THOUGHT_MAX_LENGTH}
        onChange={(e) => setContent(e.target.value)}
        aria-invalid={!!error}
        aria-describedby={error ? errorId : undefined}
        autoFocus={autoFocus}
      />
      <CategoryPicker value={category} onChange={setCategory} />
      {error && (
        <p id={errorId} role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className="vs-btn vs-btn-ghost" onClick={() => onDone()}>
          Cancel
        </button>
        <button type="submit" className="vs-btn vs-btn-primary" disabled={busy || !content.trim()}>
          Save changes
        </button>
      </div>
    </form>
  );
}
