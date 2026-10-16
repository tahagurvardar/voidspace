import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExplorePanel } from '@/features/explore/ExplorePanel';
import { EchoWaves } from '@/features/explore/echo/EchoWaves';
import { OrbitSimulation } from '@/features/explore/orbit/OrbitSimulation';
import { stubCanvas2D } from '../helpers';

function withCanvas() {
  const ctx = stubCanvas2D();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    (() => ctx) as unknown as HTMLCanvasElement['getContext'],
  );
  return ctx;
}

afterEach(() => vi.restoreAllMocks());

describe('Explore', () => {
  it('keeps the Orbit keyboard field at the top-left edge until moved inward', () => {
    withCanvas();
    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
    vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, right: 96, bottom: 96, width: 96, height: 96,
      toJSON: () => ({}),
    });
    const setPointer = vi.spyOn(OrbitSimulation.prototype, 'setPointer');
    render(<ExplorePanel />);
    const canvas = screen.getByTestId('orbit-canvas');
    fireEvent.keyDown(canvas, { key: ' ' });
    expect(setPointer).toHaveBeenLastCalledWith(48, 48, true);
    for (let i = 0; i < 3; i++) fireEvent.keyDown(canvas, { key: 'ArrowLeft' });
    expect(setPointer).toHaveBeenLastCalledWith(0, 48, true);
    for (let i = 0; i < 3; i++) fireEvent.keyDown(canvas, { key: 'ArrowUp' });
    expect(setPointer).toHaveBeenLastCalledWith(0, 0, true);
    fireEvent.keyDown(canvas, { key: ' ' });
    expect(setPointer).toHaveBeenLastCalledWith(0, 0, false);
    fireEvent.keyDown(canvas, { key: ' ' });
    expect(setPointer).toHaveBeenLastCalledWith(0, 0, true);
    fireEvent.keyDown(canvas, { key: 'ArrowRight' });
    expect(setPointer).toHaveBeenLastCalledWith(24, 0, true);
    fireEvent.keyDown(canvas, { key: 'ArrowDown' });
    expect(setPointer).toHaveBeenLastCalledWith(24, 24, true);
  });

  it('sleeps with a stationary Echo keyboard cursor and wakes for input', () => {
    withCanvas();
    const frames = new Map<number, FrameRequestCallback>();
    let nextId = 0;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.set(++nextId, callback);
      return nextId;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => { frames.delete(id); });
    const draw = () => {
      expect(frames.size).toBe(1);
      const [id, callback] = [...frames.entries()][0]!;
      frames.delete(id);
      act(() => callback(1000));
    };
    const { unmount } = render(<EchoWaves />);
    try {
      draw();
      const canvas = screen.getByRole('application', { name: 'Echo Waves' });
      fireEvent.focus(canvas);
      draw();
      expect(frames.size).toBe(0);
      fireEvent.keyDown(canvas, { key: 'ArrowRight' });
      draw();
      expect(frames.size).toBe(0);
      fireEvent.keyDown(canvas, { key: 'Enter' });
      draw();
      expect(frames.size).toBe(1); // Moving waves keep animating.
    } finally {
      unmount();
    }
    expect(frames.size).toBe(0);
  });

  it('switches between Orbit Lab and Echo Waves with an accessible tab list', async () => {
    withCanvas();
    const user = userEvent.setup();
    render(<ExplorePanel />);
    expect(screen.getByRole('tab', { name: 'Orbit Lab' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('orbit-canvas')).toBeInTheDocument();
    screen.getByRole('tab', { name: 'Orbit Lab' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Echo Waves' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('echo-canvas')).toBeInTheDocument();
    // The inactive experience is unmounted (no hidden loop keeps running).
    expect(screen.queryByTestId('orbit-canvas')).not.toBeInTheDocument();
  });

  it('Orbit Lab: interaction lifecycle, mode, intensity and reset', async () => {
    withCanvas();
    const user = userEvent.setup();
    render(<ExplorePanel />);
    const canvas = screen.getByTestId('orbit-canvas');
    fireEvent.pointerDown(canvas, { clientX: 50, clientY: 50, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 80, clientY: 60, pointerId: 1 });
    fireEvent.pointerUp(canvas, { pointerId: 1 });
    await user.click(screen.getByRole('button', { name: 'Repel' }));
    expect(screen.getByRole('button', { name: 'Repel' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.change(screen.getByLabelText(/Intensity/), { target: { value: '0.9' } });
    expect(screen.getByLabelText(/Intensity/)).toHaveValue('0.9');
    await user.click(screen.getByRole('button', { name: 'Reset' }));
    // Keyboard alternative to the pointer.
    canvas.focus();
    await user.keyboard(' {ArrowLeft}{ArrowUp} ');
    expect(canvas).toHaveFocus();
  });

  it('Echo Waves: tapping emits waves; Clear resets the field', async () => {
    withCanvas();
    const user = userEvent.setup();
    render(<ExplorePanel />);
    await user.click(screen.getByRole('tab', { name: 'Echo Waves' }));
    expect(screen.getByText('Tap anywhere to send a wave.')).toBeInTheDocument();
    fireEvent.pointerDown(screen.getByTestId('echo-canvas'), { clientX: 10, clientY: 10, pointerId: 1 });
    expect(screen.queryByText('Tap anywhere to send a wave.')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByText('Tap anywhere to send a wave.')).toBeInTheDocument();
    // Sound is opt-in and off by default.
    expect(screen.getByRole('button', { name: /Wave sound off/ })).toHaveAttribute('aria-pressed', 'false');
  });

  it('cleans up its animation frame, resize observer and listeners on unmount', () => {
    withCanvas();
    const cancel = vi.spyOn(window, 'cancelAnimationFrame');
    const disconnect = vi.fn();
    const observe = vi.fn();
    const RO = vi.fn(function (this: ResizeObserver) {
      Object.assign(this, { observe, disconnect, unobserve: vi.fn() });
    });
    vi.stubGlobal('ResizeObserver', RO);
    const removeDoc = vi.spyOn(document, 'removeEventListener');
    const { unmount } = render(<ExplorePanel />);
    expect(observe).toHaveBeenCalled();
    unmount();
    expect(disconnect).toHaveBeenCalled();
    expect(removeDoc).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    expect(cancel).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('degrades gracefully when the browser cannot provide a canvas (no WebGL or 2D)', () => {
    // The default test environment returns no canvas context.
    render(<ExplorePanel />);
    expect(screen.getByText(/can't draw this canvas/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset' })).toBeEnabled();
  });
});
