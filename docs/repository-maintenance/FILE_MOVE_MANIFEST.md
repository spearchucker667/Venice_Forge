# Venice Forge — File Move & Rename Manifest

**Baseline commit:** `c85448ce4436ca545d6da8a131f19662943e5ca5`
**Date:** 2026-09-11
**Scope:** Repository Hygiene & Organization Overhaul

---

## 1. Moved & Renamed Files

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

## 2. Directory Additions & Index Placements

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
