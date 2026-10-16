import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { VoidspaceDB } from '@/lib/storage/db';
import { ClearPanel } from '@/features/clear/ClearPanel';
import { coreStore } from '@/store/coreStore';
import { freshDb } from '../helpers';

let db: VoidspaceDB;
beforeEach(async () => {
  db = await freshDb();
  coreStore.setState({ signal: null });
});

describe('Clear', () => {
  it('saves a thought: it persists, appears in the list and the core acknowledges it', async () => {
    const user = userEvent.setup();
    render(<ClearPanel />);
    await user.type(screen.getByLabelText("What's on your mind?"), 'Book the train tickets');
    await user.click(screen.getByRole('radio', { name: 'Task' }));
    await user.click(screen.getByRole('button', { name: 'Save thought' }));

    const list = await screen.findByRole('list', { name: 'Saved thoughts' });
    expect(within(list).getByText('Book the train tickets')).toBeInTheDocument();
    const stored = await db.thoughts.toArray();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ content: 'Book the train tickets', category: 'task' });
    expect(coreStore.getState().signal?.kind).toBe('save');
    expect(screen.getByLabelText("What's on your mind?")).toHaveValue('');
  });

  it('saves with Ctrl+Enter', async () => {
    const user = userEvent.setup();
    render(<ClearPanel />);
    await user.type(screen.getByLabelText("What's on your mind?"), 'quick one{Control>}{Enter}{/Control}');
    await waitFor(async () => expect(await db.thoughts.count()).toBe(1));
  });

  it('releasing a thought never stores it', async () => {
    const user = userEvent.setup();
    render(<ClearPanel />);
    await user.type(screen.getByLabelText("What's on your mind?"), 'let this go');
    await user.click(screen.getByRole('button', { name: 'Release' }));

    expect(screen.getByLabelText("What's on your mind?")).toHaveValue('');
    expect(screen.getByTestId('dissolve')).toHaveTextContent('let this go');
    expect(screen.getByText('Released. Nothing was saved.')).toBeInTheDocument();
    expect(coreStore.getState().signal?.kind).toBe('release');
    // Give any (incorrect) async write a chance to land.
    await new Promise((r) => setTimeout(r, 50));
    expect(await db.thoughts.count()).toBe(0);
    expect(JSON.stringify({ ...window.localStorage })).not.toContain('let this go');
  });

  it('Save and Release are disabled for blank input', async () => {
    const user = userEvent.setup();
    render(<ClearPanel />);
    await user.type(screen.getByLabelText("What's on your mind?"), '    ');
    expect(screen.getByRole('button', { name: 'Save thought' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Release' })).toBeDisabled();
  });

  it('edits a saved thought', async () => {
    await db.thoughts.add({ id: 't1', content: 'first draft', category: null, createdAt: 1_760_000_000_000, updatedAt: 1_760_000_000_000 });
    const user = userEvent.setup();
    render(<ClearPanel />);
    await user.click(await screen.findByRole('button', { name: /Edit thought: first draft/ }));
    const field = screen.getByLabelText('Edit thought');
    await user.clear(field);
    await user.type(field, 'final version');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    // Wait for the editor to close: a controlled textarea's text content mirrors its
    // value, so querying earlier could match the (soon detached) textarea itself.
    await waitFor(() => expect(screen.queryByLabelText('Edit thought')).not.toBeInTheDocument());
    expect(await screen.findByText('final version', { selector: 'p' })).toBeInTheDocument();
    expect((await db.thoughts.get('t1'))?.content).toBe('final version');
  });

  it('deletes only after confirmation', async () => {
    await db.thoughts.add({ id: 't1', content: 'to remove', category: null, createdAt: 1_760_000_000_000, updatedAt: 1_760_000_000_000 });
    const user = userEvent.setup();
    render(<ClearPanel />);
    await user.click(await screen.findByRole('button', { name: /Delete thought: to remove/ }));
    // Cancel first: nothing happens.
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await db.thoughts.count()).toBe(1);
    await user.click(screen.getByRole('button', { name: /Delete thought: to remove/ }));
    await user.click(screen.getByRole('button', { name: 'Delete thought' }));
    await waitFor(async () => expect(await db.thoughts.count()).toBe(0));
    await waitFor(() => expect(screen.queryByText('to remove')).not.toBeInTheDocument());
  });

  it('searches saved thoughts', async () => {
    await db.thoughts.bulkAdd([
      { id: 'a', content: 'Call the dentist', category: 'task', createdAt: 1_760_000_000_000, updatedAt: 1_760_000_000_000 },
      { id: 'b', content: 'Song idea about rain', category: 'idea', createdAt: 1_760_000_000_001, updatedAt: 1_760_000_000_001 },
    ]);
    const user = userEvent.setup();
    render(<ClearPanel />);
    await screen.findByText('Call the dentist');
    await user.type(screen.getByLabelText('Search saved thoughts'), 'rain');
    expect(screen.queryByText('Call the dentist')).not.toBeInTheDocument();
    expect(screen.getByText('Song idea about rain')).toBeInTheDocument();
  });

  it('renders user text as text, never as HTML', async () => {
    await db.thoughts.add({
      id: 'x',
      content: '<img src=x onerror="window.__pwned=1">',
      category: null,
      createdAt: 1_760_000_000_000,
      updatedAt: 1_760_000_000_000,
    });
    render(<ClearPanel />);
    expect(await screen.findByText('<img src=x onerror="window.__pwned=1">')).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
  });
});
