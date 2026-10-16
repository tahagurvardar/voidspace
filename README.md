# VOIDSPACE

**A place to think, focus & explore.** VOIDSPACE is a single-page, local-first web app with three everyday uses:

- **Clear** — write a thought down, then either **save** it (it becomes a star in your archive) or **release** it (it dissolves and is never stored anywhere).
- **Focus** — a reliable focus timer with 15/25/50-minute presets or a custom length (1–180 min). Sessions are recorded as *completed*, *canceled* or *interrupted*, and your totals are computed from those records.
- **Explore** — two short creative breaks: **Orbit Lab** (pull or push a field of particles with your pointer or finger) and **Echo Waves** (tap to send ripples that light up where they cross, with optional sound).
- **Archive** — your saved thoughts as an interactive constellation (with a plain list view), plus your full focus history.

Everything is stored in your browser on your device. There is no account, no server-side storage and no analytics.

**Live app:** https://voidspace-pi.vercel.app

## Quick start

Requirements: Node.js ≥ 20.9 (developed on 24), pnpm ≥ 10.

```bash
pnpm install
pnpm dev            # http://localhost:3000
```

Production build:

```bash
pnpm build
pnpm start          # http://localhost:3000
```

## Deployment

The production build is deployed on Vercel at **https://voidspace-pi.vercel.app**. The route is statically prerendered and there is no backend: each visitor's data stays in their own browser.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | Development server |
| `pnpm build` / `pnpm start` | Production build / serve it |
| `pnpm typecheck` | TypeScript (strict) |
| `pnpm lint` | ESLint (Next core-web-vitals + TypeScript + React Compiler rules) |
| `pnpm test` | Vitest unit + integration tests (jsdom, fake IndexedDB) |
| `pnpm test:e2e` | Playwright end-to-end tests against a production build (desktop + mobile) |
| `pnpm verify` | typecheck → lint → unit tests → build |

E2E tests use the locally installed **Microsoft Edge** (`channel: 'msedge'`) so no browser download is needed. Use `PW_CHANNEL=chrome`, or `PW_CHANNEL=chromium` after `pnpm exec playwright install chromium`. `PW_WORKERS` sets parallelism (default 2 — WebGL runs in software via SwiftShader in tests and is CPU-heavy).

## Using it

- **Keyboard:** `1` Clear, `2` Focus, `3` Explore, `4` Archive, `Esc` back to the start (shortcuts are ignored while typing). `Ctrl/⌘ + Enter` saves the thought you are writing. The archive constellation has one tab stop; arrow keys move between stars.
- **Sound** is off by default. Turn it on from the speaker icon in the header or in Settings. Echo Waves has its own explicit "Wave sound" toggle.
- **Motion:** Settings → Motion follows your system's reduced-motion setting by default, or can be forced to Reduced/Full. Reduced motion shows a still core.
- **Graphics:** Auto / High / Low / Static. Static uses no 3D at all. Without WebGL the app automatically uses the static core; nothing else changes.

## Your data, privacy and its limits

- Thoughts, focus sessions and settings are stored in **IndexedDB in this browser profile on this device**. The in-progress timer is mirrored to `localStorage` so it survives reloads.
- **Browser storage is not a backup.** Clearing site data, private/incognito windows, some browser cleanup policies, or using another device or browser all mean starting empty. Use **Settings → Your data → Export backup** to keep a copy (a versioned JSON file).
- **Import** validates the file strictly, shows what it will add or change, lets you choose how to resolve conflicts (keep newer / keep this device's / use the backup), and never deletes local data. Invalid files are rejected without changing anything.
- **Delete all data** (type `DELETE` to confirm) permanently removes everything stored on this device, including a running timer.
- Settings shows storage usage and, where supported, lets you ask the browser to protect VOIDSPACE data from automatic eviction.
- Nothing is sent anywhere: no analytics, telemetry or third-party requests at runtime. Note text never appears in URLs (the URL hash only names the mode, e.g. `/#focus`).

## Architecture (short)

Next.js App Router with one route (`/`), statically prerendered. A client `AppShell` owns modes and swaps feature panels in place; the URL hash mirrors the mode for Back/Forward. A single **Living Core** (React Three Fiber) is mounted once as a fixed, pointer-transparent canvas that follows a DOM "anchor" element, so the orb glides between layouts without remounting. A CSS orb is server-rendered for instant first paint and is the permanent fallback. Business logic (timer state machine, simulations, backup format, constellation layout) is plain TypeScript, independent of React; persistence sits behind repository modules over Dexie. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Browser support and known limitations

- Targets current Chromium, Firefox and Safari. Automated E2E coverage runs on Chromium (Edge) only, at a desktop and a Pixel-7-sized mobile viewport.
- When a tab is in the background, browsers throttle timers. The focus timer is timestamp-based, so recorded times are always exact, but the completion **chime** may be delayed (up to ~1 minute in Chromium) until the tab gets a timer slot or becomes visible.
- A session left running while the app is closed for more than 2 minutes is recorded as *interrupted*, credited with focus time up to the last moment the app was open.
- The R3F runtime logs a `THREE.Clock` deprecation warning in the console (from the library, harmless).
- See [docs/PROGRESS.md](docs/PROGRESS.md) for the full status and open items.

## Documentation

- [docs/PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md) — what the product does and the rules it follows
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — structure and significant decisions
- [docs/TEST_PLAN.md](docs/TEST_PLAN.md) — what is tested and how
- [docs/PROGRESS.md](docs/PROGRESS.md) — status, verification results, remaining work
- [docs/RELEASE_NOTES_v2.0.0.md](docs/RELEASE_NOTES_v2.0.0.md) — release notes draft
