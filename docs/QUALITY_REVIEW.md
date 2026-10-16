# Quality review

Date: 2026-10-16. Scope: VOIDSPACE 2.0.0 local hardening, preserving the product layout, data and existing features. This is not a penetration test, full WCAG audit or performance certification.

## Corrections

- Backup conflict comparison includes creation dates. Imports enforce the 5 MiB UTF-8 limit before parsing and reject oversized files before reading. Busy data operations block conflicting controls, and deleting all data clears stale import previews.
- Timer recovery tolerates unavailable local storage. Failed snapshot writes warn once until storage recovers; the timer continues running.
- Echo Waves stops requesting animation frames after waves expire, even with a stationary keyboard cursor. Input wakes rendering again.
- Orbit Lab keyboard movement and field toggling preserve zero coordinates instead of jumping to the center.
- Primary-button gradients retain violet colors but provide white-text contrast above 4.5:1. Import and duration errors are associated with their inputs. Global single-key mode shortcuts can be disabled, with a persisted preference that defaults to enabled for existing users.
- Constellation distance calculations avoid repeated square roots; established layout coordinates remain covered by regression tests.
- CI uses a frozen lockfile, one Ubuntu job, read-only permissions, bounded workers and retained failure diagnostics. The Node engine range now matches the locked tools. No dependency versions or lockfile changed.

## Security

- Production dependency audit: exit 0, no known vulnerabilities reported. Complete audit: exit 1, one high-severity development dependency advisory.
- Dependency chain: eslint-config-next 16.4.1 -> @next/eslint-plugin-next 16.4.1 -> fast-glob 3.3.1 -> micromatch 4.0.8 -> braces 3.0.3. [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) concerns stack exhaustion from deeply nested brace patterns and lists no patched version. The reviewed path handles lint root-directory patterns, not user thoughts or backups. No override or audit suppression was added; an upstream compatible fix needs follow-up.
- Local production responses included nosniff, no-referrer, frame DENY and configured permissions restrictions, without X-Powered-By. Hosted headers remain unverified.
- No unsafe HTML injection sink or application fetch call was found in source. Backup validation, ordinary React text rendering, storage failure handling and destructive confirmation flows were reviewed. Pattern scans are not proof of absence of every secret or vulnerability.
- No CSP is served. A future policy must be tested against Next.js scripts, runtime styles and the rendering stack before enforcement.

## Accessibility

- White-text primary-button contrast at normal gradient stops improved from 3.23:1 / 4.95:1 to **4.95:1 / 6.61:1**. Hover improved from 2.75:1 / 4.42:1 to **4.63:1 / 5.79:1**. The endpoint channels change monotonically, so intermediate colors do not exceed the lighter endpoint luminance. Browser regression coverage reads computed styles in both states.
- Disabling global character shortcuts addresses the relevant [WCAG 2.1.4 requirement](https://www.w3.org/WAI/WCAG22/Understanding/character-key-shortcuts.html). Escape remains available. Integration tests verify duration/import error descriptions and preference compatibility; E2E exercises native dialog keyboard containment, focus return and persisted opt-out.
- A local production-browser audit using the already installed axe-core 4.14.0 found **zero violations across 12 settled states**: Home, Clear, Focus, Explore, Archive and Settings at 1280x800 and 320x800. No console/page errors or route-level horizontal overflow occurred. Some contrast checks were marked incomplete; the explicit primary-button measurements supplement them.
- Actual screen-reader speech, 200% text scaling across all states, real touch devices and full WCAG 2.2 AA conformance remain unverified.

## Performance

- A bounded same-process comparison of original/current constellation code produced exactly equal node/edge JSON for 100, 1,000 and 5,000 notes. Observed times were 7 -> 5 ms, 351 -> 42 ms and 16,239 -> 679 ms respectively. These single local timings vary with load; they are not browser interaction or real-device benchmarks. Placement remains quadratic and large archives still warrant profiling.
- Production HTML referenced 10 JavaScript files totaling **279,654 individually gzipped bytes** (about 273 KiB), excluding dynamically requested chunks. No bundle-size improvement is claimed.
- Existing dynamic imports, bounded rendering budgets, hidden-tab handling and resource cleanup were reviewed. Echo idle-frame behavior is regression tested. No real-GPU FPS, battery, memory-soak or Lighthouse result is claimed.

## Verification and limitations

Current executed test totals are recorded in [PROGRESS.md](PROGRESS.md), with coverage in [TEST_PLAN.md](TEST_PLAN.md). Regression tests exposed the confirmed duration-error, Orbit-boundary, snapshot-write and button-contrast defects before fixes. The first new dialog test incorrectly assumed immediate wrapping past browser chrome; a focused browser diagnostic identified the native focus sequence, and the assertion now allows only that specific boundary transition.

GitHub-hosted Ubuntu execution and artifact upload are pending. Local Windows Chromium verification does not establish hosted CI success. Cross-browser testing, simultaneous conflicting timer actions, real storage quota exhaustion and actual audio output remain outside the automated coverage. Imports are limited to 5 MiB while exports are uncapped, so very large backup round trips are not guaranteed. No Git publication or deployment occurred during this review.
