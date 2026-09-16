# Venice Forge — Post-August-24 Provider-Update Audit & Remediation Report

> **Historical snapshot.** Retained evidence only; the live repository, `docs/ROADMAP.md`, and `docs/summary_of_work.md` are authoritative.

> [!NOTE]  
> **IMMUTABLE HISTORICAL RECORD**  
> This report is a point-in-time snapshot of the repository state as of August 25, 2026 (commit `d13150ef...`). It is preserved for historical context and is not updated to track current `main`.

**Date:** 2026-08-25  
**Baseline commit:** `2c3bb7e1c9c53864f4758e25ff3ac84e60374593`  
**Snapshot Local HEAD:** `d13150efbd85afb9c9ad10708f6461e0f746633d`  
**Snapshot Remote `origin/main` HEAD:** `d13150efbd85afb9c9ad10708f6461e0f746633d`  
**Status:** Historical.

---

## 1. Repository State

- Branch: `main`
- Worktree: clean; all changes committed and pushed to `origin/main`.
- Local HEAD: `d13150efbd85afb9c9ad10708f6461e0f746633d`
- Remote `origin/main` HEAD: `d13150efbd85afb9c9ad10708f6461e0f746633d`
- Node: `v22.23.2`
- npm: `10.9.8`
- No secrets, raw payloads, signed URLs, or private paths were introduced.

---

## 2. Scope

Execute the post-August-24 provider-update audit handoff:

1. Reproduce and repair every confirmed locally actionable defect.
2. Revalidate every high-risk area touched by the latest update.
3. Search for sibling defects in surrounding code.
4. Run the full repository validation matrix.
5. Update current documentation to describe actual runtime behavior.
6. Leave no locally actionable P0/P1/P2 defect unresolved.
7. Distinguish fixed defects, externally blocked items, improvements, false positives, and deferred roadmap items.

---

## 3. Confirmed Findings and Disposition

| ID | Severity | Area | Finding | Status |
|---|---|---|---|---|
| P1-001 | P1 | Safety | Mandatory child-safety layer conflated with optional Family Safe Mode adult-image policy. | **FIXED** |
| P1-002 | P1 | Safety | `unsafe_image_generation` collapsed into child-safety UI category. | **FIXED** |
| P1-003 | P1 | Safety / UI | Prompt enhancer dropped safety provenance for generic HTTP 451 errors; UI ignored structured metadata. | **FIXED** |
| P1-004 | P1 | Provider | Replicate prediction creation used fragile `/v1/models/{encodedModel}/predictions` route. | **FIXED** |
| P1-005 | P1 | Security | Replicate output "SSRF guard" accepted essentially any HTTPS hostname. | **FIXED** |
| P1/P2-006 | P1/P2 | Security | Replicate downloads were unbounded. | **FIXED** |
| P2-007 | P2 | Reliability | Replicate network calls lacked explicit timeouts. | **FIXED** |
| P1/P2-008 | P1/P2 | Provider | Google Vertex "Express Mode" routed like standard Vertex requiring project/location. | **FIXED** |
| P2-009 | P2 | Provider | Hugging Face discovery used name blacklist instead of provider metadata. | **FIXED** |
| P2-010 | P2 | Concurrency | Hugging Face cache had concurrent temporary-file race. | **FIXED** |
| P1/P2-011 | P1/P2 | Security | IPC privilege boundary lacked central sender validation. | **FIXED** |
| P2-012 | P2 | Safety | Response safety screening sampled only first ~8 KB. | **FIXED** |
| P2-013 | P2 | UI | Character Creator bypassed typed safety UI contract with manual policy interpretation. | **FIXED** |
| P2-014 | P2 | Docs | Safety roadmap partially stale (described typed `SafetyDecision` as still needed). | **FIXED** |
| P2-015 | P2 | Release | Provider integrations locally implemented but not live-accepted. | **EXTERNALLY BLOCKED** |
| P2-016 | P2 | Provider | AWS Bedrock region validation syntactic, not capability-aware. | **IMPROVEMENT / NOT LOCALLY ACTIONABLE** — no authoritative supported-region source changed in this session. |
| P2/P3-017 | P2/P3 | Provider | Replicate had two divergent prediction implementations. | **FIXED** — duplicate generic adapter removed. |
| P3-018 | P3 | Provider | Replicate connection-test comment and implementation drift. | **FIXED** |
| P3-019 | P3 | Provider | Stale hard-coded Replicate `User-Agent: VeniceForge/1.0`. | **FIXED** |
| P2/P3-020 | P2/P3 | CI | Coverage threshold brittle at 68% but tests added in prior repair. | **IMPROVEMENT** — thresholds not lowered; coverage now 68.11% functions. |
| P2-021 | P2 | Governance | Branch ruleset does not require CI/CodeQL status checks. | **NOT LOCALLY ACTIONABLE** — repository settings change requires explicit authority. |
| P3-022 | P3 | CI | CodeQL can be disabled through repository variable. | **ACCEPTED RISK** — emergency bypass retained per authority; not removed. |
| P3-023 | P3 | CI | CodeQL uses `ubuntu-latest`. | **IMPROVEMENT / NOT LOCALLY ACTIONABLE** — runner pinning is repository workflow change. |
| P3-024 | P3 | Git | Recent commits unsigned and one titled `update`. | **IMPROVEMENT / NOT LOCALLY ACTIONABLE** — do not rewrite published history. |

