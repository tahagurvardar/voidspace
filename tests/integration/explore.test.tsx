import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExplorePanel } from '@/features/explore/ExplorePanel';
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
