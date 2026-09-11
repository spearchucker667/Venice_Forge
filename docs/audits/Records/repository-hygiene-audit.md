# Venice Forge — Repository Hygiene Audit

**Date:** 2026-08-22
**Repository:** `spearchucker667/Venice_Forge`, branch `main`
**Commit:** `69b330e3` (Paid queue durability, FSM bypass, and task journal hardening)

## Current Structure & Sizes

| Directory | Size | Tracked? | Notes |
|---|---|---|---|
| `node_modules/` | 829M | gitignored | Expected |
| `docs/` | 36M | tracked | Needs reorganization |
| `src/` | 12M | tracked | Application source |
| `tests/` | 11M | tracked | Test suites |
| `dist/` | 11M | gitignored | Build output, on disk |
| `assets/` | 3.7M | tracked | Branding + mascot GIFs |
| `electron/` | 1.9M | tracked | Main process |
| `dist-electron/` | 936K | gitignored | Build output, on disk |
| `scripts/` | 840K | tracked | Build/verify/dev scripts |
| `artifacts/` | 684K | untracked | Generated i18n reports |
| `build/` | 588K | tracked (3 icons) | Packaging icons |
| `public/` | 268K | tracked | Web assets |
| `inactive-features/` | 176K | tracked (16 files) | Archived research browser |
| `config/` | 176K | tracked | Themes, i18n baseline |
| `scratch/` | 60K | gitignored | 14 Python scratch scripts |
| `.agent-backups/` | — | gitignored | Agent backup data |
| `.design-captures/` | — | gitignored | Design captures |
| `.freebuff/` | — | gitignored | Agent runtime data |
| `.impeccable/` | — | gitignored | Design tool output |
| `.superpowers/` | — | gitignored | Agent planning data |
| `venice-media-output/` | empty | — | Empty local-only dir |

**Total tracked files:** 1,720

---

## Findings

### P0: Top-Level Duplicate AI Agent Instructions

Four files duplicate the same agent bootstrapping content:

| File | Content | Action |
|---|---|---|
| `.cursorrules` | Cursor IDE instructions pointing to AGENTS.md | **Remove** — consolidate |
| `.windsurfrules` | Identical to `.cursorrules` | **Remove** — consolidate |
| `CLAUDE.md` | Claude instructions, subset of AGENTS.md | **Remove** — consolidate |
| `GEMINI.md` | Gemini instructions, subset of AGENTS.md | **Remove** — consolidate |

`AGENTS.md` and `AGENT_REINITIALIZATION.md` are the canonical agent instruction files.

### P0: Duplicate Branding Assets

`assets/branding/` and `public/assets/branding/` contain **identical** SVG files. Both are tracked. Only one copy is needed; the other drains developer attention and inflates the tree.

### P0: Widespread `.DS_Store` Litter

`.DS_Store` files exist in:
- `.` (root)
- `assets/`
- `config/`
- `docs/`
- `docs/audits/`
- `docs/audits/Records/`
- `docs/design/`
- `docs/reference/`
- `docs/reports/`
- `docs/reports/historical/`
- `public/`
- `public/assets/`
- `src/`
- `src/components/`

All should be removed and tracked via a `.gitignore` catch-all rule.

### P1: Orphaned `package-scripts.test.ts` at Root

This test file sits at the repository root instead of in `tests/`. It is referenced by `package.json` → `test:contracts`, so it must be relocated and the script updated.

### P1: `docs/` Structure Needs Reorganization

Current structure is ad hoc:

