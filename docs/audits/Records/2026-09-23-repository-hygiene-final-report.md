# Venice Forge — Repository Hygiene Final Report

> **Status:** Execution record for the 2026-09-23 revalidation. Inventory: [`2026-09-23-repository-hygiene-audit.md`](2026-09-23-repository-hygiene-audit.md). Audit: [`2026-09-23-repository-audit.md`](2026-09-23-repository-audit.md).

**Date:** 2026-09-23  
**Repository:** `spearchucker667/Venice_Forge`, branch `main`  
**Starting commit:** `c4134390241f792527837fc143c7e979ae36fa7a`  
**Publication:** not committed and not pushed

The August 2026 hygiene handoff had already been executed (see `repository-hygiene-audit.md` and `repository-hygiene-final-report.md` in this directory, plus `docs/repository-maintenance/`). This pass applied only the delta that still matched the current tree.

## Removed Files

| File | Reason |
|---|---|
| `assets/ReadMe_Preview.png` | 2.8 MB PNG with no source, test, or README reference. `electron-builder` packages `assets/**/*`, so the unused image was distribution weight. The README hero is `assets/Venice_Forge_Hero.png`. |

## Moved Files

These two moves were already present in the dirty worktree as identical copies of the HEAD blobs. This pass kept them and repaired references.

| Old Location | New Location |
|---|---|
| `docs/audits/auditsep23.md` | `docs/audits/Records/auditsep23.md` |
| `docs/audits/Venice_Forge_Random_Pet_Rotation_Agent_Handoff.md` | `docs/audits/Records/Venice_Forge_Random_Pet_Rotation_Agent_Handoff.md` |

## Updated Files

| File | Change |
|---|---|
| `.gitignore` | Ignore `/out/` next to `/release/`. The pre-existing `/.agents/skills/init/` line was left in place. |
| `README.md` | Node badge says `22.15+`. `test:ci` is described as the segmented Vitest gate, with `npm run ci` as the aggregate and `test:coverage` as the coverage job. Repository map calls `tests/` Vitest smoke tests. |
| `docs/DOCS_INDEX.md` | Repaired the two moved-handoff links, registered the three 2026-09-23 reports, and described `audits/README.md` as roadmap-plus-Records rather than an active `TODO/` directory. |
| `docs/audits/repo-management/README.md` | Points at this revalidation. The August work orders stay historical. |
| `docs/repository-maintenance/FILE_MOVE_MANIFEST.md` | Records the two archive moves. |
| `docs/repository-maintenance/DELETION_MANIFEST.md` | Records the preview-image removal. |
| `docs/summary_of_work.md` | Session handoff, current SHA, and CI run IDs. |
| `docs/ROADMAP.md` | Machine-readable SHA and CI status only. Open findings were not closed. |

## Ignored Files

| Pattern | Reason |
|---|---|
| `/out/` | Unused packaging output directory. Kept ignored so a later tool cannot commit it. `electron-builder` writes to `release/`. |

Patterns the August handoff required were already present: `*.log`, `*.pid`, `*.tmp`, `*.cache`, `.agent/`, `.ai/`, `.cursor/`, `.claude/`, `.local-ai/`, `.local-reports/`, `audit-output/`, `debug-output/`, `dist/`, `release/`, `coverage/`, `.env*` with `!.env.example`, `.DS_Store`, `Thumbs.db`, `.vscode/*.log`, `.idea/`. `.agents/` stays partially tracked. See the inventory.

## Retained On Purpose

| File or directory | Reason |
|---|---|
| `tests/fixtures/character-cards/png/oversized-metadata.png` | Oversized-metadata regression fixture. Referenced by the PNG codec test and `scripts/verify-character-card-png.cjs`. |
| Pet spritesheets under `assets/` | Used by the mascot rotation feature. |
| `assets/Venice_Forge_Hero.png` | README hero image. |
| `inactive-features/research-browser/` | Archived feature snapshot. |
| `docs/summary_of_work.md` | Canonical session ledger. Large, and not split in this pass. |
| Three `.agents/skills/*/SKILL.md` files | Canonical tracked skills. |

## Validation

Local commands for this pass are recorded in `docs/summary_of_work.md` after they run. Hosted results below are for published HEAD `c4134390` and do not include this pass's uncommitted edits.

| Command | Result |
|---|---|
| Hosted CI run `35944950611` | PASS, 11/11 jobs, SHA `c4134390` |
| Hosted CodeQL run `35944950570` | PASS, actions and javascript-typescript, SHA `c4134390` |
| `git check-ignore -v out/foo` | PASS |
| `npm run verify:markdown-links` | PASS (440 files) |
| `npm run verify:repository-identity` | PASS |
| `npm run verify:roadmap-current` | PASS |
| `npm run verify:repo-handoff-hygiene` | PASS |
| `npm run verify:image-policy` | PASS |
| `npm run verify:agent-docs` | PASS |
| `npm ci` | not run |
| `npm run lint` / `npm run lint:eslint` | not run |
| `npm run typecheck` | not run |
| `npm test` | not run |
| `npm run build` | not run |

`npm run test:ci` on CI does not include coverage. Coverage is the separate `coverage` job (`npm run test:coverage`), and that job passed on `c4134390`.
