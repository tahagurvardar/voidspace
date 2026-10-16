# Progress — VOIDSPACE v2.0.0

Last updated: 2026-10-16. VOIDSPACE v2.0.0 is released: source at https://github.com/tahagurvardar/voidspace, live at https://voidspace-pi.vercel.app (Vercel).

## Phase status

| Phase | Status | Notes |
| --- | --- | --- |
| 0 Foundation | Done | Node 24.20, pnpm 12.11, Git 2.55 audited; empty directory, `git init`. Dependencies installed within pnpm's release-age policy. TS strict, ESLint, Tailwind 4, Vitest, Playwright configured. |
| 1 Core experience | Done | Single-route shell, header, mode cards/tab bar, hash routing, keyboard shortcuts, focus management, Living Core (R3F) with CSS fallback, responsive layouts. Visually checked against the reference via screenshots (desktop 1280×800, mobile 390×844). |
| 2 Functional modules | Done | Clear, Focus (timestamp state machine, reload recovery, interrupted detection, cross-tab sync), Archive (constellation + list + history), Dexie repositories. |
| 3 Playground | Done | Orbit Lab and Echo Waves (Canvas 2D, pure engines, touch + keyboard, cleanup). |
| 4 Polish | Done | Settings (sound, motion, graphics, default length), Web Audio sounds, export/import with conflict strategies, storage estimate/persist, delete-all, lazy loading (three.js, Settings, Explore, Motion features). |
| 5 Release | Done | Full verification below; docs and release notes written; published to GitHub and deployed on Vercel (https://voidspace-pi.vercel.app). |

## Verification (actual results, release-preparation run 2026-10-16)

| Check | Command | Result |
| --- | --- | --- |
| Typecheck | `pnpm typecheck` | pass, 0 errors |
| Lint | `pnpm lint` | pass, 0 errors, 0 warnings |
| `pnpm verify` | typecheck → lint → test → build | exit code 0 |
| Unit + integration | `pnpm test` | 14 files, **124/124 passed** |
| Production build | `pnpm build` | pass; `/` statically prerendered |
| E2E | `pnpm test:e2e` | **34/34 passed** (17 scenarios × desktop + mobile, Edge) |
| Bundle | measured from production HTML | initial JS ≈ 272 KB gzipped; three.js chunk ≈ 239 KB gz loaded lazily |

### Issues found and fixed during verification

- Release preparation: the timer E2E paused the fake clock at a fixed instant 5 s after install; when page load took longer under load, that instant was in the past (`Cannot fast-forward to the past`). It now pauses relative to the page's current time; 6/6 isolated and 34/34 full runs pass.

- Clear's `<section>` shared the textarea's accessible name (duplicate label) → given its own label.
- Number inputs used native constraint validation, hiding our specific error messages → `noValidate`.
- React Compiler lint findings (state set in effects, mutation of memoised three.js uniforms) → refactored: uniforms mutated through material refs, simulation held in a ref, state initialised lazily.
- WebGL orb painted over the header while content scrolled on mobile → scissor-clipped rendering to `<main>`.
- Archive selected-note card fell below the fold on desktop → constellation height capped.
- E2E: Playwright `clock.runFor` flooded React's scheduler with interval ticks → replaced by a paused clock + `fastForward` with exact assertions (13:55 → paused 13:55 → 13:50 → survives reload at 13:50 → 13:40).
- E2E: 3 parallel workers starved the CPU (software WebGL) → default 2 workers, 60 s timeout; WebGL test asserts the scene actually drew a frame (`data-webgl-ready`) and allows one retry because software WebGL can legitimately fail under load (the app then falls back, as designed).
- Initial bundle reduced from ≈ 306 KB to ≈ 271 KB gz (LazyMotion, lazy Settings/Explore).

## Visual polish pass (2026-10-16)

Driven by a manual review plus measured screenshots at 1920×1080, 1440×900, 1366×768, 768×1024 and 390×844 (seeded with 12 thoughts and 6 sessions).

| Issue (measured before) | Cause | Fix |
| --- | --- | --- |
| Home scrolled at every size (e.g. 1366×768: 655 px content in 572 px) | The CSS orb's halo was an oversized absolute layer that counted as scroll overflow even while faded out; the orb was sized by `52dvh` alone | Halo is now a box-shadow (no overflow); orb width = `clamp(10rem, min(86vw, 100dvh − 22.5rem), 34rem)`. After: scroll height = client height at all five sizes |
| Archive note under the nav (1366: note bottom 727 px, nav top 684 px; 390: 1028 vs 764) | Note stacked below a tall constellation; transparent nav on desktop | Constellation height `clamp(16rem, 44dvh, 30rem)`; note scrolls into view on selection; Edit/Delete moved to the note's header row. After: 668 < 697 (1366), 742 < 766 (390), all sizes pass |
| Content appeared to slide under the nav | Nav transparent in modes on desktop; no bottom clearance | Solid compact nav bar with hairline; scroll areas get bottom padding and a 2.25 rem fade |
| Dead space at 1920 | Narrow centred panel, small core column | Core column `clamp(18rem, 30vw, 30rem)`, wider panel max width at xl/2xl, short panels centred vertically |
| Focus stats below the fold on laptops | Single column | Timer and stats side by side at xl; ring sized from viewport height |
| Explore controls could fall under the nav | Fixed canvas height | Canvas height `clamp(15rem, 100dvh − 27rem, 34rem)` |
| Clear form felt loose | Separate textarea, picker and buttons | One composer surface (textarea + category/actions footer, focus ring on the whole) |
| Heading widows ("…or let it / go.") | — | `text-wrap: balance` |
| Dev "N" badge over the nav | Next dev indicator | `devIndicators: false` |

Constellation: deterministic placement now avoids collisions (oldest first, each star tries its own id-seeded candidates; newer notes never move older stars), star size scales with collection size, the selected star gets a ring (animated only when motion is allowed) and its category path is drawn solid while others are dashed and dimmed, and hover/focus shows a preview label. Living Core: depth-faded rings, an atmospheric rim shell (one extra draw call), specular glint and cool bounce light, dust hidden when the core is small.

Verification after the pass: typecheck 0 errors; lint clean; **124/124** unit + integration tests; build passes; **E2E 34/34** (2 new layout regressions: start screen has no scroll; selected note ends above the nav). An intermittent unit-test failure (≈1 in 6 runs) was traced to the Clear edit test: a controlled textarea's text content mirrors its value, so `findByText` could match the soon-detached textarea. The test now waits for the editor to close and queries the rendered paragraph; 0 failures in 10 consecutive full runs afterwards. One earlier full E2E run had a single teardown timeout in the mobile Explore test that did not reproduce in 6 isolated repeats or the next full run (machine contention with software WebGL).

## Known limitations / open items

- Not verified on Firefox or Safari, or on real mobile hardware; E2E runs Chromium (Edge) only, with software WebGL.
- No real-GPU frame-rate measurement or Lighthouse audit was run.
- Sound output is not automatically tested (only defaults/toggles).
- Cross-tab timer sync is implemented but not covered by tests.
- Background-tab completion chime may be delayed by browser timer throttling (record times are exact).
- `THREE.Clock` deprecation warning is logged by the R3F runtime.
- Zod v4 contributes noticeably to the initial bundle; `zod/mini` would shrink it (not done).
- IndexedDB schema has a single version (v1); the migration path is documented but there is no real migration yet. Backup format has a migration registry with no entries yet.
- Dates use the browser locale (e.g. Turkish month names on a Turkish system) — intentional.
- Echo Waves' "Wave sound" toggle is independent of the global sound switch (it is its own explicit opt-in).

## Next steps

- Cross-browser checks (Firefox, Safari) and a real-device mobile pass on the live deployment.
- Lighthouse audit of the live URL.
- Optional bundle trim: `zod/mini` instead of full Zod.
