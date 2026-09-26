# Summary of Work

This is the active handoff and validation ledger. The canonical current-work ledger is `docs/ROADMAP.md`. The ledger as it stood before the 2026-09-23 compaction is `docs/reports/historical/summary-of-work-before-2026-09-23.md`.

## Current State (machine-readable; refresh per session — VF-AUD-20260916-P3-002)

```text
repository_head_sha: 86b5580503e9b36746bac7a1b63d9602e49baea1
application_code_sha: 86b5580503e9b36746bac7a1b63d9602e49baea1
verified_against_sha: 86b5580503e9b36746bac7a1b63d9602e49baea1
verified_at:         2026-09-25 (Pacific)
package_version:     3.1.0
node_engine:         >=22.15.0 <23.0.0
branch:              main
working_tree:        uncommitted FRAT-REAUD-001 through FRAT-REAUD-005 remediation; no publication
ci_status:           baseline 86b55805 success (run 36204271635 — 11/11 jobs); current edits not hosted
codeql_status:       baseline 86b55805 success (run 36204271633 — 2/2 jobs); current edits not hosted
open_findings:       FRAT-REAUD-006 (live provider acceptance); FRAT-REAUD-007 (native-language review); P2-016 headed human accessibility QA; VF-VERIFY-005 external release evidence
external_acceptance_outstanding:
  - headed accessibility/visual QA with a human signature (P2-016)
  - qualified native-language review (P3-020)
  - funded live provider calls, signed/notarized installers, and two-device sync (VF-VERIFY-005, FRAT-AUD-010)
```

## Latest Session Summary

- **2026-09-25 Fraterna routing re-audit remediation (uncommitted).** Baseline `main` was `86b5580503e9b36746bac7a1b63d9602e49baea1` with a clean worktree. Current edits address FRAT-REAUD-001 through FRAT-REAUD-005: schema-aware provider image safety (`safe_mode` on native image routes; `moderation` on `/images/generations`), one bounded `Retry-After` retry followed by configured fallback on retryable failure, route-neutral shared errors, server-authoritative web route hydration before React mounts, and this ledger correction. Local Family Safe Mode remains separate. No commit or push is authorized in this session; hosted CI/CodeQL run IDs below cover the baseline SHA only.
- **External acceptance remains open.** FRAT-REAUD-006 needs a funded, consorzio-enrolled Fraterna key and safe live smoke evidence. FRAT-REAUD-007 needs qualified native-language review of non-English route/Inspector copy. These are tracked in `docs/ROADMAP.md`.

## Session History

### 2026-09-25 — Fraterna routing re-audit remediation

- Reproduced FRAT-REAUD-001 with failing shared safety tests and FRAT-REAUD-002 with a Fraterna 429/retry/fallback transport test. Shared, Electron guard, and web request paths now map provider preference to `moderation: "auto" | "low"` for `/images/generations`; native image routes retain `safe_mode`. Retryable responses after one same-provider `Retry-After` retry continue to configured fallback providers, while a 401 remains terminal and streamed output cannot fall back.
- Reproduced FRAT-REAUD-003 with failing renderer error tests; shared 500/503 and unknown-body errors now use route-neutral wording. Reproduced FRAT-REAUD-004 with failing server and bridge tests; the web server exposes a read-only route value and the bridge hydrates it before React mounts. Status, SafeDiagnostics, and model cache identity already consume the same store field. Web route writes are rejected.
- Reconciled current ledger state and marked the erroneous initial Fraterna implementation narrative below as historical. The exact baseline `86b55805` had CI run `36204271635` (11/11 success) and CodeQL run `36204271633` (2/2 success), verified through GitHub; these runs do not cover the current uncommitted edits. Live provider smoke and native linguistic review remain open.

### 2026-09-25 — Fraterna primary API routing post-implementation audit remediation

Executed remediation of findings FRAT-AUD-001 through FRAT-AUD-009 from the 2026-09-25 post-implementation audit handoff:

1. **FRAT-AUD-001 (P1): `/images/generations` cross-layer routing reachability.**
   - Added `/images/generations` to `ALLOWED_VENICE_ENDPOINTS` and `VENICE_ENDPOINT_METHODS` (`POST`) in `src/shared/validation.ts`.
   - Updated `server.ts` to allow `/images/generations` through Express proxy routes and FSM media screening.
   - Added validation and safety pipeline regression tests in `tests/safety/guardPipeline.test.ts`.

2. **FRAT-AUD-002 (P1): Route-aware connection failure classification.**
   - Updated `classifyConnectivityFailure` in `electron/ipc/handlers/apiKeyHandlers.ts` to receive `activeRoute`.
   - Distinct classification for Fraterna: 401/403 responses indicate Fraterna consorzio membership/route configuration requirements rather than telling users their Venice API key is invalid. Network failures distinguish whether Fraterna or Venice direct was unreachable.
   - Added 10 regression tests in `electron/ipc/handlers/apiKeyHandlers.routeConnectivity.test.ts`.

