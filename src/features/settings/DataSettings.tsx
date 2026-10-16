'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Download, HardDrive, Trash2, Upload } from 'lucide-react';
import {
  applyImport,
  backupFileName,
  deleteAllData,
  exportBackup,
  parseBackup,
  planImport,
  type ConflictStrategy,
  type ImportPlan,
} from '@/lib/storage/backup';
import { preferencesRepository } from '@/lib/storage/preferencesRepository';
import { useAppStore } from '@/store/appStore';
import { usePreferencesStore } from '@/store/preferencesStore';
import { focusStore } from '@/features/focus/focusInstance';
import { createIdle } from '@/features/focus/timerMachine';
import { DEFAULT_PREFERENCES } from '@/types';

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

async function readStorageInfo(): Promise<{
  estimate: { usage: number; quota: number } | null;
  persisted: boolean | null;
}> {
  try {
    const sm = navigator.storage;
    const e = sm?.estimate ? await sm.estimate() : null;
    const persisted = sm?.persisted ? await sm.persisted() : null;
    return { estimate: e ? { usage: e.usage ?? 0, quota: e.quota ?? 0 } : null, persisted };
  } catch {
    return { estimate: null, persisted: null }; // informational only
  }
}

const STRATEGIES: Array<{ id: ConflictStrategy; label: string; help: string }> = [
  { id: 'keep-newer', label: 'Keep the newer version', help: 'Compare edit times and keep whichever copy changed last.' },
  { id: 'keep-existing', label: 'Keep what is on this device', help: 'Only add items that are not here yet.' },
  { id: 'replace', label: 'Use the backup', help: 'Overwrite matching items with the backup copy.' },
];

