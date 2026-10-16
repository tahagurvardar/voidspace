# Test plan

Three layers. All tests are deterministic where feasible: pure modules take `now`/seeds as inputs, the focus store takes an injected clock, React tests spy on `Date.now`, and E2E timer tests use Playwright's paused fake clock with `fastForward`.

## 1. Unit (`tests/unit`, Vitest)

| Area | File | Covers |
| --- | --- | --- |
| Timer machine | `focus/timerMachine.test.ts` | start/pause/resume/reset; exact completion time incl. pauses; reset never completes; short cancels not recorded; reset after end records the completion; invalid transitions ignored; delayed/skipped ticks (background tabs); quick reload continues; completion during reload; abandoned → interrupted with partial credit; paused survives any gap; completion re-emitted after reload |
| Focus store | `focus/focusStore.test.ts` | full session with mocked clock; cancel record; late single tick completes at exact end; snapshot on every transition; reload continuation; interrupted recovery; persistence failure reported |
| Statistics | `focus/stats.test.ts` | totals from records only; canceled/interrupted never count as completed; "today" boundary |
| Orbit Lab engine | `explore/orbitSimulation.test.ts` | determinism; particle cap; attract vs repel; intensity; bounds & finiteness under huge dt; reset; resize |
| Echo Waves engine | `explore/echoField.test.ts` | expansion/fade; expiry → idle; cap; clear; exact intersection points; no false intersections |
| Constellation | `archive/constellationLayout.test.ts` | deterministic; first star at its id position; older stars never move when newer notes are added; edits never move stars; minimum spacing for moderate collections; margins for 400 stars; size scaling by collection; same-category chronological links |
| Core | `core/core.test.ts` | render-mode decision (no WebGL, failure, reduced motion, Static); WebGL probe failure/throw/release; reduced-motion resolution; mode targets; signal envelopes; frame-rate-independent damping |

## 2. Integration (`tests/integration`, Vitest + RTL + fake-indexeddb)

| Area | File | Covers |
| --- | --- | --- |
| Storage | `storage.test.ts` | create/edit/delete; trimmed content; **survives DB close/reopen (reload)**; invalid content rejected without writing; missing-id edit; ordering; raw text stored verbatim; search; idempotent session records; invariant validation; preferences defaults/round trip/field-level normalisation; quota error mapping (incl. Dexie-wrapped) |
| Backup | `backup.test.ts` | export → parse round trip; **rejects** non-JSON, other apps, newer formats, empty content, bad timestamps, unknown categories, unsafe ids, duplicates, fake completions; strips unknown fields; dry-run plan; keep-newer / replace / keep-existing; never deletes local data; preferences opt-in; delete-all incl. timer snapshot |
| Clear UI | `clear.test.tsx` | save persists + list + core signal; Ctrl+Enter; **release never stores** (DB and localStorage); blank disabled; edit; delete only after confirm; search; HTML is rendered as text |
| Focus UI | `focus.test.tsx` | presets; custom validation; start/pause/resume/reset with mocked clock and canceled record; confirm before discarding > 1 min; completion state and totals from the stored record |
| Archive UI | `archive.test.tsx` | one star per stored note at its stable position; hover/focus preview and selected highlight; select → read → edit; delete with confirm; roving tab index + arrows; search dims and skips; list view; focus history from records |
| Explore UI | `explore.test.tsx` | tablist + arrow keys; inactive experience unmounted; Orbit pointer lifecycle, mode, intensity, reset, keyboard; Echo emit/clear, sound off by default; **cleanup** (rAF cancelled, ResizeObserver disconnected, listeners removed); graceful message without canvas support |
| App | `app.test.tsx` | start screen; navigation with hash + heading focus + `aria-current`; shortcuts (ignored in text fields); popstate restore; **static core without WebGL**; reduced-motion setting; settings dialog; sound toggle default off |

## 3. End-to-end (`tests/e2e`, Playwright, production build)

Projects: **desktop** (1280×800) and **mobile** (Pixel 7, touch), Microsoft Edge, SwiftShader WebGL. 17 scenarios × 2 projects:

- start screen without console errors and **without scrolling**; mode switching + Back; keyboard-only operation (skip link, Tab, Enter, shortcuts, Esc); no horizontal overflow on any mode
- saved thought survives reload and appears in archive (constellation + list), and the **selected note ends above the bottom navigation**; released thought never reaches IndexedDB; edit + delete
- timer: exact remaining time across start → pause → resume → **reload** (paused fake clock); completion after a clock jump with no intermediate ticks (background tab) recorded and shown in archive
- Orbit Lab drag/repel/reset and Echo Waves taps/clear with no page errors
- WebGL core draws a frame and the CSS orb fades out; **without WebGL** the static core is used and saving still works; reduced motion → still core
- export file name/format/content; delete all; import preview and restore; invalid import rejected

## Running

```bash
pnpm test          # unit + integration
pnpm test:e2e      # builds, starts on :3210, runs both projects
```

## Not automated (manual checks)

- Audible output (Web Audio is only exercised for "off by default" and toggling).
- Real GPU performance / frame rate; Firefox and Safari.
- Cross-tab timer synchronisation (implemented via `storage` events; not covered by E2E).
- Storage quota exhaustion in a real browser (mapping is unit tested).
- Screen-reader output (structure and ARIA are tested; actual SR speech is not).
