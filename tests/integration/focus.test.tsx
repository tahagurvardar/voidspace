import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { VoidspaceDB } from '@/lib/storage/db';
import { FocusPanel } from '@/features/focus/FocusPanel';
import { focusStore } from '@/features/focus/focusInstance';
import { createIdle } from '@/features/focus/timerMachine';
import { FOCUS_SNAPSHOT_KEY } from '@/features/focus/snapshotStorage';
import { usePreferencesStore } from '@/store/preferencesStore';
import { DEFAULT_PREFERENCES } from '@/types';
import { freshDb } from '../helpers';

let db: VoidspaceDB;
let now = Date.UTC(2026, 9, 15, 9, 0, 0);

beforeEach(async () => {
  db = await freshDb();
  now = Date.UTC(2026, 9, 15, 9, 0, 0);
  // Mock only the clock; timers and IndexedDB keep working normally.
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  usePreferencesStore.setState({ prefs: { ...DEFAULT_PREFERENCES }, loaded: true });
  focusStore.setState({ timer: createIdle(25 * 60), hydrated: true });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Focus panel', () => {
  it('offers 15/25/50 presets and a validated custom length', async () => {
    const user = userEvent.setup();
    render(<FocusPanel />);
    await user.click(screen.getByRole('button', { name: '50 min' }));
    expect(screen.getByTestId('focus-remaining')).toHaveTextContent('50:00');
    await user.click(screen.getByRole('button', { name: 'Custom' }));
    const input = screen.getByLabelText('Custom length in minutes');
    await user.clear(input);
    await user.type(input, '500');
    await user.click(screen.getByRole('button', { name: 'Set minutes' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/Maximum is 180/);
    await user.clear(input);
    await user.type(input, '40');
    await user.click(screen.getByRole('button', { name: 'Set minutes' }));
    expect(screen.getByTestId('focus-remaining')).toHaveTextContent('40:00');
  });

  it('start, pause, resume and reset drive the timer and record a canceled session', async () => {
    const user = userEvent.setup();
    render(<FocusPanel />);
    await user.click(screen.getByRole('button', { name: 'Start' }));
    expect(screen.getByTestId('focus-status')).toHaveTextContent('Focusing');

    now += 30_000;
    await user.click(screen.getByRole('button', { name: 'Pause' }));
    expect(screen.getByTestId('focus-status')).toHaveTextContent('Paused');
    expect(screen.getByTestId('focus-remaining')).toHaveTextContent('24:30');

    now += 10 * 60_000; // paused: no change
    await user.click(screen.getByRole('button', { name: 'Resume' }));
    expect(screen.getByTestId('focus-remaining')).toHaveTextContent('24:30');

    now += 20_000;
    // Under a minute focused: reset needs no confirmation.
    await user.click(screen.getByRole('button', { name: 'Reset' }));
    expect(screen.getByTestId('focus-status')).toHaveTextContent('Ready');
    await waitFor(async () => {
      const sessions = await db.focusSessions.toArray();
      expect(sessions).toEqual([expect.objectContaining({ status: 'canceled', actualFocusedSeconds: 50 })]);
    });
  });

  it('asks before resetting a session with more than a minute of focus', async () => {
    const user = userEvent.setup();
    render(<FocusPanel />);
    await user.click(screen.getByRole('button', { name: 'Start' }));
    now += 5 * 60_000;
    await user.click(screen.getByRole('button', { name: 'Reset' }));
    expect(screen.getByRole('dialog', { name: 'Reset this session?' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByTestId('focus-status')).toHaveTextContent('Focusing');
  });

  it('shows a clear completion state and derives totals from the stored record', async () => {
    const user = userEvent.setup();
    render(<FocusPanel />);
    await user.click(screen.getByRole('button', { name: '15 min' }));
    await user.click(screen.getByRole('button', { name: 'Start' }));
    now += 15 * 60_000;
    act(() => focusStore.getState().tick());
    expect(screen.getByTestId('focus-status')).toHaveTextContent('Complete');
    expect(screen.getByText(/You focused for 15 min/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('stat-total')).toHaveTextContent('15 min'));
    expect(screen.getByTestId('stat-count')).toHaveTextContent('1');
    expect(JSON.parse(window.localStorage.getItem(FOCUS_SNAPSHOT_KEY)!).status).toBe('completed');
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByTestId('focus-status')).toHaveTextContent('Ready');
  });
});
