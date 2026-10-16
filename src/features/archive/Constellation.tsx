'use client';

import { useMemo, useRef, useState } from 'react';
import type { Thought } from '@/types';
import { formatDateTime } from '@/lib/utils/time';
import { cn } from '@/lib/utils/cn';
import { categoryMeta } from '@/features/clear/categories';
import { layoutConstellation } from './constellationLayout';

interface ConstellationProps {
  thoughts: readonly Thought[];
  /** Ids that match the current search; others are dimmed and skipped by the keyboard. */
  matches: ReadonlySet<string>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function preview(text: string, max: number): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine;
}

/**
 * Interactive star map of saved thoughts. Stars are real <button>s (focusable,
 * labelled), arranged with a roving tab index: Tab enters the map once, arrow
 * keys move between stars in the order they were written, Enter/Space opens one.
 * Hovering or focusing a star shows a short preview; the selected star is ringed
 * and its category's path through the sky is drawn brighter.
 */
export function Constellation({ thoughts, matches, selectedId, onSelect }: ConstellationProps) {
  const { nodes, edges } = useMemo(() => layoutConstellation(thoughts), [thoughts]);
  const byId = useMemo(() => new Map(thoughts.map((t) => [t.id, t])), [thoughts]);
  const nodePos = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const refs = useRef(new Map<string, HTMLButtonElement>());
  const [hoverId, setHoverId] = useState<string | null>(null);

  const navigable = nodes.filter((n) => matches.has(n.id));
  const tabStop = (selectedId && matches.has(selectedId) ? selectedId : navigable[navigable.length - 1]?.id) ?? null;
  const selectedCategory = selectedId ? (byId.get(selectedId)?.category ?? null) : null;
  const dense = nodes.length > 80;

  const move = (fromId: string, delta: number) => {
    const i = navigable.findIndex((n) => n.id === fromId);
    if (i < 0 || navigable.length === 0) return;
    const next = navigable[(i + delta + navigable.length) % navigable.length]!;
    onSelect(next.id);
    refs.current.get(next.id)?.focus();
  };

  const labelNode = hoverId ? nodePos.get(hoverId) : undefined;
  const labelThought = hoverId ? byId.get(hoverId) : undefined;

  return (
    <div
      className="relative aspect-[4/5] w-full overflow-hidden rounded-2xl border border-line bg-[radial-gradient(ellipse_at_50%_45%,#141b44_0%,#0b1029_45%,#080c19_80%)] sm:aspect-auto sm:h-[clamp(16rem,44dvh,30rem)]"
      data-testid="constellation"
      onPointerLeave={() => setHoverId(null)}
    >
      <svg className="pointer-events-none absolute inset-0 size-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {edges.map((e) => {
          const a = nodePos.get(e.from);
          const b = nodePos.get(e.to);
          if (!a || !b) return null;
          const lit = matches.has(e.from) && matches.has(e.to);
          const path = selectedCategory !== null && e.category === selectedCategory;
          const opacity = !lit ? 0.05 : path ? 0.75 : selectedCategory ? 0.14 : 0.28;
          return (
            <line
              key={`${e.from}-${e.to}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={categoryMeta(e.category).color}
              strokeOpacity={opacity}
              strokeWidth={path ? 1.5 : 1}
              strokeDasharray={path ? undefined : '2 3'}
              vectorEffect="non-scaling-stroke"
              style={{ transition: 'stroke-opacity 250ms' }}
            />
          );
        })}
      </svg>

      <div role="group" aria-label="Constellation of saved thoughts" className="absolute inset-0">
        {nodes.map((n) => {
          const t = byId.get(n.id)!;
          const meta = categoryMeta(n.category);
          const match = matches.has(n.id);
          const selected = selectedId === n.id;
          return (
            <button
              key={n.id}
              ref={(el) => {
                if (el) refs.current.set(n.id, el);
                else refs.current.delete(n.id);
              }}
              type="button"
              className={cn(
                'group absolute grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full outline-none transition-opacity duration-300 focus-visible:ring-2 focus-visible:ring-violet-soft',
                dense ? 'size-6' : 'size-8',
                selected && 'z-10',
              )}
              style={{ left: `${n.x}%`, top: `${n.y}%`, opacity: match ? 1 : 0.15 }}
              aria-label={`${meta.id ? `${meta.label}: ` : ''}${preview(t.content, 60)}, ${formatDateTime(t.createdAt)}`}
              aria-pressed={selected}
              aria-hidden={!match || undefined}
              tabIndex={match && n.id === tabStop ? 0 : -1}
              disabled={!match}
              data-testid="constellation-node"
              data-node-id={n.id}
              onClick={() => onSelect(n.id)}
              onPointerEnter={() => setHoverId(n.id)}
              onFocus={() => setHoverId(n.id)}
              onBlur={() => setHoverId((h) => (h === n.id ? null : h))}
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                  e.preventDefault();
                  move(n.id, 1);
                } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                  e.preventDefault();
                  move(n.id, -1);
                }
              }}
            >
              {selected && (
                <span
                  className="constellation-ring pointer-events-none absolute rounded-full border"
                  style={{
                    width: n.r * 2 + 16,
                    height: n.r * 2 + 16,
                    borderColor: `color-mix(in oklab, ${meta.color} 70%, transparent)`,
                  }}
                  aria-hidden="true"
                />
              )}
              <span
                className="block rounded-full transition-transform duration-200 ease-out group-hover:scale-125 group-focus-visible:scale-125"
                style={{
                  width: n.r * 2,
                  height: n.r * 2,
                  background: selected
                    ? `radial-gradient(circle at 40% 35%, #fff 0%, ${meta.color} 55%)`
                    : meta.color,
                  boxShadow: selected
                    ? `0 0 22px 6px color-mix(in oklab, ${meta.color} 55%, transparent)`
                    : `0 0 10px 1px color-mix(in oklab, ${meta.color} 45%, transparent)`,
                  transform: selected ? 'scale(1.35)' : undefined,
                }}
              />
            </button>
          );
        })}
      </div>

      {labelNode && labelThought && matches.has(labelNode.id) && (
        <div
          className={cn(
            'pointer-events-none absolute z-20 max-w-[min(16rem,60%)] rounded-lg border border-line-strong bg-panel/95 px-3 py-2 text-xs leading-snug shadow-[0_10px_30px_-10px_rgba(0,0,0,0.8)]',
            labelNode.x > 62 ? '-translate-x-full' : '',
            labelNode.y > 70 ? '-translate-y-full' : '',
          )}
          style={{
            left: `calc(${labelNode.x}% ${labelNode.x > 62 ? '- 1.1rem' : '+ 1.1rem'})`,
            top: `calc(${labelNode.y}% ${labelNode.y > 70 ? '- 0.6rem' : '+ 0.6rem'})`,
          }}
          aria-hidden="true"
          data-testid="constellation-preview"
        >
          <span className="block text-ink">{preview(labelThought.content, 72)}</span>
          <span className="mt-1 block text-ink-faint">
            {labelThought.category ? `${categoryMeta(labelThought.category).label}, ` : ''}
            {formatDateTime(labelThought.createdAt)}
          </span>
        </div>
      )}
    </div>
  );
}