export function DataSettings() {
  const toast = useAppStore((s) => s.toast);
  const hydratePrefs = usePreferencesStore((s) => s.hydrate);
  const [estimate, setEstimate] = useState<{ usage: number; quota: number } | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [strategy, setStrategy] = useState<ConflictStrategy>('keep-newer');
  const [includePrefs, setIncludePrefs] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteText, setDeleteText] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const fileId = useId();
  const deleteId = useId();
  const strategyName = useId();

  const refreshStorageInfo = useCallback(() => {
    void readStorageInfo().then((info) => {
      setEstimate(info.estimate);
      setPersisted(info.persisted);
    });
  }, []);

  useEffect(refreshStorageInfo, [refreshStorageInfo]);

  const doExport = async () => {
    setBusy(true);
    try {
      const backup = await exportBackup();
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = backupFileName();
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast(
        `Backup exported: ${backup.data.thoughts.length} thoughts, ${backup.data.focusSessions.length} sessions.`,
        'success',
      );
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Export failed.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (file: File | undefined) => {
    setPlan(null);
    setImportError(null);
    if (!file) return;
    setBusy(true);
    try {
      const text = await file.text();
      const backup = parseBackup(text);
      setPlan(await planImport(backup));
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'That file could not be read.');
    } finally {
      setBusy(false);
    }
  };

  const doImport = async () => {
    if (!plan) return;
    setBusy(true);
    try {
      const result = await applyImport(plan.backup, { strategy, includePreferences: includePrefs });
      if (result.preferencesApplied) hydratePrefs(await preferencesRepository.load());
      toast(
        `Imported ${result.thoughtsWritten} thoughts and ${result.focusSessionsWritten} sessions${
          result.skipped ? `; ${result.skipped} unchanged or kept` : ''
        }.`,
        'success',
      );
      setPlan(null);
      if (fileRef.current) fileRef.current.value = '';
      refreshStorageInfo();
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'Import failed. Nothing was changed.');
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async () => {
    setBusy(true);
    try {
      await deleteAllData();
      focusStore.setState({ timer: createIdle(DEFAULT_PREFERENCES.defaultFocusDuration * 60) });
      hydratePrefs({ ...DEFAULT_PREFERENCES });
      setDeleteOpen(false);
      setDeleteText('');
      toast('All VOIDSPACE data on this device was deleted.');
      refreshStorageInfo();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Delete failed.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const conflicts = plan ? plan.thoughts.conflicting + plan.focusSessions.conflicting : 0;

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm leading-relaxed text-ink-muted">
        Everything is stored only in this browser on this device. Nothing is uploaded. Browser storage is not a
        backup: clearing site data, private windows or a new device mean starting empty. Export a backup to keep a
        copy you control.
      </p>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-ink-faint">
        <span className="inline-flex items-center gap-1.5">
          <HardDrive size={14} aria-hidden="true" />
          {estimate ? `${formatBytes(estimate.usage)} used` : 'Storage usage unavailable'}
        </span>
        {persisted !== null && (
          <span>{persisted ? 'Protected from automatic cleanup' : 'May be cleared by the browser when space runs low'}</span>
        )}
        {persisted === false && (
          <button
            type="button"
            className="text-violet-soft underline-offset-2 hover:underline"
            onClick={async () => {
              try {
                const ok = await navigator.storage.persist();
                setPersisted(ok);
                toast(ok ? 'The browser will keep VOIDSPACE data.' : 'The browser declined. Export backups regularly.');
              } catch {
                toast('This browser does not support protected storage.');
              }
            }}
          >
            Ask the browser to keep it
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" className="vs-btn vs-btn-ghost" onClick={() => void doExport()} disabled={busy}>
          <Download size={15} aria-hidden="true" />
          Export backup
        </button>
        <label htmlFor={fileId} className="vs-btn vs-btn-ghost cursor-pointer has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-violet-soft">
          <Upload size={15} aria-hidden="true" />
          Import backup
          <input
            ref={fileRef}
            id={fileId}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
        </label>
      </div>

      {importError && (
        <p role="alert" className="text-sm text-danger">
          {importError}
        </p>
      )}

      {plan && (
        <div className="vs-surface flex flex-col gap-4 p-4" data-testid="import-plan">
          <div className="text-sm">
            <p className="text-ink">This backup contains:</p>
            <ul className="mt-1 list-inside list-disc text-ink-muted">
              <li>
                {plan.backup.data.thoughts.length} thoughts ({plan.thoughts.new} new, {plan.thoughts.conflicting} differ
                from this device, {plan.thoughts.identical} already here)
              </li>
              <li>
                {plan.backup.data.focusSessions.length} focus sessions ({plan.focusSessions.new} new,{' '}
                {plan.focusSessions.conflicting} differ, {plan.focusSessions.identical} already here)
              </li>
            </ul>
            <p className="mt-2 text-xs text-ink-faint">Nothing on this device is removed by an import.</p>
          </div>

          {conflicts > 0 && (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-xs text-ink-muted">When an item exists in both places</legend>
              {STRATEGIES.map((s) => (
                <label key={s.id} className="flex cursor-pointer items-start gap-2 text-sm">
                  <input
                    type="radio"
                    name={strategyName}
                    className="mt-1 accent-violet"
                    checked={strategy === s.id}
                    onChange={() => setStrategy(s.id)}
                  />
                  <span>
                    <span className="text-ink">{s.label}</span>
                    <span className="block text-xs text-ink-faint">{s.help}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          )}

          {plan.hasPreferences && (
            <label className="flex items-center gap-2 text-sm text-ink-muted">
              <input type="checkbox" className="accent-violet" checked={includePrefs} onChange={(e) => setIncludePrefs(e.target.checked)} />
              Also import settings from the backup
            </label>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="vs-btn vs-btn-ghost"
              onClick={() => {
                setPlan(null);
                if (fileRef.current) fileRef.current.value = '';
              }}
            >
              Cancel
            </button>
            <button type="button" className="vs-btn vs-btn-primary" onClick={() => void doImport()} disabled={busy}>
              Import
            </button>
          </div>
        </div>
      )}

      <div className="border-t border-line pt-5">
        {!deleteOpen ? (
          <button type="button" className="vs-btn vs-btn-danger" onClick={() => setDeleteOpen(true)}>
            <Trash2 size={15} aria-hidden="true" />
            Delete all data…
          </button>
        ) : (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (deleteText === 'DELETE') void doDelete();
            }}
          >
            <p className="text-sm text-ink">
              This permanently deletes every thought, focus session and setting stored on this device, and stops any
              running timer. Export a backup first if you might want them back.
            </p>
            <label htmlFor={deleteId} className="text-xs text-ink-muted">
              Type DELETE to confirm
            </label>
            <input
              id={deleteId}
              className="vs-input"
              value={deleteText}
              onChange={(e) => setDeleteText(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="vs-btn vs-btn-ghost"
                onClick={() => {
                  setDeleteOpen(false);
                  setDeleteText('');
                }}
              >
                Cancel
              </button>
              <button type="submit" className="vs-btn vs-btn-danger" disabled={deleteText !== 'DELETE' || busy}>
                Delete everything
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
