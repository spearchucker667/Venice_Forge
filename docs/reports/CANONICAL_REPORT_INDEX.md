# Canonical Report Index

This index maps retained audit and report artifacts to their current authority.
Historical reports are evidence only. If any report conflicts with live source,
package scripts, workflow files, `docs/summary_of_work.md`, or
`docs/audits/repository-todo-roadmap-current.md`, rerun validation and trust the
live repository.

## Current Authorities

| Purpose | Current authority |
|---|---|
| Session ledger and validation record | [`../summary_of_work.md`](../summary_of_work.md) |
| Current TODO roadmap | [`../audits/repository-todo-roadmap-current.md`](../audits/repository-todo-roadmap-current.md) |
| Documentation source map | [`../DOCS_INDEX.md`](../DOCS_INDEX.md) |
| Report directory policy | [`README.md`](README.md) |
| Current audit evidence | [`../audits/`](../audits/) and the `Current Audit Evidence` section in [`../DOCS_INDEX.md`](../DOCS_INDEX.md) |

## Historical Report Map

| Historical report | Status | Current handling |
|---|---|---|
| [`historical/AUDIT-006-021_VALIDATION_REPORT.md`](historical/AUDIT-006-021_VALIDATION_REPORT.md) | Historical validation evidence | Keep for traceability; current status belongs in the ledger and roadmap. |
| [`historical/AUDIT_FOLLOWUP_2026_06_05.md`](historical/AUDIT_FOLLOWUP_2026_06_05.md) | Historical audit follow-up | Keep for traceability only. |
| [`historical/BUG_HUNTING_AGENT_PROMPT.md`](historical/BUG_HUNTING_AGENT_PROMPT.md) | Historical agent prompt | Not a current instruction source; current agent rules live in [`../../AGENTS.md`](../../AGENTS.md). |
| [`historical/BUG_HUNT_REVIEW.md`](historical/BUG_HUNT_REVIEW.md) | Superseded review | Keep for evidence; do not use as current TODO list. |
| [`historical/BUG_HUNT_SUMMARY.md`](historical/BUG_HUNT_SUMMARY.md) | Historical bug-hunt summary | Keep for VF-AUDIT traceability. |
| [`historical/CI_FAILURE_AND_BUG_HUNT_2026_06_09.md`](historical/CI_FAILURE_AND_BUG_HUNT_2026_06_09.md) | Historical CI failure notes | Keep for root-cause history; rerun current CI/verifiers for status. |
| [`historical/DOCS_CANONICALIZATION_AND_STALE_PRUNE.md`](historical/DOCS_CANONICALIZATION_AND_STALE_PRUNE.md) | Historical docs cleanup evidence | Current docs authority is this file plus [`../DOCS_INDEX.md`](../DOCS_INDEX.md). |
| [`historical/EXHAUSTIVE_REPO_SCAN_TODO.md`](historical/EXHAUSTIVE_REPO_SCAN_TODO.md) | Superseded TODO input | Durable items must be folded into the current roadmap. |
| [`historical/FINAL_MASSIVE_BUG_HUNT_WITH_PROOF.md`](historical/FINAL_MASSIVE_BUG_HUNT_WITH_PROOF.md) | Historical release-blocking audit input | Keep for evidence; current closure status belongs in the ledger and roadmap. |
| `historical/FINAL_MASSIVE_BUG_HUNT_WITH_PROOF copy.md` | Duplicate historical copy | Retained as historical evidence only; do not cite as a separate current source. |
| [`historical/HQE_AUDIT_REPORT.md`](historical/HQE_AUDIT_REPORT.md) | Historical quality audit | Keep for evidence only. |
| [`historical/POST_VENICE_JINA_AUDIT_2026_06_06.md`](historical/POST_VENICE_JINA_AUDIT_2026_06_06.md) | Historical Venice/Jina audit | Keep for traceability; current Venice/Jina contracts live in source and verifiers. |
| [`historical/ROUND2_POST_FIX_BUG_HUNT_WITH_PROOF.md`](historical/ROUND2_POST_FIX_BUG_HUNT_WITH_PROOF.md) | Historical post-fix audit | Keep for evidence only. |
| [`historical/SWARM_AUDIT_2026_06_09.md`](historical/SWARM_AUDIT_2026_06_09.md) | Historical swarm audit | Keep for evidence only. |
| [`historical/VALIDATION_REPORT_AUDIT_001_080.md`](historical/VALIDATION_REPORT_AUDIT_001_080.md) | Historical validation report | Keep for evidence; current validation must be rerun under supported Node 22. |
| [`historical/VENICE_UI_PARITY_REFERENCE.md`](historical/VENICE_UI_PARITY_REFERENCE.md) | Historical UI reference | Reference-only; not a current implementation contract. |
| [`historical/audit-validation-report-022-051.md`](historical/audit-validation-report-022-051.md) | Historical validation report | Keep for evidence only. |
| [`historical/audit_report.yaml`](historical/audit_report.yaml) | Historical machine-readable audit input | Keep for traceability; not a current execution ledger. |

## Rules For New Reports

1. Do not create new root-level audit or TODO files.
2. Prefer updating [`../summary_of_work.md`](../summary_of_work.md) and
   [`../audits/repository-todo-roadmap-current.md`](../audits/repository-todo-roadmap-current.md).
3. If a durable report is still needed, place it under `docs/reports/` and add
   it to this index plus [`../DOCS_INDEX.md`](../DOCS_INDEX.md).
4. If a report is historical, keep a clear banner in the report itself or list
   it here as historical evidence only.
