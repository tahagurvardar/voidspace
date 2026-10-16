# Architecture

## Stack (installed versions)

| Purpose | Package |
| --- | --- |
| Framework | Next.js 16.4.1 (App Router, Turbopack), React 19.3.1 |
| Language | TypeScript 6.0.3, `strict` + `noUncheckedIndexedAccess` |
| Styling | Tailwind CSS 4.3.3 (tokens in `src/app/globals.css` `@theme`) |
| Motion | `motion` 14 (`LazyMotion` + `m`, features loaded async) |
| 3D | three 0.186, @react-three/fiber 9.8 |
| State | zustand 5 |
| Storage | dexie 4.4 + dexie-react-hooks 4.4 |
| Validation | zod 4.6 |
| Icons | lucide-react |
| Tests | vitest 5, @testing-library/react 16, jsdom, fake-indexeddb, @playwright/test 1.64 |

Version notes: TypeScript 7 was available but is outside `typescript-eslint`'s supported range (`<6.1`), so 6.0.3 is pinned; ESLint 9 is used because `eslint-plugin-react` does not yet support ESLint 10. pnpm's `minimumReleaseAge` supply-chain policy is respected (no exclusions); `pnpm-workspace.yaml` disables build scripts for `unrs-resolver` and `sharp` (prebuilt binaries are used).

## Layout

```
src/
  app/                  layout.tsx (fonts, metadata), page.tsx (Server Component), globals.css, icon.svg
  components/
    layout/             AppShell (client root), Header, ModeNav, modes.ts, motionFeatures.ts
    core/               LivingCore (layer + anchor + mode selection), CoreScene (R3F, lazy),
                        CoreFallback (CSS orb), coreDynamics.ts (pure), coreShaders.ts, webgl.ts
    ui/                 Dialog/ConfirmDialog (native <dialog>), Toasts
  features/
    clear/              ClearPanel, ThoughtList, ThoughtEditForm, CategoryPicker, categories.ts
    focus/              timerMachine.ts (pure), focusStore.ts (store factory), focusInstance.ts (app wiring,
                        runtime hook), snapshotStorage.ts, stats.ts, FocusPanel, SessionList
    explore/            ExplorePanel, useCanvasLoop, orbit/OrbitSimulation.ts (pure) + OrbitLab,
                        echo/EchoField.ts (pure) + EchoWaves
    archive/            ArchivePanel, Constellation, constellationLayout.ts (pure)
    settings/           SettingsDialog, DataSettings
  hooks/                useMediaQuery, useReducedMotion, useLiveData
  lib/
    storage/            db.ts (Dexie schema), *Repository.ts, backup.ts, errors.ts
    audio/              soundEngine.ts (Web Audio synthesis)
    validation/         schemas.ts (Zod)
    utils/              id, hash (FNV-1a + mulberry32), time, cn
  store/                appStore (mode, dialogs, toasts), coreStore (vanilla; renderer channel),
                        preferencesStore
  types/                domain types and defaults
tests/  unit/  integration/  e2e/  setup.ts  helpers.ts
```

Deviation from the suggested structure: `src/hooks` was added for cross-feature hooks; `focusInstance.ts` lives in the focus feature because it wires the timer to app-level effects.

## Key decisions

1. **Single route, client shell.** `page.tsx` is a Server Component rendering `AppShell` (a client boundary). The page is statically prerendered: the start screen, headline, cards and CSS orb are in the HTML. All browser-dependent work (IndexedDB, WebGL, audio, hash) runs in effects, so server and client markup match (no hydration errors). Mode is in zustand and mirrored to `location.hash`.

2. **One Living Core, never remounted.** `LivingCoreLayer` mounts one fixed, `pointer-events: none` R3F canvas for the whole session. A single `CoreAnchor` element stays mounted across modes (only its size/position change); the scene reads the anchor's bounding rect every frame and damps toward it, so the orb glides between layouts. The scene reads mode, signals and pointer from a **vanilla zustand store** (`coreStore.getState()` inside `useFrame`), so animation never causes React renders. Rendering is scissor-clipped to the `<main>` region so the orb never paints over header or nav while content scrolls. Orthographic camera: 1 world unit = 1 CSS pixel.

3. **Progressive enhancement & fallbacks.** The CSS orb (`CoreFallback`) is server-rendered and shown until the WebGL scene reports its first frame (`webglReady`), then fades out. `chooseCoreRenderMode` picks static when WebGL is missing, has failed (error boundary or `webglcontextlost`), reduced motion is active, or Graphics = Static. Three.js is only downloaded when WebGL will be used (`next/dynamic`, `ssr: false`). Quality profiles cap DPR (1–2) and particle count; Auto lowers DPR to 1 if the first 120 frames average under ~40 FPS.

