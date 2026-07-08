# Subagent Report: README / Docs Phase 1 Remediation Pass

**Status:** DONE — documentation updates applied and validation passed.  
**Date:** 2026-07-08  
**Scope:** Update user-facing and policy documentation to reflect the findings from the Phase 1 remediation subagent reports:

- `scratch/subagent-report-security-profile-hardening.md`
- `scratch/subagent-report-theme-system.md`
- `scratch/subagent-report-onboarding-comments-scanner.md`

No source code was changed in this pass; the report covers documentation only. Code changes implied by the subagent reports were already present in the working tree.

---

## Files Modified

| File | Nature of change |
| --- | --- |
| `README.md` | Added `main` branch instability warning; updated Quick Start for first-launch onboarding splash; rewrote Profiles and Credentials section with master password, profile password, main-process lockout, and profile-deletion purge behavior; updated Data Storage table; expanded Theming section to 35 built-in themes with the 5 new themes highlighted; added running-from-source note; added Known Limitations bullets. |
| `SECURITY.md` | Added new `## Master Password` section; updated `## Profile-Locked Credentials` with main-process lockout, verifier-never-leaves-main-process guarantee, and profile deletion data retention. |
| `docs/legal/PRIVACY.md` | Added master password description; updated profile password description with PBKDF2/constant-time compare/lockout; added profile deletion purge behavior. |
| `docs/design/THEME_SYSTEM.md` | Updated built-in theme count to 35; listed the 5 new themes (Obsidian Bloom, Harbor Fog, Circuit Mint, Amber Archive, Neon Dusk); documented the expanded all-theme WCAG contrast matrix. |
| `docs/FILE_TREE.md` | Updated `config/themes/` count to 36 starter YAML templates; added the new theme YAML/TS files and theme test files; updated the `tests/theme/` listing. |
| `docs/summary_of_work.md` | Appended 2026-07-08 Phase 1 README/docs remediation session entry, updated Open TODO Ledger, and appended Validation Matrix. |

`docs/DOCS_INDEX.md` was reviewed; it does not list theme counts or other quantities that needed updating, so no change was made.

---

## Change Details

### README.md

- **Branch warning:** Added a note near the top that `main` may carry unreleased work and that release tags are the stable reference.
- **Quick Start:** Step 3 now mentions the first-launch onboarding splash (age acknowledgement and initial preferences), matching the new `OnboardingSplash.tsx` component.
- **Profiles and Credentials:** Replaced the older API-key-only paragraph with a structured description covering:
  - Master password gating Family Safe Mode changes in desktop mode.
  - Per-profile password setup, removal, and switch-time unlock.
  - Salted PBKDF2-SHA256 verifier stored in OS `safeStorage`.
  - Plaintext fallback refused for password-class credentials even on Linux.
  - Verifier never leaves the main process.
- **Profile deletion:** Documented best-effort purge of profile-scoped API keys, password verifier, `localStorage` keys, and IndexedDB records; noted that filesystem chat history is not keyed by profile.
- **Data Storage table:** Updated scopes to reflect encrypted/local-first storage.
- **Theming:** Expanded from a short paragraph to a list of 35 built-in themes, highlighting the 5 new themes and noting YAML import/export, custom themes, legacy compatibility, and WCAG AA contrast validation.
- **Running from source:** Added a note about `npm run dev:electron` for first-time contributors.
- **Known Limitations:** Added bullets for onboarding one-time behavior and theme customization availability.

### SECURITY.md

- **Master Password:** New section describes the master password as a desktop-mode gate for Family Safe Mode settings changes, with verifier storage in `safeStorage` and no plaintext fallback.
- **Profile-Locked Credentials:** Updated to include:
  - `profile_password:<profileId>` credential naming.
  - `STRICT_NO_PLAINTEXT_CREDENTIAL_NAMES` / pattern gate.
  - PBKDF2-SHA256 verifier with `crypto.timingSafeEqual` verification.
  - Rejection of legacy unsalted SHA-256 verifier strings.
  - Renderer never stores or retrieves the verifier.
  - Profile deletion purges the verifier and profile-scoped data.

### docs/legal/PRIVACY.md

- Added master password description in the local data section.
- Updated profile password description to specify PBKDF2-SHA256, constant-time comparison, and in-memory rate limiting.
- Added profile deletion purge behavior consistent with README and SECURITY.

### docs/design/THEME_SYSTEM.md

- Updated built-in theme count from 30 to 35.
- Listed the 5 new themes under a "New built-ins" subsection.
- Updated the `config/themes/` starter YAML count to 36 (35 built-ins plus `example.theme.yaml`).
- Documented the expanded WCAG contrast matrix covering foreground/background, foreground/surface, accent foreground/accent, button/status/selection pairs, and focus/disabled/foregroundSubtle minimums.

### docs/FILE_TREE.md

- Updated `config/themes/` description to 36 starter YAML templates.
- Added the 5 new theme YAML files and their corresponding TypeScript builtin files.
- Added new theme test files (`src/theme/contrast.test.ts`, `src/theme/themes.test.ts`, `src/components/ThemeMaker.ui.test.tsx`).
- Updated `tests/theme/` listing to include new contrast and token tests.

---

## Validation Results

| Command | Result | Notes |
| --- | --- | --- |
| `npm run verify:markdown-links` | PASS | 79 Markdown files checked; no broken internal links or heading fragments. |
| `npm run verify:repo-handoff-hygiene` | PASS | Handoff hygiene checks passed. |
| `npm run lint:eslint` | PASS | Zero warnings/errors across `src`, `electron`, `server.ts`, and `scripts`. |
| `npm run typecheck` | PASS | Renderer (`tsconfig.json`) and Electron main (`tsconfig.electron.json`) both clean. |
| `git diff --check` | PASS | No whitespace errors. |
| `git diff --cached --check` | PASS | No staged diff whitespace errors. |

---

## Stale-Terminology Scan

Grepped the touched docs for `Developer Mode`, `Red-Team`, `Red Team`, `/Users/...` paths, and `TODO TBD`:

- No stale `Developer Mode` / `Red-Team` / `Red Team` references in `README.md`, `SECURITY.md`, `docs/legal/PRIVACY.md`, `docs/design/THEME_SYSTEM.md`, or `docs/FILE_TREE.md`.
- Historical references remain in `docs/summary_of_work.md` prior session entries; these were intentionally left intact as historical evidence.
- No private `/Users/...` machine paths or `TODO TBD` markers were introduced.

---

## Blockers / Notes

- **No blockers.** All required validation commands passed.
- The `docs/summary_of_work.md` Open TODO Ledger still carries a P2/P3 docs-hygiene item (`AGENTS.md` version bump, coverage threshold text sync, private-path redaction, stale snapshot marking). This pass did not address those items; they remain open for a future Phase 2 docs pass.
- No commits or pushes were performed in this session per the docs-remediation scope.

---

## Next Steps (optional, out of scope for this pass)

1. Run the full CI parity chain (`npm run ci`) before any release if additional source changes land after this docs pass.
2. Address the remaining P2/P3 docs-hygiene item in `docs/summary_of_work.md` Open TODO Ledger.
3. Commit the documentation and any associated source changes when the parent session is ready.
