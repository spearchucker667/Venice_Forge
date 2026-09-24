# Venice Forge — File Move & Rename Manifest

**Latest revalidation working tree:** 2026-09-23 repository-management revalidation on `main` (published HEAD `c4134390241f792527837fc143c7e979ae36fa7a`; archive move uncommitted)
**Historical overhaul baseline:** `db028726bf308a37a764d1c9dc5ef31613f4d7ad`
**Date:** 2026-09-18
**Scope:** Repository Hygiene, Documentation Overhaul, Showcase Integration & CodeQL Hardening

---

## 0. Current Revalidation — 2026-09-23

Two closed handoffs were already copied into `Records/` in the dirty worktree. Checksums matched the HEAD blobs. This pass kept the move and updated links.

- **OLD PATH:** `docs/audits/auditsep23.md`
- **→ NEW PATH:** `docs/audits/Records/auditsep23.md`
- **Reason:** Workstreams A–I were remediated. Closed handoffs live under `Records/`.
- **References updated:** `docs/DOCS_INDEX.md`, `docs/summary_of_work.md`, `docs/audits/repo-management/README.md`.

- **OLD PATH:** `docs/audits/Venice_Forge_Random_Pet_Rotation_Agent_Handoff.md`
- **→ NEW PATH:** `docs/audits/Records/Venice_Forge_Random_Pet_Rotation_Agent_Handoff.md`
- **Reason:** The pet-rotation feature had landed. The specification is retained evidence, not an active work order.
- **References updated:** `docs/DOCS_INDEX.md`, `docs/summary_of_work.md`.

## 0.1 Prior Revalidation — 2026-09-18

During the 2026-09-18 overhaul:
- **Created Canonical Sub-READMEs:**
  - `docs/README.md`: Entry point for Diátaxis documentation taxonomy, links to `DOCS_INDEX.md`, precedence rules, and live showcase/demo links.
  - `docs/reports/README.md`: Governance and retention policy for historical validation reports.
- **Root Transient File Isolation:**
  - Root session exports (`kimi-export-session_-*.md`) and root screenshot capture (`Screenshot_20260914-132444.png`) were cleared from root and archived in local gitignored paths (`.agent-backups/session-exports/` and `.design-captures/`).
- **Retained Entrypoints:**
  - Root `server.ts` and `server.test.ts` retained at root under Option B to maintain package script contracts (`dev:server`, `build:server`).
- **No tracked file relocations or renames were required.** All existing paths remain canonical.

## 1. 2026-09-14 Session Move & Rename Audit

During the 2026-09-14 repository overhaul, **zero files required relocation or renaming**.
All 1,974 tracked files occupy their canonical locations under the established Diátaxis documentation structure, modular source directories (`electron/`, `src/`, `scripts/`, `config/`, `tests/`), and clean 29-file root governance perimeter.

---

## 2. Historical Move & Rename Manifest (2026-09-11)

### Entry 1
- **OLD PATH:** `docs/audits/repo-management/Venice Forge — Exhaustive Repository A.md`
- **→ NEW PATH:** `docs/audits/repo-management/2026-08-22-exhaustive-repository-audit-plan.md`
- **Reason:** File name contained non-ASCII em-dash (`—`), whitespace, and truncated trailing title ("Repository A" instead of "Repository Audit..."), which caused git quote-escaping issues in POSIX tools and scripts. Renamed to standard dated kebab-case convention.
- **References updated:** `docs/audits/repo-management/README.md`, `docs/DOCS_INDEX.md`, `docs/repository-maintenance/REPOSITORY_HYGIENE_REPORT.md`.
- **Validation result:** PASS (`git ls-files` no longer emits quoted path; `npm run verify:markdown-links` PASS).

### Entry 2
- **OLD PATH:** `docs/audits/repo-management/Venice Forge — Repository Hygiene, Reo.md`
- **→ NEW PATH:** `docs/audits/repo-management/2026-08-22-repository-hygiene-handoff.md`
- **Reason:** File name contained non-ASCII em-dash (`—`), whitespace, and truncated trailing title ("Reo" instead of "Reorganization..."), causing POSIX tools and script quote-escaping warnings. Renamed to standard dated kebab-case convention.
- **References updated:** `docs/audits/repo-management/README.md`, `docs/DOCS_INDEX.md`, `docs/repository-maintenance/REPOSITORY_HYGIENE_REPORT.md`.
- **Validation result:** PASS (`git ls-files` no longer emits quoted path; `npm run verify:markdown-links` PASS).

---

## 3. Directory Additions & Index Placements

### Entry 3
- **NEW PATH:** `docs/audits/repo-management/README.md`
- **Reason:** Added directory navigation index to properly document the historical repository hygiene work orders preserved in `docs/audits/repo-management/`.
- **References updated:** Indexed in `docs/DOCS_INDEX.md`.
- **Validation result:** PASS (`verify:markdown-links` PASS).

