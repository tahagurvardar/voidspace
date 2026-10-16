'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { List, Network, Pencil, Search, Trash2 } from 'lucide-react';
import type { Thought } from '@/types';
import { filterThoughts, thoughtsRepository } from '@/lib/storage/thoughtsRepository';
import { formatDateTime, formatDuration } from '@/lib/utils/time';
import { useAppStore } from '@/store/appStore';
import { useFocusSessions, useThoughts } from '@/hooks/useLiveData';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { categoryMeta } from '@/features/clear/categories';
import { CategoryDot } from '@/features/clear/CategoryPicker';
import { ThoughtEditForm } from '@/features/clear/ThoughtEditForm';
import { ThoughtList } from '@/features/clear/ThoughtList';
import { computeFocusStats } from '@/features/focus/stats';
import { SessionList } from '@/features/focus/SessionList';
import { Constellation } from './Constellation';

type View = 'constellation' | 'list';
const VIEW_KEY = 'voidspace.archive.view';

function readView(): View {
  try {
    return window.localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'constellation';
  } catch {
    return 'constellation';
  }
}

function SelectedThought({ thought, onDeleted }: { thought: Thought; onDeleted: () => void }) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const toast = useAppStore((s) => s.toast);
  const reducedMotion = useReducedMotion();
  const ref = useRef<HTMLElement>(null);
  const meta = categoryMeta(thought.category);

  // Bring the note fully into view when it is selected (or switched to editing).
  useEffect(() => {
    ref.current?.scrollIntoView?.({ block: 'nearest', behavior: reducedMotion ? 'auto' : 'smooth' });
  }, [editing, reducedMotion]);

  return (
    <article
      ref={ref}
      className="vs-surface scroll-mb-6 border-l-2 p-5"
      style={{ borderLeftColor: meta.color }}
      aria-label="Selected thought"
      data-testid="selected-thought"
    >
      {editing ? (
        <ThoughtEditForm key={thought.id} thought={thought} onDone={() => setEditing(false)} />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <p className="flex items-center gap-2 text-xs text-ink-muted">
              <CategoryDot color={meta.color} />
              {meta.id ? meta.label : 'Uncategorised'}
              <span aria-hidden="true" className="text-ink-faint">
                /
              </span>
              <time dateTime={new Date(thought.createdAt).toISOString()}>{formatDateTime(thought.createdAt)}</time>
              {thought.updatedAt > thought.createdAt && <span className="text-ink-faint">(edited)</span>}
            </p>
            <div className="-my-1 flex gap-1.5">
              <button type="button" className="vs-btn vs-btn-ghost !min-h-9 !px-3" onClick={() => setEditing(true)}>
                <Pencil size={14} aria-hidden="true" />
                Edit
              </button>
              <button
                type="button"
                className="vs-btn vs-btn-ghost !min-h-9 !px-3 hover:!text-danger"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 size={14} aria-hidden="true" />
                Delete
              </button>
            </div>
          </div>
          <p className="mt-3 whitespace-pre-wrap break-words text-base leading-relaxed text-ink">{thought.content}</p>
        </>
      )}
      <ConfirmDialog
        open={confirmDelete}
        title="Delete this thought?"
        description="It will be removed from this device permanently. This can't be undone."
        confirmLabel="Delete thought"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          try {
            await thoughtsRepository.remove(thought.id);
            toast('Thought deleted.');
            onDeleted();
          } catch (e) {
            toast(e instanceof Error ? e.message : 'Could not delete the thought.', 'error');
          }
          setConfirmDelete(false);
        }}
      />
    </article>
  );
}

