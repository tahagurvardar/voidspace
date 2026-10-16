'use client';

import { useEffect, useId, useState } from 'react';
import { Pause, Play, RotateCcw, Check } from 'lucide-react';
import { focusMinutesSchema, firstIssueMessage } from '@/lib/validation/schemas';
import { formatClock, formatDuration } from '@/lib/utils/time';
import { usePreferencesStore } from '@/store/preferencesStore';
import { useFocusSessions } from '@/hooks/useLiveData';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { cn } from '@/lib/utils/cn';
import { focusStore, useFocus } from './focusInstance';
import { elapsedMs, progress, remainingMs } from './timerMachine';
import { computeFocusStats } from './stats';
import { SessionList } from './SessionList';

const PRESETS = [15, 25, 50] as const;

/** Re-render every `ms` while `active`, to show time derived from timestamps. */
function useNow(active: boolean, ms = 250): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(id);
  }, [active, ms]);
  return now;
}

const STATUS_LABEL = {
  idle: 'Ready',
  running: 'Focusing',
  paused: 'Paused',
  completed: 'Complete',
} as const;

export function FocusPanel() {
  const timer = useFocus((s) => s.timer);
  const hydrated = useFocus((s) => s.hydrated);
  const prefs = usePreferencesStore((s) => s.prefs);
  const updatePrefs = usePreferencesStore((s) => s.update);
  const sessions = useFocusSessions();
  const now = useNow(timer.status === 'running');
  const [customOpen, setCustomOpen] = useState(false);
  const [customValue, setCustomValue] = useState('');
  const [customError, setCustomError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const groupId = useId();
  const customId = useId();
  const chimeId = useId();

  const plannedMinutes = timer.plannedSeconds / 60;
  const isPreset = (PRESETS as readonly number[]).includes(plannedMinutes);
  const editable = timer.status === 'idle' || timer.status === 'completed';
  const remaining = remainingMs(timer, now);
  const pct = progress(timer, now);
  const actions = focusStore.getState();

  const stats = sessions.status === 'ready' ? computeFocusStats(sessions.data, now) : null;

  const applyCustom = () => {
    const parsed = focusMinutesSchema.safeParse(customValue);
    if (!parsed.success) {
      setCustomError(firstIssueMessage(parsed.error));
      return;
    }
    setCustomError(null);
    actions.setPlannedMinutes(parsed.data);
  };

  const requestReset = () => {
    // Confirm before discarding more than a minute of focus.
    if (elapsedMs(timer, Date.now()) > 60_000) setConfirmReset(true);
    else actions.reset();
  };

  // SVG progress ring geometry.
  const R = 46;
  const C = 2 * Math.PI * R;

  return (
    <div className="grid gap-10 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] xl:items-start xl:gap-12">
      <section aria-label="Focus timer" className="flex flex-col items-center gap-6 text-center xl:pt-2">
        <div className="relative grid size-[clamp(12rem,34dvh,16.5rem)] place-items-center">
          <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90" aria-hidden="true">
            <circle cx="50" cy="50" r={R} fill="none" stroke="var(--color-line)" strokeWidth="1.5" />
            <circle
              cx="50"
              cy="50"
              r={R}
              fill="none"
              stroke="url(#focus-grad)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={C * (1 - pct)}
              style={{ transition: 'stroke-dashoffset 300ms linear' }}
            />
            <defs>
              <linearGradient id="focus-grad" x1="0" x2="1">
                <stop offset="0" stopColor="#8e7cf6" />
                <stop offset="1" stopColor="#6f8bff" />
              </linearGradient>
            </defs>
          </svg>
          <div>
            <p
              className="text-5xl font-light tabular-nums tracking-tight text-ink sm:text-6xl"
              role="timer"
              aria-live="off"
              aria-label={`Remaining time ${formatClock(remaining)}`}
              data-testid="focus-remaining"
            >
              {hydrated ? formatClock(remaining) : '--:--'}
            </p>
            <p className="mt-2 text-sm text-ink-muted" data-testid="focus-status">
              {STATUS_LABEL[timer.status]}
              {timer.status !== 'idle' && timer.status !== 'completed' && `, ${plannedMinutes} min session`}
            </p>
          </div>
        </div>

        {/* Screen-reader announcement only on state changes, not every second. */}
        <p className="sr-only" role="status" aria-live="polite">
          {timer.status === 'completed'
            ? `Session complete. ${formatDuration(timer.session.actualFocusedSeconds)} focused.`
            : timer.status === 'paused'
              ? 'Timer paused.'
              : timer.status === 'running'
                ? 'Timer running.'
                : ''}
        </p>

        {timer.status === 'completed' ? (
          <div className="flex flex-col items-center gap-4">
            <p className="text-ink">
              You focused for {formatDuration(timer.session.actualFocusedSeconds)}. It&apos;s in your history.
            </p>
            <div className="flex gap-2">
              <button type="button" className="vs-btn vs-btn-ghost" onClick={actions.dismiss}>
                <Check size={16} aria-hidden="true" />
                Done
              </button>
              <button type="button" className="vs-btn vs-btn-primary" onClick={actions.start}>
                <Play size={16} aria-hidden="true" />
                Start another
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap justify-center gap-2">
            {timer.status === 'idle' && (
              <button type="button" className="vs-btn vs-btn-primary min-w-32" onClick={actions.start} disabled={!hydrated}>
                <Play size={16} aria-hidden="true" />
                Start
              </button>
            )}
            {timer.status === 'running' && (
              <button type="button" className="vs-btn vs-btn-primary min-w-32" onClick={actions.pause}>
                <Pause size={16} aria-hidden="true" />
                Pause
              </button>
            )}
            {timer.status === 'paused' && (
              <button type="button" className="vs-btn vs-btn-primary min-w-32" onClick={actions.resume}>
                <Play size={16} aria-hidden="true" />
                Resume
              </button>
            )}
            {(timer.status === 'running' || timer.status === 'paused') && (
              <button type="button" className="vs-btn vs-btn-ghost" onClick={requestReset}>
                <RotateCcw size={16} aria-hidden="true" />
                Reset
              </button>
            )}
          </div>
        )}

        <fieldset className="flex flex-col items-center gap-3" disabled={!editable}>
          <legend id={groupId} className="mx-auto mb-3 text-xs text-ink-muted">
            Session length
          </legend>
          <div className="vs-segment" role="group" aria-labelledby={groupId}>
            {PRESETS.map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={!customOpen && plannedMinutes === m}
                onClick={() => {
                  setCustomOpen(false);
                  setCustomError(null);
                  actions.setPlannedMinutes(m);
                }}
              >
                {m} min
              </button>
            ))}
            <button
              type="button"
              aria-pressed={customOpen || !isPreset}
              onClick={() => {
                setCustomOpen(true);
                setCustomValue(String(plannedMinutes));
              }}
            >
              {isPreset ? 'Custom' : `${plannedMinutes} min`}
            </button>
          </div>
          {customOpen && editable && (
            <form
              className="flex items-start gap-2"
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                applyCustom();
              }}
            >
              <div>
                <label htmlFor={customId} className="sr-only">
                  Custom length in minutes
                </label>
                <input
                  id={customId}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={180}
                  step={1}
                  className="vs-input w-28 !py-2 text-center"
                  value={customValue}
                  onChange={(e) => setCustomValue(e.target.value)}
                  aria-invalid={!!customError}
                  aria-describedby={customError ? `${customId}-err` : undefined}
                />
                {customError && (
                  <p id={`${customId}-err`} role="alert" className="mt-1 text-xs text-danger">
                    {customError}
                  </p>
                )}
              </div>
              <button type="submit" className="vs-btn vs-btn-ghost">
                Set minutes
              </button>
            </form>
          )}
        </fieldset>

        <div className="flex items-center gap-2 text-sm text-ink-muted">
          <input
            id={chimeId}
            type="checkbox"
            className="size-4 accent-violet"
            checked={prefs.focusChime}
            onChange={(e) => void updatePrefs({ focusChime: e.target.checked }).catch(() => {})}
          />
          <label htmlFor={chimeId}>Play a chime when a session ends</label>
          {prefs.focusChime && !prefs.soundEnabled && <span className="text-xs text-ink-faint">(sound is off)</span>}
        </div>
      </section>

      <section aria-labelledby={`${groupId}-history`} className="flex flex-col gap-3">
        <h2 id={`${groupId}-history`} className="text-sm font-medium text-ink">
          Your focus
        </h2>
        {stats && (
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-2">
            <div className="vs-surface px-4 py-3">
              <dt className="text-xs text-ink-muted">Today</dt>
              <dd className="mt-1 text-lg tabular-nums" data-testid="stat-today">
                {formatDuration(stats.todayCompletedSeconds)}
              </dd>
            </div>
            <div className="vs-surface px-4 py-3">
              <dt className="text-xs text-ink-muted">All completed</dt>
              <dd className="mt-1 text-lg tabular-nums" data-testid="stat-total">
                {formatDuration(stats.completedSeconds)}
              </dd>
            </div>
            <div className={cn('vs-surface px-4 py-3', 'col-span-2 sm:col-span-1 xl:col-span-2')}>
              <dt className="text-xs text-ink-muted">Sessions completed</dt>
              <dd className="mt-1 text-lg tabular-nums" data-testid="stat-count">
                {stats.completedCount}
              </dd>
            </div>
          </dl>
        )}
        {sessions.status === 'ready' && <SessionList sessions={sessions.data.slice(0, 5)} />}
        {sessions.status === 'error' && (
          <p role="alert" className="text-sm text-danger">
            {sessions.message}
          </p>
        )}
      </section>

      <ConfirmDialog
        open={confirmReset}
        title="Reset this session?"
        description="The session ends now and is saved as canceled. Only the time you've already focused is recorded."
        confirmLabel="Reset session"
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          actions.reset();
          setConfirmReset(false);
        }}
      />
    </div>
  );
}
