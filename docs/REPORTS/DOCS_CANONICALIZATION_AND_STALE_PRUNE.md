# Documentation Canonicalization & Stale Prune (2026-06-08)

> **SUPERSEDED 2026-06-09 by [docs/REPORTS/CI_FAILURE_AND_BUG_HUNT_2026_06_09.md](CI_FAILURE_AND_BUG_HUNT_2026_06_09.md).**
> The 2026-06-08 PASS verdict is no longer the current release-gate
> position; the 2026-06-09 report covers the Windows CI failure on
> `configService.exportConfigTemplate` plus the bridge / SSE / image
> payload follow-up findings.
> Retained for historical provenance of the 2026-06-08 canonicalization
> pass.

## Purpose

After the 2026-06-08 final proof audit landed at HEAD `c2afcfac`
(1905/1905 tests, all `verify:*` audits pass, **PASS — safe to release
v1.0.6**), a single documentation cleanup pass was performed to:

1. Eliminate contradictions between the canonical ledger
   ([`docs/summary_of_work.md`](../summary_of_work.md), 2653L) and the
   user-facing root files ([`README.md`](../../README.md),
   [`CHANGELOG.md`](../../CHANGELOG.md), [`AGENTS.md`](../../AGENTS.md)).
2. Mark every retained-but-superseded report with an explicit, greppable
   banner so future agents cannot mistake it for the current audit of
   record.
3. Document the canonicalization decision history in this report so the
   next session can audit the auditors.

No code, no test, no package, no CI surface was modified.

## Scope: what was inspected

| Layer | Files |
|-------|-------|
| Root docs | `README.md` (496L), `AGENTS.md` (344L), `CHANGELOG.md` (532L), `CLAUDE.md`, `GEMINI.md` |
| Root todo | `todo.md` (394L), `TODO.md` (394L), `docs/TODO.md` (109L) |
| Canonical ledger | `docs/summary_of_work.md` (2653L) |
| Historical audits | `docs/AUDIT_FOLLOWUP_2026_06_05.md` (503L), `docs/POST_VENICE_JINA_AUDIT_2026_06_06.md` (420L), `docs/HQE_AUDIT_REPORT.md` (152L) |
| `docs/REPORTS/` | `BUG_HUNT_REVIEW.md` (78L), `FINAL_MASSIVE_BUG_HUNT_WITH_PROOF.md` (372L — canonical) |
| `docs/venice_llm_info.md` | 484 KB informational, HISTORICAL banner already present |
| `.gitignore` | confirmed patterns at lines 4, 5, 8, 11 |
| Tracked Markdown count | **51** (all `docs/AGENTS/`, `docs/HQE_AUDIT_REPORT.md`, `docs/design/`, root `todo.md` / `TODO.md` are gitignored) |

## Changes made

### 1. `README.md` (496L → 500L)

| Line | Before | After | Reason |
|------|--------|-------|--------|
| 436 | `Current Version \| v1.0.5` | `Current Version \| v1.0.6` | `package.json` is at `1.0.6`; CHANGELOG `[Unreleased]` already includes Phase 2J; FINAL audit confirms v1.0.6 is the safe-to-release version. |
| 444 | `Full Vitest suite plus 40 active named regression guards` | `Full Vitest suite plus 52 active named regression guards` | Line 260 (and AGENTS.md, CHANGELOG) already say 52. The "40" was a stale carry-over from a pre-2A count. |
| 309 | Single collapsed row: `\`VERIFY-047\`–\`VERIFY-051\` \| Reserved: Phase 2E Scene Composer …` | Expanded into **5 individual rows** (VERIFY-047, 048, 049, 050, 051) matching the AGENTS.md descriptions 1-for-1, each citing the locked test files and the `verify:*.cjs` audit script | Brings the README regression-guard table to parity with `AGENTS.md` so a reviewer who only reads the README sees the same surface. |
| 316 | Single sentence ending with `Outstanding P2/P3 work is tracked in the *Open TODO Ledger* …` | Added two new sentences: the 2026-06-08 final proof audit pointer (`docs/REPORTS/FINAL_MASSIVE_BUG_HUNT_WITH_PROOF.md`) and the 2026-06-08 docs canonicalization pointer (this report) | Provides a complete audit trail 2026-06-05 → 2026-06-06 → 2026-06-08 in a single sentence. |