export function ArchivePanel() {
  const thoughts = useThoughts();
  const sessions = useFocusSessions();
  // Only rendered on the client (the server always renders the start screen).
  const [view, setView] = useState<View>(readView);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(() => useAppStore.getState().archiveFocusId);
  const consumeArchiveFocus = useAppStore((s) => s.consumeArchiveFocus);
  const searchId = useId();
  const historyId = useId();
  const [sessionLimit, setSessionLimit] = useState(10);

  // The pending "show in archive" request has been taken into initial state; clear it.
  useEffect(() => {
    consumeArchiveFocus();
  }, [consumeArchiveFocus]);

  const changeView = (v: View) => {
    setView(v);
    try {
      window.localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* preference only */
    }
  };

  const all = useMemo(() => (thoughts.status === 'ready' ? thoughts.data : []), [thoughts]);
  const filtered = useMemo(() => filterThoughts(all, query), [all, query]);
  const matches = useMemo(() => new Set(filtered.map((t) => t.id)), [filtered]);
  const selected = selectedId ? all.find((t) => t.id === selectedId) : undefined;
  const stats = sessions.status === 'ready' ? computeFocusStats(sessions.data) : null;

  return (
    <div className="flex flex-col gap-10">
      <section aria-labelledby={`${searchId}-h`} className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id={`${searchId}-h`} className="text-sm font-medium text-ink">
            Thoughts
            {thoughts.status === 'ready' && <span className="ml-2 text-ink-faint">{all.length}</span>}
          </h2>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <div className="relative min-w-0 flex-1 sm:w-56">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" aria-hidden="true" />
              <label htmlFor={searchId} className="sr-only">
                Search the archive
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
            <div role="group" aria-label="Archive view" className="vs-segment">
              <button type="button" aria-pressed={view === 'constellation'} onClick={() => changeView('constellation')}>
                <Network size={15} aria-hidden="true" />
                Constellation
              </button>
              <button type="button" aria-pressed={view === 'list'} onClick={() => changeView('list')}>
                <List size={15} aria-hidden="true" />
                List
              </button>
            </div>
          </div>
        </div>

        {thoughts.status === 'loading' && <p className="text-sm text-ink-muted">Loading…</p>}
        {thoughts.status === 'error' && (
          <p role="alert" className="text-sm text-danger">
            {thoughts.message}
          </p>
        )}

        {thoughts.status === 'ready' && all.length === 0 && (
          <p className="rounded-xl border border-dashed border-line px-4 py-10 text-center text-sm text-ink-muted">
            Your archive is empty. Every thought you save in Clear becomes a star here.
          </p>
        )}

        {thoughts.status === 'ready' && all.length > 0 && view === 'constellation' && (
          <>
            <p className="text-xs text-ink-faint">
              Each star is a saved thought; lines join thoughts of the same category in the order you wrote them.
              {query.trim() && ` ${filtered.length} of ${all.length} match.`}
            </p>
            <Constellation thoughts={all} matches={matches} selectedId={selectedId} onSelect={setSelectedId} />
            {selected ? (
              <SelectedThought key={selected.id} thought={selected} onDeleted={() => setSelectedId(null)} />
            ) : (
              <p className="text-sm text-ink-muted">Select a star to read the thought.</p>
            )}
          </>
        )}

        {thoughts.status === 'ready' && all.length > 0 && view === 'list' && (
          <ThoughtList thoughts={filtered} label="Archived thoughts" emptyMessage="No thoughts match that search." />
        )}
      </section>

      <section aria-labelledby={historyId} className="flex flex-col gap-4">
        <h2 id={historyId} className="text-sm font-medium text-ink">
          Focus history
        </h2>
        {stats && (
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ['Completed time', formatDuration(stats.completedSeconds)],
              ['Completed', String(stats.completedCount)],
              ['Canceled', String(stats.canceledCount)],
              ['Interrupted', String(stats.interruptedCount)],
            ].map(([label, value]) => (
              <div key={label} className="vs-surface px-4 py-3">
                <dt className="text-xs text-ink-muted">{label}</dt>
                <dd className="mt-1 text-lg tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
        )}
        {stats && stats.totalFocusedSeconds > stats.completedSeconds && (
          <p className="text-xs text-ink-faint">
            Including partial sessions, you have focused for {formatDuration(stats.totalFocusedSeconds)}.
          </p>
        )}
        {sessions.status === 'ready' && (
          <>
            <SessionList sessions={sessions.data.slice(0, sessionLimit)} />
            {sessions.data.length > sessionLimit && (
              <button type="button" className="vs-btn vs-btn-quiet self-center" onClick={() => setSessionLimit((l) => l + 20)}>
                Show more sessions
              </button>
            )}
          </>
        )}
        {sessions.status === 'error' && (
          <p role="alert" className="text-sm text-danger">
            {sessions.message}
          </p>
        )}
      </section>
    </div>
  );
}
