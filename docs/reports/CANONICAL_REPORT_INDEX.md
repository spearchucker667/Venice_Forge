# Canonical Report Index

This index maps retained audit and report artifacts to their current authority. Historical reports are evidence only. If any report conflicts with live source, package scripts, workflow files, `docs/summary_of_work.md`, or `docs/ROADMAP.md`, rerun validation and trust the live repository.

## Current Authorities

| Purpose | Current authority |
|---|---|
| Session ledger and validation record | [`../summary_of_work.md`](../summary_of_work.md) |
| Current TODO roadmap | [`../ROADMAP.md`](../ROADMAP.md) |
| Documentation source map | [`../DOCS_INDEX.md`](../DOCS_INDEX.md) |
| Report directory policy | [`README.md`](README.md) |

## Historical Report Map

| Historical report | Status | Current handling |
|---|---|---|
| [`historical/AUDIT-006-021_VALIDATION_REPORT.md`](historical/AUDIT-006-021_VALIDATION_REPORT.md) | Historical validation evidence | Keep for traceability; current status belongs in the ledger and roadmap. |
| [`historical/BUG_HUNTING_AGENT_PROMPT.md`](historical/BUG_HUNTING_AGENT_PROMPT.md) | Historical agent prompt | Not a current instruction source; current agent rules live in [`../../AGENTS.md`](../../AGENTS.md). |
| [`historical/BUG_HUNT_SUMMARY.md`](historical/BUG_HUNT_SUMMARY.md) | Historical bug-hunt summary | Keep for VF-AUDIT traceability. |
| [`historical/final-massive-bug-hunt-with-proof.md`](historical/final-massive-bug-hunt-with-proof.md) | Historical release-blocking audit | Keep for evidence; current closure status belongs in the ledger and roadmap. |
| [`historical/ROUND2_POST_FIX_BUG_HUNT_WITH_PROOF.md`](historical/ROUND2_POST_FIX_BUG_HUNT_WITH_PROOF.md) | Historical post-fix audit | Keep for evidence only. |
| [`historical/VALIDATION_REPORT_AUDIT_001_080.md`](historical/VALIDATION_REPORT_AUDIT_001_080.md) | Historical validation report | Keep for evidence; current validation must be rerun under supported Node 22. |
| [`historical/VENICE_UI_PARITY_REFERENCE.md`](historical/VENICE_UI_PARITY_REFERENCE.md) | Historical UI reference | Reference-only; not a current implementation contract. |
| [`historical/audit-validation-report-022-051.md`](historical/audit-validation-report-022-051.md) | Historical validation report | Keep for evidence only. |
| [`historical/audit_report.yaml`](historical/audit_report.yaml) | Historical machine-readable audit input | Keep for traceability; not a current execution ledger. |

## Rules For New Reports

1. Do not create new root-level audit or TODO files.
2. Prefer updating [`../summary_of_work.md`](../summary_of_work.md) and [`../ROADMAP.md`](../ROADMAP.md).
3. If a durable report is still needed, place it under `docs/reports/` and add it to this index plus [`../DOCS_INDEX.md`](../DOCS_INDEX.md).
4. If a report is historical, keep a clear banner in the report itself or list it here as historical evidence only.
