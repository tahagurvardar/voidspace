import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { VoidspaceDB } from '@/lib/storage/db';
import { ArchivePanel } from '@/features/archive/ArchivePanel';
import { nodePosition } from '@/features/archive/constellationLayout';
import { useAppStore } from '@/store/appStore';
import { freshDb } from '../helpers';

let db: VoidspaceDB;
const T = 1_760_000_000_000;

beforeEach(async () => {
  db = await freshDb();
  useAppStore.setState({ archiveFocusId: null });
  await db.thoughts.bulkAdd([
    { id: 'n1', content: 'First idea', category: 'idea', createdAt: T, updatedAt: T },
    { id: 'n2', content: 'Second idea', category: 'idea', createdAt: T + 1, updatedAt: T + 1 },
    { id: 'n3', content: 'A plain note', category: null, createdAt: T + 2, updatedAt: T + 2 },
  ]);
  await db.focusSessions.bulkAdd([
    { id: 's1', plannedDurationSeconds: 1500, actualFocusedSeconds: 1500, startedAt: T, endedAt: T + 1_500_000, status: 'completed' },
    { id: 's2', plannedDurationSeconds: 900, actualFocusedSeconds: 300, startedAt: T + 2e6, endedAt: T + 2.3e6, status: 'canceled' },
  ]);
});

describe('Archive', () => {
  it('shows one star per stored thought at its stable position', async () => {
    render(<ArchivePanel />);
    const nodes = await screen.findAllByTestId('constellation-node');
    expect(nodes).toHaveLength(3);
    const n1 = nodes.find((n) => n.dataset.nodeId === 'n1')!;
    const { x, y } = nodePosition('n1');
    expect(n1.style.left).toBe(`${x}%`);
    expect(n1.style.top).toBe(`${y}%`);
  });

  it('selecting a star reveals the note, which can be edited', async () => {
    const user = userEvent.setup();
    render(<ArchivePanel />);
    await user.click(await screen.findByRole('button', { name: /Idea: Second idea/ }));
    const detail = screen.getByTestId('selected-thought');
    expect(within(detail).getByText('Second idea')).toBeInTheDocument();
    await user.click(within(detail).getByRole('button', { name: 'Edit' }));
    const field = within(detail).getByLabelText('Edit thought');
    await user.clear(field);
    await user.type(field, 'Second idea, refined');
    await user.click(within(detail).getByRole('button', { name: 'Save changes' }));
    await waitFor(async () => expect((await db.thoughts.get('n2'))?.content).toBe('Second idea, refined'));
  });

  it('deletes the selected note after confirmation', async () => {
    const user = userEvent.setup();
    render(<ArchivePanel />);
    await user.click(await screen.findByRole('button', { name: /A plain note/ }));
    await user.click(within(screen.getByTestId('selected-thought')).getByRole('button', { name: 'Delete' }));
    await user.click(screen.getByRole('button', { name: 'Delete thought' }));
    await waitFor(async () => expect(await db.thoughts.get('n3')).toBeUndefined());
    await waitFor(() => expect(screen.getAllByTestId('constellation-node')).toHaveLength(2));
  });

  it('is keyboard navigable with a single tab stop and arrow keys', async () => {
    const user = userEvent.setup();
    render(<ArchivePanel />);
    const nodes = await screen.findAllByTestId('constellation-node');
    expect(nodes.filter((n) => n.tabIndex === 0)).toHaveLength(1);
    nodes.find((n) => n.tabIndex === 0)!.focus();
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toHaveAttribute('data-node-id', 'n1'); // wraps from newest to oldest
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toHaveAttribute('data-node-id', 'n2');
    expect(screen.getByTestId('selected-thought')).toHaveTextContent('Second idea');
  });

  it('search dims non-matching stars and removes them from keyboard order', async () => {
    const user = userEvent.setup();
    render(<ArchivePanel />);
    await screen.findAllByTestId('constellation-node');
    await user.type(screen.getByLabelText('Search the archive'), 'plain');
    const disabled = screen.getAllByTestId('constellation-node').filter((n) => (n as HTMLButtonElement).disabled);
    expect(disabled.map((n) => n.dataset.nodeId).sort()).toEqual(['n1', 'n2']);
  });

  it('previews a star on hover/focus and highlights the selected one', async () => {
    const user = userEvent.setup();
    render(<ArchivePanel />);
    const star = await screen.findByRole('button', { name: /Idea: First idea/ });
    await user.hover(star);
    expect(screen.getByTestId('constellation-preview')).toHaveTextContent('First idea');
    await user.click(star);
    expect(star).toHaveAttribute('aria-pressed', 'true');
    expect(within(screen.getByTestId('selected-thought')).getByRole('button', { name: 'Edit' })).toBeVisible();
  });

  it('offers an accessible list view with the same notes', async () => {
    const user = userEvent.setup();
    render(<ArchivePanel />);
    await user.click(await screen.findByRole('button', { name: 'List' }));
    const list = screen.getByRole('list', { name: 'Archived thoughts' });
    expect(within(list).getAllByTestId('thought-item')).toHaveLength(3);
    expect(within(list).getByText('A plain note')).toBeInTheDocument();
  });

  it('shows focus history totals derived from stored sessions', async () => {
    render(<ArchivePanel />);
    const history = (await screen.findByRole('heading', { name: 'Focus history' })).closest('section')!;
    await waitFor(() => expect(within(history).getAllByTestId('session-item')).toHaveLength(2));
    const items = within(history).getAllByTestId('session-item');
    expect(items[0]).toHaveTextContent('Canceled'); // newest first
    expect(items[1]).toHaveTextContent('25 min');
    expect(within(history).getByText('Completed time').nextElementSibling).toHaveTextContent('25 min');
    expect(within(history).getByText('Canceled', { selector: 'span' })).toBeInTheDocument();
  });
});
