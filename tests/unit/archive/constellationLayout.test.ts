import { describe, expect, it } from 'vitest';
import { MIN_SPACING, collectionScale, layoutConstellation, nodePosition } from '@/features/archive/constellationLayout';
import type { Thought } from '@/types';

const t = (id: string, createdAt: number, category: Thought['category'] = null, content = 'x'): Thought => ({
  id,
  content,
  category,
  createdAt,
  updatedAt: createdAt,
});

const many = (n: number) => Array.from({ length: n }, (_, i) => t(`id-${i}-${i * 31}`, i));

describe('constellation layout', () => {
  it('is deterministic: the same notes always produce the same sky', () => {
    expect(layoutConstellation(many(30))).toEqual(layoutConstellation(many(30)));
    expect(nodePosition('abc')).toEqual(nodePosition('abc'));
    expect(nodePosition('abc')).not.toEqual(nodePosition('abd'));
  });

  it('the first star sits at its id-derived position', () => {
    const [node] = layoutConstellation([t('only', 1)]).nodes;
    expect({ x: node!.x, y: node!.y }).toEqual(nodePosition('only'));
  });

  it('existing stars never move when newer thoughts are added', () => {
    const before = layoutConstellation(many(25)).nodes;
    const after = layoutConstellation([...many(25), t('newer-1', 100), t('newer-2', 101, 'idea')]).nodes;
    for (const n of before) {
      const m = after.find((a) => a.id === n.id)!;
      expect([m.x, m.y]).toEqual([n.x, n.y]);
    }
  });

  it('editing the text does not move a star', () => {
    const a = layoutConstellation([t('one', 1, null, 'short')]).nodes[0]!;
    const b = layoutConstellation([t('one', 1, null, 'a much longer edited text')]).nodes[0]!;
    expect([a.x, a.y]).toEqual([b.x, b.y]);
  });

  it('spreads stars out: moderate collections keep the preferred spacing', () => {
    const { nodes } = layoutConstellation(many(40));
    let min = Infinity;
    for (let i = 0; i < nodes.length; i++)
      for (let j = i + 1; j < nodes.length; j++)
        min = Math.min(min, Math.hypot(nodes[i]!.x - nodes[j]!.x, nodes[i]!.y - nodes[j]!.y));
    expect(min).toBeGreaterThanOrEqual(MIN_SPACING);
  });

  it('keeps all stars inside the field margins, even for large collections', () => {
    const { nodes } = layoutConstellation(many(400));
    for (const n of nodes) {
      expect(n.x).toBeGreaterThanOrEqual(7);
      expect(n.x).toBeLessThanOrEqual(93);
      expect(n.y).toBeGreaterThanOrEqual(7);
      expect(n.y).toBeLessThanOrEqual(93);
    }
  });

  it('scales stars down as the collection grows, within bounds', () => {
    expect(collectionScale(1)).toBeGreaterThan(collectionScale(20));
    expect(collectionScale(20)).toBeGreaterThan(collectionScale(500));
    expect(collectionScale(100_000)).toBeGreaterThanOrEqual(0.65);
    expect(collectionScale(0)).toBeLessThanOrEqual(1.5);
  });

  it('links same-category thoughts in chronological order, leaving uncategorised ones alone', () => {
    const { nodes, edges } = layoutConstellation([
      t('c', 3, 'idea'),
      t('a', 1, 'idea'),
      t('b', 2, 'task'),
      t('d', 4, null),
      t('e', 5, 'idea'),
    ]);
    expect(nodes.map((n) => n.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(edges).toEqual([
      { from: 'a', to: 'c', category: 'idea' },
      { from: 'c', to: 'e', category: 'idea' },
    ]);
  });
});