### 2. `docs/REPORTS/BUG_HUNT_REVIEW.md` (78L → 86L)

The 2026-06-04 review predates:

- the 2026-06-04/05 `modules/` → `components/` refactor that fixed section 1.1,
- the 2026-06-06 round-2 audit (BUG-001..006, 008, 009),
- the 2026-06-08 final proof audit,
- Phases 2A–2J (VERIFY-035..052).

Without a banner, a future agent reading the `docs/REPORTS/` directory in
filename-sort order would see `BUG_HUNT_REVIEW.md` *before*
`FINAL_MASSIVE_BUG_HUNT_WITH_PROOF.md` and could mistake the Critical
finding in section 1.1 for an open regression. Three edits:

- **Top-of-file SUPERSEDED banner (15 lines)**: greppable `SUPERSEDED`
  marker, dates every event that supersedes it, and points to the
  three current reports of record (`FINAL_MASSIVE_BUG_HUNT_WITH_PROOF.md`,
  `POST_VENICE_JINA_AUDIT_2026_06_06.md`, `summary_of_work.md`).
- **Section 1.1 header**: added `**Status:** ✅ Fixed
  *(2026-06-04/05 modules→components refactor; see SUPERSEDED banner
  above)*` to match the ✅ Fixed marker that sections 1.2, 3.1, 3.2
  already carried.
- **Conclusion section**: changed "is currently structurally sound but
  functionally incomplete" to "was at that point structurally sound but
  functionally incomplete" (past tense) and added a pointer line to the
  current conclusion of record.

### 3. `docs/REPORTS/DOCS_CANONICALIZATION_AND_STALE_PRUNE.md` (this file)

New file. Captures the audit/decision history so the next session can
verify the verifiers.

### 4. `CHANGELOG.md` and `docs/summary_of_work.md`

Updated under separate edits (see corresponding entries in those files
and in the Session History of `summary_of_work.md`).

## Files explicitly NOT modified (and why)

| File | Reason |
|------|--------|
| `todo.md`, `TODO.md` (root, 394L each) | Both are **gitignored** per `.gitignore:11` (`todo.md` matches case-insensitively on macOS HFS+/APFS case-preserving filesystems). They are local-only cross-ref snapshots, content-identical (SHA `d8edf87bea842851f9b89b1ca7d3749e6a6e88ec`), and each already carries a `Status: HISTORICAL (2026-06-07)` banner. Deleting them is impossible without removing the gitignore pattern, and the canonical ledger in `summary_of_work.md` already supersedes them. **No action needed.** |
| `docs/TODO.md` (109L) | Tracked, HISTORICAL banner present (lines 1–6), references the canonical `summary_of_work.md` and `POST_VENICE_JINA_AUDIT_2026_06_06.md`. Serves as the user-facing public roadmap / historical-defects list. **Keep.** |
| `docs/HQE_AUDIT_REPORT.md` (152L) | **Gitignored** per `.gitignore:5`. All 3 findings (T8, T11, T14) are VERIFIED FIXED in source via commits referenced in `summary_of_work.md` and `POST_VENICE_JINA_AUDIT_2026_06_06.md`. The gitignore is intentional — the dev-only HQE is a scratch auditor that should never ship. **No action needed.** |
| `docs/AGENTS/AGENTS.md`, `docs/AGENTS/agent-reinitialization.md` | **Gitignored** per `.gitignore:4` (`docs/AGENTS/`). These are local-only agent scratch / reinit notes. `verify:markdown-links` is hardened against them via `VERIFY-034`. **No action needed.** |
| `docs/design/` (2 files) | **Gitignored** per `.gitignore:8`. Local-only design scratch. **No action needed.** |
| `docs/venice_llm_info.md` (484 KB) | Tracked, HISTORICAL banner present (line 2) pointing to `docs/Venice_swagger_api.yaml` as the canonical machine-readable reference. The 484 KB body is informational, not a duplicate of any current source file. **No action needed.** |
| `docs/AUDIT_FOLLOWUP_2026_06_05.md` (503L) | HISTORICAL banner present, all P0/P1/P2 items RESOLVED, references the same `summary_of_work.md` ledger we maintain. **No action needed.** |
| `docs/POST_VENICE_JINA_AUDIT_2026_06_06.md` (420L) | HISTORICAL banner present, BUG-SEED-001..009 documented, scope-correction section explains the MiniMax retirement, all VERIFY-030..032 documented. **No action needed.** |
| `docs/REPORTS/FINAL_MASSIVE_BUG_HUNT_WITH_PROOF.md` (372L) | Canonical final audit. Has clear banner. **No action needed.** |
| `AGENTS.md` (344L) | Stack pin (1.0.5 / Node 22.13+ / Electron 42 / React 19 / Vitest 4) is consistent with `package.json` (1.0.6 is the only delta, and 1.0.5 was the prior release on the date the file was last re-pinned). VERIFY table matches README. **No action needed.** |
| `CHANGELOG.md` (532L) | Keep-a-Changelog format. `[Unreleased]` already contains every Phase 2A–2J + 2I + 2F entry. No internal contradictions. **No action needed.** |
| `.gitignore` | Patterns at lines 4 (`docs/AGENTS/`), 5 (`docs/HQE_AUDIT_REPORT.md`), 8 (`docs/design/`), and 11 (`todo.md`) are all doing their job — every file they cover is either a local-only scratch document or a duplicate of a canonical entry. No additions or removals. |

