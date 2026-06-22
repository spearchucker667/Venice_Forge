# Documentation Index

This index separates current source-of-truth documents from historical audit
evidence. If a historical report conflicts with live source, package scripts, or
`docs/summary_of_work.md`, rerun validation and trust the live repository.

## Current Source of Truth

| Area | Document |
|---|---|
| Project overview | [README.md](../README.md) |
| Product overview | [ABOUT.md](ABOUT.md) |
| User FAQ | [FAQ.md](FAQ.md) |
| Support | [SUPPORT.md](SUPPORT.md) |
| Agent instructions | [../AGENTS.md](../AGENTS.md) |
| Agent/session handoff ledger | [summary_of_work.md](summary_of_work.md) |
| Current TODO roadmap | [audits/repository-todo-roadmap-current.md](audits/repository-todo-roadmap-current.md) |
| Canonical report index | [reports/CANONICAL_REPORT_INDEX.md](reports/CANONICAL_REPORT_INDEX.md) |
| Contributor workflow | [../CONTRIBUTING.md](../CONTRIBUTING.md) |
| Security policy | [../SECURITY.md](../SECURITY.md) |
| Privacy policy | [../PRIVACY.md](../PRIVACY.md) |
| Legal notices | [../LEGAL.md](../LEGAL.md), [legal/NOTICE.md](legal/NOTICE.md), [legal/THIRD_PARTY_NOTICES.md](legal/THIRD_PARTY_NOTICES.md) |
| Release process | [RELEASE/release.md](RELEASE/release.md) |
| Signed artifact evidence | [RELEASE/SIGNED_ARTIFACT_EVIDENCE.md](RELEASE/SIGNED_ARTIFACT_EVIDENCE.md) |
| Signing/notarization | [RELEASE/signing-and-notarization.md](RELEASE/signing-and-notarization.md) |
| Repository settings | [RELEASE/repository-settings.md](RELEASE/repository-settings.md) |
| Platform support | [DEVELOPMENT/platform-support.md](DEVELOPMENT/platform-support.md) |
| Configuration | [DEVELOPMENT/CONFIG.md](DEVELOPMENT/CONFIG.md) |
| Storage policy | [DEVELOPMENT/storage-policy.md](DEVELOPMENT/storage-policy.md) |
| Repository map | [design/REPOSITORY_TREE.md](design/REPOSITORY_TREE.md) |
| Theme system | [design/THEME_SYSTEM.md](design/THEME_SYSTEM.md) |

## Current Audit Evidence

| Area | Document |
|---|---|
| v2.1.0 closed bug map | [audits/bug-cross-reference-v2.1.0.md](audits/bug-cross-reference-v2.1.0.md) |
| v2.1.0 repair evidence | [audits/agent-repair-status-2026-06-16.yaml](audits/agent-repair-status-2026-06-16.yaml) |
| P0 closure evidence | [audits/p0-closure-evidence-2026-06-16.yaml](audits/p0-closure-evidence-2026-06-16.yaml) |
| Work-order records | [audits/work-orders-2026-06-15.yaml](audits/work-orders-2026-06-15.yaml) |
| Exhaustive bug-hunt audit | [audits/exhaustive-bug-hunt-2026-06-19.md](audits/exhaustive-bug-hunt-2026-06-19.md) |
| Release safety gate | [audits/release_safety_gate_2026-06-19.md](audits/release_safety_gate_2026-06-19.md) |
| Security / quality static audit | [audits/security-quality-static-audit-2026-06-19.md](audits/security-quality-static-audit-2026-06-19.md) |
| Historical bug-hunt summary (VF-AUDIT-001..011) | [reports/historical/BUG_HUNT_SUMMARY.md](reports/historical/BUG_HUNT_SUMMARY.md) |
| Audit changelog | [audits/CHANGELOG.md](audits/CHANGELOG.md) |
| Historical coverage baseline | [audits/docstrings-and-coverage-baseline.md](audits/docstrings-and-coverage-baseline.md) |
| Historical coverage final report | [audits/docstrings-and-coverage-final.md](audits/docstrings-and-coverage-final.md) |

## Historical Reports

The files under [reports/historical](reports/historical/) are retained for
traceability. They are not current TODO lists. See
[reports/CANONICAL_REPORT_INDEX.md](reports/CANONICAL_REPORT_INDEX.md) for the
complete report authority map. Each retained report should have a historical or
superseded banner near the top.

| Report | Use |
|---|---|
| [AUDIT_FOLLOWUP_2026_06_05.md](reports/historical/AUDIT_FOLLOWUP_2026_06_05.md) | Early audit-followup evidence. |
| [BUG_HUNT_REVIEW.md](reports/historical/BUG_HUNT_REVIEW.md) | Superseded bug-hunt review. |
| [CI_FAILURE_AND_BUG_HUNT_2026_06_09.md](reports/historical/CI_FAILURE_AND_BUG_HUNT_2026_06_09.md) | Historical CI failure and bug repair notes. |
| [DOCS_CANONICALIZATION_AND_STALE_PRUNE.md](reports/historical/DOCS_CANONICALIZATION_AND_STALE_PRUNE.md) | Prior docs cleanup evidence. |
| [EXHAUSTIVE_REPO_SCAN_TODO.md](reports/historical/EXHAUSTIVE_REPO_SCAN_TODO.md) | Historical exhaustive scan TODO input. |
| [FINAL_MASSIVE_BUG_HUNT_WITH_PROOF.md](reports/historical/FINAL_MASSIVE_BUG_HUNT_WITH_PROOF.md) | Historical release-blocking audit input. |
| [HQE_AUDIT_REPORT.md](reports/historical/HQE_AUDIT_REPORT.md) | Historical HQE audit. |
| [POST_VENICE_JINA_AUDIT_2026_06_06.md](reports/historical/POST_VENICE_JINA_AUDIT_2026_06_06.md) | Historical Venice/Jina audit. |
| [SWARM_AUDIT_2026_06_09.md](reports/historical/SWARM_AUDIT_2026_06_09.md) | Historical swarm audit. |
| [VENICE_UI_PARITY_REFERENCE.md](reports/historical/VENICE_UI_PARITY_REFERENCE.md) | Historical UI reference only. |

## Retired In This Hygiene Pass

- `docs/audits/Repository TODO Roadmap — Venice Forge.md` was merged into the
  current roadmap and deleted.
- `docs/audits/roadmap-verification-2026-06-16.yaml` was deleted with the old
  roadmap.
- `docs/audits/current-audit-cross-check-status.md` and
  `docs/audits/current-audit-cross-check-status.yaml` were deleted because the
  closed findings are covered by the repair evidence and current ledger.
- `docs/VENICE_FORGE_TODO.md` and `docs/VENICE_FORGE_ZIP_AUDIT_HANDOFF.md` were
  completed and moved to [archives/](archives/) as historical evidence.