3. **FRAT-AUD-003 & FRAT-AUD-004 (P2): Upstream observability & route-aware transport errors.**
   - Added `selectedPrimaryRoute`, `effectiveUpstream`, and `routingReason` to `VeniceIpcResponse`, `performSingleVeniceRequest` in `electron/services/veniceClient.ts`, and `resolvePrimaryApiRouteForRequest` in `electron/services/providerAdapters.ts`.
   - Threaded headers `x-venice-forge-primary-route`, `x-venice-forge-effective-upstream`, and `x-venice-forge-routing-reason` through `server.ts` proxy responses; registered in `DIAG_HEADER_NAMES` (`src/constants/venice.ts`).
   - Extended `VeniceApiError` in `src/services/veniceClient/errors.ts` and Inspector telemetry contracts (`src/shared/inspectorTelemetryContracts.ts`, `src/services/inspectorTelemetry.ts`, `src/stores/inspector-store.ts`).
   - Added localized UI inspector rows for `Primary Route`, `Effective Upstream`, and `Routing Reason` in `src/components/layout/inspector-pane.tsx`.
   - Updated shared transport/streaming errors to dynamically cite the effective upstream name (`Fraterna` vs `Venice`).

4. **FRAT-AUD-005 & FRAT-AUD-007 (P2): Route panel UI mutation hardening & docs link.**
   - Hardened `src/components/settings/PrimaryApiRoutePanel.tsx` with async `isSaving` state disabling `<select>` during update, `try/catch` wrapping `desktopProviderSettings.update()`, localized `role="alert"` error on `{ ok: false }` or rejected IPC, and authoritative rehydration via `desktopProviderSettings.get()`.
   - Added external link to `https://fraterna.ai/docs` with `target="_blank"` and `rel="noopener noreferrer"`.
   - Exported `FRATERNA_DOCS_URL` from `src/shared/primaryApiRoute.ts`.

5. **FRAT-AUD-006 (P2): Focused component regression test suite.**
   - Created `src/components/settings/PrimaryApiRoutePanel.test.tsx` testing: Venice default, Fraterna selection, success, `{ ok: false }`, rejected IPC, disabled pending state, external docs link, and web-mode notice (8/8 tests pass).

6. **FRAT-AUD-009 (P2 risk): Centralized model-catalog runtime store reset.**
   - Verified that per-hook `useEffect` in `useModels` caused redundant and potentially conflicting store resets across concurrent consumers.
   - Removed `lastRouteRef` and `useEffect` from `src/hooks/use-models.ts`. Centralized reset in `src/stores/settings-store.ts` via `useSettingsStore.subscribe` on `primaryApiRoute` change.
   - Added concurrent consumer test in `src/hooks/use-models.test.tsx` verifying exact single reset across concurrent `text` and `image` consumers without race conditions (8/8 tests pass).

