import type { Thought, ThoughtCategory } from '@/types';
import { hashString, seededRandom } from '@/lib/utils/hash';

export interface ConstellationNode {
  id: string;
  /** 0..100 (% of the field width). */
  x: number;
  /** 0..100 (% of the field height). */
  y: number;
  /** Visual radius in px — longer thoughts shine a little brighter; scaled to the collection size. */
  r: number;
  category: ThoughtCategory | null;
}

export interface ConstellationEdge {
  from: string;
  to: string;
  category: ThoughtCategory;
}

const MARGIN = 7;
/** Preferred minimum distance between stars, in % of the field. */
export const MIN_SPACING = 7;
const TRIES = 24;

/** The i-th candidate position for an id. Depends only on the id. */
function candidates(id: string): () => { x: number; y: number } {
  const rnd = seededRandom(hashString(id));
  return () => {
    // Weighted draws bias stars softly toward the middle band of the field.
    const x = (rnd() * 0.7 + rnd() * 0.3) * (100 - 2 * MARGIN) + MARGIN;
    const y = (rnd() * 0.6 + rnd() * 0.4) * (100 - 2 * MARGIN) + MARGIN;
    return { x, y };
  };
}

/** A star's preferred (first-choice) position, derived only from its random id — never from note text. */
export function nodePosition(id: string): { x: number; y: number } {
  return candidates(id)();
}

/** Stars are larger when there are few, smaller when there are many. */
export function collectionScale(count: number): number {
  return Math.min(1.5, Math.max(0.65, 1.5 - 0.15 * Math.log2(Math.max(1, count))));
}

export function nodeRadius(contentLength: number, scale = 1): number {
  return (3.5 + Math.min(4, Math.log2(1 + contentLength / 40))) * scale;
}

/**
 * Lays out thoughts as a constellation: one star per thought, and lines joining
 * thoughts of the same category in the order they were written.
 *
 * Placement is deterministic and stable: stars are placed oldest-first, each trying
 * its own id-seeded candidate positions until one keeps a comfortable distance from
 * the stars placed before it. A star therefore never moves when newer thoughts are
 * added, and editing text never moves anything.
 */
export function layoutConstellation(thoughts: readonly Thought[]): {
  nodes: ConstellationNode[];
  edges: ConstellationEdge[];
} {
  const chronological = [...thoughts].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  const scale = collectionScale(chronological.length);
  const placed: Array<{ x: number; y: number }> = [];
  const nodes: ConstellationNode[] = [];

  for (const t of chronological) {
    const next = candidates(t.id);
    let best = next();
    let bestGap = nearest(best, placed);
    for (let i = 1; i < TRIES && bestGap < MIN_SPACING; i++) {
      const c = next();
      const gap = nearest(c, placed);
      if (gap > bestGap) {
        best = c;
        bestGap = gap;
      }
    }
    placed.push(best);
    nodes.push({ id: t.id, x: best.x, y: best.y, r: nodeRadius(t.content.length, scale), category: t.category });
  }

  const edges: ConstellationEdge[] = [];
  const lastByCategory = new Map<ThoughtCategory, string>();
  for (const t of chronological) {
    if (!t.category) continue; // Uncategorised thoughts stay as lone stars.
    const prev = lastByCategory.get(t.category);
    if (prev) edges.push({ from: prev, to: t.id, category: t.category });
    lastByCategory.set(t.category, t.id);
  }
  return { nodes, edges };
}

function nearest(p: { x: number; y: number }, others: ReadonlyArray<{ x: number; y: number }>): number {
  let min = Infinity;
  for (const o of others) {
    const dx = p.x - o.x;
    const dy = p.y - o.y;
    min = Math.min(min, dx * dx + dy * dy);
  }
  return Math.sqrt(min);
}
