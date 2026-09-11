# Venice Forge — Repository Hygiene Final Report

**Date:** 2026-08-22
**Repository:** `spearchucker667/Venice_Forge`, branch `main`
**Starting commit:** `69b330e3`
**Working tree:** multiple hygiene and CI-fix changes (uncommitted)

---

## Removed Files

| File | Reason |
|---|---|
| `.windsurfrules` | Duplicate of `.cursorrules`; canonical agent instructions are in `AGENTS.md` |
| `CLAUDE.md` | AI agent instruction stub; superseded by `AGENTS.md` |
| `GEMINI.md` | AI agent instruction stub; superseded by `AGENTS.md` |
| All 14 `.DS_Store` files | OS metadata; added to `.gitignore` |
| `docs/SUPPORT.md` | Duplicate of root `SUPPORT.md`; content restored to root |
| `docs/privacy.md` | Duplicate of root `PRIVACY.md` |
| `public/assets/branding/` (11 files) | Identical duplicate of `assets/branding/`; code referenced only the latter |
| `scratch/` (14 Python scripts) | Already gitignored; old development scratchpad |

## Moved Files

| Old Location | New Location |
|---|---|
| `package-scripts.test.ts` (root) | `tests/package-scripts.test.ts` |
| `docs/backup-and-sync.md` | `docs/user/backup-and-sync.md` |
| `docs/chat-model-selection.md` | `docs/user/chat-model-selection.md` |
| `docs/data-export-format.md` | `docs/architecture/data-export-format.md` |
| `docs/memory-isolation.md` | `docs/architecture/memory-isolation.md` |
| `docs/rp-token-counting.md` | `docs/DEVELOPMENT/rp-token-counting.md` |
| `docs/security-model.md` | `docs/security/security-model.md` |
| `docs/sync-threat-model.md` | `docs/security/sync-threat-model.md` |
| `docs/sync-troubleshooting.md` | `docs/user/sync-troubleshooting.md` |
| `docs/pastel-theme-pack-report.md` | `docs/design/pastel-theme-pack-report.md` |
| `docs/BUG_HUNTING_AGENT_PROMPT.md` | `docs/DEVELOPMENT/BUG_HUNTING_AGENT_PROMPT.md` |
| `docs/FILE_TREE.md` | `docs/DEVELOPMENT/FILE_TREE.md` |
| `docs/superpowers/plans/`, `docs/superpowers/specs/` | `docs/archives/superpowers/` |
| `docs/work-orders/` (3 files) | `docs/archives/work-orders/` |
| `docs/Repo-management/` (2 files) | `docs/audits/repo-management/` |
| `assets/mio-xc3-nerdprofeta-gifs/` (28 files) | `assets/mascot/` |

## Updated Files

| File | Change |
|---|---|
| `.cursorrules` | Rewritten as minimal stub pointing to `AGENTS.md` |
| `.gitignore` | Added: `.idea/`, `.vscode/*.log`, `*.pid`, `*.cache`, `.local-reports/`, `audit-output/`, `debug-output/`, `venice-media-output/`, `artifacts/`, `/CLAUDE.md`, `/GEMINI.md`, `/patch_runner.js` |
| `package.json` | Updated `test:contracts` path from `package-scripts.test.ts` → `tests/package-scripts.test.ts` |
| `tests/package-scripts.test.ts` | Fixed `package.json` resolution path (`__dirname` → `".."`) |
| `SUPPORT.md` | Restored canonical content (was a redirect stub to deleted `docs/SUPPORT.md`) |
| `README.md` | Updated `FILE_TREE.md` link path |
| `docs/DOCS_INDEX.md` | Updated all moved-file links; added new audit + repo-management entries; updated `SUPPORT.md` reference |
| `docs/architecture/data-export-format.md` | Fixed cross-document links |
| `docs/security/security-model.md` | Fixed all cross-document links |
| `src/components/generation/generation-animation-registry.ts` | Updated mascot import paths |
| `src/components/character-creator/CharacterCreatorMascot.tsx` | Updated mascot import paths |
| `electron/services/backgroundTaskManager.ts` | Fixed write-ahead journal cleanup on non-success responses (delete intent rather than leave failed task) |

## Gitignore Additions

| Pattern | Reason |
|---|---|
| `.idea/` | JetBrains IDE metadata |
| `.vscode/*.log` | Editor log files |
| `*.pid` | Runtime process IDs |
| `*.cache` | Runtime caches |
| `.local-reports/` | Local report output |
| `audit-output/` | Audit tool output |
| `debug-output/` | Debug tool output |
| `venice-media-output/` | Local media output directory |
| `artifacts/` | Generated artifacts (i18n reports, etc.) |
| `/CLAUDE.md` | AI agent instruction stub |
| `/GEMINI.md` | AI agent instruction stub |

## CI Fix (commingled)

The CI failure on `main` (commit `69b330e3`) was caused by the write-ahead journal changes in `backgroundTaskManager.ts`. When the provider returned a non-2xx response (409 consent challenge, 400, 503, etc.), the code left a `pending_finalize` task with status `failed` in the journal. The `paidQueue.test.ts` expected `listBackgroundTasks()` to have length 0 after a 409. Fixed by deleting the intent task on all non-billable provider responses instead of leaving a failed journal entry.

## Validation

| Command | Result |
|---|---|
| `npm run lint:eslint` | PASS (0 warnings) |
| `npm run typecheck` | PASS (renderer + Electron) |
| `npm run verify:markdown-links` | PASS (253 files, 0 broken links) |
| `tests/package-scripts.test.ts` (7 tests) | PASS |
| `backgroundTaskManager.test.ts` (21 tests) | PASS |
| `backgroundTaskManager.paidQueue.test.ts` (3 tests) | PASS |
| `backgroundTaskHandlers.test.ts` (13 tests) | PASS |
| `background-task-store.test.ts` (8 tests) | PASS |
| `restart-idempotency.test.ts` (1 test) | PASS |

## Files NOT Removed (with justification)

| File/Dir | Reason |
|---|---|
| `inactive-features/research-browser/` | Deliberate archival snapshot of deactivated feature |
| `assets/mascot/` (renamed) | Referenced by animation registry and character creator mascot |
| `assets/branding/` | Canonical branding assets, referenced by logo component |
| `build/icon.*` | Required for Electron packaging |
| `config/` | Theme definitions and i18n baselines |
| `docs/archives/session-history-pre-2026-07-11.md` | Historical session record |
| `docs/i18n/` | i18n review status |
| `PRODUCT.md`, `LEGAL.md`, `PRIVACY.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `CONTRIBUTING.md` | Standard open-source community files |

## Unresolved

- The CI `unit-and-integration-tests`, `macos-sensitive-tests`, and `windows-sensitive-tests` jobs all fail on the remote `main` branch. The `paidQueue.test.ts` failure is fixed in this working tree. The other failures may have additional root causes not yet investigated. A full `npm test` run locally would clarify, but the serial suite was timing out at 300s.