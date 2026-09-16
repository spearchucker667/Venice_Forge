# Venice Forge — Deletion & Retirement Manifest

**Latest revalidation working tree:** 2026-09-16 hygiene continuation on `main` (baseline `bd070918ae9aaefac681f68743882c195f8c3778`; commit SHA pending publication)
**Historical overhaul baseline:** `db028726bf308a37a764d1c9dc5ef31613f4d7ad`
**Date:** 2026-09-16
**Scope:** Repository Hygiene & Organization Overhaul

---

## 0. Current Revalidation — 2026-09-16

No tracked file was deleted in this continuation. Four dated reports were relocated into `docs/reports/historical/` rather than removed. Local-only artifacts (`kimi-export-session_*.md`, `Screenshot_*.png`, `scratch/`, `artifacts/`, `venice-media-output/`, `.env`) remain user-owned and ignored. `docs/audits/TODO/.DS_Store` remains ignored.

## 0.1 Prior Revalidation — 2026-09-15

No tracked file was deleted. Local-only artifacts remain user-owned and were not removed; their ignore coverage was verified, with a root screenshot pattern added to `.gitignore`.

## 1. 2026-09-14 Session Deletion Audit

During the 2026-09-14 repository overhaul, **zero tracked files were deleted or retired**.
All 1,974 tracked files were evaluated against the Section 45 Removal Criteria and verified to be necessary, referenced, active source, test, configuration, assets, or canonical documentation.

### Untracked Scratch Files Removed
- **Path:** `docs/ROADMAP.md.clean` (37 KB)
- **Classification:** Stale untracked scratch backup
- **Reason for removal:** Accidental scratch backup from prior roadmap maintenance pass left in the worktree. Removed per Section 27 after confirming that Git tracks canonical `docs/ROADMAP.md`.
- **Reference search performed:** Yes (`docs/summary_of_work.md:1173` confirmed it was an untracked scratch file).

All candidate files were evaluated against the Section 45 Removal Criteria:
1. Duplicate of authoritative file (none found)
2. Generated artifact accidentally committed (none found)
3. Obsolete implementation no longer referenced (none found)
4. Temporary / debug artifact (1 untracked scratch file removed: `docs/ROADMAP.md.clean`)
5. Accidental backup (none found)
6. Stale documentation superseded elsewhere (none found)
7. Unused asset with no build/runtime reference (none found)

---

## 2. Historical Deletion Ledger

For reference, the following items were removed or untracked during prior documented hygiene passes (2026-08-22 and 2026-09-01) and are tracked here to prevent re-introduction:

### 1. Root Stubs & Redundant Instructions
- **Path:** `CLAUDE.md`, `GEMINI.md`, `.windsurfrules`
- **Classification:** Redundant agent instruction duplicates
- **Reason for removal:** Duplicated `AGENTS.md` and caused instructions to drift out of sync. `AGENTS.md` is the canonical instruction file; `.cursorrules` is a thin pointer.
- **Replacement:** `AGENTS.md`
- **Reference search performed:** Yes (verified in `scripts/verify-agent-docs.cjs`).

### 2. Root Duplicate Documentation
- **Path:** `docs/SUPPORT.md`, `docs/privacy.md`
- **Classification:** Duplicate documentation files
- **Reason for removal:** Identical or stale copies of root-level `SUPPORT.md` and `PRIVACY.md`.
- **Replacement:** Root `SUPPORT.md`, `PRIVACY.md`, and technical `docs/legal/PRIVACY.md`.
- **Reference search performed:** Yes.

### 3. Root-Level Audit Stubs
- **Path:** `VENICE_FORGE_COMPLETE_AUDIT.md`
- **Classification:** Root audit scratch file
- **Reason for removal:** Stale audit stub in repository root violating Rule 6 / Section 6 root-cleanliness policy.
- **Replacement:** Canonical audit directories in `docs/audits/`.
- **Reference search performed:** Yes.

### 4. Oversized Transient Session Dumps
- **Path:** `docs/archives/session-history-pre-2026-07-11.md` (1.29 MiB)
- **Classification:** Transient agent transcript dump
- **Reason for removal:** 1.29 MiB raw agent session text untracked 2026-09-01; not required to build, test, or document Venice Forge. Git history preserves the blob.
- **Replacement:** `docs/summary_of_work.md` (active session ledger).
- **Reference search performed:** Yes.

### 5. Superseded Historical Ledger
- **Path:** `docs/reports/historical/historical_summary_of_work.md` (1.22 MiB)
- **Classification:** Superseded historical ledger
- **Reason for removal:** 1.22 MiB historical ledger untracked to reduce repository bloat.
- **Replacement:** `docs/summary_of_work.md` (active session ledger) and `docs/ROADMAP.md`.
- **Reference search performed:** Yes.

### 6. Non-Compliant Raw Traffic Logs
- **Path:** `docs/audits/TODO/venice_forge_traffic_logs_1788307814290.json` (~14.6 MiB)
- **Classification:** Raw provider response & traffic capture
- **Reason for removal:** Violated AGENTS.md Rule 6 / Section 6 (prohibiting raw provider payloads and complete response captures in source control).
- **Replacement:** Traffic Inspector redacted diagnostic summaries.
- **Reference search performed:** Yes.
