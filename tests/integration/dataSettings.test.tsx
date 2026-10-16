import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DataSettings } from '@/features/settings/DataSettings';
import { MAX_BACKUP_BYTES } from '@/lib/storage/backup';
import { freshDb } from '../helpers';

beforeEach(async () => {
  await freshDb();
});

const backup = JSON.stringify({
  app: 'voidspace', formatVersion: 1, exportedAt: '2026-10-16T00:00:00.000Z',
  data: { thoughts: [], focusSessions: [] },
});

describe('data settings', () => {
  it('rejects oversized files before reading their contents', async () => {
    render(<DataSettings />);
    const file = new File([' '.repeat(MAX_BACKUP_BYTES + 1)], 'large.json', { type: 'application/json' });
    const read = vi.fn().mockResolvedValue(backup);
    Object.defineProperty(file, 'text', { value: read });
    await userEvent.setup().upload(screen.getByLabelText('Import backup'), file);
    expect(await screen.findByRole('alert')).toHaveTextContent(/larger than 5 MB/);
    expect(screen.getByLabelText('Import backup')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Import backup')).toHaveAccessibleDescription(/larger than 5 MB/);
    expect(read).not.toHaveBeenCalled();
    expect(screen.queryByTestId('import-plan')).not.toBeInTheDocument();
    const valid = new File([backup], 'valid.json', { type: 'application/json' });
    Object.defineProperty(valid, 'text', { value: async () => backup });
    await userEvent.setup().upload(screen.getByLabelText('Import backup'), valid);
    expect(await screen.findByTestId('import-plan')).toBeInTheDocument();
    expect(screen.getByLabelText('Import backup')).toHaveAttribute('aria-invalid', 'false');
    expect(screen.getByLabelText('Import backup')).not.toHaveAttribute('aria-describedby');
  });

  it('blocks conflicting data actions until the selected file finishes loading', async () => {
    render(<DataSettings />);
    let finish!: (text: string) => void;
    const file = new File(['{}'], 'backup.json', { type: 'application/json' });
    Object.defineProperty(file, 'text', { value: () => new Promise<string>((resolve) => { finish = resolve; }) });
    await userEvent.setup().upload(screen.getByLabelText('Import backup'), file);
    try {
      expect(screen.getByLabelText('Import backup')).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Export backup' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Delete all data…' })).toBeDisabled();
    } finally {
      await act(async () => finish(backup));
    }
    expect(await screen.findByTestId('import-plan')).toBeInTheDocument();
    expect(screen.getByLabelText('Import backup')).toBeEnabled();
  });

  it('discards the pending backup preview after deleting all data', async () => {
    render(<DataSettings />);
    const user = userEvent.setup();
    const file = new File([backup], 'backup.json', { type: 'application/json' });
    Object.defineProperty(file, 'text', { value: async () => backup });
    await user.upload(screen.getByLabelText('Import backup'), file);
    expect(await screen.findByTestId('import-plan')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Delete all data…' }));
    await user.type(screen.getByLabelText('Type DELETE to confirm'), 'DELETE');
    await user.click(screen.getByRole('button', { name: 'Delete everything' }));
    await waitFor(() => expect(screen.queryByTestId('import-plan')).not.toBeInTheDocument());
  });
});
