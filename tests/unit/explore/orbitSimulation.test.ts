import { describe, expect, it } from 'vitest';
import { MAX_PARTICLES, OrbitSimulation } from '@/features/explore/orbit/OrbitSimulation';

const make = () => new OrbitSimulation({ count: 300, width: 800, height: 600, seed: 3 });

function centroidDistance(sim: OrbitSimulation, x: number, y: number) {
  let sum = 0;
  for (let i = 0; i < sim.count; i++) sum += Math.hypot(sim.pos[i * 2]! - x, sim.pos[i * 2 + 1]! - y);
  return sum / sim.count;
}

describe('OrbitSimulation', () => {
  it('is deterministic for a seed', () => {
    const a = make();
    const b = make();
    for (let i = 0; i < 30; i++) {
      a.step(1 / 60);
      b.step(1 / 60);
    }
    expect(Array.from(a.pos)).toEqual(Array.from(b.pos));
  });

  it('caps the particle count', () => {
    expect(new OrbitSimulation({ count: 1e6, width: 10, height: 10 }).count).toBe(MAX_PARTICLES);
  });

  it('attract pulls particles toward the pointer; repel pushes them away', () => {
    const attract = make();
    const repel = make();
    repel.mode = 'repel';
    const px = 650;
    const py = 120;
    const before = centroidDistance(attract, px, py);
    attract.setPointer(px, py, true);
    repel.setPointer(px, py, true);
    for (let i = 0; i < 90; i++) {
      attract.step(1 / 60);
      repel.step(1 / 60);
    }
    expect(centroidDistance(attract, px, py)).toBeLessThan(before);
    expect(centroidDistance(repel, px, py)).toBeGreaterThan(centroidDistance(attract, px, py));
  });

  it('higher intensity produces stronger motion', () => {
    const low = make();
    const high = make();
    low.intensity = 0;
    high.intensity = 1;
    low.setPointer(100, 100, true);
    high.setPointer(100, 100, true);
    for (let i = 0; i < 20; i++) {
      low.step(1 / 60);
      high.step(1 / 60);
    }
    expect(high.meanSpeed()).toBeGreaterThan(low.meanSpeed());
  });

  it('keeps every particle inside the bounds and finite, even with huge time steps', () => {
    const sim = make();
    sim.intensity = 1;
    sim.setPointer(0, 0, true);
    for (let i = 0; i < 200; i++) sim.step(5); // clamped internally
    for (let i = 0; i < sim.count; i++) {
      const x = sim.pos[i * 2]!;
      const y = sim.pos[i * 2 + 1]!;
      expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(800);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(600);
    }
  });

  it('reset restores the initial state and releases the pointer', () => {
    const sim = make();
    const initial = Array.from(sim.pos);
    sim.setPointer(10, 10, true);
    for (let i = 0; i < 50; i++) sim.step(1 / 60);
    sim.reset();
    expect(Array.from(sim.pos)).toEqual(initial);
    expect(sim.pointer.active).toBe(false);
    expect(sim.meanSpeed()).toBe(0);
  });

  it('rescales positions on resize', () => {
    const sim = make();
    const x0 = sim.pos[0]!;
    sim.resize(400, 300);
    expect(sim.pos[0]).toBeCloseTo(x0 / 2, 3);
  });
});
