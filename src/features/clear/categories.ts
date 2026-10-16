import type { ThoughtCategory } from '@/types';

export interface CategoryMeta {
  id: ThoughtCategory | null;
  label: string;
  /** CSS color (token) used for dots, nodes and chips. */
  color: string;
}

export const CATEGORY_OPTIONS: readonly CategoryMeta[] = [
  { id: null, label: 'None', color: 'var(--color-cat-none)' },
  { id: 'idea', label: 'Idea', color: 'var(--color-cat-idea)' },
  { id: 'task', label: 'Task', color: 'var(--color-cat-task)' },
  { id: 'feeling', label: 'Feeling', color: 'var(--color-cat-feeling)' },
  { id: 'note', label: 'Note', color: 'var(--color-cat-note)' },
];

export function categoryMeta(id: ThoughtCategory | null): CategoryMeta {
  return CATEGORY_OPTIONS.find((c) => c.id === id) ?? CATEGORY_OPTIONS[0]!;
}
