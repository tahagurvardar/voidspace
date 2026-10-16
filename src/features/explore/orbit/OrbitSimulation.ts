import { seededRandom } from '@/lib/utils/hash';

export type FieldMode = 'attract' | 'repel';

export interface OrbitOptions {
  count: number;
  width: number;
  height: number;
  seed?: number;
}

/** Hard upper bound regardless of what callers ask for. */
export const MAX_PARTICLES = 2000;
const MAX_SPEED = 900; // px/s
const SOFTENING = 40; // px — prevents singular forces at the pointer

/**
 * Bounded particle simulation for Orbit Lab. Pure TypeScript over typed arrays:
 * no DOM, no allocation per step, deterministic for a given seed and input.
 *
 * Particles rest on loose elliptical "home" orbits around the centre. A held
 * pointer becomes a gravity well (attract, with a tangential swirl so particles
 * orbit instead of collapsing) or a pressure source (repel).
 */
export class OrbitSimulation {
  readonly count: number;
  width: number;
  height: number;
  /** Interleaved x,y. */
  readonly pos: Float32Array;
  readonly vel: Float32Array;
  /** Home orbit parameters per particle: radius factor, angle, angular speed. */
  private readonly home: Float32Array;
  private readonly seed: number;

  pointer = { x: 0, y: 0, active: false };
  mode: FieldMode = 'attract';
  /** 0..1 */
  intensity = 0.5;
  time = 0;

  constructor({ count, width, height, seed = 1 }: OrbitOptions) {
    this.count = Math.max(0, Math.min(MAX_PARTICLES, Math.floor(count)));
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.seed = seed;
    this.pos = new Float32Array(this.count * 2);
    this.vel = new Float32Array(this.count * 2);
    this.home = new Float32Array(this.count * 3);
    this.reset();
  }

  /** Restores the initial, deterministic arrangement. */
  reset(): void {
    const rnd = seededRandom(this.seed);
    this.time = 0;
    this.pointer.active = false;
    for (let i = 0; i < this.count; i++) {
      const r = 0.18 + Math.pow(rnd(), 0.7) * 0.32;
      const a = rnd() * Math.PI * 2;
      // Mostly one direction of travel, with a few counter-orbiting particles.
      const w = (0.05 + rnd() * 0.1) * (rnd() < 0.8 ? 1 : -1);
      this.home[i * 3] = r;
      this.home[i * 3 + 1] = a;
      this.home[i * 3 + 2] = w;
      this.pos[i * 2] = this.homeX(i);
      this.pos[i * 2 + 1] = this.homeY(i);
      this.vel[i * 2] = 0;
      this.vel[i * 2 + 1] = 0;
    }
  }

  resize(width: number, height: number): void {
    const sx = Math.max(1, width) / this.width;
    const sy = Math.max(1, height) / this.height;
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    for (let i = 0; i < this.count; i++) {
      this.pos[i * 2]! *= sx;
      this.pos[i * 2 + 1]! *= sy;
    }
  }

  setPointer(x: number, y: number, active: boolean): void {
    this.pointer.x = x;
    this.pointer.y = y;
    this.pointer.active = active;
  }

  private homeAngle(i: number): number {
    return this.home[i * 3 + 1]! + this.home[i * 3 + 2]! * this.time;
  }

  private homeX(i: number): number {
    const s = Math.min(this.width, this.height);
    return this.width / 2 + Math.cos(this.homeAngle(i)) * this.home[i * 3]! * s * 1.25;
  }

  private homeY(i: number): number {
    const s = Math.min(this.width, this.height);
    return this.height / 2 + Math.sin(this.homeAngle(i)) * this.home[i * 3]! * s * 0.85;
  }

  /** Advances the simulation. `dt` is clamped so a long frame cannot explode the system. */
  step(dtSeconds: number): void {
    const dt = Math.min(Math.max(dtSeconds, 0), 1 / 30);
    if (dt === 0) return;
    this.time += dt;
    const { x: px, y: py, active } = this.pointer;
    const strength = 2.2e5 * (0.25 + this.intensity * 1.75);
    const sign = this.mode === 'attract' ? 1 : -1;
    const damping = Math.exp(-dt * (active ? 0.9 : 2.2));
    const spring = active ? 0.6 : 3.2;

    for (let i = 0; i < this.count; i++) {
      const ix = i * 2;
      const iy = ix + 1;
      let x = this.pos[ix]!;
      let y = this.pos[iy]!;
      let vx = this.vel[ix]!;
      let vy = this.vel[iy]!;

      // Gentle pull back to the particle's home orbit.
      vx += (this.homeX(i) - x) * spring * dt;
      vy += (this.homeY(i) - y) * spring * dt;

      if (active) {
        const dx = px - x;
        const dy = py - y;
        const d2 = dx * dx + dy * dy + SOFTENING * SOFTENING;
        const d = Math.sqrt(d2);
        const f = (strength / d2) * dt;
        vx += (dx / d) * f * sign;
        vy += (dy / d) * f * sign;
        if (sign > 0) {
          // Tangential swirl → orbits rather than collapse.
          vx += (-dy / d) * f * 0.55;
          vy += (dx / d) * f * 0.55;
        }
      }

      vx *= damping;
      vy *= damping;
      const sp = Math.hypot(vx, vy);
      if (sp > MAX_SPEED) {
        vx = (vx / sp) * MAX_SPEED;
        vy = (vy / sp) * MAX_SPEED;
      }
      x += vx * dt;
      y += vy * dt;

      // Soft walls: reflect and lose energy, so particles always stay on screen.
      if (x < 0) {
        x = 0;
        vx = Math.abs(vx) * 0.5;
      } else if (x > this.width) {
        x = this.width;
        vx = -Math.abs(vx) * 0.5;
      }
      if (y < 0) {
        y = 0;
        vy = Math.abs(vy) * 0.5;
      } else if (y > this.height) {
        y = this.height;
        vy = -Math.abs(vy) * 0.5;
      }

      this.pos[ix] = x;
      this.pos[iy] = y;
      this.vel[ix] = vx;
      this.vel[iy] = vy;
    }
  }

  /** Mean speed, useful for tests and visual intensity. */
  meanSpeed(): number {
    if (this.count === 0) return 0;
    let sum = 0;
    for (let i = 0; i < this.count; i++) sum += Math.hypot(this.vel[i * 2]!, this.vel[i * 2 + 1]!);
    return sum / this.count;
  }
}
