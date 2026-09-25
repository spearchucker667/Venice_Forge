# Venice Forge — Fraterna Primary API Routing Post-Implementation Audit & Remediation Handoff

**Repository:** `spearchucker667/Venice_Forge`  
**Audited branch:** `main`  
**Audited HEAD:** `d9fb4262ef4f791197aa301d75e9189039ab0823`  
**Prior feature-handoff baseline:** `0a1bfdf45aaa161d0408f7421e7f3f166ba460a3`  
**Package version:** `3.1.0`  
**Audit date:** 2026-09-25  
**Scope:** Fraterna primary API route implementation, routing correctness, request validation, persistence, cache identity, Settings UX, diagnostics, privacy/security documentation, focused tests/verifiers, and hosted CI.

> **Authority / intent:** This is a point-in-time remediation handoff for the feature currently live on `main`. It does not replace `AGENTS.md`, `docs/ROADMAP.md`, or repository security rules. Re-read current source before editing because `main` may move after this audit.

---

## 1. Executive Summary

The Fraterna feature is substantially implemented and the **core architecture is sound**, but current `main` still contains two important correctness issues plus several observability, UI-resilience, test-coverage, and documentation defects.

The feature should **not** be rolled back. Keep the fixed-host, main-process-authoritative design and close the gaps below.

### Verified-good architecture

- `fraterna.ai` is fixed/allowlisted; there is no arbitrary user-editable primary base URL.
- Desktop route selection is profile-scoped and main-process authoritative.
- The existing Venice API key remains in the trusted secure-store boundary.
- Fraterna reuses the Venice key; no second credential is introduced.
- Web mode remains same-origin from the browser; server code chooses the upstream.
- Fraterna is implemented as a primary route, not a normal fallback provider.
- Explicit third-party provider routes take precedence over Fraterna.
- Unsupported Fraterna endpoints return to Venice Direct.
- `primaryApiRoute` is part of the model-query cache key.
- The model-catalog runtime state is reset on route change.
- Local Family Safe Mode and existing request/response guards remain active.
- The network-boundary verifier has a fixed-host Fraterna rule.
- Current English Settings copy acknowledges Fraterna as a third-party service and notes server-side technical metadata.

### Finding summary

| ID | Severity | Status | Finding |
|---|---|---|---|
| FRAT-AUD-001 | **P1** | Confirmed | `/images/generations` is advertised as Fraterna-supported but rejected by Venice Forge's canonical endpoint validator before routing occurs. |
| FRAT-AUD-002 | **P1** | Confirmed | Fraterna connection failures are classified/displayed as Venice key failures; ambiguous Fraterna 401/403 responses can incorrectly tell users to replace a valid Venice key. |
| FRAT-AUD-003 | **P2** | Confirmed | Diagnostics expose selected route only, not the effective upstream/routing reason for mixed-route requests. |
| FRAT-AUD-004 | **P2** | Confirmed | Shared Electron transport/stream errors still hard-code “Venice” when the effective upstream is Fraterna. |
| FRAT-AUD-005 | **P2** | Confirmed | Primary-route UI mutation lacks a rejected-IPC error path, pending state, and user-facing failure handling. |
| FRAT-AUD-006 | **P2** | Coverage gap | No focused `PrimaryApiRoutePanel` component regression suite was found. |
| FRAT-AUD-007 | **P2** | Confirmed spec gap | Settings has no direct safe link to Fraterna's current docs despite membership/privacy being external dependencies. |
| FRAT-AUD-008 | **P2** | Confirmed | Canonical/current docs and source comments still contradict the corrected matrix, UI location, privacy posture, and publication state. |
| FRAT-AUD-009 | **P2 risk** | Reproduce first | Runtime catalog reset occurs independently in each `useModels()` instance and may cause repeated resets during one route change. |
| FRAT-AUD-010 | **P3** | Acceptance gap | No funded/live Fraterna contract acceptance is recorded for the exact four-endpoint matrix. |
| FRAT-AUD-011 | **P3** | Localization debt | New route strings remain `__MISSING__:` in the non-English catalogs under the project's current review process. |

**No P0 Fraterna routing security defect was confirmed.**

