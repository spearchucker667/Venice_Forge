# Venice Forge — Venice API 2026-09-16 Feature-Gap Implementation Handoff

**Status:** READY FOR IMPLEMENTATION PLANNING  
**Research date:** 2026-09-16  
**Repository:** `spearchucker667/Venice_Forge`  
**Authoritative branch:** `main`  
**Audited live-main SHA:** `59b61c43c2aea95fb806cd081894dad0154714ea`  
**Current declared app version:** `3.0.0-beta.3`  
**Latest upstream Venice changelog reviewed:** September 9, 2026 (covering July 28–August 31, 2026)  
**Primary mission:** Bring Venice Forge up to date with newly exposed Venice API capabilities and contract changes that are either absent, only documented, or only partially represented in the current app.

---

## 0. Executive Summary

Venice Forge already implements a large majority of Venice's core inference/media surface. The current runtime endpoint allowlist includes:

- `GET /models`
- `GET /models/traits`
- `GET /models/compatibility_mapping`
- `GET /image/styles`
- `POST /chat/completions`
- `POST /image/generate`
- `POST /image/upscale`
- `POST /image/edit`
- `POST /image/multi-edit`
- `POST /image/background-remove`
- `POST /augment/search`
- `POST /augment/scrape`
- `POST /augment/text-parser`
- `POST /embeddings`
- video queue/retrieve/quote/complete/transcription
- audio queue/retrieve/quote/complete/speech/voices/transcription
- character list/detail via the parameterized `/characters` family

The app also already has meaningful support for:

- web search/scraping and citations;
- structured-output usage in at least targeted internal flows;
- image prompt enhancement;
- image style references;
- asynchronous media jobs;
- image editing and multi-edit;
- voice cloning;
- reference images/videos/audio for current video flows;
- video/audio quote and approval handling;
- `Retry-After` aware transport behavior;
- model capability/pricing metadata;
- tool/function-call handling;
- privacy capability metadata including `supportsE2EE`;
- prompt-cache keys;
- reasoning/function-calling fields in provider-adapter compatibility logic;
- extensive Electron/main-process safety and endpoint validation.

Therefore, this work order is **not** a rewrite and must not reimplement features already present.

The highest-value gaps are:

1. **P0 — Venice contract synchronization and caller-scoped `/models` correctness**
   - add the new explicit `model_spec.uncensored` field;
   - stop inferring uncensored status from traits where the explicit field is present;
   - treat `/models` as caller/profile scoped and non-cacheable across credentials;
   - preserve negotiated/promotional pricing returned to the calling API key;
   - normalize newer privacy/output-format/model metadata from upstream.

2. **P1 — Billing & usage center**
   - add `GET /billing/usage-history` as the canonical history route;
   - add balance and usage-analytics support where still present in current OpenAPI;
   - explicitly avoid building new code against deprecated `GET /billing/usage`.

3. **P1 — API rate-limit semantics**
   - parse Venice's new typed rate-limit reason values:
     `RPM`, `TPM`, `RPD`, `FAILED_REQUESTS`, `UNSUPPORTED_FEATURE_REQUESTS`;
   - preserve the app's existing `Retry-After` handling;
   - expose actionable rate-limit state in Status/diagnostics and API-key settings.

4. **P1 — E2EE request selection**
   - runtime model metadata already knows `supportsE2EE`;
   - the current `VeniceParameters` request type does not expose `enable_e2ee`;
   - add an explicit, capability-gated E2EE toggle where upstream still documents it;
   - never offer E2EE through the alpha Responses API if upstream continues to exclude it.

5. **P1 — September Seedance/media contract delta**
   - add `bitrate_mode: "standard" | "high"` for Seedance 2.0/2.5 where supported;
   - consume upstream source-matched aspect-ratio/duration semantics;
   - enforce the current documented video prompt/negative-prompt ceiling (20,000 chars where applicable);
   - reconcile quote/cost logic with input-image-based video pricing;
   - consume model-advertised TTS output formats rather than static assumptions when available.

6. **P2 — Native Venice chat file/video inputs**
   - current canonical `ContentPart` supports only `text`, `image_url`, and `input_audio`;
   - add official OpenAI-compatible file input content and native video input where capability metadata permits;
   - retain existing local Documents ingestion as a distinct local-first path.

7. **P2 — Responses API (alpha)**
   - add `POST /responses` as an **explicit experimental transport**, not as a silent replacement for `/chat/completions`;
   - support typed output blocks, streaming, reasoning/function calls/web-search blocks;
   - keep stateless semantics explicit;
   - do not route E2EE models through it while upstream says E2EE is unsupported.

8. **P2 — Venice API-key administration**
   - add list/get/create/update/delete key operations;
   - add per-key privacy setting support;
   - add rate-limit configuration/logs;
   - add child-key spend caps if they remain in the current OpenAPI;
   - keep all secret material in the trusted main-process/OS secure-storage boundary.

9. **P2/P3 — x402 wallet authentication**
   - optional alternate authentication mode for supported paid Venice routes;
   - wallet balance/top-up/transaction views;
   - private keys must never enter renderer state, logs, IndexedDB, or plain config.

10. **P3 — Crypto RPC integration**
    - live networks discovery;
    - JSON-RPC single/batch requests;
    - idempotency for transaction relay;
    - read-only tools first; transaction relay must require explicit approval;
    - never hold or transmit signing keys to Venice.

11. **P3 — Character reviews**
    - add the reviews subresource only after verifying its exact current path/schema;
    - integrate into Character/RP UI without conflating Venice-hosted reviews with local character-card metadata.

12. **Investigate / optional**
    - Venice's provider-side agent-tools discovery endpoint announced in the 2026 changelog;
    - OpenAI-compatible `/images/generations` on the Venice path;
    - neither is a higher priority than the correctness/security work above.

---

# 1. Source of Truth and Evidence Rules

The implementation agent must use this authority order for this work:

1. Current user task.
2. Current repository `AGENTS.md`.
3. Current checked-out source/tests/verifiers on `main`.
4. Current checked-in `docs/reference/Venice_swagger_api.yaml`.
5. Live official Venice OpenAPI/API reference.
6. Live official Venice changelog.
7. Checked-in `docs/reference/Venice_api_LLM_info.md`.
8. Historical audits, old handoffs, comments, and commit messages only as evidence.

Do not treat this handoff as permission to override a newer live Venice contract.

## Required upstream references

Review these before implementation:

- Venice changelog:  
  https://featurebase.venice.ai/changelog
- Venice API docs index:  
  https://docs.venice.ai/llms.txt
- Venice API overview:  
  https://docs.venice.ai/guides/overview
- API specification:  
  https://docs.venice.ai/api-reference/api-spec