4. **Timer = pure state machine over timestamps.** `timerMachine.ts` has no React, no timers. States: `idle`, `running` (`segmentStartedAt`, `accumulatedMs`), `paused`, `completed`. Elapsed = accumulated + (now − segment start), clamped. Completion time is computed exactly (`endsAt`), so background throttling cannot skew records. Every transition is persisted to a localStorage snapshot; a heartbeat (`lastSeenAt`, every 5 s and on `pagehide`/`visibilitychange`) distinguishes a reload (≤ 2 min gap → continue) from an abandoned session (> 2 min → `interrupted`, credited to the last heartbeat). Records are written idempotently by session id (safe for retries, reload re-emission of an unsaved completion, and multiple tabs). Cross-tab: `storage` events mirror the snapshot. `focusStore.ts` is a factory with injected dependencies (clock, ids, persistence, effects) for deterministic tests; `focusInstance.ts` wires the real ones and a runtime hook (end-time timeout, 1 s safety tick, heartbeat, visibility, title).

5. **Repositories over Dexie.** UI never touches tables directly for writes. `thoughtsRepository` validates with Zod, `focusSessionsRepository` validates record invariants (e.g. *completed ⇒ actual = planned*), `preferencesRepository` normalises field by field. All failures are mapped by `toStorageError` to `quota` / `unavailable` / `validation` / `unknown` with specific messages. Reads use `useLiveQuery` (reactive, also across tabs) wrapped so errors become state instead of thrown render errors.

6. **Schema & backup versioning.** `db.ts` documents the rule: never edit a published `db.version(n)`; add `version(n+1).upgrade()`. Only v1 exists (this is the first release with this schema). Backups carry `formatVersion`; `parseBackup` refuses newer formats, runs registered migrations for older ones (none needed yet), then validates. Import is a dry-run plan followed by one atomic transaction.

7a. **Constellation placement.** Stars are placed oldest-first; each tries up to 24 id-seeded candidate positions and keeps the first that is ≥ 7 % from already-placed stars (or the best one found). Positions never depend on note text, and adding newer notes never moves older ones; deleting a note can only shift newer stars that had collided with it.

7. **Explore engines are pure, renderers are thin.** `OrbitSimulation` (typed arrays, no allocation per step, clamped dt, speed cap, soft walls, deterministic seed) and `EchoField` (bounded wave list, analytic circle intersections) are unit tested. `useCanvasLoop` owns DPR sizing, one rAF chain, sleep when idle/hidden, and cleanup. Explore uses Canvas 2D, so it works without WebGL.

8. **Accessibility.** Native `<dialog>` for modals (focus containment, Esc, focus return). Headings receive focus after user navigation. Toggle groups use `aria-pressed`; Explore uses a real tablist with arrow keys; the constellation uses a roving tab index. Interactive canvases have `role="application"`, labels and keyboard alternatives. Live regions announce saves/releases/timer state changes (not every second). Reduced motion is honoured by the core, CSS animations and Motion (`MotionConfig`).

9. **Sound.** Synthesised with Web Audio (no audio assets/licensing). `AudioContext` is created lazily on the first sound, which always follows a user action. Off by default.

10. **Security & privacy.** No `dangerouslySetInnerHTML`; user text only rendered as React text. Imports are untrusted: size cap, JSON parse guard, strict schema (unknown keys stripped, ID charset restricted, timestamp bounds), duplicate-id rejection. Security headers set in `next.config.ts` (nosniff, no-referrer, frame DENY, permissions policy). IDs are random UUIDs, never derived from content; URLs only contain the mode.

## Performance notes

- Initial JS ≈ 272 KB gzipped across 10 chunks (measured from the production HTML): react-dom ≈ 70 KB, the app chunk with Dexie, Zod and icons ≈ 64 KB, Next/React runtime chunks ≈ 85 KB, the rest smaller. three.js/R3F (≈ 239 KB gz) is a separate lazy chunk, loaded only when WebGL is used. Settings (backup code) and Explore are lazy as well.
- Core: one draw call each for orb, halo, two rings, two moons, dust points (10–28) and two effect meshes; DPR capped; adaptive DPR on Auto; scissor-clipped.
- Orbit Lab: 3 fill-style changes per frame regardless of particle count; DPR capped at 1.5.