---

## 2. Audit Method

The review traced the feature across:

```text
Settings UI
→ Zustand renderer mirror
→ desktop bridge / preload
→ provider-settings IPC
→ provider-settings.json
→ canonical request validator
→ primary route resolver
→ Electron HTTPS transport / Express proxy
→ retry/fallback chain
→ model discovery/cache
→ diagnostics/status
→ documentation/verifiers/tests
→ hosted GitHub CI / CodeQL
```

Evidence sources:

- current `main` via the GitHub connector;
- commit history from the original feature baseline to current HEAD;
- current Fraterna public docs;
- current TanStack Query documentation for query-key dependency behavior;
- repository Superdesign Settings/Status dependency maps;
- Superpowers code-review/systematic-debugging workflow.

No repository writes were performed during this audit.

---

## 3. Current Fraterna External Contract

Current Fraterna documentation states:

- Base URL: `https://fraterna.ai/api/v1`
- Bearer token: the user's Venice API key
- Shared capacity requires the key to belong to an active consorzio
- Supported endpoints:
  - `POST /api/v1/chat/completions`
  - `POST /api/v1/image/generate`
  - `POST /api/v1/images/generations`
  - `GET /api/v1/models`
- Successful requests are recorded using pseudonymous member IDs; technical details may include endpoint, model, and API consumption.

Reference:

`https://fraterna.ai/docs`

Do not expand the Fraterna matrix without re-verifying the public contract.

---

## 4. Relevant Current Implementation

### `src/shared/primaryApiRoute.ts`

Current primary routes:

```text
venice   → api.venice.ai /api/v1
fraterna → fraterna.ai   /api/v1
```

Current Fraterna endpoint set:

```text
/models
/chat/completions
/image/generate
/images/generations
```

### `electron/services/providerSettingsStore.ts`

- schema v2;
- profile-scoped `primaryApiRoute`;
- default `venice`;
- malformed values sanitize to `venice`;
- v1 state reads compatibly and becomes v2 on subsequent write.

### `electron/services/providerAdapters.ts`

`resolvePrimaryApiRouteForRequest()` resolves an allowlisted primary route using main-process settings and the existing Venice key.

### `electron/services/veniceClient.ts`

Current precedence is correct:

1. explicit/automatic third-party provider route;
2. otherwise Venice/Fraterna primary route.

### `server.ts`

- web route is server-authoritative (`VENICE_FORGE_PRIMARY_API_ROUTE`);
- browser remains on `/api/venice`;
- renderer Authorization/Cookie/Host are stripped;
- proxy supplies the stored key;
- Venice and Fraterna share guard/response behavior.

Preserve this architecture.

---

# 5. FRAT-AUD-001 — `/images/generations` Is Unreachable

**Severity:** P1  
**Confidence:** Confirmed  
**Class:** Cross-layer contract integration

## Evidence

Fraterna publicly supports:

```text
POST /api/v1/images/generations
```

and `src/shared/primaryApiRoute.ts` marks:

```text
/images/generations
```

as Fraterna-supported.

But `src/shared/validation.ts::ALLOWED_VENICE_ENDPOINTS` does **not** contain `/images/generations`.

`VENICE_ENDPOINT_METHODS` also has no entry for it.

Electron request flow:

```text
renderer
→ validateVeniceIpcRequest()
→ endpoint must pass ALLOWED_VENICE_ENDPOINTS / parameterized families
→ /images/generations rejected
→ primary route resolver never executes
```

Web flow:

```text
/api/venice/images/generations
→ isAllowedVeniceRequest()
→ rejected before proxy-selection middleware
→ Fraterna proxy never executes
```

## Root cause

The feature added support in the downstream **route resolver** but not in the upstream **trusted request boundary**.

The resolver unit test therefore passes while the real request cannot reach it.

## Impact

One of the four Fraterna endpoints advertised by:

- Fraterna's docs;
- Venice Forge Settings copy;
- `primaryApiRoute.ts`;
- `docs/DEVELOPMENT/FRATERNA_ROUTING.md`;

is unavailable through the canonical Venice Forge transport.

## Remediation