- Chat completions:  
  https://docs.venice.ai/api-reference/endpoint/chat/completions
- Models:  
  https://docs.venice.ai/api-reference/endpoint/models/list
- File inputs:  
  https://docs.venice.ai/guides/features/file-inputs
- TEE & E2EE:  
  https://docs.venice.ai/guides/features/tee-e2ee-models
- Prompt caching:  
  https://docs.venice.ai/guides/features/prompt-caching
- Seedance:  
  https://docs.venice.ai/guides/media/seedance-2-0
- x402:  
  https://docs.venice.ai/guides/integrations/x402-venice-api
- Crypto RPC for agents:  
  https://docs.venice.ai/guides/integrations/crypto-rpc-agents

Also inspect the exact current API-reference pages discovered from `llms.txt` for:

- billing balance;
- billing usage-history;
- usage analytics;
- API-key CRUD;
- API-key rate limits and rate-limit logs;
- character reviews;
- x402 balance/top-up/transactions;
- crypto network discovery/RPC.

## Important source drift already observed

At audited `main`:

- `docs/DOCS_INDEX.md` identifies the local OpenAPI snapshot as newer than August 2026.
- `src/shared/venice-media-contract/types.ts` still states that it was sourced from Swagger schema `20260814.194349`.
- The September Venice changelog introduces fields/semantics not found in the current runtime contracts, including `model_spec.uncensored`, `bitrate_mode`, typed rate-limit reasons, and the usage-history route.

**Conclusion:** Phase 0 must reconcile the generated/manual runtime contracts against the current upstream schema before feature implementation.

---

# 2. Repository Baseline

## 2.1 Live-main baseline

The comparison was performed against:

```text
branch: main
SHA: 59b61c43c2aea95fb806cd081894dad0154714ea
commit: fix: reject incomplete SSE chat responses
commit timestamp: 2026-09-15T22:11:58Z
```

Do not implement from an older archive or prior handoff.

Before editing locally, obey `AGENTS.md` and verify:

```bash
set -euo pipefail

cd /Users/super_user/Projects/Venice_Forge

test "$(git rev-parse --show-toplevel)" = "/Users/super_user/Projects/Venice_Forge"
test "$(git branch --show-current)" = "main"

git status --short
git rev-parse HEAD
git remote -v

node --version
npm --version
node -e 'const p=require("./package.json"); console.log(p.version, p.engines)'
```

Expected repository contract at the audited baseline:

```text
Venice Forge: 3.0.0-beta.3
Node: >=22.15.0 <23.0.0
npm: >=10
branch: main
```

Do not reset, stash, discard, or overwrite user-owned work to obtain a clean tree.

## 2.2 Current Venice endpoint boundary

At the audited SHA, `src/shared/validation.ts` allows:

```text
/models
/models/traits
/models/compatibility_mapping
/image/styles
/chat/completions
/image/generate
/image/upscale
/augment/search
/augment/scrape
/augment/text-parser
/video/queue
/video/retrieve
/video/quote
/video/complete
/video/transcriptions
/image/edit
/image/multi-edit
/image/background-remove
/embeddings
/audio/queue
/audio/retrieve
/audio/quote
/audio/complete
/audio/speech
/audio/voices
/audio/transcriptions
```

The `/characters` family is separately validated for:

```text
GET /characters
GET /characters/{slug}
```

The validator intentionally rejects nested character paths, which means character reviews are not currently reachable through this transport.

The endpoint boundary currently does **not** include:

```text
/responses
/billing/*
/api_keys/*
/x402/*
/crypto/rpc/*
/crypto/rpc/networks
/characters/{slug}/...reviews...
```

Do not simply add wildcard prefixes. Every new family must have narrowly defined methods, path-parameter validators, payload limits, and tests.

---

# 3. Feature-Gap Matrix

| ID | Area | Upstream capability/change | Current app state | Classification | Priority |
|---|---|---|---|---|---|
| VF-API-20260916-001 | Contract sync | Latest Venice API schema/changelog fields | Media contract header still references 2026-08-14 schema | CONTRACT DRIFT | P0 |
| VF-API-20260916-002 | Models | `model_spec.uncensored` | App infers uncensored from traits in agent model mapping | CONFIRMED GAP | P0 |
| VF-API-20260916-003 | Models | `/models` caller-specific visibility/rates and non-cacheability | Existing model caching must be audited for credential/profile scoping | CORRECTNESS RISK | P0 |
| VF-API-20260916-004 | Pricing | chat response `cost` reflects negotiated partner rates; image promos exposed in model pricing | Pricing types exist, but caller-specific pricing behavior must be verified end-to-end | PARTIAL / VERIFY | P0 |
| VF-API-20260916-005 | Billing | `/billing/usage-history` replaces deprecated `/billing/usage` | Billing family not allowed; no runtime usage-history implementation found | CONFIRMED GAP | P1 |
| VF-API-20260916-006 | Billing | balance / analytics | No billing transport in current endpoint allowlist | CONFIRMED GAP | P1 |
| VF-API-20260916-007 | Rate limits | typed 429 reason: RPM/TPM/RPD/FAILED_REQUESTS/UNSUPPORTED_FEATURE_REQUESTS | `Retry-After` supported; typed reason not found | PARTIAL GAP | P1 |
| VF-API-20260916-008 | Privacy | request-level E2EE selector for capable models | `supportsE2EE` metadata exists; `VeniceParameters.enable_e2ee` absent | CONFIRMED GAP | P1 |
| VF-API-20260916-009 | Video | Seedance `bitrate_mode` standard/high | No `bitrate_mode` found in repository | CONFIRMED GAP | P1 |
| VF-API-20260916-010 | Video | source-matched duration/aspect ratio | Existing video contract uses strings but UI/validation semantics need update | CONTRACT DRIFT | P1 |
| VF-API-20260916-011 | Video | 20,000-char prompt and negative-prompt limits where documented | Must reconcile existing validators with latest model/route constraints | VERIFY/REMEDIATE | P1 |
| VF-API-20260916-012 | Video pricing | xAI/reference-video pricing can depend on number of input images | Existing quote type lacks an obvious reference-image-count field | LIKELY GAP — VERIFY SPEC | P1 |
| VF-API-20260916-013 | TTS | model metadata publishes supported output formats; redundant default voice omitted | Current response-format support exists; metadata-driven UI needs verification | PARTIAL GAP | P1 |
| VF-API-20260916-014 | Chat inputs | OpenAI-compatible file inputs GA | Canonical `ContentPart` lacks file content variant | CONFIRMED GAP | P2 |
| VF-API-20260916-015 | Chat inputs | native video input | Canonical `ContentPart` lacks `video_url` | CONFIRMED GAP | P2 |
| VF-API-20260916-016 | Chat caching | `prompt_cache_retention` and current cache controls | `prompt_cache_key` exists; retention field not found | CONFIRMED GAP | P2 |
| VF-API-20260916-017 | Responses | `POST /responses` alpha | Docs mention it; runtime allowlist does not | CONFIRMED GAP | P2 |
| VF-API-20260916-018 | API keys | list/get/create/update/delete | No runtime implementation found | CONFIRMED GAP | P2 |
| VF-API-20260916-019 | API keys | per-key model privacy, rate-limit config/logs, child-key spend caps | No runtime implementation found | CONFIRMED GAP | P2 |
| VF-API-20260916-020 | x402 | keyless wallet auth, balance/top-up/transactions | Docs only; no runtime implementation found | CONFIRMED GAP | P2 |
| VF-API-20260916-021 | Crypto | network discovery + JSON-RPC proxy | Docs only; no runtime implementation found | CONFIRMED GAP | P3 |
| VF-API-20260916-022 | Characters | character reviews | Upstream docs list it; validator permits only list/detail | CONFIRMED GAP | P3 |
| VF-API-20260916-023 | Provider tools | provider agent-tools discovery endpoint announced in changelog | No implementation found | INVESTIGATE | P3 |
| VF-API-20260916-024 | OpenAI compatibility | Venice `/images/generations` | Third-party adapters know this route; Venice endpoint allowlist does not | OPTIONAL | P3 |

