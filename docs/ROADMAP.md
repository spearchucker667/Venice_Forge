# Venice Forge Roadmap

This is the canonical ledger for current unfinished work only. Closed execution history and validation evidence belong in `docs/summary_of_work.md`; retained scan reports are audit input, not current status authority.

## Current State (machine-readable; refresh per session — VF-AUD-20260916-P3-002)

```text
repository_head_sha: 6747b0ad (docs(hygiene): compact the roadmap and archive the session ledger)
application_code_sha: 6747b0ad
verified_against_sha: 6747b0ad
verified_at:         2026-09-23 (Pacific)
package_version:     3.1.0
node_engine:         >=22.15.0 <23.0.0
npm_engine:          >=10.0.0
branch:              main
working_tree:        clean
ci_status:           success for 6747b0ad (run 35957327247 — 11/11 jobs)
codeql_status:       success for 6747b0ad (run 35957327282 — Analyze actions and Analyze javascript-typescript)
open_findings:       P2-016 headed human accessibility QA; P3-020 qualified native-language review; VF-VERIFY-005 external release evidence
external_acceptance_outstanding:
  - headed accessibility/visual QA with a human signature (P2-016)
  - qualified native-language review (P3-020). Settings catalogs still carry __MISSING__ markers. Do not mark locales production-complete.
  - funded live provider calls, signed/notarized installers, and two-device sync (VF-VERIFY-005)
```

## Current Work

These three items cannot be closed from this tree. Each one needs a person, a certificate, a second device, or a paid provider account. Local code and hosted CI on `c4134390` do not substitute for that evidence.

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
