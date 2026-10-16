'use client';

import { X } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { cn } from '@/lib/utils/cn';

/** Polite live region for confirmations; errors use an assertive alert role. */
export function Toasts() {
  const toasts = useAppStore((s) => s.toasts);
  const dismiss = useAppStore((s) => s.dismissToast);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-50 flex flex-col items-center gap-2 px-4" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.tone === 'error' ? 'alert' : 'status'}
          className={cn(
            'pointer-events-auto flex max-w-md items-start gap-3 rounded-xl border px-4 py-2.5 text-sm shadow-lg backdrop-blur-md',
            t.tone === 'error' && 'border-danger/40 bg-[#2a1220]/90 text-[#ffd6df]',
            t.tone === 'success' && 'border-violet/40 bg-surface/90 text-ink',
            t.tone === 'info' && 'border-line bg-surface/90 text-ink',
          )}
        >
          <span className="pt-0.5">{t.message}</span>
          <button
            type="button"
            className="-mr-1 rounded p-0.5 text-ink-muted hover:text-ink"
            aria-label="Dismiss notification"
            onClick={() => dismiss(t.id)}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  );
}