---

## 4. False Positives

None identified. Every handoff item either corresponded to a real implementation gap or was correctly classified as externally blocked/improvement.

---

## 5. Fixes Implemented

### Safety-layer architecture

- `src/shared/safety/childExploitationGuard.ts` now contains **only** mandatory child-protection rules.
- `src/shared/safety/localFamilyGuardRules.ts` contains the optional PG-13 adult-image policy and runs only when Family Safe Mode is enabled.
- `src/shared/safety/localFamilySafeGuard.ts` emits typed `SafetyLayer` and `SafetyCategory`; every block carries `layer`, `category`, `reasonCode`, user-safe explanation, and developer-safe explanation.
- `unsafe_image_generation` now maps to `adult-content-blocked` / `optional-family-policy`, not child-safety.
- `screenResponseBody()` replaced the 8 KB head sample with bounded head+middle+tail windows.

### Safety provenance propagation

- Added `src/shared/safety/formatSafetyDecision.ts` with serializable `SafetyBlockResult`.
- `src/services/prompt-enhancer-service.ts` preserves `safetyLayer`/`safetyCategory`/`safetyReasonCode` for all block paths, including generic HTTP 451.
- `src/components/image/image-view.tsx` shows layer-aware toasts.
- `src/components/character-creator/CharacterCreatorView.tsx` uses the shared formatter instead of manual policy interpretation.
- i18n catalogs updated with `safetyDecision` namespace and `imageStudioRuntime.enhancementSafetyBlocked*` keys.

### Replicate hardening

- `electron/services/replicateService.ts`:
  - Routes `POST /v1/models/{owner}/{name}/predictions` (version in JSON body).
  - `validateReplicateOutputUrl()` enforces HTTPS, exact `replicate.delivery` allowlist, no credentials, no unexpected ports, and rejects loopback/private/link-local destinations.
  - `downloadReplicateOutput()` uses manual redirect handling (max 5 hops), 50 MB content-length ceiling, streaming byte limit, allowed MIME types, and media-signature verification.
  - `replicateFetch()` and `downloadReplicateOutput()` use `AbortController` timeouts; pre-acceptance timeout throws `[acceptance-unknown]` to prevent blind retries.
  - `User-Agent` generated from `app.getVersion()`.
  - `testReplicateConnection()` semantics corrected.
- Removed duplicate Replicate adapter from `electron/services/providerAdapters.ts`.

### Google Vertex Express Mode

- `electron/services/providerAdapters.ts` and `src/types/provider.ts` now implement **true** Express Mode: `authMode: "express"` + `apiKey` only.
- Routes to `aiplatform.googleapis.com/v1/publishers/google/models/{model}:generateContent/streamGenerateContent?key={API_KEY}`.
- `authMode: "full"` is typed but rejected until implemented.
- `electron/ipc/handlers/apiKeyHandlers.ts` connection test uses the Express endpoint.

### Hugging Face discovery

- `electron/services/huggingfaceDiscovery.ts`:
  - Uses `/v1/models` metadata (input/output modalities, provider status, context length, etc.) for positive capability detection.
  - Keeps a conservative fallback blacklist only when metadata is absent.
  - Writes cache with unique random `.tmp` names + atomic rename.
  - Validates `profileId` via `assertValidProfileStorageId`.

### IPC sender validation

