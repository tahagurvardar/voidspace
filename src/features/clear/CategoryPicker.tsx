'use client';

import { useId } from 'react';
import type { ThoughtCategory } from '@/types';
import { CATEGORY_OPTIONS } from './categories';

/** Native radio group (arrow keys move between options). */
export function CategoryPicker({
  value,
  onChange,
  legend = 'Category',
}: {
  value: ThoughtCategory | null;
  onChange: (value: ThoughtCategory | null) => void;
  legend?: string;
}) {
  const name = useId();
  return (
    <fieldset className="min-w-0">
      <legend className="mb-2 text-xs text-ink-muted">{legend}</legend>
      <div className="vs-segment flex-wrap">
        {CATEGORY_OPTIONS.map((c) => (
          <label key={c.label}>
            <input
              type="radio"
              className="sr-only"
              name={name}
              value={c.id ?? 'none'}
              checked={value === c.id}
              onChange={() => onChange(c.id)}
            />
            <span className="size-2 rounded-full" style={{ background: c.color }} aria-hidden="true" />
            {c.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function CategoryDot({ color, className = 'size-2' }: { color: string; className?: string }) {
  return <span className={`inline-block shrink-0 rounded-full ${className}`} style={{ background: color }} aria-hidden="true" />;
}