---

# 4. Features Already Present — Do Not Rebuild

The implementation agent must first prove a feature is missing before adding duplicate infrastructure.

The audited repo already contains evidence for the following.

## 4.1 Web retrieval and parsing

Already present in endpoint validation:

```text
POST /augment/search
POST /augment/scrape
POST /augment/text-parser
```

Do not create a second search subsystem just because newer Venice docs advertise these tools.

## 4.2 Image Studio API breadth

Already present:

- generate;
- edit;
- multi-edit;
- upscale;
- background removal;
- styles;
- prompt enhancement;
- prompt-optimization thinking control;
- style references;
- variants;
- web-search-assisted image generation;
- safe-mode handling.

`src/shared/venice-media-contract/types.ts` and payload builders already represent many of these fields.

## 4.3 Audio

Already present:

- speech/TTS;
- transcription;
- voice cloning endpoint;
- queued audio/music;
- retrieve;
- quote;
- complete;
- `loop`;
- lyrics/instrumental fields;
- voice/language/speed controls.

Do not rewrite these flows solely to add new TTS metadata.

## 4.4 Video

Already present:

- quote;
- queue;
- retrieve;
- complete;
- transcription;
- image/start image;
- end image;
- reference images;
- reference videos;
- reference audio;
- scene images;
- Seedance consent object;
- paid-submission approval infrastructure.

Extend the canonical video contract rather than bypassing it.

## 4.5 Structured responses and function calling

The repository has evidence of:

- tool call representations and streaming tool-call handling;
- structured `response_format` usage in targeted flows;
- provider-adapter support for `tools`, `tool_choice`, `parallel_tool_calls`, `reasoning`, and `reasoning_effort`.

The task is to normalize canonical request contracts and user-facing capability gating, **not** to invent a second function-calling engine.

## 4.6 Retry behavior

The app already honors `Retry-After` in its Venice client and proxy paths.

The new work is:

- preserve current bounded backoff;
- parse and expose Venice's typed rate-limit reason;
- avoid retrying non-idempotent paid requests unsafely.

---

# 5. Phase 0 — Synchronize the Venice Contract First

**Priority:** P0  
**Blocking:** all later phases

## Objective

Regenerate/reconcile local Venice API reference data and identify every runtime contract drift introduced since the media types were last normalized.

## Required commands

From current `main`:

```bash
npm ci
npm run docs:venice:sync
npm run verify:venice-api-docs
npm run verify:venice-contract-drift
git status --short
git diff -- docs/reference src/shared src/types
```

Do not blindly commit generated changes. Review them.

## Required comparison targets

Inspect at minimum:

```text
docs/reference/Venice_swagger_api.yaml
docs/reference/Venice_api_LLM_info.md
src/shared/validation.ts
src/shared/veniceSafeMode.ts
src/types/venice.ts
src/shared/venice-media-contract/types.ts
src/shared/venice-media-contract/payload-builders.ts
src/shared/venice-media-contract/capabilities.ts
src/config/image-model-capabilities.ts
src/services/veniceClient/*
electron/services/veniceClient.ts
server.ts
```

## Deliverable

Create a machine-readable or test-backed delta ledger covering:

- new endpoints;
- removed/deprecated endpoints;
- new fields;
- changed enum values;
- changed required/optional status;
- new response headers;
- changed error bodies;
- model metadata changes;
- billing/auth requirements;
- privacy constraints.

Prefer generating contract tests from the current OpenAPI shape over duplicating schema prose manually.

## Phase-0 acceptance

- no implementation uses a deprecated upstream endpoint when a replacement exists;
- media/chat/model types correspond to the current OpenAPI;
- `verify:venice-contract-drift` detects deliberate test drift;
- all new endpoint additions have explicit method/path validation.

---

# 6. Phase 1 — Model Metadata, Privacy, Pricing, and Cache Correctness

**IDs:** 002, 003, 004  
**Priority:** P0

## 6.1 Add explicit uncensored metadata

Upstream now returns:

```text
model_spec.uncensored
```

The current agent-model mapper uses a trait inference comparable to:

```text
traits.includes("most_uncensored")
```

That is no longer sufficient.

### Required rule

Use precedence:

```text
if model_spec.uncensored is explicitly boolean:
    use it
else:
    fall back to legacy inference only for old/fallback records
```

Do not infer from model-name substrings when live explicit metadata exists.

### Expected touchpoints

Likely:

```text
src/types/venice.ts
src/hooks/use-agent-models.ts
model normalization/selectors
model detail UI
model filter/badge UI
fallback model normalization
tests around live/fallback model merge
```

## 6.2 Credential/profile-scope `/models`

Upstream states that model visibility and negotiated rates can vary by caller and that `/models` responses should not be cached as globally reusable data.

Audit:

- React/query caches;
- Zustand caches;
- IndexedDB persistence;
- background fetch caches;
- proxy/server caching;
- Electron client caches;
- fallback merge logic.

### Required invariants

A `/models` result obtained under credential/profile A must never be reused as authoritative provider state for profile B.

A reconnect or active-profile switch must invalidate caller-specific provider catalog data.

Do not override upstream no-cache semantics with a shared application cache.

A local static fallback catalog may remain, but it must be clearly marked fallback and must not overwrite live caller-specific:

