'use client';

import { Archive, Settings, Volume2, VolumeX } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { usePreferencesStore } from '@/store/preferencesStore';
import { soundEngine } from '@/lib/audio/soundEngine';

export function Header({ onNavigate }: { onNavigate: (mode: 'home' | 'archive') => void }) {
  const mode = useAppStore((s) => s.mode);
  const openSettings = useAppStore((s) => s.openSettings);
  const toast = useAppStore((s) => s.toast);
  const soundEnabled = usePreferencesStore((s) => s.prefs.soundEnabled);
  const update = usePreferencesStore((s) => s.update);

  return (
    <header className="relative z-20 flex items-center justify-between gap-4 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-2 sm:px-6">
      <button
        type="button"
        onClick={() => onNavigate('home')}
        className="flex items-center gap-2 rounded-md text-[1.05rem] font-bold tracking-[0.02em] text-ink"
        aria-label="VOIDSPACE, back to start"
      >
        <span className="grid size-4 place-items-center rounded-full border-2 border-ink" aria-hidden="true">
          <span className="size-1.5 rounded-full bg-ink" />
        </span>
        VOIDSPACE
      </button>

      <div className="flex items-center gap-1 sm:gap-2">
        <span className="mr-2 hidden text-xs tracking-[0.06em] text-ink-muted uppercase sm:inline">V2 / Personal space</span>
        <button
          type="button"
          className="vs-icon-btn"
          aria-label="Archive"
          aria-pressed={mode === 'archive'}
          title="Archive (4)"
          onClick={() => onNavigate('archive')}
        >
          <Archive size={18} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="vs-icon-btn"
          aria-label="Sound effects"
          aria-pressed={soundEnabled}
          title={soundEnabled ? 'Sound on' : 'Sound off'}
          onClick={() => {
            const next = !soundEnabled;
            update({ soundEnabled: next })
              .then(() => {
                if (next) soundEngine.play('test');
              })
              .catch(() => toast('Could not save the sound setting.', 'error'));
          }}
        >
          {soundEnabled ? <Volume2 size={18} aria-hidden="true" /> : <VolumeX size={18} aria-hidden="true" />}
        </button>
        <button type="button" className="vs-icon-btn" aria-label="Settings" title="Settings" onClick={openSettings}>
          <Settings size={18} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
