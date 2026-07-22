# 02 Documentation Audit

## Overview
The repository contains approximately 700 documentation-like files across all directories (excluding `node_modules`).
- **docs/**: ~107 files containing the core documentation, audits, design specs, and historical logs.
- **.superpowers/**: ~31 files containing historical design/specification artifacts.
- **.design-captures/**: ~40 files containing historical captures.
- **Root**: Standard boilerplate (README, CONTRIBUTING, SECURITY, etc.) and Agent rules (AGENTS.md, CLAUDE.md, GEMINI.md).

## Stale Names and Paths
- **Venice-API-connector / Windows-Venice-API-connector**: These names are explicitly historical and are guarded against in `AGENTS.md`. 
- **Venice_Forge**: Canonical repository name.

## API Documentation Copies
- `docs/reference/Venice_swagger_api.yaml` (canonical, tested via `verify:venice-api-docs`)
- `docs/reference/Venice_api_LLM_info.md`
- `docs/reference/VENICE_API_SYSTEM_PROMPT.md`

## Disposition Table (Core Documents)

| Path | Classification | Recommended Disposition |
|---|---|---|
| `docs/ROADMAP.md` | CANONICAL | Keep (active ledger) |
| `docs/summary_of_work.md` | CANONICAL | Keep (active handoff) |
| `docs/DOCS_INDEX.md` | CANONICAL | Keep |
| `AGENTS.md` | CANONICAL | Keep |
| `GEMINI.md`, `CLAUDE.md` | ACTIVE_SUPPORTING | Keep |
| `docs/audits/Records/*` | HISTORICAL_RECORD | Archive (maintain in Records) |
| `docs/audits/Venice_Forge-audit-evidence-*` | GENERATED_STALE | Move to `docs/audits/Records/` |
| `docs/reports/historical/*` | HISTORICAL_RECORD | Keep in archive |
| `docs/design/*` | ACTIVE_SUPPORTING | Keep, verify if outdated |
| `.superpowers/*` | HISTORICAL_RECORD | Move to `docs/archives/` or Gitignore |
| `rewrite_history.py`, `update_history.py` | ORPHANED | Remove or move to `scripts/` |

## Required Updates
- Audit README (`docs/audits/README.md`) should be created to define the active vs. records convention.
- Generated audit outputs outside of `Records/` or `active/` should be consolidated.
- Root python scripts (`rewrite_history.py`, `update_history.py`) must be removed if no longer used.