- visibility;
- privacy;
- negotiated pricing;
- promotional pricing;
- deprecation state.

## 6.3 Pricing

Existing `VeniceModelPricing` is reasonably rich. Extend normalization only where current upstream has new fields.

Ensure UI labels distinguish:

```text
provider/current caller rate
public/list rate (only if separately available)
estimated pre-request cost
actual response cost
```

Never calculate "actual" cost from static list pricing when the response supplies a caller-specific cost.

## Acceptance tests

Add tests for:

- explicit uncensored true/false overriding trait inference;
- legacy fallback inference;
- account/profile switch invalidating live catalog;
- same model ID with different caller pricing not leaking across profiles;
- promotional price display;
- response `cost` preferred over local estimate for completed requests;
- deprecation metadata not hidden by fallback merge.

---

# 7. Phase 2 — Billing & Usage Center

**IDs:** 005, 006  
**Priority:** P1

## Objective

Add first-class usage/balance observability to Venice Forge without exposing credentials to the renderer.

## Canonical route requirement

Use:

```text
GET /billing/usage-history
```

when verified in current OpenAPI.

Do **not** implement new UI against:

```text
GET /billing/usage
```

because Venice marks it deprecated.

Also verify current contracts for:

```text
GET /billing/balance
GET /billing/usage-analytics
```

Do not guess endpoint paths if the current spec differs.

## Architecture

Implement through the existing trusted Venice request path:

```text
renderer
  -> typed preload API / existing Venice dispatcher
  -> main-process validation
  -> Venice API
  -> normalized non-secret DTO
  -> renderer
```

Do not let renderer code attach authorization headers itself.

## UI

Recommended location:

```text
Settings / API & Billing
```

and/or:

```text
Status -> Usage
```

Use existing design primitives/theme tokens.

Suggested surfaces:

1. **Balance card**
   - spendable credits;
   - DIEM/USD breakdown only if provided;
   - refresh action;
   - last updated timestamp.

2. **Usage summary**
   - current period;
   - requests;
   - token/media cost;
   - total spend.

3. **Usage-history table**
   - timestamp;
   - endpoint/modality;
   - model;
   - normalized request ID when safe;
   - cost;
   - status;
   - pagination.

4. **Analytics**
   - model/modality aggregation;
   - time window;
   - no sensitive prompt/body retention.

## Security/privacy

Do not log or persist:

- prompts;
- response text;
- API key;
- auth headers;
- raw provider response if it contains sensitive account metadata.

If usage history contains provider-side identifiers, normalize only what is needed.

## Tests

- endpoint allowlist method tests;
- pagination validation;
- date/range validation;
- renderer cannot inject alternate account/profile ID;
- 401/403/429/5xx states;
- stale request cancellation on profile switch;
- sensitive-field redaction;
- empty-history state;
- large history virtualization/pagination.

---

# 8. Phase 3 — Typed Rate Limits

**ID:** 007  
**Priority:** P1

## Upstream change

Venice 429 errors now document reason values:

```text
RPM
TPM
RPD
FAILED_REQUESTS
UNSUPPORTED_FEATURE_REQUESTS
```

## Existing functionality to preserve

The repo already handles `Retry-After`.

Do not replace bounded backoff.

## Add

A normalized error shape, conceptually:

```ts
type VeniceRateLimitReason =
  | "RPM"
  | "TPM"
  | "RPD"
  | "FAILED_REQUESTS"
  | "UNSUPPORTED_FEATURE_REQUESTS"
  | "UNKNOWN";

interface VeniceRateLimitInfo {
  reason: VeniceRateLimitReason;
  retryAfterMs?: number;
  resetAt?: string;
  limit?: number;
  remaining?: number;
}
```

Use exact upstream JSON/header names from current spec; do not assume this illustrative shape matches wire format.

## UX mapping

- RPM: "Request-per-minute limit reached"
- TPM: "Token-per-minute limit reached"
- RPD: "Daily request limit reached"
- FAILED_REQUESTS: "Failed-request quota reached"
- UNSUPPORTED_FEATURE_REQUESTS: "Unsupported-feature request quota reached"
- UNKNOWN: generic rate limit

Expose technical details in Status/Inspector, not verbose internals in ordinary chat toasts.

## Retry rules

- Retry only when the operation is safe and policy permits.
- Respect `Retry-After`.
- Do not replay billable non-idempotent POSTs merely because a 429 occurred.
- For media submissions, keep existing paid-submission/approval semantics.

---

# 9. Phase 4 — E2EE Request Selection

**ID:** 008  
**Priority:** P1

## Finding

The app's model capability type already includes:

```text
supportsE2EE?: boolean
```

but `VeniceParameters` does not expose:

```text
enable_e2ee
```

## Implementation

After confirming current OpenAPI field spelling/location, add the request control to the canonical chat contract.

Never set it merely because the model supports E2EE.

The state must be explicit and capability-gated.

Suggested UI:

```text
Chat model controls / Privacy
  Privacy mode:
    Provider default
    E2EE
```

Only show E2EE when:

```text
model.model_spec.capabilities.supportsE2EE === true
```

If upstream supports a richer privacy-mode enum, prefer it over a boolean.

## Required behavior

- switching to a model without E2EE resets or disables the E2EE override;
- persisted conversation settings must not force E2EE onto unsupported models;
- fallback-provider routes must strip Venice-only E2EE fields;
- Responses API must not accept the E2EE path while upstream documents it unsupported;
- diagnostics may record `e2eeRequested: true/false` but never plaintext prompt/response.

## Tests

- supported model + enabled -> field sent;
- supported model + default -> field omitted/provider default;
- unsupported model -> control unavailable and field stripped;
- provider fallback -> Venice-only field stripped;
- profile/model switch;
- streaming behavior unchanged;
- no secrets/body leakage in Inspector.

---

# 10. Phase 5 — Seedance and Media Contract Delta

**IDs:** 009–013  
**Priority:** P1

## 10.1 `bitrate_mode`

Add only where model metadata/current docs indicate support:

```text
standard
high
```

Do not show it globally for every video model.

Recommended type:

```ts
type VideoBitrateMode = "standard" | "high";
```

Wire field must follow current OpenAPI exactly.

## 10.2 Source-matched duration/aspect ratio

Do not hardcode guessed sentinel values.

Read the current Seedance guide/OpenAPI and normalize the documented options through `VideoConstraints`.

The UI should:

- populate from live model constraints;
- allow source-matched behavior only for applicable modes;
- resolve invalid persisted values when model/mode changes;
- show the effective output settings before submission.

## 10.3 Prompt length

Where current route/model docs specify a 20,000-character maximum:

- update UI counter;
- update payload/schema validation;
- update tests;
- do not silently truncate;
- negative prompt gets its own validation.