## Validation performed

```
git status                                  # clean baseline
git ls-files | rg "\.md$" | wc -l           # 51 tracked .md files
git check-ignore -v todo.md TODO.md         # both matched by .gitignore:11
git check-ignore -v docs/HQE_AUDIT_REPORT.md # matched by .gitignore:5
git check-ignore -v docs/AGENTS/AGENTS.md docs/AGENTS/agent-reinitialization.md # matched by .gitignore:4
shasum todo.md TODO.md                       # d8edf87bea842851f9b89b1ca7d3749e6a6e88ec (identical)
grep '"version"' package.json | head -1      # "1.0.6"
```

After edits, before commit, the following will be re-run:

```
node scripts/verify-markdown-links.cjs       # confirm no broken link regressions
```

`npm run lint:eslint`, `npm run typecheck`, `npx vitest run`, and the
other `verify:*.cjs` audits are **not** re-run because the changes are
documentation-only and do not touch TypeScript, package, test, or CI
files.

## What is still allowed to grow

- `docs/summary_of_work.md` continues to be the canonical AI / dev-agent
  handoff ledger. New sessions append to *Session History* and update
  the *Open TODO Ledger* / *Validation Matrix* per the AGENTS.md
  mandatory handoff rule.
- `docs/REPORTS/` is open for new audit files (date-suffixed filenames
  are the convention) but every new file must carry a clear banner that
  declares its status: ACTIVE / HISTORICAL / SUPERSEDED.
- `CHANGELOG.md` `[Unreleased]` is the surface for user-facing changes.
  This pass adds an Unreleased bullet describing the documentation-only
  canonicalization.

## What is now disallowed

- A new audit file under `docs/REPORTS/` or `docs/` without a clear
  status banner.
- A root `todo.md` or `TODO.md` change (the file is gitignored and
  redundant; any new cross-ref audit work goes in
  `docs/summary_of_work.md` *Open TODO Ledger*).
- A `docs/AGENTS/AGENTS.md` commit (the file is gitignored local-only;
  the canonical agent guide is the root `AGENTS.md`).
- A `docs/HQE_AUDIT_REPORT.md` commit (gitignored dev-only).
- A change to the regression-guard count (52) anywhere — `README.md`,
  `CHANGELOG.md`, `AGENTS.md`, and `summary_of_work.md` all must stay
  in lock-step on this number.