### Entry 4
- **NEW PATH:** `docs/repository-maintenance/README.md`
- **Reason:** Added index for repository maintenance, hygiene audits, move manifests, and deletion records.
- **References updated:** Indexed in `docs/DOCS_INDEX.md`.
- **Validation result:** PASS (`verify:markdown-links` PASS).

---

## 4. 2026-09-16 Session — Directory Normalization & Root Hygiene

### Entry 5: Root Decluttering
- **OLD PATH:** `AGENT_REINITIALIZATION.md`
- **→ NEW PATH:** `docs/DEVELOPMENT/agents/AGENT_REINITIALIZATION.md`
- **Reason:** Decluttered repository root; consolidated agent documentation under development hierarchy.
- **References updated:** AGENTS.md, docs/DOCS_INDEX.md, docs/DEVELOPMENT/troubleshooting.md.
- **Validation result:** PASS (`verify:markdown-links` PASS, `verify:agent-docs` PASS).

### Entry 6: docs/developer/ Consolidation into docs/DEVELOPMENT/
- **OLD PATH:** `docs/developer/CHARACTER_CARD_CODEC.md`
- **→ NEW PATH:** `docs/DEVELOPMENT/CHARACTER_CARD_CODEC.md`
- **Reason:** Consolidated duplicate casing directory split; eliminated docs/developer/ vs docs/DEVELOPMENT/ confusion.
- **References updated:** docs/DOCS_INDEX.md, verify scripts.
- **Validation result:** PASS (`verify:markdown-links` PASS).

- **OLD PATH:** `docs/developer/CHARACTER_CARD_MAPPINGS.md`
- **→ NEW PATH:** `docs/DEVELOPMENT/CHARACTER_CARD_MAPPINGS.md`
- **Reason:** Consolidated duplicate casing directory split.
- **References updated:** docs/DOCS_INDEX.md, verify scripts.
- **Validation result:** PASS (`verify:markdown-links` PASS).

- **OLD PATH:** `docs/developer/image-inspector-architecture.md`
- **→ NEW PATH:** `docs/DEVELOPMENT/image-inspector-architecture.md`
- **Reason:** Consolidated duplicate casing directory split.
- **References updated:** docs/DOCS_INDEX.md, docs/security/security-model.md, docs/user/IMAGE_INSPECTOR.md, verify scripts.
- **Validation result:** PASS (`verify:markdown-links` PASS).

### Entry 7: docs/RELEASE/ Normalization to docs/release/
- **OLD PATH:** `docs/RELEASE/release.md`
- **→ NEW PATH:** `docs/release/release.md`
- **Reason:** Normalized directory casing to lowercase for consistency with other docs directories.
- **References updated:** All scripts (verify-release-packaging-hardening.cjs, verify-archive-clean.test.ts), workflows (.github/workflows/release.yml), docs (DOCS_INDEX.md, FAQ.md, ABOUT.md, SUPPORT.md, LEGAL.md, CONTRIBUTING.md, .github/copilot-instructions.md, docs/release/release.md, docs/DEVELOPMENT/troubleshooting.md, docs/summary_of_work.md).
- **Validation result:** PASS (`verify:markdown-links` PASS, `verify:release-packaging-hardening` PASS).

- **OLD PATH:** `docs/RELEASE/signing-and-notarization.md`
- **→ NEW PATH:** `docs/release/signing-and-notarization.md`
- **Reason:** Normalized directory casing to lowercase.
- **References updated:** All scripts, workflows, and docs (see above).
- **Validation result:** PASS.

- **OLD PATH:** `docs/RELEASE/repository-settings.md`
- **→ NEW PATH:** `docs/release/repository-settings.md`
- **Reason:** Normalized directory casing to lowercase.
- **References updated:** All scripts, workflows, and docs (see above).
- **Validation result:** PASS.

- **OLD PATH:** `docs/RELEASE/SIGNED_ARTIFACT_EVIDENCE.md`
- **→ NEW PATH:** `docs/release/SIGNED_ARTIFACT_EVIDENCE.md`
- **Reason:** Normalized directory casing to lowercase.
- **References updated:** All scripts, workflows, and docs (see above).
- **Validation result:** PASS.

- **OLD PATH:** `docs/RELEASE/ST_CARD_STUDIO_MIGRATION.md`
- **→ NEW PATH:** `docs/release/ST_CARD_STUDIO_MIGRATION.md`
- **Reason:** Normalized directory casing to lowercase.
- **References updated:** All scripts, workflows, and docs (see above).
- **Validation result:** Re-run in the continuation session before publication. The actual `git mv` rename was executed on 2026-09-16 in the FEAT-003/004 continuation session via a two-step rename through a temporary `docs/RELEASE_TMP/` directory (required on case-insensitive APFS volumes where `docs/RELEASE` and `docs/release` share an inode). The earlier entry recorded the documentation updates but did not run `git mv`, leaving the Git index tracking `docs/RELEASE/`. After the rename: `verify:markdown-links` PASS (0 issues in 415 files), `verify:contracts` PASS (104/104), `verify:repo-handoff-hygiene` PASS.