Prefer model/route-provided constraints over a single global magic number if the API exposes them.

## 10.4 Input-image pricing

Upstream notes xAI video pricing is per input image.

Audit:

```text
VideoQuoteLogicalRequest
VideoQuoteWirePayload
quote service
approval dialog
media job cost display
agent media approval
```

If current OpenAPI has a reference-image count/list field for quote, add it.

If quote API derives cost from the exact request instead, refactor so the quote is generated from the same canonical payload inputs as the queued request.

**Invariant:** the user-approved quote must correspond to the material request that is submitted.

## 10.5 TTS output formats

The app already accepts:

```text
mp3
opus
aac
flac
wav
pcm
```

Do not assume every model supports all formats.

If `/models` now exposes per-model formats:

- normalize them;
- populate TTS format selector dynamically;
- fall back to current conservative defaults only when live metadata is absent;
- remove invalid persisted format on model change.

## Tests

- `bitrate_mode` gated by model;
- source-match option transforms correctly;
- prompt limits;
- quote hash changes when input image set changes;
- approval invalidates if payload changes;
- TTS output format per model;
- model switch repairs invalid media settings;
- safe-mode behavior unchanged.

---

# 11. Phase 6 — Native File and Video Inputs for Chat

**IDs:** 014, 015  
**Priority:** P2

## Current limitation

Canonical `ContentPart` at the audited SHA only covers:

```text
text
image_url
input_audio
```

It does not model:

```text
file
video_url
```

## Important product distinction

Venice Forge already has a substantial local Documents/attachment system.

Do **not** replace it.

Provide two explicit attachment paths when appropriate:

1. **Local context**
   - local ingestion/chunking;
   - existing privacy/storage behavior;
   - useful for local-first workflows.

2. **Native Venice input**
   - provider-supported file/video content passed directly in the chat request;
   - only when the selected model/endpoint supports it;
   - clearly indicate that the file is being sent to the provider API.

## Type design

Use exact current OpenAI-compatible Venice schema.

Do not invent `file_id`/`file_data` fields from memory.

The canonical content union should be discriminated and exhaustive.

## Video inputs

Use `supportsVideoInput` for gating.

Validate:

- URL/data form;
- supported MIME/format;
- size;
- remote URL policy;
- provider errors for invalid/unreachable URLs.

## File inputs

Validate:

- accepted extension/MIME from current docs;
- size;
- source;
- local path never sent as a raw filesystem path;
- upload/encoding format;
- content limits.

## UX

Attachment menu can offer:

```text
Attach for local context
Send as native Venice file
Send video to model
```

Only show provider-native options when capability metadata supports them.

## Tests

- content-part serializer;
- unsupported model rejection;
- remote URL validation error rendering;
- attachment size limits;
- privacy disclosure;
- no absolute local path in request;
- no base64 payload in diagnostics;
- conversation persistence handles native-part metadata safely.

---

# 12. Phase 7 — Prompt Cache Retention and Canonical Chat Contract Cleanup

**ID:** 016  
**Priority:** P2

The app already has `prompt_cache_key`.

Current upstream docs expose additional cache controls such as `prompt_cache_retention`.

Add only fields confirmed by the synced OpenAPI.

Use capability-aware or provider-aware serialization.

Do not send unsupported Venice-specific cache fields to fallback providers.

Add a focused contract test that builds the exact Venice chat payload and ensures:

- known OpenAI-compatible fields survive;
- Venice-only fields are nested/top-level correctly;
- fallback providers strip fields they do not support;
- unknown fields are rejected or intentionally passed according to the canonical contract.

This phase is a good point to reconcile `ChatCompletionRequest` with request builders because the public type currently under-represents fields that other internal paths already use.

---

# 13. Phase 8 — Responses API (Alpha)

**ID:** 017  
**Priority:** P2 / EXPERIMENTAL

## Product stance

Do not replace the existing chat-completions transport.

Add Responses as a feature-flagged transport for:

- agent workflows;
- typed response blocks;
- compatible web-search/function-call use;
- OpenAI Responses compatibility testing.

Label it **Alpha / Experimental** in UI.

## Endpoint

Verify current spec and then allow:

```text
POST /responses
```

## Required architecture

Create a separate normalized client contract:

```text
VeniceResponsesRequest
VeniceResponsesEvent
VeniceResponsesOutputBlock
```

Do not force Responses events into `ChatCompletionChunk` if their semantics differ.

Implement an adapter from Responses events to app conversation/tool events only where lossless.

## Must support

Based on current Venice docs:

- stateless request semantics;
- streaming SSE;
- typed output blocks;
- reasoning blocks;
- message blocks;
- function-call blocks;
- web-search blocks where available;
- API-key auth;
- x402 auth only after x402 phase is explicitly enabled.

## Must not support

While upstream says E2EE is unsupported:

- no E2EE model selection;
- fail before dispatch if an E2EE-only configuration is selected;
- direct user to `/chat/completions`.

## Failure handling

Responses has its own parser/tests.

Do not reuse assumptions such as a chat-completions `[DONE]` terminator unless the current Responses SSE contract actually uses the same framing.

## Acceptance

- flag off -> no behavioral change;
- flag on -> simple text response;
- stream;
- reasoning event;
- function call loop;
- web search event;
- cancellation;
- malformed/incomplete stream;
- 401/402/429/5xx;
- E2EE rejection;
- no duplicate persistence.

---

# 14. Phase 9 — API-Key Administration & Privacy

**IDs:** 018, 019  
**Priority:** P2

## Scope

After current API-reference verification, support:

- list keys;
- key metadata;
- create;
- update;
- delete/revoke;
- per-key model privacy;
- key rate limits;
- rate-limit logs;
- child API keys/spend caps if still current.

## Security model

This is privileged account administration.

### Hard requirements

- all provider calls originate in trusted main process;
- renderer never receives the active stored secret;
- a newly created key secret may be shown only according to upstream response semantics and should be treated as one-time sensitive material;
- do not write a new key into logs, Redux/Zustand devtools, diagnostics, crash reports, clipboard automatically, or persistent plain-text state;
- use OS secure storage for any key the user explicitly chooses to save as a Venice Forge profile;
- destructive delete/revoke requires confirmation.

## Important bootstrap problem

If the current active key lacks permission to administer keys, show a permission error. Do not fall back to browser scraping or use another credential implicitly.

## UI

Recommended:

```text
Settings
  Providers
    Venice
      Connection
      API Keys
      Privacy
      Rate Limits
      Billing
```

Keep current theme engine, spacing, typography, motion, RTL, keyboard navigation, and accessible-dialog patterns.

## Key list row

Show only safe metadata:

- key name/label;
- masked key identifier if upstream provides one;
- created time;
- last-used time if exposed;
- status;
- privacy mode;
- spend cap;
- rate-limit tier.

Never show the current secret value after the one-time creation flow.

## Tests

- no secret in renderer state after modal closes;
- delete confirmation;
- privacy update;
- spend cap validation;
- active key deletion guard;
- 403 insufficient privilege;
- profile invalidation after revocation;
- rate-limit log pagination;
- redaction snapshots.

---

# 15. Phase 10 — x402 Wallet Authentication

**ID:** 020  
**Priority:** P2/P3, EXPERIMENTAL

## Rationale

Venice now supports wallet-authenticated paid inference without an API key on supported routes.

The current app has no x402 runtime integration.

## Security position

This feature must be isolated.

**Never store an EVM/Solana private key in renderer state, localStorage, IndexedDB, app logs, or plain configuration.**

Preferred implementation options:

1. **External wallet signer / WalletConnect-style integration**, if compatible with the desired desktop flow.
2. **OS-secure-storage key vault** only if the product explicitly supports local key custody and the threat model is documented.
3. **Environment/agent-runner signer** for headless/advanced workflows.

Do not invent a custom crypto vault casually.

## Venice x402 surfaces

Current docs describe:

```text
X-Sign-In-With-X
GET  /x402/balance/{walletAddress}
POST /x402/top-up
GET  /x402/transactions/{walletAddress}
```

and supported paid inference routes including chat, Responses, media, embeddings.

Verify exact current paths and chain support before implementation.

## UI

Keep x402 separated from normal API-key profiles:

```text
Venice authentication
  API key
  Wallet / x402 (Experimental)
```

Display:

- wallet address;
- network;
- spendable balance;
- transaction history;
- authentication expiration;
- explicit top-up confirmation.

## Spend safety

- no automatic top-up by default;
- no silent signing;
- no hidden transaction execution;
- cost confirmation for paid media remains active;
- surface `X-Balance-Remaining` safely.

---

# 16. Phase 11 — Crypto RPC

**ID:** 021  
**Priority:** P3 / OPTIONAL AGENT EXTENSION

## Product fit

This is useful for Venice Forge's agent/workflow tooling but it materially expands the security surface.

Implement only after P0–P2 features are stable.

## Upstream

Venice documents:

```text
GET  /crypto/rpc/networks
POST /crypto/rpc/{network}
```

with single/batch JSON-RPC and up to 100 batch items in documented flows.

## Architecture

Do not put arbitrary URLs into the endpoint allowlist.

Implement a strict family validator:

```text
/crypto/rpc/networks
/crypto/rpc/{validated-network-slug}
```

Network slug must come from live discovery and still pass a conservative regex/length check.

JSON-RPC request must validate:

- `jsonrpc === "2.0"`;
- request `id`;
- method string length;
- params JSON;
- max batch count;
- payload byte limit.

## Read/write split

Start with **read-only RPC tools**.

Transaction relay:

```text
eth_sendRawTransaction
```

must be a separately permissioned capability with user approval.

Venice must never receive a signing key. Sign locally and submit only signed raw transaction bytes.

## Idempotency

For transaction relay and any upstream-documented idempotent paid RPC path:

- generate/stabilize an `Idempotency-Key`;
- persist only non-secret idempotency metadata required for safe retry;
- reuse the same key only for the same request body;
- never generate a fresh key when retrying an uncertain submitted transaction unless the user explicitly intends a second submission.

## Agent-tool policy

Expose separately:

```text
rpc.read
rpc.sendSignedTransaction
```

Do not give the generic agent unrestricted JSON-RPC by default.

---

# 17. Phase 12 — Character Reviews

**ID:** 022  
**Priority:** P3

The current path validator only supports list/detail.

After verifying current API docs, add the exact character-review route.

Do not generalize to arbitrary nested `/characters/*` paths.

Suggested UI:

- Venice Character detail drawer/page;
- Reviews tab;
- paginated list;
- rating summary only if upstream provides one.

Keep local character-card ratings/notes distinct from provider-hosted Venice reviews.

Cache reviews by character slug with a short TTL; reviews are not credential secrets but visibility may still vary.

---

# 18. Phase 13 — Investigations / Optional Compatibility

## 18.1 Agent tools discovery

Venice changelog announced an agent-tools endpoint.

Before implementation:

- confirm it remains public/current in OpenAPI;
- determine whether it returns descriptors only or executable tool contracts;
- compare against Venice Forge's existing internal agent tool registry.

Do not dynamically execute arbitrary remote tool definitions.

If used, treat remote tool descriptors as untrusted metadata and map only known supported tool IDs to local executors.

## 18.2 `/images/generations`

The repo already recognizes `/images/generations` in fallback-provider adapter logic.

Adding it to Venice Forge's primary Venice transport provides little UI value because `/image/generate` exposes richer Venice-native features.

Implement only for:

- API playground;
- OpenAI compatibility testing;
- external bridge compatibility.

Do not duplicate Image Studio around it.

---

# 19. UI / Superdesign Guidance

The repository already contains a `.superdesign/init` context and has recently completed a broad reference-driven UI redesign plus visual/a11y QA.

Do not introduce a separate visual language.

## Required design invariants

All new UI must:

- use current shared primitives;
- use current CSS variables/theme tokens;
- work in existing light/dark/custom themes;
- contain no hardcoded theme colors when a semantic token exists;
- preserve current type scale and spacing;
- support RTL;
- support keyboard-only navigation;
- retain visible focus;
- use existing accessible dialogs/popovers/tables;
- obey reduced-motion preferences;
- fit the existing Settings/Status shell;
- pass current viewport/visual QA patterns.

## Recommended surface mapping

| Feature | Surface |
|---|---|
| model privacy/uncensored/pricing | existing model details/picker |
| E2EE selector | chat model/privacy controls |
| billing balance/history | Settings > Venice > Billing; Status summary |
| API keys | Settings > Venice > API Keys |
| rate limits | Settings > Venice > Rate Limits; Status |
| native file/video input | existing chat composer attachment menu |
| Responses API | Advanced/Developer or agent runtime settings |
| Seedance bitrate | existing Video advanced controls |
| x402 | Settings > Venice > Authentication |
| Crypto RPC | Agent/Tools or Advanced, not generic chat settings |
| character reviews | Character detail/RP surface |

If Superdesign is used during implementation, initialize/resume against the existing repository context rather than creating a greenfield design.

---

# 20. Electron / Security Architecture Rules

These are non-negotiable.

## Secrets

Provider credentials, wallet keys, auth signatures, payment headers, and newly created API-key secrets stay behind trusted main-process boundaries.

Renderer receives only:

- connection status;
- masked identifiers;
- balances;
- safe metadata;
- normalized errors.

## Endpoint validation

Do not replace the endpoint allowlist with:

```text
startsWith("/billing")
startsWith("/api_keys")
startsWith("/crypto")
```

without exact route-family validators.

Every family needs:

- allowed method;
- path segment validation;
- query validation;
- request schema;
- payload byte limit;
- response normalization.

## URLs

For remote image/video/file inputs:

- validate `https:` unless upstream explicitly supports another scheme;
- reject local/file/custom schemes;
- reject malformed URL;
- honor upstream provider validation errors;
- do not allow arbitrary renderer-controlled proxy targets.

## Diagnostics

Preserve existing redaction.

Never log:

- `Authorization`;
- `X-Sign-In-With-X`;
- `X-402-Payment`;
- private key;
- newly issued API key;
- prompt bodies;
- file bytes/base64;
- signed raw transaction unless explicitly determined safe by security review;
- complete usage/account payloads.

## Paid operations

Any new paid path must integrate with the app's existing cost/approval strategy.

Do not introduce automatic retry that can double bill.

---

# 21. Data Model / Persistence Guidance

Prefer additive, versioned persisted-state changes.

Do not persist volatile provider catalog responses as a cross-profile global truth.

Suggested persisted data:

```text
profile:
  authMode: api_key | x402
  provider settings
  selected privacy preference
  selected billing-view filters
  selected model IDs

conversation:
  model ID
  provider
  optional E2EE preference
  optional transport: chat_completions | responses
  attachment metadata (no raw private file path where avoidable)

media presets:
  model-specific bitrate/resolution/aspect selections
```

Do not persist:

```text
new API-key plaintext
wallet private key in renderer DB
SIWE/x402 payment authorization headers
raw billing response
raw API-key administration response
```

If a migration is needed:

- version it;
- make it idempotent;
- test old -> new;
- test missing/unknown fields;
- test rollback/failure behavior where applicable.

---

# 22. Error Handling Matrix

Implement normalized handling for:

| Status | Meaning/action |
|---|---|
| 400 | schema/parameter error; show field-level message where possible |
| 401 | invalid/expired credential |
| 402 | insufficient credits or x402 payment flow |
| 403 | permission/privacy/key-admin restriction |
| 404 | route/resource/model not found or no longer visible |
| 409 | provider conflict/consent/idempotency conflict if documented |
| 422 | validation/content/consent error where documented |
| 429 | parse typed Venice rate-limit reason; honor Retry-After |
| 5xx | provider failure; bounded retry only when safe |

Do not collapse every 4xx into "API failed."

Provider errors are untrusted strings; render as text, never HTML.

---

# 23. Testing Requirements

## 23.1 Contract tests

Add or update tests for:

- endpoint allowlist additions;
- invalid nested paths;
- unsupported HTTP methods;
- query parsing;
- body validators;
- model metadata normalization;
- caller/profile cache isolation;
- billing DTO normalization;
- API-key secret redaction;
- x402 header redaction;
- Responses SSE parser;
- native file/video content parts;
- E2EE gating;
- Seedance new fields;
- typed rate-limit errors.

## 23.2 Security tests

Explicitly verify:

- renderer cannot request arbitrary URL/path;
- renderer cannot select another profile's credential;
- secrets do not appear in diagnostics;
- wallet private key never crosses preload;
- API-key create response is not persisted accidentally;
- RPC network slug cannot inject path traversal;
- RPC batch max is enforced;
- transaction relay requires approval;
- Responses cannot bypass safety/tool permission layers.

## 23.3 UI tests

For new surfaces:

- loading;
- empty;
- populated;
- error;
- disabled/capability unavailable;
- keyboard navigation;
- focus restore;
- RTL;
- reduced motion;
- responsive width;
- all current theme variants.

## 23.4 Integration tests

Mock provider responses for:

- profile A/B different `/models` visibility/pricing;
- usage-history pagination;
- 429 reason variants;
- 402 x402 flow;
- API-key create/delete;
- Responses stream completion and truncation;
- invalid remote file/video URL;
- E2EE unsupported model;
- Seedance high bitrate;
- source-matched aspect/duration.

## 23.5 Optional live smoke tests

Only when a test credential is intentionally provided through the approved secret path.

Never bake a live Venice key into fixtures.

Recommended live smoke matrix:

```text
GET /models
POST /chat/completions
GET /billing/usage-history
POST /responses (experimental)
one file-input request
one video-input request if cost-safe
one Seedance quote only (avoid generation unless explicitly approved)
```

x402/RPC live tests require separate explicit authorization because they may involve wallet/signing/payment state.

---

# 24. Validation Commands

Confirm scripts exist in the current `package.json` immediately before use.

Focused first:

```bash
npm run verify:venice-api-docs
npm run verify:venice-contract-drift
npm run verify:ipc-parity
npm run verify:network-boundaries
npm run verify:storage-privacy
npm run verify:provider-adapters
```

Then:

```bash
npm run lint:eslint
npm run typecheck
npm run test:server
npm run test:electron
npm run test:unit
npm run test:ui
npm run verify:contracts
npm run verify:i18n:release
npm run build
```

Also run feature-specific Vitest files serially where they share global state.

Do not claim any command passed unless it was actually executed on the final worktree.

---

# 25. Documentation Requirements

Update canonical docs, not duplicate roadmaps.

At minimum:

```text
docs/summary_of_work.md
docs/ROADMAP.md
docs/DOCS_INDEX.md
docs/reference/* if synced/generated
relevant design/developer docs for new API surfaces
```

Register any retained new design/implementation document in `DOCS_INDEX.md`.

Document:

- new endpoints;
- new feature flags;
- privacy effects;
- billing behavior;
- x402 security model;
- RPC approval model;
- migration behavior;
- known upstream-alpha limitations.

Do not include local secrets or private absolute paths in distributable docs.

---

# 26. Implementation Order / Commit Strategy

Work directly on `main` per repository policy, but make coherent commits and do not publish until the user authorizes publication.

Recommended sequence:

1. `chore(api): sync current Venice API contracts`
2. `fix(models): honor caller-scoped Venice metadata`
3. `feat(billing): add usage history and balance`
4. `feat(api): surface typed Venice rate limits`
5. `feat(chat): add E2EE selection and current cache controls`
6. `feat(video): add latest Seedance controls`
7. `feat(chat): add native Venice file and video inputs`
8. `feat(api): add experimental Responses transport`
9. `feat(settings): add Venice API-key administration`
10. `feat(auth): add experimental x402 wallet mode`
11. `feat(agent): add guarded Venice crypto RPC tools`
12. `feat(characters): add Venice reviews`
13. `docs(api): finalize Venice platform parity documentation`