```
docs/
├── ABOUT.md                    # orphan
├── AGENTS/                     # gitignored, local agent docs
├── BUG_HUNTING_AGENT_PROMPT.md # orphan
├── DEVELOPMENT/                # dev docs
├── DOCS_INDEX.md               # canonical index
├── FAQ.md                      # orphan
├── FILE_TREE.md                # orphan
├── RELEASE/                    # release docs
├── ROADMAP.md                  # canonical roadmap
├── Repo-management/            # untracked, hygiene docs
├── SUPPORT.md                  # duplicate of top-level SUPPORT.md
├── archives/                   # historical session logs
├── audits/                     # audit reports
├── backup-and-sync.md          # orphan
├── design/                     # design docs
├── developer/                  # developer docs
├── discovery/                  # discovery docs
├── features/                   # feature docs
├── i18n/                       # i18n docs
├── implementation/             # implementation docs
├── legal/                      # legal docs
├── pastel-theme-pack-report.md # orphan
├── reference/                  # reference docs
├── reports/                    # historical reports
├── security/                   # security docs
├── summary_of_work.md          # canonical handoff
├── superpowers/                # old plans/specs
├── testing/                    # testing docs
├── user/                       # user docs
├── work-orders/                # work orders
├── privacy.md                  # orphan (duplicate of PRIVACY.md)
├── security-model.md           # orphan
├── sync-threat-model.md        # orphan
├── sync-troubleshooting.md     # orphan
├── chat-model-selection.md     # orphan
├── data-export-format.md       # orphan
├── memory-isolation.md         # orphan
└── rp-token-counting.md        # orphan
```

**Problems:**
- 15+ orphan `.md` files at the top of `docs/`
- `docs/SUPPORT.md` duplicates `SUPPORT.md` at repo root
- `docs/privacy.md` duplicates `PRIVACY.md` at repo root
- `docs/superpowers/` contains 5 old plans/specs — archival material
- Multiple top-level feature docs (`backup-and-sync.md`, `chat-model-selection.md`, etc.)

**Recommended restructure:**

```
docs/
├── architecture/     ← security-model, data-export-format, memory-isolation
├── development/      ← DEVELOPMENT, developer, testing, implementation
├── user/             ← FAQ, user docs, features
├── reference/        ← canonical references
├── releases/         ← RELEASE, changelogs
├── audits/           ← audit reports
├── i18n/             ← i18n status
├── legal/            ← legal docs
├── archives/         ← historical session logs, old plans/specs
├── ROADMAP.md        ← canonical
├── summary_of_work.md ← canonical
├── DOCS_INDEX.md     ← canonical
├── ABOUT.md
└── design/           ← design docs
```

### P1: `docs/superpowers/` Contains Old Plans

Five files under `docs/superpowers/plans/` and `docs/superpowers/specs/` from June-July 2026. These are historical planning documents, not current architecture references. Move to `docs/archives/`.

### P1: `docs/work-orders/` Contains Stale Work Orders

Three files, including a completed work order (`VENICE_FORGE_CHAT_FOLDERS_MEDIA_DOCUMENTS_2026-07-19.md`) and a reopen notice. These should move to archives.

### P2: `inactive-features/research-browser/` — 16 Tracked Files

The research browser was intentionally deactivated (`AGENT_REINITIALIZATION.md` confirms this). 16 files at 176K remain tracked but unreferenced by active code. References only exist in i18n translation keys and a prompt starter string — both reference the *feature concept*, not the archived code.

**Decision:** Keep as-is. The code is a deliberate archival snapshot, not accidental cruft. References in i18n keys and prompt starters describe the feature's *intended* behavior, which is appropriate even while deactivated.

### P2: `docs/AGENTS/` — Local Agent Docs

Already gitignored. Contains `scratch_summary.md` (old session handoff, superseded by `docs/summary_of_work.md`) and copies of `AGENTS.md`/`AGENT_REINITIALIZATION.md`. These are agent runtime artifacts, not tracked content. No change needed — already ignored.

### P2: `docs/Repo-management/` — Two Hygiene Docs

Untracked, two hygiene-related markdown files. Should be tracked or moved into `docs/audits/` where they belong.

### P3: `.gitignore` Gaps

Current `.gitignore` is comprehensive but has gaps:

| Pattern | Needed? | Reason |
|---|---|---|
| `.vscode/*.log` | Yes | Editor logs |
| `.idea/` | Yes | JetBrains IDE |
| `*.pid` | Yes | Runtime process IDs |
| `*.cache` | Yes | Runtime caches |
| `.local-reports/` | Yes | Local report output |
| `audit-output/` | Yes | Audit tool output |
| `debug-output/` | Yes | Debug tool output |
| `venice-media-output/` | Yes | Local media output |
| `artifacts/` | Yes | Generated artifacts (currently untracked but not ignored) |
| `/public/assets/branding/` | Conditional | If consolidated with assets/branding |

