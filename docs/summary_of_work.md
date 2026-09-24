# Summary of Work

This is the active handoff and validation ledger. The canonical current-work ledger is `docs/ROADMAP.md`. The ledger as it stood before the 2026-09-23 compaction is `docs/reports/historical/summary-of-work-before-2026-09-23.md`.

## Current State (machine-readable; refresh per session — VF-AUD-20260916-P3-002)

```text
repository_head_sha: 6747b0ad (docs(hygiene): compact the roadmap and archive the session ledger)
application_code_sha: 6747b0ad
verified_against_sha: 6747b0ad
verified_at:         2026-09-23 (Pacific)
package_version:     3.1.0
node_engine:         >=22.15.0 <23.0.0
branch:              main
working_tree:        clean
ci_status:           success for 6747b0ad (run 35957327247 — 11/11 jobs)
codeql_status:       success for 6747b0ad (run 35957327282 — Analyze actions and Analyze javascript-typescript)
open_findings:       P2-016 headed human accessibility QA; P3-020 qualified native-language review; VF-VERIFY-005 external release evidence
external_acceptance_outstanding:
  - headed accessibility/visual QA with a human signature (P2-016)
  - qualified native-language review (P3-020)
  - funded live provider calls, signed/notarized installers, and two-device sync (VF-VERIFY-005)
```

## Latest Session Summary

- **2026-09-23 Roadmap compaction and remaining-risk closeout.**
  - **Scope:** Finish the risks left by the repository-management revalidation: the roadmap narrated closed tranches, the session ledger had grown to about 650 KB, and the IPC, media, and store boundary had only been spot-checked.
  - **Roadmap:** `docs/ROADMAP.md` now lists only unfinished external acceptance, plus accepted product deferrals that already have decision records. Closed 2026-09 narratives were removed from the live roadmap. Their evidence remains in the archived ledger.
  - **Ledger:** The previous full ledger was copied to `docs/reports/historical/summary-of-work-before-2026-09-23.md` and this file was replaced with the active handoff.
  - **IPC:** Every production `ipcMain.handle` registration goes through `registerPrivilegedIpcChannel`. `registerIpcChannel` has no production caller. `sync:setSyncFolder` accepts only the path already chosen by the main-process folder picker.
  - **Theme:** `--color-border-soft` and `--color-border-faint` already have a single `color-mix` definition in `src/styles/theme.css`. No second declaration remains.
  - **Left open on purpose:** human per-tab accessibility sign-off, qualified native-language review, and external release evidence (signing, notarization, funded provider calls, two-device sync). Those require a person, certificates, a paid account, or a second device.
  - **Publication:** committed and pushed as `6747b0ad`. Hosted CI run `35957327247` and CodeQL run `35957327282` both succeeded.

- **2026-09-23 Repository-management revalidation.** Hygiene delta from the prior turn in this worktree is still uncommitted: `/out/` ignore, removal of unreferenced `assets/ReadMe_Preview.png`, Records archive of `auditsep23.md` and the pet-rotation handoff, README CI wording, and the three reports under `docs/audits/Records/2026-09-23-repository-*.md`.

## Session History

### 2026-09-23 — Roadmap compaction and remaining-risk closeout

- Archived the previous session ledger and reduced `docs/ROADMAP.md` to current unfinished work.
- Recorded the IPC registrar check and the single border-token definitions.
- External acceptance items stay open. Details and commands are in the validation matrix below.

## Open TODO Ledger

* **REPO-MANAGEMENT-REAVALIDATION-2026-09-23** — Hygiene delta is in the worktree and uncommitted. Reports: `docs/audits/Records/2026-09-23-repository-audit.md`, `docs/audits/Records/2026-09-23-repository-hygiene-audit.md`, `docs/audits/Records/2026-09-23-repository-hygiene-final-report.md`.

* **ROADMAP-COMPACTION-2026-09-23** — Live roadmap and live ledger compacted. Prior ledger text is `docs/reports/historical/summary-of-work-before-2026-09-23.md`.

* **EXTERNAL-ACCEPTANCE** — `P2-016`, `P3-020`, and `VF-VERIFY-005` stay open. They are not local code defects. See `docs/ROADMAP.md`.

## Validation Matrix

### 2026-09-23 — Roadmap compaction and remaining-risk closeout

- Hosted CI run `35957327247` — PASS, 11/11 jobs, SHA `6747b0ad`.
- Hosted CodeQL run `35957327282` — PASS, Analyze actions and Analyze javascript-typescript, SHA `6747b0ad`.
- Local `HEAD` matches `origin/main` at `6747b0ad`.
- `npm ci`, `npm run lint:eslint`, `npm run typecheck`, `npm test`, `npm run build` — not run. This pass did not change application source.
- `npm run verify:markdown-links` — PASS (441 files).
- `npm run verify:repository-identity` — PASS.
- `npm run verify:roadmap-current` — PASS.
- `npm run verify:repo-handoff-hygiene` — PASS.
- `npm run verify:agent-docs` — PASS.

### 2026-09-23 — Repository-management revalidation

- `npm run verify:markdown-links` — PASS (440 files) before this compaction.
- `npm run verify:repository-identity` — PASS.
- `npm run verify:roadmap-current` — PASS.
- `npm run verify:repo-handoff-hygiene` — PASS.
- `npm run verify:image-policy` — PASS.
- `npm run verify:agent-docs` — PASS.
- `git check-ignore -v out/foo` — PASS.