- `electron/utils/validateIpcSender.ts` central primitive added/confirmed:
  - Prefers `event.senderFrame.url`.
  - Dev: trusts only `http://localhost:5173`.
  - Production: trusts only `file://` inside renderer root.
  - Rejects loopback/link-local/RFC1918/`file://localhost`.
- `electron/ipc/handlers/common.ts` provides `registerPrivilegedIpcChannel()` used by all privileged handlers.
- `electron/ipc/handlers/common.security.test.ts` adds 12 adversarial end-to-end tests.
- `electron/ipc/updates.test.ts` updated for trusted production sender frames.

### Verifier/test fixes discovered during validation

- `server.test.ts`: updated two assertions to match new mandatory child-safety wording.
- `scripts/verify-backup-sync.cjs`: updated to recognize sync handlers registered via `registerPrivilegedIpcChannel`.
- `src/components/character-creator/CharacterCreatorView.test.tsx`: updated stale mock message text.

---

## 6. Security Impact

- Mandatory child protection remains enforced and is now separated from optional adult filtering.
- Adult-only content with Family Safe Mode OFF is no longer mislabeled as child exploitation.
- Replicate cannot fetch arbitrary HTTPS hosts; output URLs are allowlisted and redirects are validated per-hop.
- Replicate downloads are bounded by size, MIME type, and media signature.
- Privileged IPC handlers reject untrusted renderer frames before handler logic runs.
- Secrets, credentials, and provider keys remain main-process-only.
- Existing Electron sandbox, context isolation, disabled `nodeIntegration`, and restricted navigation are preserved.

---

## 7. Provider-Contract Changes

| Provider | Change |
|---|---|
| Replicate | Authoritative route is `POST /v1/models/{owner}/{name}/predictions`; versioned models send `version` in body; generic adapter removed. |
| Google Vertex | True Express Mode (`apiKey` only) at `aiplatform.googleapis.com/v1/publishers/google/models/{model}:generateContent/streamGenerateContent?key=...`; full mode rejected. |
| Hugging Face | Capability-driven discovery; metadata-based acceptance; race-free atomic cache writes. |
| Cohere / Azure OpenAI / AWS Bedrock | No contract changes in this session; locally implemented, live acceptance blocked. |

---

## 8. Safety-Layer Changes

- New `SafetyLayer` type: `mandatory-child-safety`, `optional-family-policy`, `provider-policy`, `request-validation`.
- New `SafetyCategory` values including `minor-sexualization`, `csam`, `grooming`, `age-evasion`, `adult-explicit-image`, `graphic-gore`, `provider-restriction`, `validation-error`.
- `localFamilySafeGuard.ts` requires `layer` on every block decision.
- Response screening uses bounded head+middle+tail windows.
- UI surfaces layer-aware messages via `formatSafetyDecision()`.

---

## 9. Regression Tests Added or Updated

### Safety

- `tests/safety/adult-content-boundary.test.ts` — adult image with family OFF/ON, mandatory minor block with family OFF/ON, age-evasion.
- `tests/safety/guardPipeline.test.ts` — long-response prohibited content after byte 8000.
- `tests/safety/prompt-enhancer-guard-regression.test.ts` — typed provenance for generic 451.
- `src/shared/safety/childExploitationGuard.test.ts`, `localFamilySafeGuard.test.ts` — layer/category semantics.

### UI provenance

- `src/services/prompt-enhancer-service.test.ts` — layer/category/reasonCode preservation.
- `src/components/image/image-view.test.tsx` — layer-aware toasts.
- `src/components/character-creator/CharacterCreatorView.test.tsx` — shared formatter, serializable block result.

### Replicate

- `electron/services/replicateService.test.ts` — exact documented path, owner/name, versioned model, async state, polling, failure, cancellation, timeout, SSRF, redirect, oversized output, invalid media.
- `electron/services/backgroundTaskManager.replicate.test.ts` — stress tested 30 iterations.

### Google Vertex

- `electron/services/providerAdapters.test.ts` — true Express Mode URL, no project/location, streaming/non-stream routes, full-mode rejection.
- `scripts/verify-provider-adapters.test.ts` — Vertex express fixtures.

### Hugging Face

- `electron/services/huggingfaceDiscovery.test.ts` — text/chat acceptance, image/audio/embedding rejection, unavailable provider, stale/corrupt cache, concurrent refresh, failed live refresh with stale fallback.

