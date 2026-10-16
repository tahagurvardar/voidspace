'use client';

import { useId, useRef, useState } from 'react';
import { Orbit, Waves } from 'lucide-react';
import { OrbitLab } from './orbit/OrbitLab';
import { EchoWaves } from './echo/EchoWaves';

const TABS = [
  { id: 'orbit', label: 'Orbit Lab', icon: Orbit, blurb: 'Pull and push a field of particles.' },
  { id: 'echo', label: 'Echo Waves', icon: Waves, blurb: 'Send ripples across the dark and watch them cross.' },
] as const;
type TabId = (typeof TABS)[number]['id'];

/**
 * EXPLORE — two short creative breaks. Only the active experience is mounted,
 * so the hidden one costs nothing (its loop and listeners are torn down).
 */
export function ExplorePanel() {
  const [tab, setTab] = useState<TabId>('orbit');
  const base = useId();
  const tabRefs = useRef<Record<TabId, HTMLButtonElement | null>>({ orbit: null, echo: null });

  const select = (id: TabId, focus = false) => {
    setTab(id);
    if (focus) tabRefs.current[id]?.focus();
  };

  return (
    <div className="flex flex-col gap-5">
      <div
        role="tablist"
        aria-label="Experiences"
        className="vs-segment self-start"
        onKeyDown={(e) => {
          const i = TABS.findIndex((t) => t.id === tab);
          if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
            e.preventDefault();
            const next = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length]!;
            select(next.id, true);
          } else if (e.key === 'Home') {
            e.preventDefault();
            select(TABS[0].id, true);
          } else if (e.key === 'End') {
            e.preventDefault();
            select(TABS[TABS.length - 1]!.id, true);
          }
        }}
      >
        {TABS.map((t) => {
          const Icon = t.icon;
          const selected = tab === t.id;
          return (
            <button
              key={t.id}
              ref={(el) => {
                tabRefs.current[t.id] = el;
              }}
              type="button"
              role="tab"
              id={`${base}-tab-${t.id}`}
              aria-selected={selected}
              aria-controls={`${base}-panel-${t.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => select(t.id)}
            >
              <Icon size={15} aria-hidden="true" />
              {t.label}
            </button>
          );
        })}
      </div>

      {TABS.map((t) =>
        tab === t.id ? (
          <section
            key={t.id}
            role="tabpanel"
            id={`${base}-panel-${t.id}`}
            aria-labelledby={`${base}-tab-${t.id}`}
            className="flex flex-col gap-3"
          >
            <p className="text-sm text-ink-muted">{t.blurb}</p>
            {t.id === 'orbit' ? <OrbitLab /> : <EchoWaves />}
          </section>
        ) : null,
      )}
    </div>
  );
}
