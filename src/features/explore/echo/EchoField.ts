export interface Wave {
  id: number;
  x: number;
  y: number;
  /** Seconds (simulation clock) when emitted. */
  born: number;
  /** 0..1 — maps to colour between violet and electric blue. */
  hue: number;
}

export const MAX_WAVES = 36;
export const WAVE_LIFETIME_S = 4.2;
export const WAVE_SPEED = 140; // px/s

/**
 * Model for Echo Waves: emitted waves expand at constant speed and fade over
 * their lifetime. Overlaps between wavefronts are computed analytically
 * (circle–circle intersections) so the renderer can highlight interference.
 * Bounded: never more than MAX_WAVES alive.
 */
export class EchoField {
  waves: Wave[] = [];
  time = 0;
  private nextId = 1;

  emit(x: number, y: number, hue: number = Math.random()): Wave {
    const wave: Wave = { id: this.nextId++, x, y, born: this.time, hue };
    this.waves.push(wave);
    if (this.waves.length > MAX_WAVES) this.waves.splice(0, this.waves.length - MAX_WAVES);
    return wave;
  }

  step(dtSeconds: number): void {
    this.time += Math.min(Math.max(dtSeconds, 0), 0.1);
    if (this.waves.length && this.time - this.waves[0]!.born > WAVE_LIFETIME_S) {
      this.waves = this.waves.filter((w) => this.time - w.born <= WAVE_LIFETIME_S);
    }
  }

  clear(): void {
    this.waves = [];
  }

  radius(w: Wave): number {
    return (this.time - w.born) * WAVE_SPEED;
  }

  /** 1 at birth → 0 at end of life (ease-out). */
  alpha(w: Wave): number {
    const t = (this.time - w.born) / WAVE_LIFETIME_S;
    if (t <= 0) return 1;
    if (t >= 1) return 0;
    return (1 - t) * (1 - t);
  }

  get isIdle(): boolean {
    return this.waves.length === 0;
  }

  /**
   * Intersection points of every pair of live wavefronts, with a strength based
   * on both waves' alpha. Calls `visit` instead of allocating an array.
   */
  forEachIntersection(visit: (x: number, y: number, strength: number) => void): void {
    const ws = this.waves;
    for (let i = 0; i < ws.length; i++) {
      const a = ws[i]!;
      const ra = this.radius(a);
      if (ra <= 0) continue;
      for (let j = i + 1; j < ws.length; j++) {
        const b = ws[j]!;
        const rb = this.radius(b);
        if (rb <= 0) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d === 0 || d > ra + rb || d < Math.abs(ra - rb)) continue;
        const l = (ra * ra - rb * rb + d * d) / (2 * d);
        const h = Math.sqrt(Math.max(0, ra * ra - l * l));
        const mx = a.x + (dx * l) / d;
        const my = a.y + (dy * l) / d;
        const strength = Math.min(this.alpha(a), this.alpha(b));
        visit(mx + (h * -dy) / d, my + (h * dx) / d, strength);
        visit(mx - (h * -dy) / d, my - (h * dx) / d, strength);
      }
    }
  }
}
