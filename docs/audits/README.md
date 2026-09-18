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

As of the 2026-09-18 closure pass, `TODO/` holds no active work orders. The previously active 2026-09-16 Venice API feature-gap handoff, 2026-09-16 current-main deep-audit handoff, and 2026-09-18 current-main exhaustive review handoff have all been moved to `Records/` after their actionable findings were closed on `main`. Open items from those handoffs (notably `P2-016` headed visual/accessibility QA and `P3-020` qualified native-language review) remain tracked in `docs/ROADMAP.md`. Do not execute a historical handoff as if it were current fact; reproduce each claim against the checked-out tree.

## Ignore policy

`.gitignore` ignores `/docs/audits/*` by default, then unignores `Records/`, `TODO/*.md`, `repo-management/`, and markdown/YAML files directly under `docs/audits/`. Local `.DS_Store` files and non-markdown scratch under `TODO/` remain ignored.
