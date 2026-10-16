'use client';

import { useId, useRef, useState } from 'react';
import { Eraser, Volume2, VolumeX } from 'lucide-react';
import { soundEngine } from '@/lib/audio/soundEngine';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useCanvasLoop } from '../useCanvasLoop';
import { EchoField, WAVE_LIFETIME_S } from './EchoField';

const BG = '#080c19';
const DRAG_EMIT_MS = 140;
const KEY_STEP = 32;

function waveColor(hue: number, alpha: number): string {
  // Interpolate violet (142,124,246) → electric blue (111,139,255).
  const r = Math.round(142 + (111 - 142) * hue);
  const g = Math.round(124 + (139 - 124) * hue);
  const b = Math.round(246 + (255 - 246) * hue);
  return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
}

export function EchoWaves() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [field] = useState(() => new EchoField());
  const [soundOn, setSoundOn] = useState(false);
  const [hasWaves, setHasWaves] = useState(false);
  const cursor = useRef<{ x: number; y: number } | null>(null);
  const size = useRef({ w: 1, h: 1 });
  const lastDragEmit = useRef(0);
  const dragging = useRef(false);
  const reducedMotion = useReducedMotion();
  const hintId = useId();

  const { wake, supported } = useCanvasLoop(canvasRef, {
    maxDpr: 2,
    onResize: (w, h) => {
      size.current = { w, h };
    },
    onFrame: ({ ctx, dt, width, height }) => {
      field.step(reducedMotion ? dt * 0.5 : dt);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, width, height);
      ctx.globalCompositeOperation = 'lighter';

      for (const w of field.waves) {
        const r = field.radius(w);
        const a = field.alpha(w);
        if (r <= 0 || a <= 0) continue;
        // A primary wavefront followed by two fainter echoes.
        for (let k = 0; k < 3; k++) {
          const rk = r - k * 22;
          if (rk <= 0) continue;
          ctx.beginPath();
          ctx.arc(w.x, w.y, rk, 0, Math.PI * 2);
          ctx.strokeStyle = waveColor(w.hue, a * (k === 0 ? 0.9 : k === 1 ? 0.45 : 0.22));
          ctx.lineWidth = k === 0 ? 1.75 : 1.1;
          ctx.stroke();
        }
      }

      // Interference: highlight where wavefronts cross.
      ctx.fillStyle = 'rgba(236, 230, 255, 0.9)';
      field.forEachIntersection((x, y, s) => {
        if (s < 0.05) return;
        ctx.globalAlpha = Math.min(1, s * 1.2);
        ctx.beginPath();
        ctx.arc(x, y, 1.5 + s * 2.5, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;

      if (cursor.current) {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = 'rgba(201, 191, 255, 0.7)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cursor.current.x, cursor.current.y, 6, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';

      const alive = !field.isIdle;
      if (alive !== hasWaves) setHasWaves(alive);
      // A stationary cursor needs no animation; focus, blur and arrow keys wake the loop.
      return alive;
    },
  });

  const emit = (x: number, y: number) => {
    const { w, h } = size.current;
    field.emit(x, y, Math.min(1, Math.max(0, x / w)));
    if (soundOn) soundEngine.wave(x / w, y / h);
    setHasWaves(true);
    wake();
  };

  const local = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="vs-btn vs-btn-ghost"
          aria-pressed={soundOn}
          onClick={() => setSoundOn((v) => !v)}
          disabled={!soundEngine.isSupported}
        >
          {soundOn ? <Volume2 size={15} aria-hidden="true" /> : <VolumeX size={15} aria-hidden="true" />}
          Wave sound {soundOn ? 'on' : 'off'}
        </button>
        <button
          type="button"
          className="vs-btn vs-btn-ghost"
          onClick={() => {
            field.clear();
            setHasWaves(false);
            wake();
          }}
        >
          <Eraser size={15} aria-hidden="true" />
          Clear
        </button>
      </div>
      <div className="relative overflow-hidden rounded-2xl border border-line bg-void">
        <canvas
          ref={canvasRef}
          className="vs-play-canvas block w-full touch-none select-none outline-none focus-visible:ring-2 focus-visible:ring-violet-soft"
          tabIndex={0}
          role="application"
          aria-roledescription="wave canvas"
          aria-label="Echo Waves"
          aria-describedby={hintId}
          data-testid="echo-canvas"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture?.(e.pointerId);
            dragging.current = true;
            lastDragEmit.current = performance.now();
            const p = local(e);
            emit(p.x, p.y);
          }}
          onPointerMove={(e) => {
            if (!dragging.current) return;
            const now = performance.now();
            if (now - lastDragEmit.current < DRAG_EMIT_MS) return;
            lastDragEmit.current = now;
            const p = local(e);
            emit(p.x, p.y);
          }}
          onPointerUp={() => {
            dragging.current = false;
          }}
          onPointerCancel={() => {
            dragging.current = false;
          }}
          onFocus={() => {
            cursor.current = cursor.current ?? { x: size.current.w / 2, y: size.current.h / 2 };
            wake();
          }}
          onBlur={() => {
            cursor.current = null;
            wake();
          }}
          onKeyDown={(e) => {
            const c = cursor.current ?? { x: size.current.w / 2, y: size.current.h / 2 };
            if (e.key === ' ' || e.key === 'Enter') {
              e.preventDefault();
              emit(c.x, c.y);
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
            cursor.current = {
              x: Math.min(size.current.w, Math.max(0, c.x + m[0])),
              y: Math.min(size.current.h, Math.max(0, c.y + m[1])),
            };
            wake();
          }}
        />
        {!hasWaves && supported && (
          <p
            className="pointer-events-none absolute inset-0 grid place-items-center p-6 text-center text-sm text-ink-muted"
            aria-hidden="true"
          >
            Tap anywhere to send a wave.
          </p>
        )}
        {!supported && (
          <p className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-ink-muted">
            Your browser can&apos;t draw this canvas. The rest of VOIDSPACE works normally.
          </p>
        )}
      </div>

      <p id={hintId} className="text-xs text-ink-faint">
        Click, tap or drag to emit waves; where they cross, they light up. Waves fade after about{' '}
        {Math.round(WAVE_LIFETIME_S)} seconds. With a keyboard, focus the canvas, move with the arrow keys and press
        Space to emit.
      </p>

    </div>
  );
}
