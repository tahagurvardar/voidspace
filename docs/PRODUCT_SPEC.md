# VOIDSPACE v2.0.0 — Product specification (as implemented)

VOIDSPACE is a local-first digital headspace and small creative playground. It is not a therapy, spirituality or productivity-gamification product: no scores, streaks or achievements.

## Visual identity

From the approved v2 reference: midnight navy field (`#080C19`), the VOIDSPACE wordmark top-left, a version indicator top-right ("V2 / Personal space"), a luminous violet-blue orb with two elliptical orbit rings and small moons at the centre, the headline "Make room for your mind.", the tagline "Your thoughts. Your rhythm. Your universe.", and three cards — CLEAR, FOCUS, EXPLORE — along the bottom. Archive and Settings are minimal icon controls in the header. Typeface: Sora.

When a mode opens, the orb glides to the left column (desktop) or a small strip at the top (mobile), and the cards become a compact bottom tab bar.

## Shell

- Single route `/`; no page per mode. Mode ↔ URL hash (`#clear`, `#focus`, `#explore`, `#archive`) for Back/Forward and deep links.
- Header: wordmark (returns to start), version indicator, Archive, Sound toggle, Settings.
- No splash screen, login, onboarding or autoplay.

## Living Core

States: **idle** (slow breathing and spin), **clear** (acknowledges a save with a spark and brightening; a release dims it briefly), **focus** (cooler, slower; calmer still while a session runs), **explore** (tilts toward the pointer), **complete** (an expanding ring pulse when a focus session finishes). Never required for any feature.

Rendering modes: WebGL (React Three Fiber) or a static CSS orb, chosen automatically. Static is used when WebGL is unavailable or fails (including context loss), when reduced motion is in effect, or when Graphics is set to Static.

## Clear

- Write a thought (1–2000 characters, trimmed). Optional category: None, Idea, Task, Feeling, Note.
- **Save thought**: validated, written to IndexedDB, then acknowledged (rising star, core spark, optional sound). On failure the text is kept and an error is shown.
- **Release**: the text dissolves and is discarded. It is never written to IndexedDB, localStorage or any draft cache.
- Saved thoughts list (newest first) with search, inline **edit** and **delete** (delete requires confirmation). Delete removes a saved thought; release discards an unsaved one — distinct actions with distinct names.
- User text is always rendered as text (React escaping); no HTML rendering anywhere.

## Focus

- Presets 15/25/50 minutes and a custom length (1–180, whole minutes). Default length is a setting.
- Start, Pause, Resume, Reset. Reset after more than a minute of focus asks for confirmation.
- Visible remaining time, a progress ring, state label (Ready, Focusing, Paused, Complete) and screen-reader announcements on state changes only.
- Completion state with "Done" and "Start another"; optional chime (needs sound on).
- Timer is a timestamp-based state machine (see Architecture). Records:
  - **completed** — reached its planned duration; credited exactly the planned duration.
  - **canceled** — reset by the user; credited the focused time only (≥ 1 s to be recorded).
  - **interrupted** — the app was closed for longer than 2 minutes while running; credited up to the last heartbeat.
  - **paused** is a live state, persisted across reloads, never a record.
- Statistics (today, all completed time, completed count; Archive adds canceled and interrupted counts and partial totals) are derived only from stored records.

## Explore

- **Orbit Lab**: ~500–1600 particles (by graphics quality and screen size, hard cap 2000) on calm home orbits. Press/drag to attract (with orbital swirl) or repel; intensity slider; Reset. Keyboard: focus the field, Space toggles the field, arrows move it.
- **Echo Waves**: click/tap (or drag) to emit waves that expand, echo and fade (~4 s, at most 36 alive); wavefront crossings glow. Optional "Wave sound" (pentatonic tones with echo). Clear. Keyboard: arrows move a cursor, Space emits.
- Both are bounded, touch-enabled, sleep when idle or hidden, and clean up fully on unmount. No scores or progression.

## Archive

- Constellation: one star per saved thought, positioned deterministically from its random ID only (stable across sessions; unaffected by edits or other notes). Same-category thoughts are joined in writing order. Star size reflects length; colour reflects category.
- Select a star to read; edit or delete from there. Search dims non-matching stars and removes them from keyboard order.
- List view (remembered per browser) with the same edit/delete.
- Focus history with totals and paged session list.

## Settings

Sound on/off, volume, test; Motion (Match system / Reduced / Full); Graphics (Auto / High / Low / Static) with a status line explaining the current core mode; default focus length; data management (see below); keyboard reference.

## Data & privacy

IndexedDB via Dexie (schema v1: `thoughts`, `focusSessions`, `preferences`). Live timer snapshot in localStorage. Export: versioned JSON (`app: "voidspace"`, `formatVersion: 1`). Import: size-limited (5 MB), JSON-parsed, Zod-validated, format-migrated, dry-run preview, conflict strategy, single transaction, never deletes. Delete all data with typed confirmation. Storage usage and persistence request where supported. Quota/unavailable storage errors produce specific messages. No tracking or network calls at runtime.
