import type { FocusSession, FocusSessionStatus } from '@/types';
import { formatDateTime, formatDuration } from '@/lib/utils/time';
import { cn } from '@/lib/utils/cn';

const STATUS: Record<FocusSessionStatus, { label: string; className: string }> = {
  completed: { label: 'Completed', className: 'text-success border-success/30' },
  canceled: { label: 'Canceled', className: 'text-ink-muted border-line-strong' },
  interrupted: { label: 'Interrupted', className: 'text-[#f2c38b] border-[#f2c38b]/30' },
};

export function SessionList({ sessions }: { sessions: readonly FocusSession[] }) {
  if (sessions.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-ink-muted">
        No sessions yet. Finished, canceled and interrupted sessions appear here.
      </p>
    );
  }
  return (
    <ul className="flex flex-col divide-y divide-line/60 rounded-xl border border-line/70" aria-label="Focus sessions">
      {sessions.map((s) => {
        const st = STATUS[s.status];
        return (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2.5 text-sm" data-testid="session-item">
            <span className="text-ink">
              {s.status === 'completed'
                ? formatDuration(s.actualFocusedSeconds)
                : `${formatDuration(s.actualFocusedSeconds)} of ${formatDuration(s.plannedDurationSeconds)}`}
            </span>
            <span className="flex items-center gap-3">
              <time className="text-xs text-ink-faint" dateTime={new Date(s.startedAt).toISOString()}>
                {formatDateTime(s.startedAt)}
              </time>
              <span className={cn('rounded-full border px-2 py-0.5 text-xs', st.className)}>{st.label}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
