# 10 Remediation Backlog

## VF-AUDIT-001 — Archive Historical Design/Specification Repositories
- Severity: P3
- Confidence: High
- Category: Stale Artifact
- Status: Open
- Affected paths:
  - `.design-captures/`
  - `.superpowers/`
- Evidence: These directories contain historical design artifacts, specs, and mockups that are not part of the active source tree, yet remain in the repository root.
- Expected contract: The repository root should only house active build/source logic or explicitly configured configuration/ignores.
- Root cause: Legacy workflow outputs remaining post-migration.
- Impact: Clutters root directory.
- Remediation:
  1. Add `.design-captures/` and `.superpowers/` to `.gitignore`.
- Safe cleanup disposition: Gitignore.

## VF-AUDIT-002 — Remove Root-Level Scratch Scripts
- Severity: P3
- Confidence: High
- Category: Hygiene
- Status: Open
- Affected paths:
  - `rewrite_history.py`
  - `update_history.py`
  - `scratch.diff`
  - `scratch/`
- Evidence: Temporary python scripts and diffs reside in the root directory. 
- Expected contract: No root scratch files should be committed.
- Root cause: Leftover agent artifacts.
- Impact: Hygiene degradation.
- Remediation:
  1. Delete `rewrite_history.py`, `update_history.py`, `scratch.diff`.
  2. Ensure `scratch/` is ignored (already in `.gitignore` natively).
- Safe cleanup disposition: Remove.

## VF-AUDIT-003 — Clean Stale Audit Directories
- Severity: P3
- Confidence: High
- Category: Stale Artifact
- Status: Open
- Affected paths:
  - `docs/audits/Venice_Forge-audit-evidence-20260717-031029/`
- Evidence: Contains stale generated audit from prior run, clashing with the active vs records convention.
- Expected contract: Historical audits must reside in `docs/audits/Records/`.
- Root cause: Misplaced directory during prior agent session.
- Impact: Clutters active audit space.
- Remediation:
  1. Move to `docs/audits/Records/Venice_Forge-audit-evidence-20260717-031029`.
- Safe cleanup disposition: Move.

*(Note: VF-VERIFY-005, VF-UX-REPRO-001, and VF-DOCUMENT-AGENT-001 remain explicitly tracked on ROADMAP.md and require external product/credential input or further scoping).*