### Entry 8: Historical report archive and active audit-handoff tracking
- **OLD PATH:** `docs/reports/FINAL_AUDIT_REMEDIATION_REPORT_2026-08-26.md`
- **→ NEW PATH:** `docs/reports/historical/FINAL_AUDIT_REMEDIATION_REPORT_2026-08-26.md`
- **Reason:** Durable historical reports belong under `docs/reports/historical/` with a `Historical snapshot.` banner required by `scripts/verify-repository-identity.cjs`.
- **References updated:** `docs/DOCS_INDEX.md`, `docs/reports/historical/CANONICAL_REPORT_INDEX.md`, `docs/superpowers/specs/2026-08-30-audit-remediation-design.md`.
- **Validation result:** VERIFIED (`verify:markdown-links`, `verify:repository-identity`).

- **OLD PATH:** `docs/reports/VENICE_FORGE_POST_AUGUST_24_AUDIT_REPORT.md`
- **→ NEW PATH:** `docs/reports/historical/VENICE_FORGE_POST_AUGUST_24_AUDIT_REPORT.md`
- **Reason:** Same historical-report placement rule.
- **References updated:** `docs/DOCS_INDEX.md`, `docs/reports/historical/CANONICAL_REPORT_INDEX.md`, self-path inside the report.
- **Validation result:** VERIFIED (`verify:markdown-links`, `verify:repository-identity`).

- **OLD PATH:** `docs/reports/MEDIA_PREVIEW_TRAFFIC_INSPECTOR_REMEDIATION_REPORT_2026-07-26.md`
- **→ NEW PATH:** `docs/reports/historical/MEDIA_PREVIEW_TRAFFIC_INSPECTOR_REMEDIATION_REPORT_2026-07-26.md`
- **Reason:** Same historical-report placement rule.
- **References updated:** `docs/DOCS_INDEX.md`, `docs/reports/historical/CANONICAL_REPORT_INDEX.md`, self-path inside the report.
- **Validation result:** VERIFIED (`verify:markdown-links`, `verify:repository-identity`).

- **OLD PATH:** `docs/reports/MEDIA_SAVE_PIPELINE_AUDIT_2026-07-28.md`
- **→ NEW PATH:** `docs/reports/historical/MEDIA_SAVE_PIPELINE_AUDIT_2026-07-28.md`
- **Reason:** Same historical-report placement rule.
- **References updated:** `docs/DOCS_INDEX.md`, `docs/reports/historical/CANONICAL_REPORT_INDEX.md`.
- **Validation result:** VERIFIED (`verify:markdown-links`, `verify:repository-identity`).

- **NEW PATH:** `docs/audits/README.md`
- **Reason:** Document the `TODO/` vs `Records/` vs `repo-management/` split after unignoring active markdown handoffs.
- **References updated:** `docs/DOCS_INDEX.md`.
- **Validation result:** VERIFIED (`verify:markdown-links`, `verify:repository-identity`).

- **NEW PATH:** `docs/audits/TODO/VENICE_API_2026-09-16_FEATURE_GAP_AGENT_HANDOFF.md`
- **Reason:** Live roadmap and source comments already cite this work order; `/docs/audits/*` previously hid it from Git.
- **References updated:** `.gitignore` unignore for `TODO/*.md`; indexed in `docs/DOCS_INDEX.md`.
- **Validation result:** VERIFIED (`verify:markdown-links`, `verify:repository-identity`).

- **NEW PATH:** `docs/audits/TODO/VENICE_FORGE_CURRENT_MAIN_DEEP_AUDIT_AGENT_HANDOFF_2026-09-16.md`
- **Reason:** Same ignore-gap; remaining work stays in `docs/ROADMAP.md`.
- **References updated:** `.gitignore`; `docs/DOCS_INDEX.md`.
- **Validation result:** VERIFIED (`verify:markdown-links`, `verify:repository-identity`).

---

## Summary
- **2026-09-16 Session:** 13 files moved/renamed plus 3 newly tracked audit documents
- **Directory normalization:** docs/RELEASE/ -> docs/release/ (5 files), docs/developer/ -> docs/DEVELOPMENT/ (3 files)
- **Root decluttering:** 1 file moved from root to docs/DEVELOPMENT/agents/
- **Historical archive:** 4 dated reports moved from `docs/reports/` to `docs/reports/historical/`
- **Audit tracking:** `docs/audits/TODO/*.md` unignored; `docs/audits/README.md` added
- **All live references updated** in scripts, documentation, workflows, and configuration
- **Verification gates:** focused continuation gates VERIFIED (`verify:markdown-links`, identity, roadmap, release-metadata, agent-docs, release-packaging-hardening, safety-guard, repo-handoff-hygiene, lint:eslint, typecheck). `npm test` / `build` / `verify:contracts` / hosted CI NOT VERIFIED.
