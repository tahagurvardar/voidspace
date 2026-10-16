'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Search, Sparkle, Wind } from 'lucide-react';
import type { ThoughtCategory } from '@/types';
import { thoughtsRepository, filterThoughts } from '@/lib/storage/thoughtsRepository';
import { THOUGHT_MAX_LENGTH } from '@/lib/validation/schemas';
import { soundEngine } from '@/lib/audio/soundEngine';
import { emitCoreSignal } from '@/store/coreStore';
import { useAppStore } from '@/store/appStore';
import { useThoughts } from '@/hooks/useLiveData';
import { CategoryPicker } from './CategoryPicker';
import { ThoughtList } from './ThoughtList';

const DISSOLVE_MS = 900;

/**
 * CLEAR — write a thought, then either save it or release it.
 *
 * Semantics:
 * - Save: validated and written to IndexedDB, then acknowledged by the Core.
 * - Release: the draft is discarded. It is never written anywhere — not to the
 *   database, not to a draft cache. Only an animation of the words remains.
 * - Delete (in the list): removes an already-saved thought, after confirmation.
 */
export function ClearPanel() {
  const [content, setContent] = useState('');
  const [category, setCategory] = useState<ThoughtCategory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dissolving, setDissolving] = useState<{ text: string; key: number } | null>(null);
  const [starKey, setStarKey] = useState(0);
  const [announcement, setAnnouncement] = useState('');
  const [query, setQuery] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const toast = useAppStore((s) => s.toast);
  const thoughts = useThoughts();
  const fieldId = useId();
  const hintId = useId();
  const errorId = useId();
  const searchId = useId();

  useEffect(() => {
    if (!dissolving) return;
    const t = window.setTimeout(() => setDissolving(null), DISSOLVE_MS);
    return () => window.clearTimeout(t);
  }, [dissolving]);

  const trimmed = content.trim();
  const remaining = THOUGHT_MAX_LENGTH - content.length;

  const save = async () => {
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      await thoughtsRepository.create({ content, category });
      setContent('');
      setCategory(null);
      setStarKey((k) => k + 1);
      setAnnouncement('Thought saved.');
      emitCoreSignal('save');
      soundEngine.play('save');
    } catch (e) {
      // Keep the text so nothing the user wrote is lost on a failed save.
      const message = e instanceof Error ? e.message : 'Could not save the thought.';
      setError(message);
      toast(message, 'error');
    } finally {
      setBusy(false);
      textareaRef.current?.focus();
    }
  };

  const release = () => {
    if (!trimmed) return;
    setDissolving({ text: content, key: Date.now() });
    setContent('');
    setCategory(null);
    setError(null);
    setAnnouncement('Released. Nothing was saved.');
    emitCoreSignal('release');
    soundEngine.play('release');
    textareaRef.current?.focus();
  };

  const list = thoughts.status === 'ready' ? filterThoughts(thoughts.data, query) : [];

  return (
    <div className="flex flex-col gap-10">
      <section aria-label="Write a thought">
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <label id={`${fieldId}-label`} htmlFor={fieldId} className="text-sm text-ink-muted">
            What&apos;s on your mind?
          </label>
          <div className="vs-composer">
          <div className="relative">
            <textarea
              id={fieldId}
              ref={textareaRef}
              className="block min-h-32 w-full resize-y bg-transparent px-4 pt-3.5 pb-3 text-base leading-relaxed text-ink outline-none placeholder:text-ink-faint lg:min-h-36"
              placeholder="Write it down. Nothing leaves this device."
              value={content}
              maxLength={THOUGHT_MAX_LENGTH}
              onChange={(e) => {
                setContent(e.target.value);
                if (error) setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void save();
                }
              }}
              aria-invalid={!!error}
              aria-describedby={[hintId, error ? errorId : ''].filter(Boolean).join(' ')}
              data-testid="thought-input"
            />
            {dissolving && (
              <div
                key={dissolving.key}
                className="thought-dissolve pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words px-4 pt-3.5 pb-3 text-base leading-relaxed text-violet-soft"
                aria-hidden="true"
                data-testid="dissolve"
              >
                {dissolving.text}
              </div>
            )}
            {starKey > 0 && (
              <span
                key={starKey}
                className="star-rise pointer-events-none absolute left-1/2 top-2 text-violet-soft"
                aria-hidden="true"
              >
                <Sparkle size={22} fill="currentColor" />
              </span>
            )}
          </div>

          <div className="flex flex-col gap-3 border-t border-line/70 px-3 py-3 sm:flex-row sm:items-end sm:justify-between sm:px-4">
            <CategoryPicker value={category} onChange={setCategory} legend="Category (optional)" />
            <div className="flex shrink-0 gap-2 self-end">
              <button
                type="button"
                className="vs-btn vs-btn-ghost"
                onClick={release}
                disabled={!trimmed}
                aria-describedby={hintId}
              >
                <Wind size={16} aria-hidden="true" />
                Release
              </button>
              <button type="submit" className="vs-btn vs-btn-primary" disabled={!trimmed || busy}>
                <Sparkle size={16} aria-hidden="true" />
                Save thought
              </button>
            </div>
          </div>
          </div>

          <p id={hintId} className="text-xs text-ink-faint">
            Save keeps it in your archive. Release lets it go without storing it anywhere.
            {remaining <= 200 && <span className="ml-1 text-ink-muted">{remaining} characters left.</span>}
          </p>
          {error && (
            <p id={errorId} role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <p className="sr-only" role="status" aria-live="polite">
            {announcement}
          </p>
        </form>
      </section>

      <section aria-labelledby={`${searchId}-heading`} className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id={`${searchId}-heading`} className="text-sm font-medium text-ink">
            Saved thoughts
            {thoughts.status === 'ready' && <span className="ml-2 text-ink-faint">{thoughts.data.length}</span>}
          </h2>
          <div className="relative w-full sm:w-64">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" aria-hidden="true" />
            <label htmlFor={searchId} className="sr-only">
              Search saved thoughts
            </label>
            <input
              id={searchId}
              type="search"
              className="vs-input !py-2 pl-9 text-sm"
              placeholder="Search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
        {thoughts.status === 'loading' && <p className="text-sm text-ink-muted">Loading…</p>}
        {thoughts.status === 'error' && (
          <p role="alert" className="text-sm text-danger">
            {thoughts.message}
          </p>
        )}
        {thoughts.status === 'ready' && (
          <ThoughtList
            thoughts={list}
            label="Saved thoughts"
            emptyMessage={
              query.trim()
                ? 'No saved thoughts match that search.'
                : 'Nothing saved yet. Thoughts you save appear here and in the archive.'
            }
          />
        )}
      </section>
    </div>
  );
}
