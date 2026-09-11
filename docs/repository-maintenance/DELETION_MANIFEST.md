# Venice Forge — Deletion & Retirement Manifest

**Baseline commit:** `c85448ce4436ca545d6da8a131f19662943e5ca5`
**Date:** 2026-09-11
**Scope:** Repository Hygiene & Organization Overhaul

---

## 1. Current Session Deletion Audit

During the 2026-09-11 repository hygiene overhaul, **zero active code or asset files were deleted**.
Two historical files with truncated/quoted filenames were safely moved with `git mv` (recorded in [`FILE_MOVE_MANIFEST.md`](FILE_MOVE_MANIFEST.md)) preserving git blame and revision history.

All candidate files were evaluated against the Section 45 Removal Criteria:
1. Duplicate of authoritative file
2. Generated artifact accidentally committed
3. Obsolete implementation no longer referenced
4. Temporary / debug artifact
5. Accidental backup
6. Stale documentation superseded elsewhere
7. Unused asset with no build/runtime reference

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
