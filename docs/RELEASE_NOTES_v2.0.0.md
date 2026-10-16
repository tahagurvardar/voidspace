# VOIDSPACE 2.0.0 — release notes

Live: https://voidspace-pi.vercel.app

VOIDSPACE 2 is a fresh, local-first build: a single page with a living orb at its centre and three ways to use it.

## What's in it

- **Clear** — write a thought, then save it or release it. Saved thoughts can be searched, edited and deleted. Released thoughts are never stored.
- **Focus** — 15/25/50-minute or custom sessions with pause and resume. Accurate even in background tabs and across reloads. History distinguishes completed, canceled and interrupted sessions; totals come only from real records.
- **Explore** — Orbit Lab (attract/repel a particle field) and Echo Waves (ripples that glow where they cross, optional sound). Mouse, touch and keyboard.
- **Archive** — your thoughts as a stable, keyboard-navigable constellation or a list, plus focus history.
- **Settings** — sound and volume, motion, graphics quality, default session length, export/import backups with conflict handling, storage protection request, and delete-all.

## Quality

- Works without WebGL, with reduced motion, and without audio. The 3D code is only downloaded when it will be used.
- 124 unit/integration tests and 34 end-to-end runs (17 scenarios × desktop + mobile) passing; strict TypeScript and lint clean.
- Layouts verified at 1920×1080, 1440×900, 1366×768, 768×1024 and 390×844.

## Good to know

- Data lives only in this browser on this device. Export a backup to keep a copy.
- In background tabs the completion chime can be delayed by browser throttling; recorded times are exact.