First inspect the current bundled Venice OpenAPI contract.

Choose one safe design:

### A. Canonical endpoint

If direct Venice currently supports `/images/generations`:

- add to `ALLOWED_VENICE_ENDPOINTS`;
- add `POST` in `VENICE_ENDPOINT_METHODS`;
- add validation tests;
- add Electron/web transport tests.

### B. Fraterna-only exact endpoint

If Venice Direct must not expose the alias:

- add a narrow primary-route-aware allowance for:
  - route `fraterna`;
  - method `POST`;
  - exact path `/images/generations`;
- keep every other arbitrary path forbidden;
- do not allow renderer-supplied host/base URL.

**Do not bypass `validateVeniceIpcRequest()` inside the transport.**

## Required red tests

Electron:

```text
primary route = fraterna
POST /images/generations
→ request accepted
→ hostname fraterna.ai
→ path /api/v1/images/generations
```

Web equivalent:

```text
VENICE_FORGE_PRIMARY_API_ROUTE=fraterna
POST /api/venice/images/generations
→ accepted
→ Fraterna proxy selected
```

Negative:

```text
POST /images/not-real
→ rejected
```

---

# 6. FRAT-AUD-002 — Fraterna Failures Are Misclassified as Venice Key Failures

**Severity:** P1  
**Confidence:** Confirmed  
**Class:** Connectivity classification / destructive troubleshooting advice

## Evidence

`electron/ipc/handlers/apiKeyHandlers.ts::testVeniceConnection()` uses:

```text
GET /models
```

through the normal primary route, so when Fraterna is selected the test really does hit Fraterna.

But `classifyConnectivityFailure()` remains route-blind.

For 401/403 it reports:

```text
API key was found, but Venice rejected it. Re-enter the key in Config.
```

For retryable errors:

```text
Venice returned an error response.
```

For network failure:

```text
Network request failed before Venice responded.
```

## Root cause

Routing became multi-upstream, but the connectivity status contract still assumes one Venice upstream.

## Impact

Fraterna requires an active consorzio. A Fraterna 401/403 can reflect:

- invalid Venice key;
- Fraterna auth rejection;
- membership/consorzio state;
- another Fraterna-specific access condition.

The current UI can therefore tell users to replace a valid Venice key for a Fraterna account/membership problem.

## Remediation

Pass selected/effective primary route into connectivity classification.

For Fraterna 401/403 use deliberately ambiguous, non-destructive copy:

```text
Fraterna rejected this request. The Venice key may be invalid or may not
belong to an active Fraterna consorzio. Verify Fraterna membership and
the stored key before replacing the credential.
```

For Fraterna 429/5xx:

```text
Fraterna returned an upstream error. Try again or switch to Venice Direct.
```

For network failure:

```text
Failed to reach Fraterna. Check network/proxy/VPN/firewall or switch to Venice Direct.
```

Do not delete or overwrite the key automatically.

## Required tests

- Fraterna `/models` 200 → verified.
- Fraterna 401 → ambiguous route-aware auth message.
- Fraterna 403 → ambiguous route-aware auth message.
- Fraterna 429 → retryable Fraterna error.
- Fraterna 503 → Fraterna unavailable.
- Venice 401 → existing Venice invalid-key behavior preserved.

---

# 7. FRAT-AUD-003 — Selected Route Is Not Effective-Route Observability

**Severity:** P2  
**Confidence:** Confirmed

`SafeDiagnosticsSnapshot` currently contains only:

```ts
primaryApiRoute?: "venice" | "fraterna";
```

The source comments explicitly say this is the **selected** route only.

No implementation was found for:

```text
effectiveUpstream
routingReason
```

## Impact

A profile selected as Fraterna intentionally has mixed routing:

```text
/models              → Fraterna
/chat/completions    → Fraterna
/embeddings          → Venice
/image/edit          → Venice
explicit fallback    → another provider
```

`primaryApiRoute = fraterna` cannot answer where a specific request actually went.

## Remediation

Extend per-request inspector telemetry, not the global static setting, with safe fields:

```ts
selectedPrimaryRoute: "venice" | "fraterna";
effectiveUpstream: "venice" | "fraterna" | ProviderId;
routingReason:
  | "selected-venice"
  | "fraterna-supported-endpoint"
  | "fraterna-unsupported-endpoint"
  | "explicit-provider"
  | "automatic-fallback-provider";
```

Never include raw credentials or prompt bodies.

## Tests

- selected Fraterna + `/models` → effective Fraterna.
- selected Fraterna + `/embeddings` → effective Venice.
- explicit provider prefix → effective provider.
- Fraterna failure then third-party fallback → final effective provider reported.

---

# 8. FRAT-AUD-004 — Shared Errors Still Hard-Code “Venice”

**Severity:** P2  
**Confidence:** Confirmed

`electron/services/veniceClient.ts` still contains shared messages such as:

```text
Venice returned invalid stream data.
Venice stream ended with a truncated data sequence.
Venice response stream error.
Venice response exceeded the local safety limit.
Failed to reach Venice API.
Malformed SSE frame from Venice upstream.
Venice API request failed.
```

These paths are also used when `hostname === fraterna.ai`.

## Impact

A real Fraterna outage/stream problem can be reported as a Venice outage.

This damages:

- troubleshooting;
- support logs;
- route-switch guidance;
- privacy/incident analysis.

## Remediation

Derive a safe upstream label once per request.

Prefer neutral wording where possible:

```text
Upstream stream ended before [DONE].
Upstream response exceeded the local safety limit.
```

Use route-specific wording where useful:

```text
Failed to reach Fraterna.
Failed to reach Venice API.
```

Preserve secret redaction.

---

# 9. FRAT-AUD-005 — Route Selector Has No Rejected-IPC Handling

**Severity:** P2  
**Confidence:** Confirmed

`PrimaryApiRoutePanel.tsx` calls the settings update promise and handles only its resolved value.

`desktopBridge.update()` handles a returned `{ok:false}` by rehydrating, but an actual rejected `ipcRenderer.invoke()` is not caught by either layer.

## Failure mode

A rejected IPC call can cause:

- no toast/error;
- no explicit rollback explanation;
- unhandled promise rejection;
- selector state changing later without explanation.

## Remediation

Use a single async change handler with:

```text
idle → saving → success/error
```

Requirements:

- disable control while saving;
- `try/catch`;
- safe localized failure message;
- authoritative rehydrate after thrown failure;
- model invalidation only after successful authoritative save;
- avoid redundant local write if bridge already mirrors returned settings.

## Tests

- success;
- `{ok:false}`;
- invoke rejection;
- two fast changes;
- profile change while pending.

---

# 10. FRAT-AUD-006 — Missing Focused Route-Panel UI Tests

**Severity:** P2 coverage gap

No focused `PrimaryApiRoutePanel.test.tsx` or equivalent suite was found.

Add direct tests for:

1. Venice default.
2. Fraterna choice.
3. successful persistence.
4. returned failure.
5. rejected IPC.
6. pending/disabled state.
7. label/accessibility semantics.
8. explanatory privacy/membership copy.
9. Fraterna docs link.
10. profile route hydration.

Resolver tests do not replace component behavior tests.

---

# 11. FRAT-AUD-007 — No User-Facing Fraterna Docs Link

**Severity:** P2

Repository search for:

```text
fraterna.ai/docs
```

found the audit handoff, but not the Settings route control.

This matters because Venice Forge cannot authoritatively infer:

- current consorzio membership rules;
- Fraterna account behavior;
- current endpoint matrix;
- third-party privacy changes.

## Remediation

Add a “Fraterna documentation” action beside the route explanation.

Use the app's existing safe external-link/openExternal boundary.

Do not introduce raw `window.open()` if project policy forbids it.

---

# 12. FRAT-AUD-008 — Canonical Docs and Source Comments Are Still Contradictory

**Severity:** P2  
**Confidence:** Confirmed

This is not merely cosmetic: repository instructions tell future agents to use these documents as implementation context.

## `docs/DEVELOPMENT/FRATERNA_ROUTING.md`

The table is now correct, but prose still says:

```text
Capacity diversity for chat / image / embeddings.
```

`/embeddings` currently goes to Venice.

It also says:

```text
Zero new privacy surface.
```

This is misleading because supported requests go to a new third-party origin and Fraterna documents recording technical request metadata.

Desktop instructions still say:

```text
Settings → Fallback Providers → Primary API Route
```

but the real component is mounted in `VeniceApiKeysPanel.tsx`.

The doc also contains “No new privacy surface” / “No telemetry ... not already opted into” language that should be replaced with the precise distinction:

```text
Venice Forge adds no analytics telemetry.
Fraterna has its own documented server-side request metadata as part of service operation.
```

## `docs/security/security-model.md`

The direct-Venice fallback list still says `/models` is Fraterna-unsupported.

That is false; `/models` is in the current supported matrix.

## `docs/summary_of_work.md`

The machine-readable Current State is stale relative to current HEAD.

The leading “Latest Session Summary” still repeats pre-correction facts:

- wrong Fraterna host;
- wrong endpoint matrix;
- wrong route-resolution ordering;
- old UI placement;
- uncommitted/no-push state.

Later historical entries record corrections, but the current header remains contradictory.

## `src/shared/primaryApiRoute.ts`

Top-level comments still contain stale “no separate privacy posture” language even though the exported user-facing description was corrected.

## `src/hooks/use-models.ts`

A comment still describes `/models` as Venice-only even though current routing sends it through Fraterna when selected.

## Remediation order

1. fix source comments;
2. fix canonical routing doc;
3. fix security model;
4. refresh `docs/summary_of_work.md` Current State;
5. mark pre-correction narrative historical/obsolete rather than current;
6. run Markdown/agent-doc verification.

Do not rewrite historical audits under `docs/audits/Records/`.

---

# 13. FRAT-AUD-009 — Possible Multi-Hook Runtime-Reset Race

**Severity:** P2 risk  
**Confidence:** Reproduce before fixing

The TanStack Query key now correctly includes `primaryApiRoute`.

That is required because route selection changes the query dependency/result source.

However each `useModels()` instance independently owns a route-change effect that calls:

```text
modelCatalogRuntimeStore.reset()
```

Venice Forge often mounts multiple `useModels()` consumers concurrently.

A single route switch may therefore produce multiple resets around concurrent query loads.

Potential symptoms:

- status flicker;
- `idle` after another query marked loading;
- temporary loss of count/ID runtime state.

## Required next action

Do **not** refactor only on this hypothesis.

Create a test mounting at least two `useModels()` consumers with different types, switch route once, and assert the runtime state sequence.

If interference reproduces, centralize the reset in one authoritative route-transition/coordinator path.

Keep `primaryApiRoute` in the query key.

---

# 14. FRAT-AUD-010 — No Live Fraterna Contract Acceptance Recorded

**Severity:** P3

The repository records strong unit/local/hosted CI validation but explicitly excludes funded live-provider calls.

Therefore current acceptance does not prove live behavior for:

- `/models`;
- non-stream chat;
- streaming chat;
- `/image/generate`;
- `/images/generations`;
- Fraterna 401/403;
- Fraterna 429/Retry-After;
- actual content types/SSE framing;
- Venice-specific optional field compatibility.

## Acceptance procedure

Using a dedicated test Venice key enrolled in a test consorzio:

- perform bounded low-cost calls;
- never commit key/payloads;
- record endpoint/status/content type/high-level result only;
- redact request IDs if they could expose sensitive context.

Do not state live compatibility as verified until done.

---

# 15. FRAT-AUD-011 — Non-English Route Strings Incomplete

**Severity:** P3 / known localization debt

The English catalog is updated.

Non-English catalogs contain `__MISSING__:` route strings under the current localization process.

Do not silently strip markers or claim native review.

Follow the repository's existing first-pass/qualified-review workflow.

---

# 16. UI / Superdesign Assessment

The repository Superdesign dependency map identifies:

```text
Settings → SettingsView → settings panels/stores
Status   → StatusView → status/diagnostics
```

The current placement next to Venice API key management is defensible because Fraterna reuses that credential.

Recommended UX:

