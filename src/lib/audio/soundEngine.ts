import type { Preferences } from '@/types';

/**
 * Tiny synthesiser for interface sounds. Everything is generated with the Web Audio
 * API — no audio files, so no licensing or loading cost.
 *
 * The AudioContext is created lazily on the first sound, which only ever happens
 * as a result of a user action (browsers block autoplay anyway). Nothing plays
 * unless the user has turned sound on.
 */
export type UiSound = 'save' | 'release' | 'complete' | 'test';

type AudioContextCtor = typeof AudioContext;

function getAudioContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null;
  const g = globalThis as typeof globalThis & { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
  return g.AudioContext ?? g.webkitAudioContext ?? null;
}

/** C major pentatonic across two octaves — any combination sounds consonant. */
const PENTATONIC_HZ = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25, 783.99, 880.0];

class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private echoBus: { input: GainNode } | null = null;
  private enabled = false;
  private volume = 0.6;

  configure(prefs: Pick<Preferences, 'soundEnabled' | 'volume'>): void {
    this.enabled = prefs.soundEnabled;
    this.volume = prefs.volume;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.02);
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  get isSupported(): boolean {
    return getAudioContextCtor() !== null;
  }

  private ensure(): AudioContext | null {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => {});
      return this.ctx;
    }
    const Ctor = getAudioContextCtor();
    if (!Ctor) return null;
    try {
      const ctx = new Ctor();
      const master = ctx.createGain();
      master.gain.value = this.volume;
      const compressor = ctx.createDynamicsCompressor();
      master.connect(compressor).connect(ctx.destination);
      this.ctx = ctx;
      this.master = master;
      return ctx;
    } catch {
      return null;
    }
  }

  private tone(freq: number, startOffset: number, duration: number, peak: number, type: OscillatorType = 'sine') {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t = ctx.currentTime + startOffset;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  /** Plays a UI sound if sound is enabled. Never throws. */
  play(sound: UiSound): void {
    if (!this.enabled) return;
    try {
      switch (sound) {
        case 'save':
          this.tone(659.25, 0, 0.5, 0.18);
          this.tone(987.77, 0.08, 0.7, 0.12);
          break;
        case 'release':
          this.releaseSweep();
          break;
        case 'complete':
          this.tone(523.25, 0, 1.6, 0.16);
          this.tone(659.25, 0.18, 1.6, 0.14);
          this.tone(783.99, 0.36, 2.2, 0.14);
          break;
        case 'test':
          this.tone(587.33, 0, 0.6, 0.18);
          break;
      }
    } catch {
      /* Audio is decorative; never let it break an interaction. */
    }
  }

  private releaseSweep() {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(520, t);
    osc.frequency.exponentialRampToValueAtTime(140, t + 0.9);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.1, t + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + 1);
  }

  private ensureEcho(): GainNode | null {
    const ctx = this.ensure();
    if (!ctx || !this.master) return null;
    if (this.echoBus) return this.echoBus.input;
    const input = ctx.createGain();
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.32;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.38;
    const wet = ctx.createGain();
    wet.gain.value = 0.5;
    input.connect(this.master);
    input.connect(delay);
    delay.connect(feedback).connect(delay);
    delay.connect(wet).connect(this.master);
    this.echoBus = { input };
    return input;
  }

  /**
   * A soft plucked tone for Echo Waves. `x` and `y` are 0..1 across the canvas:
   * x picks the pitch, y the brightness. Played whenever the caller asks — the
   * Echo Waves module has its own explicit opt-in toggle.
   */
  wave(x: number, y: number): void {
    try {
      const ctx = this.ensure();
      const bus = this.ensureEcho();
      if (!ctx || !bus) return;
      const idx = Math.min(PENTATONIC_HZ.length - 1, Math.max(0, Math.floor(x * PENTATONIC_HZ.length)));
      const freq = PENTATONIC_HZ[idx] ?? 440;
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(600 + (1 - y) * 3400, t);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.16, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
      osc.connect(filter).connect(gain).connect(bus);
      osc.start(t);
      osc.stop(t + 1.5);
    } catch {
      /* ignore */
    }
  }

  /** Releases the audio device (e.g. when everything is muted for good). */
  async dispose(): Promise<void> {
    const ctx = this.ctx;
    this.ctx = null;
    this.master = null;
    this.echoBus = null;
    if (ctx) await ctx.close().catch(() => {});
  }
}

export const soundEngine = new SoundEngine();
