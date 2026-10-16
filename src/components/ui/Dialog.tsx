'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  /** Element to focus on open; defaults to the first focusable control. */
  initialFocusRef?: React.RefObject<HTMLElement | null>;
}

/**
 * Modal built on the native <dialog> element: the browser provides the focus
 * trap, inert background and Escape handling. Focus returns to the opener on close.
 */
export function Dialog({ open, onClose, title, description, children, className, initialFocusRef }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();
  const opener = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.hasAttribute('open')) {
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
      const target = initialFocusRef?.current;
      if (target) target.focus();
    } else if (!open && dialog.hasAttribute('open')) {
      dialog.close();
    }
  }, [open, initialFocusRef]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const handleClose = () => {
      opener.current?.focus?.();
      onCloseRef.current();
    };
    const handleCancel = (e: Event) => {
      e.preventDefault();
      dialog.close();
    };
    dialog.addEventListener('close', handleClose);
    dialog.addEventListener('cancel', handleCancel);
    return () => {
      dialog.removeEventListener('close', handleClose);
      dialog.removeEventListener('cancel', handleCancel);
    };
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      className={cn(
        'm-auto w-[min(100vw-2rem,32rem)] max-h-[min(100dvh-2rem,48rem)] overflow-hidden rounded-2xl border border-line bg-panel p-0 text-ink shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)]',
        className,
      )}
      onClick={(e) => {
        // Click on the backdrop (the dialog element itself, outside the content) closes.
        if (e.target === ref.current) ref.current?.close();
      }}
    >
      {open && (
        <div className="vs-scroll flex max-h-[inherit] flex-col overflow-y-auto">
          <header className="flex items-start justify-between gap-4 px-6 pt-5 pb-3">
            <div>
              <h2 id={titleId} className="text-lg font-semibold tracking-tight">
                {title}
              </h2>
              {description && (
                <p id={descId} className="mt-1 text-sm text-ink-muted">
                  {description}
                </p>
              )}
            </div>
            <button type="button" className="vs-icon-btn -mr-2 shrink-0" aria-label="Close" onClick={() => ref.current?.close()}>
              <X size={18} aria-hidden="true" />
            </button>
          </header>
          <div className="px-6 pb-6">{children}</div>
        </div>
      )}
    </dialog>
  );
}

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  tone?: 'danger' | 'default';
  busy?: boolean;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  onConfirm,
  onCancel,
  tone = 'danger',
  busy,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  return (
    <Dialog open={open} onClose={onCancel} title={title} description={description} initialFocusRef={cancelRef}>
      <div className="mt-2 flex flex-wrap justify-end gap-2">
        <button ref={cancelRef} type="button" className="vs-btn vs-btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className={cn('vs-btn', tone === 'danger' ? 'vs-btn-danger' : 'vs-btn-primary')}
          onClick={() => void onConfirm()}
          disabled={busy}
        >
          {confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}