### Clean: No Secrets Found

A `rg` search for API keys, secrets, tokens, and passwords across tracked files found no exposed secrets. The `.env` file is properly gitignored.

---

## Proposed Changes Summary

### Remove
1. `.cursorrules` — consolidate into AGENTS.md
2. `.windsurfrules` — duplicate of .cursorrules
3. `CLAUDE.md` — consolidate into AGENTS.md
4. `GEMINI.md` — consolidate into AGENTS.md
5. All `.DS_Store` files (14 locations)
6. `docs/SUPPORT.md` — duplicate of `SUPPORT.md`
7. `docs/privacy.md` — duplicate of `PRIVACY.md`

### Move
1. `package-scripts.test.ts` → `tests/package-scripts.test.ts` (update `package.json`)
2. `docs/superpowers/` → `docs/archives/superpowers/`
3. `docs/work-orders/` → `docs/archives/work-orders/`
4. Orphan docs into subdirectories:
   - `docs/backup-and-sync.md` → `docs/user/backup-and-sync.md`
   - `docs/chat-model-selection.md` → `docs/user/chat-model-selection.md`
   - `docs/data-export-format.md` → `docs/architecture/data-export-format.md`
   - `docs/memory-isolation.md` → `docs/architecture/memory-isolation.md`
   - `docs/rp-token-counting.md` → `docs/DEVELOPMENT/rp-token-counting.md`
   - `docs/security-model.md` → `docs/security/security-model.md`
   - `docs/sync-threat-model.md` → `docs/security/sync-threat-model.md`
   - `docs/sync-troubleshooting.md` → `docs/user/sync-troubleshooting.md`
   - `docs/pastel-theme-pack-report.md` → `docs/design/pastel-theme-pack-report.md`
   - `docs/BUG_HUNTING_AGENT_PROMPT.md` → `docs/DEVELOPMENT/BUG_HUNTING_AGENT_PROMPT.md`
5. `docs/Repo-management/` → `docs/audits/repo-management/`

### Consolidate
1. `public/assets/branding/` → reference `assets/branding/` (or vice versa). Keep one canonical copy.
2. Add a `.cursorrules` that simply redirects: `# See AGENTS.md`

### Gitignore Additions
1. `.vscode/*.log`, `.idea/`, `*.pid`, `*.cache`
2. `.local-reports/`, `audit-output/`, `debug-output/`
3. `venice-media-output/`
4. `artifacts/`
5. `.cursorrules`, `.windsurfrules` — track only a stub
6. `/public/assets/branding/` — if consolidating

### Validate
1. `npm ci` → clean install
2. `npm run lint:eslint` → 0 warnings
3. `npm run typecheck` → pass
4. `npm test` → pass
5. `npm run build` → pass
6. `npm run verify:markdown-links` → no broken links

---

## Files NOT Removed (with justification)

| File/Dir | Reason to Keep |
|---|---|
| `inactive-features/` | Deliberate archival snapshot of deactivated research browser |
| `assets/mio-xc3-nerdprofeta-gifs/` | Referenced by `generation-animation-registry.ts` and `CharacterCreatorMascot.tsx` |
| `assets/branding/` | Canonical branding assets |
| `build/icon.*` | Required for Electron packaging |
| `config/` | Theme definitions, i18n baseline |
| `scratch/` | Already gitignored; Python scripts used during development |
| `docs/archives/session-history-pre-2026-07-11.md` | Historical record |
| `docs/i18n/` | i18n review status |
| `.agent-backups/`, `.design-captures/`, `.freebuff/`, `.impeccable/`, `.superpowers/` | Already gitignored; local tool data |
| `LEGAL.md`, `PRIVACY.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `SUPPORT.md`, `CONTRIBUTING.md` | Standard open-source community files |
| `PRODUCT.md` | Product description |