### IPC

- `electron/utils/validateIpcSender.test.ts` — primitive validation (dev origin, production path containment, loopback rejection).
- `electron/ipc/handlers/common.security.test.ts` — 12 adversarial end-to-end privileged-handler rejection tests.

### Verifiers

- `scripts/verify-backup-sync.cjs` — updated sync-handler registration pattern.

---

## 10. Validation Commands Executed

| Command | Result |
|---|---|
| `npm ci` | PASS — 858 packages, 0 vulnerabilities |
| `npm run lint:eslint` | PASS — 0 warnings |
| `npm run typecheck` | PASS — renderer + Electron |
| `npm run test:ci` | PASS — 23 files, 267 tests |
| `npm run test:coverage` | PASS — 477 files, 5324 tests; thresholds met |
| `npm run verify:safety-guard` | PASS |
| `npm run verify:provider-adapters` | PASS — 57 tests |
| `npm run verify:network-boundaries` | PASS |
| `npm run verify:storage-privacy` | PASS |
| `npm run verify:storage-policy` | PASS |
| `npm run verify:custom-protocol-privileges` | PASS |
| `npm run verify:image-policy` | PASS |
| `npm run verify:venice-api-docs` | PASS |
| `npm run verify:venice-contract-drift` | PASS |
| `npm run verify:roadmap-current` | PASS |
| `npm run verify:ci-contract` | PASS |
| `npm run verify:contracts` | PASS — static + feature + release (104 release checks) |
| `npm run build` | PASS |
| `npm run verify:dist` | PASS |
| Replicate stress (30 iterations) | PASS — 30/30 |

Coverage thresholds:
- Statements: 71.37% (threshold 70%)
- Branches: 62.19% (threshold 59%)
- Functions: 68.11% (threshold 68%)
- Lines: 74.21% (threshold 73%)

---

## 11. Current CI / CodeQL Status

- Local validation matrix: **all green**.
- Hosted GitHub CI: **green** — run `32840049748` on commit `d13150ef` (all jobs passed after re-running the `electron-smoke-linux` job, which initially failed due to a transient AppImage `ECONNRESET` network flake).
- Hosted CodeQL: **green** — run `32840049687` on commit `d13150ef`.
- No CI/CodeQL status checks are required by the active ruleset (`Rules01`) — this is a recorded governance risk, not changed in this session.

---

## 12. External Acceptance Still Blocked

Per `docs/ROADMAP.md` and `docs/reports/historical/DEFERRED_WORK_DECISION_RECORD.md`:

- Signed macOS artifact + Apple notarization.
- Signed Windows artifact.
- Clean macOS/Windows installation and upgrade migration.
- Paid-provider live acceptance:
  - Cohere, Hugging Face, Azure OpenAI, AWS Bedrock, Google Vertex, Replicate.
  - Image/audio/video generation, Replicate queued restart recovery.
- Multi-device sync convergence, migration, conflict handling.
- Accessibility: screen reader, keyboard-only, high zoom, reduced motion, theme contrast, audio feedback.

These require credentials, signing identities, physical devices, and paid accounts not available in this session. They are **not marked complete**.

---

## 13. Remaining Items

No locally actionable P0/P1 items remain. The following items are intentionally deferred or require external resources:

| ID | Severity | Path | Status | Blocker | Next Action |
|---|---|---|---|---|---|
| EXT-001 | P2 | Provider adapters | EXTERNALLY BLOCKED | No live credentials | Provision credentials and run live matrix from handoff §17. |
| EXT-002 | P2 | Release packaging | EXTERNALLY BLOCKED | No signing identities | Obtain Apple Developer ID + Windows cert; run signed build QA. |
| EXT-003 | P2 | Multi-device sync | EXTERNALLY BLOCKED | Second device + network | Run two-device convergence and conflict tests. |
| EXT-004 | P2 | Accessibility | EXTERNALLY BLOCKED | Screen-reader setup | Run screen reader, keyboard-only, zoom, motion, contrast tests. |
| P3-021 | P3 | `.github/workflows/codeql.yml` | ACCEPTED RISK | Emergency bypass retained | Document purpose and restrict variable access; do not remove without authority. |
| P3-023 | P3 | `.github/workflows/codeql.yml` | NOT LOCALLY ACTIONABLE | Runner image policy | Pin Ubuntu generation when authorized. |
| P2-021 | P2 | GitHub ruleset | NOT LOCALLY ACTIONABLE | Repository settings authority | Add required CI/CodeQL status checks when authorized. |