- keep the primary selector adjacent to the Venice credential;
- do not move it into normal fallback providers;
- show “Uses your existing Venice API key”;
- show active-consorzio requirement;
- add direct Fraterna docs link;
- show selected-route validation status;
- show:
  - “Supported requests use Fraterna.”
  - “Other Venice Forge APIs continue directly through Venice.”
- show saving/error state;
- never turn it into an arbitrary URL form.

---

# 17. Security Assessment

No Fraterna-specific regression was confirmed in:

- SSRF protections;
- secure API-key custody;
- renderer privilege boundary;
- direct browser networking;
- explicit fallback-provider precedence;
- local safety guard routing.

The current primary issue is actually **over-restriction** at the endpoint validator for `/images/generations`, not a bypass.

Do not weaken security boundaries while fixing it.

---

# 18. Hosted CI State at Audit Time

Audited HEAD:

`d9fb4262ef4f791197aa301d75e9189039ab0823`

At scan time:

- **CodeQL:** completed successfully.
- **CI run 36188314772:** still in progress.
  - `lint-and-typecheck` — success
  - `contracts` — success
  - `windows-sensitive-tests` — success
  - `macos-sensitive-tests` — success
  - `script-coverage` — success
  - `unit-and-integration-tests` — in progress
  - `coverage` — in progress

A prior corrected feature commit (`2c551019...`) had recorded 11/11 CI success and CodeQL success.

Do not claim the audited HEAD's CI is green until the exact run reaches `completed/success`.

---

# 19. Cross-Layer Test Matrix Required

The current `/images/generations` bug demonstrates that resolver-only tests are insufficient.

For every Fraterna-supported route, test the intersection of:

```text
trusted endpoint validation
∩ route resolver
∩ Electron transport
∩ web proxy
```

Required positive matrix:

| Method | Path |
|---|---|
| GET | `/models` |
| POST | `/chat/completions` |
| POST | `/image/generate` |
| POST | `/images/generations` |

Required direct-Venice/negative coverage:

- `/embeddings`
- `/image/edit`
- `/image/upscale`
- `/video/queue`
- `/audio/speech`
- `/responses`
- `/api_keys`
- `/x402/*`
- `/crypto/rpc/*`
- arbitrary unknown endpoint

This would have caught FRAT-AUD-001 before publication.

---

# 20. Remediation Sequence

## Phase 0 — bootstrap

Read:

- `AGENTS.md`
- `docs/DEVELOPMENT/agents/AGENT_REINITIALIZATION.md`
- `docs/summary_of_work.md`
- `docs/DOCS_INDEX.md`
- `docs/ROADMAP.md`
- `docs/DEVELOPMENT/FRATERNA_ROUTING.md`
- current Venice OpenAPI reference
- current Fraterna docs

Verify:

```bash
git rev-parse HEAD
git status --short
git branch --show-current
node -p "require('./package.json').version"
```

Use local `main` only. Never force-push.

## Phase 1

Add failing cross-layer `/images/generations` tests.

## Phase 2

Repair trusted endpoint validation without bypassing security.

## Phase 3

Make connectivity classification route-aware.

## Phase 4

Make shared transport/stream errors route-aware.

## Phase 5

Add effective-upstream inspector telemetry.

## Phase 6

Harden route-selector async failure handling.

## Phase 7

Add focused component tests + safe Fraterna docs link.

## Phase 8

Reconcile canonical docs/source comments.

## Phase 9

Reproduce FRAT-AUD-009 before changing model-runtime architecture.

## Phase 10

Run full local validation and verify hosted CI/CodeQL on the final exact SHA.

---

# 21. Validation Commands

Re-read `package.json` before execution.

At minimum:

```bash
npm ci
npm run lint:eslint
npm run typecheck

npm run verify:network-boundaries
npm run verify:provider-adapters
npm run verify:ipc-parity
npm run verify:safety-guard
npm run verify:venice-api-docs
npm run verify:venice-contract-drift
npm run verify:markdown-links
npm run verify:i18n
npm run verify:i18n-hardcoded-regressions
npm run verify:agent-docs

npm run verify:contracts:static
npm test
npm run build
npm run ci
```

Run new focused tests separately and record exact results.

Never report unexecuted commands as passing.

---

