'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface CanvasFrame {
  ctx: CanvasRenderingContext2D;
  /** Seconds since the previous frame (clamped). */
  dt: number;
  /** CSS pixel size of the canvas. */
  width: number;
  height: number;
}

export interface CanvasLoopOptions {
  /** Return false when there is nothing left to animate; the loop sleeps until `wake()`. */
  onFrame: (frame: CanvasFrame) => boolean | void;
  onResize?: (width: number, height: number) => void;
  /** Cap the backing-store resolution to keep fill-rate in check. */
  maxDpr?: number;
}

/**
 * Owns a 2D canvas render loop: DPR-aware sizing, a single requestAnimationFrame
 * chain, sleeping when idle or when the tab is hidden, and full cleanup on unmount
 * (no leaked frames, observers or listeners).
 */
export function useCanvasLoop(canvasRef: React.RefObject<HTMLCanvasElement | null>, options: CanvasLoopOptions) {
  const optsRef = useRef(options);
  useEffect(() => {
    optsRef.current = options;
  });
  const wakeRef = useRef<() => void>(() => {});
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = canvas.getContext('2d', { alpha: false });
    } catch {
      ctx = null;
    }
    if (!ctx) {
      setSupported(false);
      return;
    }
    const context = ctx;
    let raf = 0;
    let last = 0;
    let width = 0;
    let height = 0;
    let disposed = false;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, optsRef.current.maxDpr ?? 2);
      width = Math.max(1, Math.round(rect.width));
      height = Math.max(1, Math.round(rect.height));
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      optsRef.current.onResize?.(width, height);
      wake();
    };

    const frame = (t: number) => {
      raf = 0;
      if (disposed) return;
      const dt = last ? Math.min((t - last) / 1000, 0.1) : 1 / 60;
      last = t;
      const keepGoing = optsRef.current.onFrame({ ctx: context, dt, width, height });
      if (keepGoing === false || document.hidden) {
        last = 0;
        return;
      }
      raf = requestAnimationFrame(frame);
    };

    const wake = () => {
      if (disposed || raf || document.hidden) return;
      raf = requestAnimationFrame(frame);
    };
    wakeRef.current = wake;

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const onVisibility = () => {
      if (!document.hidden) wake();
    };
    document.addEventListener('visibilitychange', onVisibility);
    resize();

    return () => {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      wakeRef.current = () => {};
    };
  }, [canvasRef]);

  const wake = useCallback(() => wakeRef.current(), []);
  return { wake, supported };
}