---

## 14. Documentation Updated

- `docs/ROADMAP.md` — adult-content boundary marked closed; Google Vertex Express Mode described accurately (API-key only).
- `docs/summary_of_work.md` — Latest Session Summary, Session History entry, Open TODO Ledger, and Validation Matrix updated.
- `SECURITY.md` — mandatory-vs-optional safety layers, bounded response-body windows, and IPC sender-validation rules documented.
- `docs/security/security-model.md` — IPC sender validation summarized.
- `docs/DOCS_INDEX.md` — this report registered under Historical Reports.
- This report: `docs/reports/historical/VENICE_FORGE_POST_AUGUST_24_AUDIT_REPORT.md`.

Historical records (`docs/reports/historical/DEFERRED_WORK_DECISION_RECORD.md`, `docs/audits/`) were not edited to change past conclusions.

---

## 15. Files Changed

Key changed/added files (full `git status` available separately):

### Added

- `electron/utils/validateIpcSender.ts`
- `electron/utils/validateIpcSender.test.ts`
- `electron/ipc/handlers/common.security.test.ts`
- `src/shared/safety/formatSafetyDecision.ts`

### Modified — Safety

- `src/shared/safety/childExploitationGuard.ts`
- `src/shared/safety/childExploitationGuard.test.ts`
- `src/shared/safety/localFamilyGuardRules.ts`
- `src/shared/safety/localFamilySafeGuard.ts`
- `src/shared/safety/localFamilySafeGuard.test.ts`
- `src/shared/safety/index.ts`
- `tests/safety/adult-content-boundary.test.ts`
- `tests/safety/guardPipeline.test.ts`
- `tests/safety/prompt-enhancer-guard-regression.test.ts`

### Modified — UI / Provenance

- `src/services/prompt-enhancer-service.ts`
- `src/services/prompt-enhancer-service.test.ts`
- `src/components/image/image-view.tsx`
- `src/components/image/image-view.test.tsx`
- `src/components/character-creator/CharacterCreatorView.tsx`
- `src/components/character-creator/CharacterCreatorView.test.tsx`
- `src/i18n/resources/en-US/common.json`
- `src/i18n/resources/en-US/media.json`
- All non-English i18n catalogs (synced `__MISSING__:` placeholders)

### Modified — Provider Contracts

- `electron/services/replicateService.ts`
- `electron/services/replicateService.test.ts`
- `electron/services/providerAdapters.ts`
- `electron/services/providerAdapters.test.ts`
- `electron/services/huggingfaceDiscovery.ts`
- `electron/services/huggingfaceDiscovery.test.ts`
- `electron/ipc/handlers/apiKeyHandlers.ts`
- `electron/ipc/validation.ts`
- `src/types/provider.ts`
- `scripts/verify-provider-adapters.test.ts`

### Modified — IPC

- `electron/ipc/handlers/common.ts`
- `electron/ipc/handlers/*.ts` (already privileged; no functional change)
- `electron/ipc/updates.test.ts`

### Modified — Verifiers / Tests

- `server.test.ts`
- `scripts/verify-backup-sync.cjs`
- `src/services/veniceClient.test.ts`
- `src/services/veniceClient.web.test.ts`
- `src/services/veniceClient.edge.test.ts`

### Modified — Documentation

- `docs/ROADMAP.md`
- `docs/summary_of_work.md`
- `SECURITY.md`
- `docs/security/security-model.md`
- `docs/DOCS_INDEX.md`

---

## 16. Git Status

```text
nothing to commit, working tree clean
```

All remediation changes are committed in `d13150ef` and pushed to `origin/main`.

---

## 17. Conclusion

All locally actionable P0 and P1 findings from the post-August-24 provider-update audit have been remediated. The full repository validation matrix passes, hosted GitHub CI and CodeQL are green, and the changes are committed and pushed to `origin/main` at `d13150ef`. Safety decisions now correctly identify their owning layer, Replicate cannot fetch arbitrary hosts and uses a documented prediction contract, Google Vertex Express Mode uses the documented express contract, privileged IPC rejects untrusted senders, Hugging Face discovery uses capabilities rather than filename heuristics, and current documentation describes current behavior. External live-provider and release acceptance remain honestly reported as blocked, not complete.
