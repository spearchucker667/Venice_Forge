# Venice Forge Roadmap

This is the canonical ledger for current unfinished work only. Closed execution history and validation evidence belong in `docs/summary_of_work.md`; retained scan reports are audit input, not current status authority.

## Current State (machine-readable; refresh per session — VF-AUD-20260916-P3-002)

```text
repository_head_sha: 8ee5ddd2a14691739d5bfda7c3759a06ce352b66
application_code_sha: 8ee5ddd2a14691739d5bfda7c3759a06ce352b66
verified_against_sha: 8ee5ddd2a14691739d5bfda7c3759a06ce352b66
verified_at:         2026-09-25 (Pacific)
package_version:     3.1.0
node_engine:         >=22.15.0 <23.0.0
npm_engine:          >=10.0.0
branch:              main
working_tree:        uncommitted theme-system audit remediation (Waves 1 & 2); pre-existing user-owned audit files
ci_status:           baseline 86b55805 success (run 36204271635 — 11/11 jobs); current edits not hosted
codeql_status:       baseline 86b55805 success (run 36204271633 — 2/2 jobs); current edits not hosted
open_findings:       2026-09-24 audit safety-contract conflict; FRAT-REAUD-006 live provider acceptance; FRAT-REAUD-007 native-language review; P2-016 headed human accessibility QA; VF-VERIFY-005 external release evidence
external_acceptance_outstanding:
  - headed accessibility/visual QA with a human signature (P2-016)
  - qualified native-language review (P3-020). First-pass translations require human review before locales are production-complete.
  - funded live provider calls, signed/notarized installers, and two-device sync (VF-VERIFY-005)
```

## Current Work

`THEME-OVERLAY-2026-09-25` — User reports theme formatting and unwanted border/mesh overlays. Awaiting affected theme names and screens or an overlay screenshot. The supplied Diagnostics screenshot shows its intentional selected-section outline; shared mesh gradients are translucent. Reproduce before changing shared styling. Status: blocked by missing evidence.

`FRAT-REAUD-006` — Run the four documented Fraterna endpoints with a dedicated, consorzio-enrolled test key when a funded account is available. Record only endpoint, timestamp, status, content type, effective route, safe request ID, and high-level result. The local re-audit remediation for FRAT-REAUD-001 through FRAT-REAUD-005 is uncommitted; exact-SHA hosted CI and CodeQL remain pending authorized publication.

`FRAT-REAUD-007` — Review new route and Inspector copy in every non-English catalog with a qualified native-language reviewer. Keep `isProductionComplete: false` until `docs/i18n/native-review-status.json` records reviewer and date. This is part of the existing `P3-020` review workflow.

The 2026-09-24 audit handoff's child-safety requirement conflicts with current `SECURITY.md`, `server.test.ts`, and `tests/safety/guardPipeline.test.ts`: Adult Mode currently skips the local child-safety guard. Establish the intended policy before changing enforcement across Electron, web proxy, bridge, response screening, tests, and documentation. This is a contract conflict under investigation, not a proven bypass of the current documented behavior.

The six findings in the 2026-09-24 point-in-time [application/repository audit](audits/Records/2026-09-24-application-repository-audit-handoff.md) have local remediations committed on main. Their implementation and validation evidence belong in `docs/summary_of_work.md`; the audit remains a record of the original defects. First-pass locale strings now pass strict structural verification, while qualified linguistic review remains open below.

The following three external acceptance items cannot be closed from this tree. Each needs a person, certificate, second device, or paid provider account. Local code and hosted CI do not substitute for that evidence.

`VF-20260922-P2-011` / `P2-016` — Headed visual and accessibility QA. The checklist, schema, and verifier are `docs/design/per-tab-acceptance/README.md`, `docs/design/per-tab-acceptance/CHECKLIST.md`, and `npm run verify:per-tab-acceptance`. Closure needs a human signature. Automated capture does not satisfy the verifier.

`VF-20260922-P2-009` / `P3-020` / `VF-I18N-NATIVE-REVIEW-001` — Qualified native-language review. `docs/i18n/native-review-status.json` keeps every non-English locale at `first-pass-machine` with a null reviewer. Structural coverage is not linguistic approval. Locales stay `isProductionComplete: false` until that file records a reviewer and a review date. Review pack: `docs/i18n/review-pack/README.md`.

`VF-EXTERNAL-RELEASE-ACCEPTANCE` / `VF-VERIFY-005` — External release evidence. Still required: signed and notarized macOS artifacts, signed Windows artifacts, an authorized funded-provider check of Responses, x402, and Crypto RPC, and a two-device sync recovery. The decision record is `docs/reports/historical/DEFERRED_WORK_DECISION_RECORD.md`. Hosted CI and CodeQL are already green for published `c4134390`.

## Accepted Deferrals

These are product decisions, not open defects. Implementation stays off the current list until a new work order selects a backend, a provider, or a surface.

- Vertex full OAuth stays off. The public config is express API-key only. The design is `docs/superpowers/specs/2026-08-24-deferred-provider-integration-design.md`.
- Semantic media classification stays structural. No ML backend is registered. The decision is `docs/audits/Records/semantic-media-classifier-decision-2026-09-01.md`.
- Video enhancement and upscale fields stay off the default queue until a live Topaz-style model surface is approved.
- Attachment extraction still uses the existing per-file caps. Admission is already model-aware. Chunked extraction needs its own work order.
- Design-primitive rollout past the migrated chat, media, prompt, scene, and workflow surfaces is incremental product work, not a release blocker.
- Future commits should keep meaningful subjects. Signing tags is a release-engineer choice, not a source change.

## Verified This Session

- IPC invoke handlers register through `registerPrivilegedIpcChannel` in `electron/ipc/handlers/common.ts`. `registerIpcChannel` has no production caller. `sync:setSyncFolder` rejects any path other than the folder already approved by the main-process picker (`electron/ipc/handlers/syncHandlers.ts`).
- `--color-border-soft` and `--color-border-faint` each have one definition, derived with `color-mix` from the theme border (`src/styles/theme.css`).
- The session ledger before this compaction is `docs/reports/historical/summary-of-work-before-2026-09-23.md`.

## Audit Input

Retained scan evidence, not status authority: `docs/audits/Records/Venice_Forge-audit-evidence-20260717-031029/EVIDENCE_MANIFEST.md`.

Closed audit orders from 2026-09-12 through 2026-09-22 stay in `docs/summary_of_work.md` and in that archived ledger. Findings `VF-SCAN-20260717-031029-010` through `012` are accepted documentation guidance with no runtime change.