Do not combine all phases into one unreviewable commit.

Do not create feature branches/worktrees unless the user explicitly overrides current repo policy.

Never force-push.

---

# 27. Definition of Done

This work is complete only when all implemented phases satisfy all applicable items below.

## Contract correctness

- current upstream docs/OpenAPI synchronized;
- no new code targets deprecated `/billing/usage`;
- new fields use upstream spelling/location/enums;
- endpoint/method validators are exact;
- callers cannot bypass trusted transport.

## Model correctness

- `model_spec.uncensored` honored;
- legacy inference used only as fallback;
- caller-specific model visibility/pricing does not leak between profiles;
- live catalog beats static fallback for live facts.

## Billing

- usage history available;
- balance/analytics available where current API supports them;
- no prompt/body leakage;
- pagination/filtering works.

## Rate limits

- typed reason surfaced;
- Retry-After preserved;
- unsafe paid requests are not automatically replayed.

## Privacy

- E2EE capability and request selection match provider contract;
- unsupported paths fail closed;
- Responses does not pretend to provide E2EE.

## Media

- Seedance bitrate/source-match/current limits implemented;
- quote/cost approval reflects actual request;
- TTS format selector is model-aware when metadata exists.

## Chat

- native file/video content supported where model permits;
- local Documents path remains available;
- prompt-cache controls match current API.

## Responses

- explicitly experimental;
- streaming parser fully tested;
- tool/reasoning/search blocks normalized;
- cancellation/incomplete stream safe.

## API keys

- CRUD/rate limits/privacy/spend controls work where authorized;
- key secrets remain main-process protected;
- revoke invalidates local connection state appropriately.

## x402/RPC

- isolated feature flag;
- signer secrets protected;
- no silent spend/top-up/signing;
- RPC send path requires approval and idempotency.

## UI

- current theme engine preserved;
- no hardcoded design fork;
- RTL/keyboard/focus/reduced-motion/responsive tests pass;
- i18n keys added and release coverage remains green.

## Repository gates

- lint/typecheck/tests pass or pre-existing unrelated failures are accurately documented;
- contract verifiers pass;
- build succeeds;
- `docs/summary_of_work.md` updated;
- no secrets in diff;
- no unrelated edits.

If publication is later authorized:

- push directly to `main`;
- verify remote SHA;
- inspect GitHub Actions and CodeQL against that SHA;
- do not declare hosted acceptance green until the actual hosted checks are green.

---

# 28. Explicit Do-Not Rules

Do **not**:

- rewrite Venice Forge around a new SDK;
- duplicate already implemented image/audio/video/search features;
- hardcode new model IDs as the primary integration strategy;
- infer `uncensored` from names when explicit upstream metadata exists;
- reuse `/models` data across credentials as provider truth;
- use deprecated `/billing/usage` for new code;
- expose API keys or wallet keys to renderer state;
- add wildcard endpoint proxying;
- allow arbitrary crypto network/path strings;
- give an agent unrestricted signing capability;
- sign blockchain transactions inside Venice/provider infrastructure;
- auto-top-up x402 balances;
- silently switch a conversation from chat completions to Responses;
- send E2EE-only workflows to Responses while upstream says unsupported;
- log base64 attachments, prompts, auth headers, private keys, or raw account payloads;
- retry paid non-idempotent requests automatically;
- weaken Family Safe Mode or existing mandatory safety boundaries as part of unrelated API work;
- weaken IPC validation or CSP to make a feature easier;
- bypass the existing paid-media quote/approval system;
- hardcode colors/layouts that bypass the theme engine;
- skip i18n/a11y/RTL tests;
- edit historical audits as if they are current truth;
- force-push;
- create a PR unless explicitly requested;
- claim live API behavior without either current official documentation or an authorized live smoke test.

---

# 29. Recommended First Implementation Slice

For the first coding session, implement only:

```text
Phase 0: API contract sync
Phase 1: model metadata/cache correctness
Phase 3: typed rate-limit reason
```

Why this slice first:

- no new account-management or wallet security surface;
- directly fixes latest upstream contract drift;
- makes later billing/privacy/media work safer;
- ensures the app consumes caller-specific model visibility/pricing correctly;
- establishes fresh contract tests before adding endpoints.

First-session acceptance:

```bash
npm run docs:venice:sync
npm run verify:venice-api-docs
npm run verify:venice-contract-drift
npm run verify:provider-adapters
npm run verify:network-boundaries
npm run lint:eslint
npm run typecheck
```

plus focused new tests.

Only after this is stable should the next session implement Billing and E2EE/Seedance changes.

---

# 30. Research Notes

## Latest Venice platform changes most relevant to Venice Forge

From Venice's September 9, 2026 changelog:

- `GET /v1/models` gained `model_spec.uncensored`.
- `GET /v1/billing/usage` is deprecated in favor of `GET /v1/billing/usage-history`.
- `/models` responses are caller-specific/non-cacheable due to visibility and negotiated rate differences.
- per-API-key model privacy is enforced.
- API keys gained a persistent model privacy setting.
- chat cost data reflects negotiated partner rates.
- image promotional pricing is represented upstream.
- Seedance 2.0/2.5 accepts `bitrate_mode`.
- source-matched Seedance duration/aspect ratio is documented.
- rate-limit errors have typed reasons.
- overloaded text-to-image requests can include `Retry-After`.
- remote image/video URLs are validated.
- TTS gained/expanded format and voice metadata behavior.

Earlier 2026 Venice API additions relevant to optional parity:

- Responses API;
- OpenAI-compatible file inputs;
- Crypto RPC;
- x402 wallet auth;
- voice cloning;
- image edit/multi-edit;
- style references;
- prompt enhancement;
- character reviews;
- API-key CRUD/rate-limit endpoints;
- usage history;
- native video/audio/file multimodal support.

The app already implements many of the earlier additions. The handoff intentionally prioritizes only remaining gaps.

---

# 31. Final Agent Instruction

Treat this handoff as a **work order to verify and implement current Venice API parity**, not as permission to mechanically add every endpoint Venice exposes.

For every item:

1. verify the live/current upstream contract;
2. verify the capability is absent or incomplete in current `main`;
3. identify the canonical existing Venice Forge subsystem to extend;
4. write a focused failing test;
5. implement the smallest contract-correct change;
6. run focused validation;
7. run broad required gates;
8. update canonical docs/handoff state;
9. review for secrets, unsafe paid retries, IPC expansion, theme regressions, and profile leakage;
10. stop and document upstream ambiguity rather than guessing.

Preserve Venice Forge's local-first architecture, Electron trust boundary, current UI design system, safety stack, and direct-on-`main` repository policy throughout the work.
