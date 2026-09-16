# Audits Directory

This directory separates **active work orders** from **immutable audit evidence**.

Current unfinished work still belongs in [`docs/ROADMAP.md`](../ROADMAP.md). Session validation belongs in [`docs/summary_of_work.md`](../summary_of_work.md). Documents here never become a second roadmap.

## Layout

| Path | Role |
|---|---|
| [`TODO/`](TODO/) | Active, git-tracked markdown work-order handoffs cited by the live roadmap, source comments, or current session ledger. |
| [`Records/`](Records/) | Immutable historical audit packages and evidence. Do not rewrite findings to match later code. |
| [`repo-management/`](repo-management/) | Historical August 2026 repository-hygiene planning only. |

## Active work orders

- [`TODO/VENICE_API_2026-09-16_FEATURE_GAP_AGENT_HANDOFF.md`](TODO/VENICE_API_2026-09-16_FEATURE_GAP_AGENT_HANDOFF.md) — Venice API feature-gap implementation work order.
- [`TODO/VENICE_FORGE_CURRENT_MAIN_DEEP_AUDIT_AGENT_HANDOFF_2026-09-16.md`](TODO/VENICE_FORGE_CURRENT_MAIN_DEEP_AUDIT_AGENT_HANDOFF_2026-09-16.md) — Current-main deep-audit handoff.

Remaining open items from those handoffs are tracked in `docs/ROADMAP.md`. Do not execute a historical handoff as if it were current fact; reproduce each claim against the checked-out tree.

## Ignore policy

`.gitignore` ignores `/docs/audits/*` by default, then unignores `Records/`, `TODO/*.md`, `repo-management/`, and markdown/YAML files directly under `docs/audits/`. Local `.DS_Store` files and non-markdown scratch under `TODO/` remain ignored.
