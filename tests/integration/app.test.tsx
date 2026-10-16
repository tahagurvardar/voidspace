import { beforeEach, describe, expect, it } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppShell } from '@/components/layout/AppShell';
import { useAppStore } from '@/store/appStore';
import { coreStore } from '@/store/coreStore';
import { usePreferencesStore } from '@/store/preferencesStore';
import { focusStore } from '@/features/focus/focusInstance';
import { createIdle } from '@/features/focus/timerMachine';
import { DEFAULT_PREFERENCES } from '@/types';
import { freshDb } from '../helpers';

beforeEach(async () => {
  await freshDb();
  window.history.replaceState(null, '', '/');
  useAppStore.setState({ mode: 'home', settingsOpen: false, toasts: [] });
  usePreferencesStore.setState({ prefs: { ...DEFAULT_PREFERENCES }, loaded: false });
  focusStore.setState({ timer: createIdle(1500), hydrated: false });
});

describe('Application shell', () => {
  it('opens on the start screen with the headline, the core and all three modes', async () => {
    render(<AppShell />);
    expect(screen.getByRole('heading', { level: 1, name: 'Make room for your mind.' })).toBeInTheDocument();
    for (const name of [/Clear/, /Focus/, /Explore/]) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
    expect(screen.getByTestId('core-anchor')).toBeInTheDocument();
  });

  it('navigates between modes on a single route, updating the hash and focusing the heading', async () => {
    const user = userEvent.setup();
    render(<AppShell />);
    await user.click(screen.getByTestId('nav-focus'));
    expect(await screen.findByRole('heading', { level: 1, name: 'One thing, for a set time.' })).toHaveFocus();
    expect(window.location.hash).toBe('#focus');
    expect(window.location.pathname).toBe('/');
    expect(screen.getByTestId('nav-focus')).toHaveAttribute('aria-current', 'page');
    expect(coreStore.getState().mode).toBe('focus');

    await user.click(screen.getByTestId('nav-clear'));
    expect(await screen.findByLabelText("What's on your mind?")).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Archive' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Everything you chose to keep.' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /VOIDSPACE, back to start/ }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Make room for your mind.' })).toBeInTheDocument();
  });

  it('supports keyboard shortcuts outside text fields', async () => {
    const user = userEvent.setup();
    render(<AppShell />);
    await user.keyboard('3');
    expect(await screen.findByRole('heading', { level: 1, name: /short break/ })).toBeInTheDocument();
    await user.keyboard('1');
    const field = await screen.findByLabelText("What's on your mind?");
    // Typing digits inside the text field must not switch modes.
    await user.type(field, '2');
    expect(field).toHaveValue('2');
    expect(useAppStore.getState().mode).toBe('clear');
    await user.click(document.body);
    await user.keyboard('{Escape}');
    expect(await screen.findByRole('heading', { level: 1, name: 'Make room for your mind.' })).toBeInTheDocument();
  });

  it('restores the mode from the URL hash (back/forward)', async () => {
    render(<AppShell />);
    act(() => {
      window.history.pushState(null, '', '#archive');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(await screen.findByRole('heading', { level: 1, name: 'Everything you chose to keep.' })).toBeInTheDocument();
  });

  it('falls back to the static core when WebGL is unavailable', async () => {
    render(<AppShell />);
    await waitFor(() => expect(usePreferencesStore.getState().loaded).toBe(true));
    expect(screen.getByTestId('core-anchor')).toHaveAttribute('data-render-mode', 'static');
    expect(screen.getByTestId('core-fallback')).toBeInTheDocument();
    expect(document.querySelector('[data-testid="core-canvas"]')).toBeNull();
  });

  it('honours the reduced-motion setting', async () => {
    render(<AppShell />);
    await waitFor(() => expect(usePreferencesStore.getState().loaded).toBe(true));
    act(() => {
      usePreferencesStore.setState((s) => ({ prefs: { ...s.prefs, motionPreference: 'reduce' } }));
    });
    expect(document.querySelector('[data-reduced-motion]')).toHaveAttribute('data-reduced-motion', 'true');
    expect(screen.getByTestId('core-fallback')).toHaveAttribute('data-animate', 'false');
  });

  it('opens settings as a labelled modal dialog', async () => {
    const user = userEvent.setup();
    render(<AppShell />);
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    expect(await screen.findByRole('dialog', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByText(/stored only in this browser on this device/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(useAppStore.getState().settingsOpen).toBe(false));
  });

  it('sound is off by default and toggles from the header', async () => {
    const user = userEvent.setup();
    render(<AppShell />);
    const toggle = screen.getByRole('button', { name: 'Sound effects' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await user.click(toggle);
    await waitFor(() => expect(toggle).toHaveAttribute('aria-pressed', 'true'));
  });
});
