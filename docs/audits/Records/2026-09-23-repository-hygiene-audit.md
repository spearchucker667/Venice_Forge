# Venice Forge — Repository Hygiene Audit

> **Status:** Point-in-time inventory for 2026-09-23. The 2026-08-22 and 2026-09-01 hygiene reports under this directory stay historical. This file does not authorize a second documentation reorganization.

**Repository:** `spearchucker667/Venice_Forge`  
**Branch:** `main`  
**HEAD:** `c4134390241f792527837fc143c7e979ae36fa7a`  
**Pack size:** 84.36 MiB (`git count-objects -vH`)  
**Tracked files at inventory time:** 2220

## Current Structure

Public distribution roots that are present and tracked: `src/`, `electron/`, `public/`, `assets/`, `docs/`, `scripts/`, `tests/`, `.github/`, `package.json`, `package-lock.json`, TypeScript and Vite configs, `electron-builder.config.cjs`, `README.md`, `LICENSE`, and the community files `SECURITY.md`, `PRIVACY.md`, `SUPPORT.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `LEGAL.md`, `PRODUCT.md`.

Also tracked, and retained because the current build or docs contract names them: `server.ts`, `server.test.ts`, `config/`, `build/icon.*`, `inactive-features/research-browser/`, `index.html`.

Ignored local output present on disk and not tracked: `node_modules/` (830M), `dist/` (27M), `dist-electron/` (1.2M), `artifacts/`, `.rup/`. No `scratch/`, `tmp/`, `out/`, `release/`, `coverage/`, `audit-output/`, or `debug-output/` directory was present.

`.agents/` is 9.4M on disk and intentionally **not** fully ignored. Three skill files stay tracked:

- `.agents/skills/ci-publication-verification/SKILL.md`
- `.agents/skills/i18n-remediation/SKILL.md`
- `.agents/skills/per-tab-acceptance/SKILL.md`

The August handoff's blanket `.agents/` ignore is rejected. `[FACT]`

## Problems Found

| ID | Problem | Action |
|---|---|---|
| RM-20260923-002 | Closed handoffs moved to `Records/` without index updates | Repair links. Keep the move. |
| RM-20260923-003 | `/out/` missing from the build-output ignore list | Add the pattern. |
| RM-20260923-004 | `assets/ReadMe_Preview.png` unreferenced and packaged by `assets/**/*` | Remove. |
| Docs | README called `npm run test:ci` a complete CI gate with coverage, and called `tests/` Playwright-only | Correct the sentences. |
| Docs | Node badge said `22.x` while engines require `>=22.15.0` | Badge now says `22.15+`. |
| None | Tracked `*.log`, `*.tmp`, `*.bak`, `*.old`, `*.patch`, `.DS_Store`, `Thumbs.db` | Zero matches. |
| None | Tracked `.env` other than `.env.example` | Zero matches. |
| Rejected | Mass move of `docs/` into a new tree | Already governed by `docs/DOCS_INDEX.md`. |
| Rejected | Recreate root `VENICE_FORGE_COMPLETE_AUDIT.md` | Forbidden by gitignore and the handoff hygiene verifier. |
| Retained | `tests/fixtures/character-cards/png/oversized-metadata.png` (11,184,907 bytes) | Required by `electron/services/characterCardPngCodec.test.ts`, `scripts/verify-character-card-png.cjs`, and the fixture generator. |
| Retained | Pet `spritesheet.webp` files and `assets/Venice_Forge_Hero.png` | Referenced by the mascot feature and README. |
| Retained | `docs/summary_of_work.md` (~643 KB) and `docs/reference/Venice_swagger_api.yaml` (~615 KB) | Canonical handoff and API contract. |

Git history still contains removed blobs (`assets/preview.png`, old session dumps, `.design-captures/`, `.integration-src/`). They are not in HEAD. History was not rewritten.

## Proposed Changes

Applied in the paired final report:

1. Ignore `/out/`.
2. Remove `assets/ReadMe_Preview.png`.
3. Finish the in-progress archive of `auditsep23.md` and `Venice_Forge_Random_Pet_Rotation_Agent_Handoff.md` by updating links.
4. Correct the three README claims above.
5. Write this inventory, the audit, and the final report under `docs/audits/Records/`.

Not applied:

- Deleting legal, license, CI, or build-icon files.
- Ignoring the whole `.agents/` tree.
- Reorganizing `docs/` again.
- `git clean`, reset, or history rewrite.

## Classification

| Path | Class |
|---|---|
| `src/`, `electron/`, `public/`, `assets/` (after the preview removal), `scripts/`, `tests/`, `.github/`, package manifests, configs | Public distribution |
| `docs/` | Public documentation, including historical evidence under `Records/` and `reports/historical/` |
| `node_modules/`, `dist/`, `dist-electron/`, `release/`, `out/`, `coverage/`, `artifacts/`, `.rup/` | Local or generated. Ignored. |
| `.agents/skills/` except the three canonical skills | Local agent tooling. Ignored. |

Duplicate-doc check `[FACT]`: root `README.md`, `PRIVACY.md`, `SECURITY.md`, and `SUPPORT.md` are not byte-identical to `docs/README.md`, `docs/legal/PRIVACY.md`, or `docs/security/security-model.md`. They stay. The retired-path note in `docs/DOCS_INDEX.md` about removed `docs/SUPPORT.md` and `docs/privacy.md` is historical and those paths are absent.