# 22. Definition of Done

- [ ] All four Fraterna endpoints pass trusted request validation and real routing tests.
- [ ] `/images/generations` no longer dies before route resolution.
- [ ] Unknown endpoints remain blocked.
- [ ] Fraterna 401/403 no longer claims Venice definitively rejected the key.
- [ ] Fraterna stream/network errors no longer masquerade as Venice errors.
- [ ] Inspector exposes effective upstream and route reason.
- [ ] Route selector handles failed/rejected IPC cleanly.
- [ ] Focused route-panel UI tests exist.
- [ ] Settings links to current Fraterna docs safely.
- [ ] canonical Fraterna doc has no embeddings/“zero privacy surface” drift.
- [ ] security model no longer marks `/models` Venice-only.
- [ ] `docs/summary_of_work.md` matches actual HEAD/publication.
- [ ] stale source comments are corrected.
- [ ] route remains part of the TanStack Query key.
- [ ] multi-hook reset behavior has a regression test.
- [ ] local validation is green.
- [ ] final exact-SHA hosted CI is `completed/success`.
- [ ] final exact-SHA CodeQL is `completed/success`.
- [ ] no secrets/raw prompts are committed to artifacts.
- [ ] local and remote `main` match after any authorized publication.

---

# 23. Do Not Do

- Do not replace the design with a free-form base URL.
- Do not add Fraterna as a regular fallback provider.
- Do not create a second API-key store.
- Do not expose host/base URL choice to renderer input.
- Do not bypass `validateVeniceIpcRequest()` to fix `/images/generations`.
- Do not globally broaden path validation without contract evidence.
- Do not direct the browser renderer to Fraterna.
- Do not remove safety/response guards.
- Do not claim Fraterna has Venice's privacy/retention guarantees.
- Do not assume every Fraterna 401/403 means the Venice key is invalid.
- Do not mass-rewrite historical audits.
- Do not force-push.

---

# 24. Repair Priority

1. **FRAT-AUD-001** — unreachable `/images/generations`.
2. **FRAT-AUD-002** — route-aware connection validation.
3. **FRAT-AUD-004** — route-aware transport errors.
4. **FRAT-AUD-003** — effective-route observability.
5. **FRAT-AUD-005** — route selector rejection handling.
6. **FRAT-AUD-006 / 007** — UI tests + docs link.
7. **FRAT-AUD-008** — canonical docs/source comments.
8. **FRAT-AUD-009** — reproduce/reset race first.
9. **FRAT-AUD-010 / 011** — external acceptance/localization.

---

# 25. Completion Report Template

```text
Baseline HEAD:
Final local HEAD:
Final remote HEAD:
Branch:

Findings closed:
- FRAT-AUD-001:
- FRAT-AUD-002:
...

Files changed:

Fraterna route matrix:
GET  /models:
POST /chat/completions:
POST /image/generate:
POST /images/generations:

Direct-Venice proof:
- /embeddings:
- /image/edit:
- /video/queue:
...

Security:
- raw key exposed to renderer: NO
- arbitrary base URL introduced: NO
- validation bypass introduced: NO

Focused tests:
<command + result>

Full validation:
<command + result>

Hosted CI:
run:
status:
conclusion:

CodeQL:
run:
status:
conclusion:

Live Fraterna smoke:
run/not-run
reason:
safe outcome:

Remaining risks:
```

Update `docs/summary_of_work.md` before completion and ensure its machine-readable state matches the actual final SHA.

---

# 26. Final Assessment

The feature's main architecture should be retained.

The highest-priority remaining defect is a **contract split between validation and routing**: Fraterna's `/images/generations` route is implemented downstream but rejected upstream.

The second high-priority defect is **route-blind connection diagnosis**, which can instruct the user to replace a valid Venice API key when the actual issue may be Fraterna membership or availability.

After those are fixed, effective-upstream observability is the most important quality improvement because a Fraterna-selected profile intentionally produces mixed Venice/Fraterna traffic.

The feature is close to complete, but current `main` should not be considered fully closed against the original Fraterna handoff until the P1/P2 items above are remediated and the final exact-SHA hosted CI/CodeQL are verified.
