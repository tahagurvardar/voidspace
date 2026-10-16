import { describe, expect, it } from 'vitest';
import { EchoField, MAX_WAVES, WAVE_LIFETIME_S, WAVE_SPEED } from '@/features/explore/echo/EchoField';

describe('EchoField', () => {
  it('emitted waves expand at constant speed and fade out', () => {
    const f = new EchoField();
    const w = f.emit(100, 100, 0.5);
    f.step(0.1);
    expect(f.radius(w)).toBeCloseTo(WAVE_SPEED * 0.1);
    expect(f.alpha(w)).toBeGreaterThan(0);
    expect(f.alpha(w)).toBeLessThan(1);
  });

  it('removes waves after their lifetime (idle afterwards)', () => {
    const f = new EchoField();
    f.emit(0, 0);
    for (let t = 0; t < WAVE_LIFETIME_S + 0.5; t += 0.05) f.step(0.05);
    expect(f.waves).toHaveLength(0);
    expect(f.isIdle).toBe(true);
  });

  it('is bounded: the oldest waves are dropped beyond the cap', () => {
    const f = new EchoField();
    for (let i = 0; i < MAX_WAVES + 10; i++) f.emit(i, i);
    expect(f.waves).toHaveLength(MAX_WAVES);
    expect(f.waves[0]!.x).toBe(10);
  });

  it('clear removes everything', () => {
    const f = new EchoField();
    f.emit(1, 1);
    f.emit(2, 2);
    f.clear();
    expect(f.isIdle).toBe(true);
  });

  it('finds the two crossing points of overlapping wavefronts', () => {
    const f = new EchoField();
    f.emit(0, 0);
    f.emit(200, 0);
    for (let i = 0; i < 10; i++) f.step(0.1); // radii = 140, centres 200 apart → cross at x = 100
    const points: Array<[number, number]> = [];
    f.forEachIntersection((x, y) => points.push([x, y]));
    expect(points).toHaveLength(2);
    for (const [x, y] of points) {
      expect(x).toBeCloseTo(100);
      expect(Math.abs(y)).toBeCloseTo(Math.sqrt(140 * 140 - 100 * 100));
    }
  });

  it('reports no intersections for separate waves', () => {
    const f = new EchoField();
    f.emit(0, 0);
    f.emit(1000, 0);
    f.step(0.1);
    let n = 0;
    f.forEachIntersection(() => n++);
    expect(n).toBe(0);
  });
});
