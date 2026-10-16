'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Magnet, RotateCcw, Wind } from 'lucide-react';
import { usePreferencesStore } from '@/store/preferencesStore';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useCanvasLoop } from '../useCanvasLoop';
import { OrbitSimulation, type FieldMode } from './OrbitSimulation';

export function particleBudget(quality: string, width: number): number {
  const small = width < 640;
  switch (quality) {
    case 'high':
      return small ? 900 : 1600;
    case 'low':
    case 'static':
      return small ? 300 : 500;
    default:
      return small ? 550 : 1000;
  }
}

const BG = '#080c19';
const KEY_STEP = 24;

export function OrbitLab() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const quality = usePreferencesStore((s) => s.prefs.graphicsQuality);
  const reducedMotion = useReducedMotion();
  const [mode, setMode] = useState<FieldMode>('attract');
  const [intensity, setIntensity] = useState(0.5);
  const [keyboardField, setKeyboardField] = useState(false);
  const hintId = useId();
  const intensityId = useId();

  // The simulation is a mutable engine owned by this component (not React state).
  const simRef = useRef<OrbitSimulation | null>(null);

  const getSim = (): OrbitSimulation => {
    if (!simRef.current) {
      const rect = canvasRef.current?.getBoundingClientRect();
      const sim = new OrbitSimulation({
        count: particleBudget(quality, window.innerWidth),
        width: rect && rect.width > 0 ? rect.width : 800,
        height: rect && rect.height > 0 ? rect.height : 500,
        seed: 42,
      });
      sim.mode = mode;
      sim.intensity = intensity;
      simRef.current = sim;
    }
    return simRef.current;
  };

  // A quality change rebuilds the simulation with a new particle budget.
  useEffect(() => {
    simRef.current = null;
  }, [quality]);
  useEffect(() => {
    if (simRef.current) simRef.current.mode = mode;
  }, [mode]);
  useEffect(() => {
    if (simRef.current) simRef.current.intensity = intensity;
  }, [intensity]);

  const { supported } = useCanvasLoop(canvasRef, {
    maxDpr: 1.5,
    onResize: (w, h) => simRef.current?.resize(w, h),
    onFrame: ({ ctx, dt, width, height }) => {
      const sim = getSim();
      sim.step(reducedMotion ? dt * 0.6 : dt);
      // Motion trails: translucent fill instead of a hard clear.
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = reducedMotion ? BG : 'rgba(8, 12, 25, 0.24)';
      ctx.fillRect(0, 0, width, height);

      if (sim.pointer.active) {
        const g = ctx.createRadialGradient(sim.pointer.x, sim.pointer.y, 0, sim.pointer.x, sim.pointer.y, 90);
        const tint = sim.mode === 'attract' ? '142, 124, 246' : '111, 139, 255';
        g.addColorStop(0, `rgba(${tint}, ${0.18 + sim.intensity * 0.2})`);
        g.addColorStop(1, `rgba(${tint}, 0)`);
        ctx.fillStyle = g;
        ctx.fillRect(sim.pointer.x - 90, sim.pointer.y - 90, 180, 180);
      }

      ctx.globalCompositeOperation = 'lighter';
      const { pos, vel, count } = sim;
      // Three colour bins by speed → three fill-style changes per frame, not thousands.
      const bins: Array<[string, number, number]> = [
        ['rgba(110, 100, 220, 0.75)', 0, 120],
        ['rgba(140, 160, 255, 0.85)', 120, 360],
        ['rgba(236, 230, 255, 0.95)', 360, Infinity],
      ];
      for (const [color, lo, hi] of bins) {
        ctx.fillStyle = color;
        for (let i = 0; i < count; i++) {
          const sp = Math.abs(vel[i * 2]!) + Math.abs(vel[i * 2 + 1]!);
          if (sp < lo || sp >= hi) continue;
          ctx.fillRect(pos[i * 2]! - 0.9, pos[i * 2 + 1]! - 0.9, 1.8, 1.8);
        }
      }
      ctx.globalCompositeOperation = 'source-over';
    },
  });

  const toLocal = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
        <div role="group" aria-label="Field mode" className="vs-segment">
          <button type="button" aria-pressed={mode === 'attract'} onClick={() => setMode('attract')}>
            <Magnet size={15} aria-hidden="true" />
            Attract
          </button>
          <button type="button" aria-pressed={mode === 'repel'} onClick={() => setMode('repel')}>
            <Wind size={15} aria-hidden="true" />
            Repel
          </button>
        </div>
        <div className="flex min-w-48 flex-1 flex-col gap-1.5">
          <label htmlFor={intensityId} className="text-xs text-ink-muted">
            Intensity <span className="tabular-nums text-ink-faint">{Math.round(intensity * 100)}%</span>
          </label>
          <input
            id={intensityId}
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={intensity}
            onChange={(e) => setIntensity(Number(e.target.value))}
          />
        </div>
        <button
          type="button"
          className="vs-btn vs-btn-ghost"
          onClick={() => {
            simRef.current?.reset();
            setKeyboardField(false);
          }}
        >
          <RotateCcw size={15} aria-hidden="true" />
          Reset
        </button>
      </div>
      <div className="relative overflow-hidden rounded-2xl border border-line bg-void">
        <canvas
          ref={canvasRef}
          className="vs-play-canvas block w-full touch-none select-none outline-none focus-visible:ring-2 focus-visible:ring-violet-soft"
          tabIndex={0}
          role="application"
          aria-roledescription="interactive particle field"
          aria-label="Orbit Lab"
          aria-describedby={hintId}
          data-testid="orbit-canvas"
          onPointerDown={(e) => {
            const sim = getSim();
            e.currentTarget.setPointerCapture?.(e.pointerId);
            const p = toLocal(e);
            sim.setPointer(p.x, p.y, true);
          }}
          onPointerMove={(e) => {
            const sim = getSim();
            if (!sim.pointer.active || keyboardField) return;
            const p = toLocal(e);
            sim.setPointer(p.x, p.y, true);
          }}
          onPointerUp={() => simRef.current?.setPointer(simRef.current.pointer.x, simRef.current.pointer.y, false)}
          onPointerCancel={() => simRef.current?.setPointer(simRef.current.pointer.x, simRef.current.pointer.y, false)}
          onKeyDown={(e) => {
            const sim = getSim();
            if (e.key === ' ' || e.key === 'Enter') {
              e.preventDefault();
              const on = !keyboardField;
              setKeyboardField(on);
              const x = sim.pointer.x || sim.width / 2;
              const y = sim.pointer.y || sim.height / 2;
              sim.setPointer(x, y, on);
              return;
            }
            const moves: Record<string, [number, number]> = {
              ArrowLeft: [-KEY_STEP, 0],
              ArrowRight: [KEY_STEP, 0],
              ArrowUp: [0, -KEY_STEP],
              ArrowDown: [0, KEY_STEP],
            };
            const m = moves[e.key];
            if (!m) return;
            e.preventDefault();
            const x = Math.min(sim.width, Math.max(0, (sim.pointer.x || sim.width / 2) + m[0]));
            const y = Math.min(sim.height, Math.max(0, (sim.pointer.y || sim.height / 2) + m[1]));
            sim.setPointer(x, y, keyboardField);
          }}
          onBlur={() => {
            const sim = getSim();
            if (keyboardField) {
              setKeyboardField(false);
              sim.setPointer(sim.pointer.x, sim.pointer.y, false);
            }
          }}
        />
        {!supported && (
          <p className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-ink-muted">
            Your browser can&apos;t draw this canvas. The rest of VOIDSPACE works normally.
          </p>
        )}
      </div>

      <p id={hintId} className="text-xs text-ink-faint">
        Press and drag to {mode === 'attract' ? 'pull particles into orbit' : 'push particles away'}. With a keyboard,
        focus the field, press Space to switch the field on or off and use the arrow keys to move it.
      </p>

    </div>
  );
}
