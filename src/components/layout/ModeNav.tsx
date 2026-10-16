'use client';

import type { AppMode } from '@/types';
import { cn } from '@/lib/utils/cn';
import { MODES, NAV_MODES, type NavMode } from './modes';

/**
 * The three mode cards from the reference. On the start screen they are large
 * cards with a one-line summary; once a mode is open they become a compact
 * tab bar along the bottom edge.
 */
export function ModeNav({ mode, onNavigate }: { mode: AppMode; onNavigate: (m: NavMode) => void }) {
  const home = mode === 'home';
  return (
    <nav
      aria-label="Modes"
      className={cn(
        'relative z-20 grid grid-cols-3 gap-2 px-3 sm:gap-3 sm:px-6',
        'pb-[max(0.75rem,env(safe-area-inset-bottom))]',
        home ? 'pt-2' : 'border-t border-line/70 bg-void pt-2.5',
      )}
    >
      {NAV_MODES.map((id) => {
        const m = MODES[id];
        const Icon = m.icon;
        const active = mode === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onNavigate(id)}
            aria-current={active ? 'page' : undefined}
            aria-keyshortcuts={m.shortcut}
            className={cn(
              'group vs-surface relative flex flex-col items-center justify-center text-center transition-colors duration-200',
              'hover:border-line-strong hover:bg-surface-raised',
              home
                ? 'min-h-24 gap-2 px-3 py-4 sm:min-h-28 [@media(max-height:820px)]:sm:min-h-24 [@media(max-height:820px)]:sm:py-3'
                : 'min-h-13 gap-1 px-2 py-1.5 md:min-h-12 md:flex-row md:gap-2.5',
              active && 'border-violet/50 bg-surface-raised',
            )}
            data-testid={`nav-${id}`}
          >
            <Icon
              size={home ? 20 : 18}
              className={cn('transition-colors', active ? 'text-violet-soft' : 'text-violet-soft/80 group-hover:text-violet-soft')}
              aria-hidden="true"
            />
            <span className={cn('text-[0.8125rem] tracking-[0.08em] uppercase sm:text-sm', active ? 'text-ink' : 'text-ink/90')}>
              {m.label}
            </span>
            {home && <span className="text-[0.6875rem] leading-snug text-ink-muted sm:text-xs">{m.summary}</span>}
            {active && (
              <span className="absolute inset-x-6 -bottom-px h-px bg-gradient-to-r from-transparent via-violet-soft to-transparent" aria-hidden="true" />
            )}
          </button>
        );
      })}
    </nav>
  );
}