7. **FRAT-AUD-008 (P2): Reconciled documentation and source comments.**
   - Corrected capability matrix in `docs/DEVELOPMENT/FRATERNA_ROUTING.md`, `docs/security/security-model.md`, and `src/hooks/use-models.ts` comments (clarified `/models` is supported by Fraterna, embeddings is Venice-only, UI location is in `VeniceApiKeysPanel.tsx`, and privacy posture reflects no Venice Forge analytics while accurately documenting Fraterna's server-side request metadata).

- **Validation:**
  - `npm run lint:eslint`: PASS (0 errors, 0 warnings).
  - `npm run typecheck`: PASS (0 errors across app, electron, electron.test).
  - `npm run test:server`: PASS (101/101 tests passed).
  - `npm run test:electron`: PASS (113/113 test files, 1,292/1,292 tests passed).
  - `npm run verify:contracts`: PASS (104/104 checks passed).
  - `npm run verify:agent-docs`: PASS.
  - `npm run verify:markdown-links`: PASS (446 Markdown files checked).
  - `npm run verify:i18n` & `npm run verify:i18n-hardcoded-regressions`: PASS (0 regressions).
  - `npm run build`: PASS (web, server, and electron bundles).
  - No commit, push, or release performed.

### 2026-09-25 — Copilot instruction refresh

- Added the primary API routing contract to `.github/copilot-instructions.md` after checking the canonical route resolver and the routing reference. The concise guidance preserves the canonical default, endpoint subset, transparent Venice fallback, configuration split, and mandatory centralized transport/validation path.
- Documentation-only change. No application code, tests, dependency metadata, or pre-existing user edits were modified.

### 2026-09-25 — Post-publish code-review pass: doc/i18n drift corrections

A second two-axis `mattpocock-skills:code-review` pass against the
published commits (fixed-point `0a1bfdf4`) surfaced drift between the
corrected FRATERNA implementation and three documentation surfaces
that the prior spec-axis pass missed. Real bugs fixed:

- `docs/security/security-model.md` — hostname drift (`api.fraterna.ai`
  → `fraterna.ai`); the earlier hostname sweep missed this file.
- `docs/DEVELOPMENT/FRATERNA_ROUTING.md` — capability-matrix table was
  the pre-correction matrix (image edit/upscale/multi-edit/embeddings
  marked Fraterna-supported, `/models` marked Venice-only); replaced
  with the §4.1 set.
- `src/shared/primaryApiRoute.ts` — `PRIMARY_API_ROUTE_DESCRIPTIONS`
  was carrying the old matrix AND the disallowed "no separate
  credential or privacy posture" claim; rewritten with the §4.1 set
  and the honest third-party-service wording per §3.2.
- `src/i18n/resources/en-US/settings.json` + 11 non-English catalogs
  — capability-matrix and privacy-overstatement propagated to all
  locales as `__MISSING__:` placeholders so the source-language
  catalog stays `isProductionComplete: false`.
- `src/hooks/use-models.ts` — added the missing Spec §10 runtime-store
  reset so the previous host's `status` / `totalCount` /
  `liveModelIds` do not surface as authoritative state for the new
  host while the refetch is in flight; added the matching focused
  regression test.
- Removed the unused `supportedNotice` / `unsupportedNotice` i18n
  keys (the panel never rendered them; they only re-encoded the wrong
  matrix).

Validation (re-run on local Node 22.15.0 / npm 10 before commit):
`npm run lint:eslint` clean, `npm run typecheck` clean (3 projects),
7 use-models tests pass (incl. new Spec §10 reset regression),
9 primaryApiRoute tests pass, 56 providerAdapters tests pass,
`verify:i18n` 12/12 locales pass, `verify:network-boundaries` OK.

Committed as `2c551019 fix(routing): align FRATERNA docs/i18n with
corrected §4.1/§4.2 contract` and pushed (`e90516d9..2c551019 main ->
main`). Hosted acceptance re-checked:
- CI run `36185930241` — `completed success` (11/11 jobs green)
- CodeQL run `36185930234` — `completed success`

Local and remote `main` both at `2c5510192f8ee62a2f7c24a6af6e160c94f1dfb8`.

### 2026-09-25 — Published FRATERNA routing implementation + audit handoff to main

- **Commits.** Two commits on local `main` directly from `0a1bfdf4`:
  - `1d6c89c1 feat(routing): add Fraterna primary API route selection` — the implementation (55 files, 1983 insertions, 59 deletions).
  - `8bb9c4dc docs(audit): archive FRATERNA primary routing handoff` — the canonical handoff record (1 file, 1840 insertions).
  - Author: `fayeblade <spearchucker667@users.noreply.github.com>`.
- **Push.** `git push origin main` — `0a1bfdf4..8bb9c4dc  main -> main`. Local and remote SHA match (`8bb9c4dc63c2736b4e019ecd92d1a628d32994aa`). No force-push.
- **Hosted acceptance (inspected).** Both GitHub Actions runs for the new SHA are green:
  - **CI** run `36179854415` — `completed success`. All jobs succeeded: `lint-and-typecheck`, `contracts`, `unit-and-integration-tests`, `coverage`, `windows-sensitive-tests`, `macos-sensitive-tests`, `script-coverage`, `build`, `electron-smoke-macos`, `electron-smoke-linux`, `electron-smoke-windows`.
  - **CodeQL** run `36179854370` — `completed success` (Analyze actions + Analyze javascript-typescript).
- **Pre-push local gates (re-run before commit).** `npm run lint:eslint` clean, `npm run typecheck` clean (3 projects), 410 focused tests pass across 15 files (incl. FRATERNA-201 priority-order regression test), 25 static contract verifiers pass (network-boundaries, repository-identity, roadmap-current, safety-guard, venice-api-docs, venice-contract-drift, ci-contract, provider-adapters, ipc-parity, agent-docs, theme-tokens, image-policy, work-orders, no-native-dialogs, inactive-feature-archive, repo-handoff-hygiene, bundle-budget, release-metadata, meteocon-csp, custom-protocol-privileges, superdesign-init, hardcoded-strings, prompt-language, transitive-deprecations, i18n, markdown-links), 5 feature verifiers pass (chat/image/workflow/rp/settings), `verify:contracts:release` 104 pass, `npm run build` web + server + electron succeed. `verify:lockfile` is blocked by sandbox `/tmp/npm-cache` EPERM (pre-existing on a clean baseline at `0a1bfdf4`, unrelated to this work).
- **Out of scope.** No release, signing, notarization, funded provider call, or two-device sync was performed. External release evidence (`VF-VERIFY-005`) remains separate.
- **Untracked (user-owned).** `docs/audits/Records/Venice_Forge_Exhaustive_Audit_Remediation_Handoff_2026-09-24.md` — pre-existing input, not touched by this session.

### 2026-09-25 — Code-review corrections to FRATERNA routing implementation

Ran the two-axis `mattpocock-skills:code-review` skill against the working tree (fixed-point `0a1bfdf4`). **Standards axis: clean** (no AGENTS.md / CONTRIBUTING.md breaches, no hard smell hits beyond three judgement-call duplications). **Spec axis: 5 real deviations from the untracked handoff surfaced** and fixed in place:

1. **Hostname** — `api.fraterna.ai` (everywhere) → `fraterna.ai` per handoff §2.1 / §4. Updated `src/shared/primaryApiRoute.ts`, `server.ts`, all the focused tests, and `scripts/verify-network-boundaries.cjs`.
2. **Capability matrix inverted** — implemented Fraterna allowed `/chat/completions`, `/image/generate`, `/image/edit`, `/image/upscale`, `/image/multi-edit`, `/embeddings`. Corrected to handoff §4.1: `/models`, `/chat/completions`, `/image/generate`, `/images/generations`. Image edit/upscale/multi-edit and embeddings belong on Venice Direct per §4.2. Tests updated to match.
3. **PRIVACY.md overstated privacy** — "no separate privacy posture" removed per handoff §3.2; replaced with the honest statement that Fraterna is a third-party service that records selected request metadata per its public docs.
4. **Fallback chain bypassed when Fraterna selected** — `performSingleVeniceRequest` set `fallbackRouteResult = null` whenever the primary route resolved, which would have routed explicit `provider:foo:bar` requests through Fraterna. Re-ordered to: resolve `provider:` prefix FIRST, then consult the primary route only if no third-party route was selected (handoff §7.3.4). Added the `[FRATERNA-201]` priority-order regression test.
5. **Doc in wrong location** — `docs/features/FRATERNA_ROUTING.md` → `docs/DEVELOPMENT/FRATERNA_ROUTING.md` per handoff §17.2. All references in README, PRIVACY, security-model, summary_of_work, DOCS_INDEX, and the network-boundaries verifier allowlist updated.

Two secondary fixes landed in the same pass:

- Extracted `PrimaryApiRoutePanel.tsx` and mounted it in `VeniceApiKeysPanel.tsx` (rate-limits section) per handoff §3.1 (Settings → API Keys, adjacent to the Venice credential) — not in `ProvidersPanel.tsx`.
- `desktopBridge.update()` now re-hydrates the renderer mirror on IPC failure so the UI rolls back the user's just-selected route rather than showing a stale value (handoff §6.3).

Re-ran `npm run lint:eslint`, `npm run typecheck`, the focused tests (381 pass across 13 files in the touched scopes), and the static contract verifiers (network-boundaries, repository-identity, roadmap-current, safety-guard, venice-api-docs, venice-contract-drift, provider-adapters, ipc-parity, i18n, hardcoded-strings — all pass). No commit, push, release, signing, or notarization was performed.

### 2026-09-25 — Historical pre-correction Fraterna primary API routing implementation (superseded)

- **Bootstrap.** Verified the repository root, branch `main`, head `0a1bfdf4`; switched to Node `22.15.0` via fnm to satisfy the engine contract; read AGENTS.md, `docs/DEVELOPMENT/agents/AGENT_REINITIALIZATION.md`, `docs/summary_of_work.md`, `docs/DOCS_INDEX.md`, `docs/ROADMAP.md`, the handoff document, and inspected the existing transport (`electron/services/veniceClient.ts`), provider adapter resolver (`electron/services/providerAdapters.ts`), settings store (`electron/services/providerSettingsStore.ts`), IPC validation (`electron/ipc/validation.ts`), desktop bridge (`src/services/desktopBridge.ts`), settings-store mirror (`src/stores/settings-store.ts`), web proxy (`server.ts`), and the network-boundaries verifier. All 11 non-English i18n catalogs were already first-pass-machine.
- **Phase 1 — shared route contract.** Created `src/shared/primaryApiRoute.ts` with the route id, host, base-path, capability matrix, `resolvePrimaryApiRoute()`, `isPrimaryApiRouteId()`, and `normalizePrimaryApiRouteId()`. Added 9 focused tests covering defaulting, Venice universality, Fraterna allowlist, unsupported endpoints, and the normalize/isPrimaryApiRouteId helpers (`src/shared/primaryApiRoute.test.ts`).
- **Phase 2 — persistence v2 + IPC + bridge.** Bumped `electron/services/providerSettingsStore.ts` to schema v2 with a profile-scoped `primaryApiRoute` field; v1 files migrate transparently. Updated the IPC handler (`electron/ipc/handlers/apiKeyHandlers.ts`) to reject unknown route ids with a typed error, and propagated the field through `electron/preload.ts`, `src/types/desktop.ts`, `src/services/desktopBridge.ts` (both `get()` and `update()`), and `src/stores/settings-store.ts` (persist version `18 → 19`, with `migrate` + `merge` coercion).
- **Phase 3 — Electron transport.** Added `resolvePrimaryApiRouteForRequest(request, profileId)` in `electron/services/providerAdapters.ts` and wired it into `performSingleVeniceRequest` BEFORE the fallback chain so the selected primary route is honored first; the `Authorization: Bearer <key>` is attached from the same secure-store credential.
- **Phase 4 — web proxy.** Added a `resolveServerPrimaryApiRoute()` env-driven selector, extended `applyVeniceProxyHeaders` to accept an `upstreamHost` parameter, and created parallel `fraternaProxyBase`, `standardFraternaProxy`, `fsmMediaFraternaProxy`, and `fsmChatStreamFraternaProxy` middleware instances that share every existing guard with their Venice pair.
- **Phase 5 — settings UI.** Added a Primary API Route panel to `src/components/settings/ProvidersPanel.tsx` (desktop-only selector; web mode shows the env-var notice). Added `settings:providers.primaryRoute.*` keys in `src/i18n/resources/en-US/settings.json` and `statusDiagnostics:api.routeDetail` in `src/i18n/resources/en-US/common.json`, then propagated to all 11 non-English catalogs as `__MISSING__:` placeholders.
- **Phase 6 — model cache.** Extended `useModels` query key with `primaryApiRoute` and added a red/green test that flips the route and confirms both cache entries coexist.
- **Phase 7 — diagnostics.** Added `primaryApiRoute?: PrimaryApiRouteId` to `SafeDiagnosticsSnapshot`, extended the api status item with a `statusDiagnostics.api.routeDetail` localization key, and added a `resolvePrimaryApiRouteForDiagnostics()` helper.
- **Phase 8 — documentation.** Created `docs/DEVELOPMENT/FRATERNA_ROUTING.md` (capability matrix, security/privacy posture, failure modes, implementation seams). Updated `README.md` (features index), `docs/legal/PRIVACY.md` (Network Architecture section), and `docs/security/security-model.md` (new "Primary API route selection" section). Registered the new doc in `docs/DOCS_INDEX.md`.
- **Phase 9 — verifier.** Extended `scripts/verify-network-boundaries.cjs` so the canonical `api.fraterna.ai` host is enumerated alongside `api.venice.ai`, and added a dedicated rule that rejects hard-coded Fraterna references outside the canonical routing files.
- **Phase 10 — validation.** `npm run lint:eslint` (0 errors / 0 warnings), `npm run typecheck` (3 projects), `verify:contracts:static` (25 verifiers incl. i18n, network-boundaries, venice-api-docs, venice-contract-drift, ipc-parity, prompt-language), and 1,802 tests across 103 test files all pass. The pre-existing EPERM `syncIdentity.test.ts` failures reproduce on a clean baseline (sandbox `/tmp` perms) and are unrelated to this change.
- **Out of scope.** No commit, push, release, signing, notarization, funded live provider call, or two-device sync was performed. Headed visual / accessibility QA, qualified native-language review, and external release evidence remain open per `docs/ROADMAP.md`.

### 2026-09-24 — Pre-push validation and publication to main

- Executed full pre-push validation gates: safety-guard, markdown-links, contracts (including features, release packaging, static), ESLint, TypeScript typechecking, full vitest suite (588 files, 7,055 tests passed), segmented electron/server/ingestion test suites, production build, dist verification, and full local `npm run ci`.
- Committed the audit remediations (mobile sidebar layout, legacy conversation vault migration retry custody, main-frame IPC check hardening, esbuild override spec, acceptance capture runner reporting), point-in-time audit handoff record in `docs/audits/Records/`, and first-pass locale catalog completion.
- Pushed directly to `origin/main` without force flags.

### 2026-09-24 — Six audit remediations and first-pass locale completion

- Preserved the dirty starting worktree, including its locale edits and untracked selected audit. Used red/green regression tests for valid legacy-history retry custody and unavailable IPC main-frame identity. Updated one general IPC test event to supply a matching frame after the stricter boundary exposed its incomplete fixture.
- Reproduced and fixed the 390 px mobile sidebar width defect, then adjusted History search/filter and Privacy controls found by the same eight-tuple History/Privacy capture. The capture script now records limited geometry failures, actual browser version, and pending human review rather than unearned PASS statements.
- Changed esbuild's override to npm's `$esbuild` reference. A disposable direct-dependency update resolved without `EOVERRIDE`; the committed lockfile was not regenerated.
- Cleared 128 standard i18n errors with nine translated UI strings and exact locale-specific technical-value approvals. At the user's direction, filled 594 `__MISSING__` values using existing translations, first-pass translation, and focused manual corrections. Preserved interpolation and product/transport tokens; strict structural verification passes. Qualified language review is still required and production-complete flags remain false.
- Replaced four pre-existing `ZXQ`/`ZXQPH` translation artifacts in Spanish/Swedish copy and added a red/green verifier test so such artifacts fail i18n checks. Updated the Superdesign source fingerprint after changing the tracked sidebar source.
- Built unsigned macOS arm64 DMG/ZIP and ran packaged Electron smoke. No commit, push, signing, notarization, funded provider call, or human per-tab sign-off was performed.

### 2026-09-24 — Application/repository audit and remediation handoff

- Reviewed the current source/IPC/persistence/UI/CI architecture and all four GitHub workflows; produced `docs/audits/Records/2026-09-24-application-repository-audit-handoff.md` and registered it in `docs/DOCS_INDEX.md`. This is point-in-time evidence; unfinished work is in `docs/ROADMAP.md`.
- Reproduced a shared mobile shell defect with eight History/Privacy Chrome captures and an independent DOM measurement: closed drawer position is relative, width 288 px, and main width 102 px in a 390 px viewport. Traced the CSS rule and missing geometry assertion.
- Traced valid legacy conversation migration through save failure, source relocation, and UI result handling; audited the main-frame IPC option and its security tests; verified the capture tool's unconditional review claims; corroborated Dependabot's esbuild failure with hosted run data and a disposable npm manifest outside the repository.
- Ran full local CI, macOS arm64 packaging, and packaged Electron smoke. Preserved pre-existing locale edits and the untracked prior audit draft. No application code, commit, push, or release was made.

### 2026-09-24 — Audit handoff reconciliation

- Verified repository identity and remote `main` at `56924240509f8580b9cee5d9ef31202d35439908`, Node `v22.15.0`, npm `10.9.2`, package `3.1.0`, and the dirty user-owned locale/audit state before editing.
- Rechecked the six headline audit findings against the current checkout. Five are stale as written; the security-document finding is superseded by a policy conflict between the selected audit and the current implementation/tests. Corrected a separately verified MIT label in `docs/design/REPOSITORY_TREE.md`.
- Resolved three audit verification items by static evidence: `verify:i18n-hardcoded-regressions` is part of `verify:contracts:static`, and `.github/workflows/ci.yml` runs `verify:contracts`; `@testing-library/dom` is in `devDependencies`; Playwright is installed and imported by current smoke tests.
- Preserved all existing locale edits and the untracked audit handoff. No commit, push, release, or runtime safety change was made.

### 2026-09-23 — Roadmap compaction and remaining-risk closeout

- Archived the previous session ledger and reduced `docs/ROADMAP.md` to current unfinished work.
- Recorded the IPC registrar check and the single border-token definitions.
- External acceptance items stay open. Details and commands are in the validation matrix below.

## Open TODO Ledger

* **FRAT-REAUD-2026-09-25** — FRAT-REAUD-001 through FRAT-REAUD-005 have local uncommitted remediations. Hosted acceptance remains pending publication authority and a new exact SHA. FRAT-REAUD-006 (funded live Fraterna four-endpoint smoke) and FRAT-REAUD-007 (qualified native-language review) remain open in `docs/ROADMAP.md`.

* **FRATERNA-ROUTING-2026-09-25 (historical, superseded)** — Initial implementation evidence is preserved in Session History. Current status is the FRAT-REAUD entry above and `docs/ROADMAP.md`.

* **AUDIT-2026-09-24-APPLICATION** — Six evidence-backed items in the registered audit (`UX-P1-001`, `CI-P1-001`, `DATA-P2-001`, `SEC-P2-001`, `CI-P2-002`, `QA-P2-001`) have local remediations, focused validation, and regression tests committed. Headed human QA, signing, funded provider checks, and two-device sync remain separate external acceptance.

* **AUDIT-SAFETY-CONTRACT-2026-09-24** — Resolve the selected handoff's mandatory child-safety assertion against current Adult Mode behavior before changing safety enforcement or its documentation. See `docs/ROADMAP.md`.

* **AUDIT-I18N-WORKTREE-2026-09-24** — The 128 standard errors and 594 `__MISSING__` markers in the locale catalogs are resolved and committed; strict structural verification passes. Qualified native-language review remains `P3-020`.

* **REPO-MANAGEMENT-REAVALIDATION-2026-09-23** — Hygiene delta is in the worktree and uncommitted. Reports: `docs/audits/Records/2026-09-23-repository-audit.md`, `docs/audits/Records/2026-09-23-repository-hygiene-audit.md`, `docs/audits/Records/2026-09-23-repository-hygiene-final-report.md`.

* **ROADMAP-COMPACTION-2026-09-23** — Live roadmap and live ledger compacted. Prior ledger text is `docs/reports/historical/summary-of-work-before-2026-09-23.md`.

* **EXTERNAL-ACCEPTANCE** — `P2-016`, `P3-020`, and `VF-VERIFY-005` stay open. They are not local code defects. See `docs/ROADMAP.md`.

## Validation Matrix

### 2026-09-25 — Fraterna routing re-audit remediation (uncommitted)

- Baseline: `main` at `86b5580503e9b36746bac7a1b63d9602e49baea1`, clean before edits; Node `v22.15.0`, npm `10.9.2`, package `3.1.0`. `git ls-remote origin refs/heads/main` matched the baseline. GitHub CI run `36204271635` and CodeQL run `36204271633` each completed successfully for that baseline only.
- Red regressions: initial focused run failed in the expected provider moderation, Retry-After fallback, and route-neutral error cases (9 failures); web runtime route tests failed in the expected missing-endpoint/hydration cases (2 failures); unsupported caller `safe_mode` test failed before stripping that field. The first `npm run ci` stopped at one stale `normalizeError(500)` test expectation in `src/services/veniceClient.test.ts`, then the assertion was updated.
- `npx vitest run tests/safety/veniceSafeMode.test.ts electron/services/veniceClient.adapters.test.ts electron/services/veniceClient.retryAfter.test.ts electron/services/guardPipeline.test.ts src/services/veniceClient/errors.test.ts src/services/veniceClient.web.test.ts src/services/desktopBridge.test.ts src/components/settings/PrimaryApiRoutePanel.test.tsx src/services/diagnosticsService.test.ts src/hooks/use-models.test.tsx server.test.ts --no-file-parallelism` — PASS (287/287 tests across 12 files, before the final unsupported-field test). Final focused safety/client rerun — PASS (57/57 tests across 2 files).
- `npm run ci` — PASS on final code: lint, three TypeScript projects, segmented `test:ci`, both npm audits (0 vulnerabilities), web/server/Electron build, static/feature/release contracts, and `verify:dist`. Electron suite: 1,297/1,297 tests; server suite: 102/102 tests. An Electron test emitted `[shutdown] sync cleanup failed: journal write failed` without failing the suite.
- `npm test` — PASS (7,141 passed, 4 skipped; 589 passing files, 2 skipped files). `npm run verify:agent-docs`, `npm run verify:roadmap-current`, `npm run verify:markdown-links`, `npm run verify:i18n`, and `npm run verify:i18n-hardcoded-regressions` — PASS. The i18n verifier reports 165 allowed `__MISSING__` warnings for native-review debt; no new hardcoded-string regressions.
- Not run: funded Fraterna live calls, manual headed UI QA, hosted CI/CodeQL for these uncommitted edits, signing/notarization, and two-device sync. No commit or push was performed.

### 2026-09-25 — Copilot instruction refresh

- `npm run verify:agent-docs` — PASS.
- `git diff --check` — PASS.
- Broad test/build suites — not run; this was a documentation-only update.

### 2026-09-25 — Code-review corrections to FRATERNA routing implementation

- `npx vitest run src/shared/primaryApiRoute.test.ts electron/services/providerAdapters.test.ts electron/services/veniceClient.adapters.test.ts electron/services/veniceClient.test.ts electron/services/veniceClient.error.test.ts electron/services/veniceClient.retry.test.ts electron/services/veniceClient.stream.test.ts electron/services/veniceClient.multipart.test.ts electron/services/veniceClient.sseParser.test.ts electron/services/providerSettingsStore.test.ts electron/ipc/handlers.test.ts server.test.ts src/stores/settings-store.test.ts src/hooks/use-models.test.tsx --no-file-parallelism` — PASS (381 tests across 13 files; includes the new `[FRATERNA-201]` priority-order test that confirms explicit `provider:foo:bar` bypasses Fraterna).
- `npm run lint:eslint` — PASS (0 errors / 0 warnings).
- `npm run typecheck` (3 projects) — PASS.
- `node scripts/verify-network-boundaries.cjs` — PASS (canonical hosts and the dedicated Fraterna-host rule; updated to `fraterna.ai`).
- `node scripts/verify-venice-contract-drift.cjs` — PASS.
- `node scripts/verify-provider-adapters.cjs` — PASS.
- `node scripts/verify-ipc-parity.cjs` — PASS.
- `node scripts/verify-i18n.cjs --allow-missing-markers --allow-key-name-fallbacks` — PASS.
- `node scripts/verify-hardcoded-strings.cjs --baseline config/i18n-hardcoded-baseline.json --no-regressions` — PASS.
- `node scripts/verify-repository-identity.cjs` — PASS.
- `node scripts/verify-roadmap-current.cjs` — PASS.
- `node scripts/verify-safety-guard.cjs` — PASS.
- `node scripts/verify-venice-api-docs.cjs` — PASS.
### 2026-09-25 — Fraterna primary API routing post-implementation audit remediation

- `npm run lint:eslint` — PASS (0 errors, 0 warnings across src, electron, server.ts, scripts).
- `npm run typecheck` — PASS (app, electron, electron.test).
- `npm run test:server` — PASS (101/101 tests passed).
- `npm run test:electron` — PASS (113/113 test files, 1,292/1,292 tests passed).
- `npx vitest run src/components/settings/PrimaryApiRoutePanel.test.tsx` — PASS (8/8 tests passed).
- `npx vitest run src/hooks/use-models.test.tsx` — PASS (8/8 tests passed, including centralized multi-hook concurrent reset test).
- `npx vitest run electron/ipc/handlers/apiKeyHandlers.routeConnectivity.test.ts` — PASS (10/10 tests passed).
- `npx vitest run tests/safety/guardPipeline.test.ts` — PASS (46/46 tests passed, including `/images/generations` safety coverage).
- `npm run verify:contracts` — PASS (104/104 contract invariant checks passed).
- `npm run verify:agent-docs` — PASS.
- `npm run verify:markdown-links` — PASS (446 Markdown files checked).
- `npm run verify:i18n` — PASS (12 locales, 12 namespaces; sentinel, missing-marker, and key-name-fallback aware).
- `npm run verify:i18n-hardcoded-regressions` — PASS (0 regressions).
- `npm run build` — PASS (client, server, and electron bundles).
- `git status --short` — working tree contains remediations for FRAT-AUD-001 through FRAT-AUD-009; no commit, push, or release performed.

### 2026-09-25 — Fraterna primary API routing implementation

- `npx vitest run src/shared/primaryApiRoute.test.ts --no-file-parallelism` — PASS (9 tests).
- `npx vitest run electron/services/providerSettingsStore.test.ts --no-file-parallelism` — PASS (8 tests, 4 new for `primaryApiRoute` persistence).
- `npx vitest run electron/services/providerAdapters.test.ts --no-file-parallelism` — PASS (56 tests, 5 new for `resolvePrimaryApiRouteForRequest`).
- `npx vitest run src/hooks/use-models.test.tsx --no-file-parallelism` — PASS (6 tests, 1 new for primary-route cache invalidation).
- `npx vitest run server.test.ts --no-file-parallelism` — PASS (124 tests, 2 new for the env-driven selector and the upstream-host override).
- `npx vitest run electron/services/veniceClient*.test.ts electron/services/providerAdapters.test.ts electron/ipc/handlers.test.ts electron/services/providerSettingsStore.test.ts src/stores/settings-store.test.ts src/hooks/use-models.test.tsx src/services/diagnosticsService.test.ts src/shared/primaryApiRoute.test.ts server.test.ts --no-file-parallelism` — PASS (1,802 tests across 103 files in the touched scopes).
- `npm run lint:eslint` — PASS (0 errors / 0 warnings).
- `npm run typecheck` (3 projects) — PASS.
- `node scripts/verify-i18n.cjs --allow-missing-markers --allow-key-name-fallbacks` — PASS (12 locales, 12 namespaces; sentinel, missing-marker, key-name-fallback aware).
- `node scripts/verify-network-boundaries.cjs` — PASS (canonical hosts and the dedicated Fraterna-host rule).
- `npm run verify:contracts:static` (25 verifiers: lockfile, repository-identity, roadmap-current, release-metadata, bundle-budget, safety-guard, markdown-links, repo-handoff-hygiene, theme-tokens, meteocon-csp, network-boundaries, custom-protocol-privileges, venice-api-docs, venice-contract-drift, ci-contract, agent-docs, superdesign-init, image-policy, work-orders, no-native-dialogs, inactive-feature-archive, provider-adapters, i18n, i18n-hardcoded-regressions, ipc-parity, prompt-language, transitive-deprecations) — PASS.
- `node scripts/verify-hardcoded-strings.cjs --baseline config/i18n-hardcoded-baseline.json --no-regressions` — PASS (0 regression(s)).
- `git status --short` — the FRATERNA worktree is uncommitted (expected; no commit/push/release authority was granted).
- Not run (out of scope for this session, no commit/push/release authority granted): full `npm run build`, full `npm run ci`, full `npm test`, hosted CI / CodeQL / release evidence — those remain in `VF-VERIFY-005`.

### 2026-09-24 — Pre-push validation and publication to main

- `npm run verify:safety-guard` — PASS.
- `npm run verify:markdown-links` — PASS (443 files checked).
- `npm run verify:contracts` — PASS (all static, feature, and release packaging contracts).
- `npm run lint:eslint` — PASS (0 errors, 0 warnings).
- `npm run typecheck` — PASS (app, electron, electron.test).
- `npm test` — PASS (588 test files, 7,055 tests passed).
- `npm run test:electron` — PASS.
- `npm run test:server` — PASS (92 tests passed).
- `npm run test:ingestion` — PASS (12 test files, 117 tests passed).
- `npm run build && npm run verify:dist` — PASS (web, server, and Electron bundles verified).
- `npm run ci` — PASS (full gate and dist verification).
- `git diff --check` — PASS (0 whitespace errors).
- `npm run verify:archive-clean`, `npm run verify:superdesign-init`, `npm run verify:i18n`, `npm run verify:roadmap-current`, and `npm run verify:repo-handoff-hygiene` — PASS.
- Hosted CI run `36082441197` — PASS, 11/11 jobs (`windows-sensitive-tests`, `contracts`, `lint-and-typecheck`, `unit-and-integration-tests`, `macos-sensitive-tests`, `coverage`, `script-coverage`, `build`, `electron-smoke-windows`, `electron-smoke-macos`, `electron-smoke-linux`), SHA `107e6e12`.
- Hosted CodeQL run `36082441227` — PASS, Analyze actions and Analyze javascript-typescript, SHA `107e6e12`.
- Local `HEAD` matches `origin/main` at `107e6e12a75aa5bc119b633d4117939b90339cb4`.

### 2026-09-24 — Audit remediation and first-pass locale completion

- `npm ci` — PASS (857 packages; zero reported vulnerabilities).
- Focused `electron/services/conversationVault.test.ts` and `electron/ipc/handlers/common.security.test.ts` — PASS (52 tests); general `electron/ipc/handlers.test.ts` — PASS (89 tests) after updating its main-frame fixture.
- Focused Sidebar, Privacy, reference-viewport, and History tests — PASS (56 tests across five files).
- `npm run lint:eslint`, `npm run typecheck`, and `npm run verify:lockfile` — PASS on the remediation worktree before the final locale-only changes; aggregate CI reruns these checks.
- `npm run verify:i18n` — PASS after the initial 128-error correction. `node scripts/verify-i18n.cjs --strict` — PASS after filling all 594 markers; 12 locales and 12 namespaces.
- `npx vitest run scripts/i18n-tooling.test.ts --no-file-parallelism` — PASS (16 tests) after a red test demonstrated that token artifacts were previously accepted. `npm run verify:superdesign-init` — PASS after refreshing the sidebar source fingerprint.
- History/Privacy automated capture — PASS across 8 desktop/mobile and en-US/ar tuples after layout corrections; this is not human visual, keyboard, or screen-reader acceptance.
- `npm run dist:mac:arm64` — PASS after the final locale edits; unsigned DMG/ZIP and checksums generated. The packaged `app.asar` contains the final zh-CN Settings copy. `npm run smoke:electron` — PASS against that package, 3 files / 8 tests. Signing and notarization were not performed.
- Initial full `npm run ci` after locale work — FAIL at `verify:superdesign-init` because the tracked sidebar change invalidated the source fingerprint; all preceding CI stages passed. After refreshing it, the settled-worktree `npm run ci` — PASS through lint, typecheck, segmented tests, dependency audits, build, contracts, release checks, and `verify:dist`.
- `npm run verify:roadmap-current` and `npm run verify:repo-handoff-hygiene` — PASS after the final documentation update.
- `git diff --check` — PASS. No hosted run exists for these uncommitted edits.

### 2026-09-24 — Application/repository audit

- `npm audit --json` — PASS, zero reported vulnerabilities.
- `npm run ci` — FAIL at `verify:i18n` with 128 errors from the pre-existing locale edits. Lint, typecheck, segmented tests, dependency audits, and build ran before that failure.
- `npm run verify:contracts:features` — PASS when run separately after the aggregate stop (chat, image, workflow, RP, research, settings, backup/sync).
- `npm run verify:contracts:release` — PASS, 104 release-packaging checks.
- `npm run dist:mac:arm64` — PASS; unsigned arm64 DMG/ZIP and checksums generated.
- `npm run smoke:electron` — PASS, 3 test files / 8 tests against the packaged executable.
- `npm run verify:dist:mac` — FAIL because the full macOS verifier requires an x64 DMG and this session built only arm64. This does not establish a defect in the arm64 package.
- `npm run verify:per-tab-acceptance` — FAIL, 0/2,700 signed state evaluations; automated screenshots are not human review.
- Focused Chrome capture — 8 History/Privacy tuples completed. Independent 390 px DOM measurement showed sidebar width 288 px and main width 102 px. No screen-reader or qualified visual sign-off claimed.
- Hosted CI and CodeQL — PASS at exact HEAD; older Dependabot esbuild run 35999725421 — FAIL at dependency resolution.

### 2026-09-24 — Audit handoff reconciliation

- `npm ci` — PASS (857 packages added; npm audit reported 0 vulnerabilities).
- `npm run lint:eslint` — PASS.
- `npm run typecheck` — PASS.
- `npm test` — PASS (586 files / 7,048 tests passed; 2 files / 4 tests skipped).
- `npm run build` — PASS (web, server, and Electron bundles).
- `npm run verify:agent-docs`, `npm run verify:markdown-links`, `npm run verify:release-metadata`, `npm run verify:i18n-hardcoded-regressions`, `npm run i18n:verify-hardcoded`, and `npm run verify:safety-guard` — PASS on the current worktree.
- `npm run verify:roadmap-current` and `npm run verify:repo-handoff-hygiene` — PASS after the handoff update.
- `npm run verify:i18n` — FAIL (128 unapproved untranslated-English errors, 594 warnings in the pre-existing locale edits); no locale files were changed by this session.
- `git diff --check` — PASS after the design-tree correction.
- Hosted CI run `36064443092` and CodeQL run `36064443001` — PASS for exact HEAD `56924240`; these runs do not cover the current uncommitted locale edits.
- `npm run ci`, runtime UI QA, platform packaging, and live-provider checks — not run in this session.

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
