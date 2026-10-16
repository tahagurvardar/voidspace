'use client';

import { useId, useState, type ReactNode } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { useAppStore } from '@/store/appStore';
import { usePreferencesStore } from '@/store/preferencesStore';
import { soundEngine } from '@/lib/audio/soundEngine';
import { focusMinutesSchema, firstIssueMessage } from '@/lib/validation/schemas';
import { useCoreRenderMode } from '@/components/core/LivingCore';
import type { GraphicsQuality, MotionPreference, Preferences } from '@/types';
import { focusStore } from '@/features/focus/focusInstance';
import { DataSettings } from './DataSettings';

function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="border-t border-line py-5 first:border-t-0 first:pt-1">
      <h3 id={id} className="mb-3 text-sm font-medium text-ink">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Choice<T extends string>({
  legend,
  value,
  options,
  onChange,
}: {
  legend: string;
  value: T;
  options: ReadonlyArray<{ id: T; label: string }>;
  onChange: (v: T) => void;
}) {
  const name = useId();
  return (
    <fieldset>
      <legend className="sr-only">{legend}</legend>
      <div className="vs-segment flex-wrap">
        {options.map((o) => (
          <label key={o.id}>
            <input type="radio" className="sr-only" name={name} checked={value === o.id} onChange={() => onChange(o.id)} />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

const MOTION_OPTIONS: ReadonlyArray<{ id: MotionPreference; label: string }> = [
  { id: 'system', label: 'Match system' },
  { id: 'reduce', label: 'Reduced' },
  { id: 'full', label: 'Full' },
];

const GRAPHICS_OPTIONS: ReadonlyArray<{ id: GraphicsQuality; label: string }> = [
  { id: 'auto', label: 'Auto' },
  { id: 'high', label: 'High' },
  { id: 'low', label: 'Low' },
  { id: 'static', label: 'Static' },
];

export function SettingsDialog() {
  const open = useAppStore((s) => s.settingsOpen);
  const close = useAppStore((s) => s.closeSettings);
  const toast = useAppStore((s) => s.toast);
  const prefs = usePreferencesStore((s) => s.prefs);
  const update = usePreferencesStore((s) => s.update);
  const core = useCoreRenderMode();
  const [minutes, setMinutes] = useState('');
  const [minutesError, setMinutesError] = useState<string | null>(null);
  const soundId = useId();
  const volumeId = useId();
  const minutesId = useId();

  const set = (patch: Partial<Preferences>) =>
    update(patch).catch((e: unknown) => toast(e instanceof Error ? e.message : 'Could not save settings.', 'error'));

  const coreStatus =
    core.mode === 'webgl'
      ? 'The 3D core is on.'
      : prefs.graphicsQuality === 'static'
        ? 'Showing the static core.'
        : core.reducedMotion
          ? 'Showing the static core because reduced motion is on.'
          : 'Showing the static core because 3D graphics are unavailable in this browser.';

  return (
    <Dialog open={open} onClose={close} title="Settings" className="w-[min(100vw-2rem,36rem)]">
      <Section title="Sound">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <label htmlFor={soundId} className="text-sm text-ink-muted">
              Sound effects for saving, releasing and finishing a session
            </label>
            <input
              id={soundId}
              type="checkbox"
              role="switch"
              aria-checked={prefs.soundEnabled}
              className="size-5 shrink-0 accent-violet"
              checked={prefs.soundEnabled}
              onChange={(e) => void set({ soundEnabled: e.target.checked })}
            />
          </div>
          <div className="flex items-center gap-3">
            <label htmlFor={volumeId} className="w-16 text-sm text-ink-muted">
              Volume
            </label>
            <input
              id={volumeId}
              type="range"
              min={0}
              max={1}
              step={0.05}
              className="flex-1"
              value={prefs.volume}
              onChange={(e) => void set({ volume: Number(e.target.value) })}
            />
            <button
              type="button"
              className="vs-btn vs-btn-ghost !min-h-9 !px-3 text-xs"
              disabled={!prefs.soundEnabled}
              onClick={() => soundEngine.play('test')}
            >
              Test
            </button>
          </div>
          {!soundEngine.isSupported && <p className="text-xs text-ink-faint">This browser does not support Web Audio.</p>}
        </div>
      </Section>

      <Section title="Motion">
        <Choice legend="Motion" value={prefs.motionPreference} options={MOTION_OPTIONS} onChange={(v) => void set({ motionPreference: v })} />
        <p className="mt-2 text-xs text-ink-faint">Reduced motion keeps the core still and shortens transitions.</p>
      </Section>

      <Section title="Graphics">
        <Choice legend="Graphics quality" value={prefs.graphicsQuality} options={GRAPHICS_OPTIONS} onChange={(v) => void set({ graphicsQuality: v })} />
        <p className="mt-2 text-xs text-ink-faint" data-testid="core-status">
          {coreStatus} Auto lowers resolution on slower devices; Static uses no 3D at all.
        </p>
      </Section>

      <Section title="Focus">
        <form
          className="flex flex-wrap items-start gap-2"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            const parsed = focusMinutesSchema.safeParse(minutes);
            if (!parsed.success) {
              setMinutesError(firstIssueMessage(parsed.error));
              return;
            }
            setMinutesError(null);
            void set({ defaultFocusDuration: parsed.data });
            focusStore.getState().setPlannedMinutes(parsed.data);
            setMinutes('');
            toast(`Default session length set to ${parsed.data} minutes.`, 'success');
          }}
        >
          <div className="flex flex-col gap-1">
            <label htmlFor={minutesId} className="text-sm text-ink-muted">
              Default session length (now {prefs.defaultFocusDuration} min)
            </label>
            <input
              id={minutesId}
              type="number"
              min={1}
              max={180}
              inputMode="numeric"
              className="vs-input w-32 !py-2"
              placeholder={String(prefs.defaultFocusDuration)}
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              aria-invalid={!!minutesError}
              aria-describedby={minutesError ? `${minutesId}-error` : undefined}
            />
            {minutesError && (
              <p id={`${minutesId}-error`} role="alert" className="text-xs text-danger">
                {minutesError}
              </p>
            )}
          </div>
          <button type="submit" className="vs-btn vs-btn-ghost mt-6" disabled={!minutes}>
            Set default
          </button>
        </form>
      </Section>

      <Section title="Your data">
        <DataSettings />
      </Section>

      <Section title="Keyboard">
        <label className="mb-4 flex items-center gap-2 text-sm text-ink-muted">
          <input
            type="checkbox"
            className="size-4 accent-violet"
            checked={prefs.modeShortcutsEnabled}
            onChange={(e) => void set({ modeShortcutsEnabled: e.target.checked })}
          />
          Enable single-key mode shortcuts (1–4)
        </label>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          {[
            ['1, 2, 3', 'Clear, Focus, Explore'],
            ['4', 'Archive'],
            ['Esc', 'Back to the start (outside text fields)'],
            ['Ctrl/⌘ + Enter', 'Save the thought you are writing'],
          ].map(([k, v]) => (
            <div key={k} className="contents">
              <dt>
                <kbd className="rounded border border-line bg-void-deep px-1.5 py-0.5 text-xs text-ink">{k}</kbd>
              </dt>
              <dd className="text-ink-muted">{v}</dd>
            </div>
          ))}
        </dl>
      </Section>
    </Dialog>
  );
}
