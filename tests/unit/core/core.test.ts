import { describe, expect, it } from 'vitest';
import { coreTargets, damp, signalEnvelope, SIGNAL_DURATION_S } from '@/components/core/coreDynamics';
import { chooseCoreRenderMode, detectWebGL } from '@/components/core/webgl';
import { resolveReducedMotion } from '@/hooks/useReducedMotion';

describe('core render mode (fallbacks)', () => {
  const base = { webglAvailable: true, reducedMotion: false, quality: 'auto' as const, webglFailed: false };
  it('uses WebGL when available', () => expect(chooseCoreRenderMode(base)).toBe('webgl'));
  it('falls back without WebGL', () => expect(chooseCoreRenderMode({ ...base, webglAvailable: false })).toBe('static'));
  it('falls back after a WebGL failure', () => expect(chooseCoreRenderMode({ ...base, webglFailed: true })).toBe('static'));
  it('is static with reduced motion', () => expect(chooseCoreRenderMode({ ...base, reducedMotion: true })).toBe('static'));
  it('is static when the user picks Static', () =>
    expect(chooseCoreRenderMode({ ...base, quality: 'static' })).toBe('static'));

  it('detectWebGL returns false when no context can be created', () => {
    const doc = { createElement: () => ({ getContext: () => null }) } as unknown as Document;
    expect(detectWebGL(doc)).toBe(false);
  });

  it('detectWebGL returns false when context creation throws', () => {
    const doc = {
      createElement: () => ({
        getContext: () => {
          throw new Error('blocked');
        },
      }),
    } as unknown as Document;
    expect(detectWebGL(doc)).toBe(false);
  });

  it('detectWebGL releases its probe context', () => {
    let lost = false;
    const gl = { getExtension: () => ({ loseContext: () => (lost = true) }) };
    const doc = { createElement: () => ({ getContext: () => gl }) } as unknown as Document;
    expect(detectWebGL(doc)).toBe(true);
    expect(lost).toBe(true);
  });
});

describe('reduced motion resolution', () => {
  it('follows the system setting unless overridden', () => {
    expect(resolveReducedMotion('system', true)).toBe(true);
    expect(resolveReducedMotion('system', false)).toBe(false);
    expect(resolveReducedMotion('reduce', false)).toBe(true);
    expect(resolveReducedMotion('full', true)).toBe(false);
  });
});

describe('core dynamics', () => {
  it('focus calms the core; explore responds to the pointer', () => {
    const home = coreTargets('home', false);
    const focusing = coreTargets('focus', true);
    expect(focusing.spin).toBeLessThan(home.spin);
    expect(focusing.breathPeriod).toBeGreaterThan(home.breathPeriod);
    expect(coreTargets('explore', false).pointerTilt).toBeGreaterThan(home.pointerTilt);
    expect(focusing.pointerTilt).toBe(0);
  });

  it('signal envelopes rise, decay and end', () => {
    for (const kind of ['save', 'release', 'complete'] as const) {
      expect(signalEnvelope(kind, 0)).toBe(0);
      expect(signalEnvelope(kind, 0.1)).toBeGreaterThan(0);
      expect(signalEnvelope(kind, SIGNAL_DURATION_S[kind])).toBe(0);
      expect(signalEnvelope(kind, -1)).toBe(0);
    }
  });

  it('damp converges independent of frame rate', () => {
    let a = 0;
    for (let i = 0; i < 60; i++) a = damp(a, 1, 3, 1 / 60);
    let b = 0;
    for (let i = 0; i < 30; i++) b = damp(b, 1, 3, 1 / 30);
    expect(a).toBeCloseTo(b, 6);
  });
});
