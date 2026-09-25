# Agent Handoff — Add Fraterna Primary API Routing to Venice Forge

**Repository:** `spearchucker667/Venice_Forge`  
**Target branch:** `main` only  
**Baseline inspected:** `main` @ `0a1bfdf45aaa161d0408f7421e7f3f166ba460a3`  
**Package version at baseline:** `3.1.0`  
**Prepared:** 2026-09-25  
**Task class:** Product feature + transport/security boundary + settings/persistence + documentation + test/verifier update  
**Status:** Implementation work order. This document is not permission to weaken existing security, safety, validation, privacy, release, or Git controls.

---

## 1. Mission

Implement a first-class Venice Forge setting that lets the user select the primary Venice-compatible inference route:

1. **Venice Direct**
   - Base URL: `https://api.venice.ai/api/v1`
   - Existing/default behavior.

2. **Fraterna Pool**
   - Base URL: `https://fraterna.ai/api/v1`
   - Uses the user's existing Venice API key as the bearer credential.
   - Routes only endpoints Fraterna publicly documents as supported.
   - Automatically keeps unsupported Venice endpoints on the direct Venice API so existing Venice Forge features do not silently break.

This is a **primary upstream transport selector**, not a generic custom-base-URL field and not another fallback-model provider.

Do not implement Fraterna as an arbitrary editable URL. Do not add a second copy of the user's Venice API key. Do not expose the Venice key to the renderer. Do not route unsupported endpoints to Fraterna merely because they happen to share an OpenAI-like path.

---

# 2. External Facts / Evidence

## 2.1 Fraterna public API contract

Fraterna's public documentation states:

- Product role: an OpenAI-compatible API proxy that pools Venice API keys within a "consorzio."
- Base URL: `https://fraterna.ai/api/v1`
- Authentication: `Authorization: Bearer <VENICE_API_KEY>`
- The Venice API key must belong to an active consorzio for shared capacity to work.
- Fraterna is not a replacement account system for Venice; it routes requests using pooled Venice capacity.
- Publicly documented endpoints at the time of this handoff:
  - `POST /api/v1/chat/completions`
  - `POST /api/v1/image/generate`
  - `POST /api/v1/images/generations`
  - `GET /api/v1/models`
- Fraterna's docs tell OpenAI-compatible clients to change their base URL to `https://fraterna.ai/api/v1` while continuing to use a Venice API key.
- Fraterna states that successful requests are recorded using pseudonymous member IDs and may include technical details such as endpoint, model, and API consumption.

Reference:
- `https://fraterna.ai/docs`

Do not infer additional endpoint support beyond the currently published contract. If Fraterna adds endpoints later, expand the capability matrix only after checking current official documentation and adding focused regression tests.

## 2.2 Venice API contract

Venice's API is OpenAI-compatible and its canonical base URL is:

`https://api.venice.ai/api/v1`

Venice documentation also exposes a substantially broader product/API surface than Fraterna's currently documented proxy matrix, including API families used throughout Venice Forge.

References:
- `https://docs.venice.ai`
- `https://docs.venice.ai/swagger.yaml`

## 2.3 Current Venice Forge implementation facts verified from the repository

At the inspected baseline:

- `src/shared/configSchema.ts`
  - Defines `VENICE_API_HOST`.
  - Default: `api.venice.ai`.
  - Defines `VENICE_API_BASE_PATH`.
  - Default: `/api/v1`.
- `src/shared/apiConfig.ts`
  - Exposes the current canonical Venice host/base-path constants.
  - Exposes renderer web-proxy path `/api/venice`.
- `electron/services/veniceClient.ts`
  - Is the trusted Electron main-process Venice/provider transport.
  - Uses `https.request`.
  - Primary Venice requests currently resolve to `VENICE_API_HOST` and `VENICE_API_BASE_PATH`.
  - Fallback-provider routes are resolved separately via `providerAdapters`.
  - Venice API keys are obtained in the main process through secure storage.
  - It already contains handling for X402 and crypto/RPC cases that must not accidentally be redirected through Fraterna.
- `src/services/veniceClient/fetch.ts`
  - Is the canonical renderer request helper.
  - Electron mode delegates through `desktopVenice.request`.
  - Web mode routes through the local `/api/venice` proxy.
- `src/services/veniceClient/stream.ts`
  - Electron mode delegates streaming through `desktopVenice.streamChat`.
  - Web mode streams through `/api/venice/chat/completions`.
- `src/services/veniceClient/venice.ts`
  - Is a compatibility shim that delegates to the canonical fetch path.
- `electron/services/providerSettingsStore.ts`
  - Stores profile-scoped provider consent/routing data in `provider-settings.json`.
  - Current file schema version is `1`.
  - Existing fallback-provider settings are main-process authority.
- `src/stores/settings-store.ts`
  - Mirrors settings needed by the renderer and already carries fallback provider state.
- `src/services/desktopBridge.ts`
  - Hydrates provider settings from the trusted desktop bridge.
- `src/types/provider.ts`, `src/types/desktop.ts`
  - Contain shared provider/settings contracts.
- `src/components/settings/SettingsView.tsx`
  - Owns Settings navigation and consumes API/provider panels.
- `src/components/settings/ProvidersPanel.tsx`
  - Owns non-primary fallback provider controls.
  - Explicitly excludes Venice from the fallback-provider list because Venice is the primary provider.
- `src/stores/auth-store.ts`
  - Owns Venice API-key configuration and connection-validation state.
- `src/hooks/use-models.ts`
  - Calls `/models`.
  - React Query cache key currently includes model type, enabled fallback providers, and active profile.
  - Route selection is not currently represented in the model-cache key.
- `README.md`
  - Describes Venice Forge as an unofficial local-first desktop client for the Venice API.
- `SECURITY.md`, `PRIVACY.md`, `LEGAL.md`, `docs/`, `.github/`, and verifier scripts contain current Venice-specific transport, credential, privacy, and documentation claims.

This existing architecture is suitable for a Fraterna selector if the new setting remains an allowlisted, main-process-controlled primary transport choice.

---

# 3. Product Decision

## 3.1 User-facing setting

Add a setting named approximately:

**Primary API Route**

Choices:

- **Venice Direct**
  - "Connect directly to the Venice API."
- **Fraterna Pool**
  - "Route supported inference requests through Fraterna using your existing Venice API key and consorzio capacity."

Do not label Fraterna as an unrelated "provider" in the fallback-provider panel.

Recommended placement:

- **Settings → API Keys** or a small primary-routing subsection immediately adjacent to the Venice API key controls.
- A read-only status row may also appear in **Settings → Providers** or **Status**, but the authoritative control should be colocated with the Venice credential because Fraterna reuses that credential.

## 3.2 Required explanatory copy

When Fraterna is selected, the UI must make the following clear:

- Fraterna uses the same Venice API key.
- The key must belong to an active Fraterna consorzio.
- Fraterna routing applies only to Fraterna-supported endpoints.
- Venice-only features continue to use Venice Direct.
- Fraterna is a third-party service separate from Venice Forge and Venice.ai.
- Fraterna documents request metadata recording for successful proxied requests; users should not be shown a misleading "all traffic is direct/zero-retention" claim when Fraterna is active.

Do not overstate Fraterna's privacy properties.

## 3.3 Default behavior

Default must remain:

`venice`

Existing users must experience **no routing change** after upgrade.

A missing/corrupt/unknown persisted route must fail closed to:

`venice`

---

# 4. Routing Contract

Create a central shared route contract. Suggested type:

```ts
export type PrimaryApiRoute = "venice" | "fraterna";
```

Suggested immutable definitions:

```ts
export const PRIMARY_API_UPSTREAMS = {
  venice: {
    id: "venice",
    label: "Venice Direct",
    host: "api.venice.ai",
    basePath: "/api/v1",
  },
  fraterna: {
    id: "fraterna",
    label: "Fraterna Pool",
    host: "fraterna.ai",
    basePath: "/api/v1",
  },
} as const;
```

No arbitrary hostname input.

## 4.1 Fraterna capability matrix

At this handoff's evidence date, Fraterna routing is allowed only for:

| Method | Canonical endpoint | Fraterna |
|---|---|---|
| `GET` | `/models` | Supported |
| `POST` | `/chat/completions` | Supported |
| `POST` | `/image/generate` | Supported |
| `POST` | `/images/generations` | Supported |

Normalize query strings before checking support, so:

`/models?type=image`

matches canonical endpoint:

`/models`

## 4.2 Required direct-Venice exceptions

Until official Fraterna documentation explicitly adds support, keep these categories on Venice Direct:

- Responses API
- image edit
- image multi-edit
- image upscale
- background removal
- video generation/queue/retrieve/quote
- audio/TTS/transcription/voice conversion
- music
- embeddings
- augment search
- augment scrape
- text parser/document parsing
- account/billing/API-key-management endpoints
- model traits or other model metadata endpoints not documented by Fraterna
- crypto RPC
- X402 flows
- SIWX-authenticated crypto requests
- any binary/media retrieval route not in the documented Fraterna matrix
- any future endpoint until explicitly classified

Do not assume "OpenAI-compatible" means "every Venice endpoint is proxied."

## 4.3 Resolver behavior

Add one canonical resolver, e.g.:

```ts
resolvePrimaryApiUpstream({
  selectedRoute,
  method,
  endpoint,
  authMode,
})
```

Return an object such as:

```ts
{
  selected: "fraterna",
  effective: "fraterna",
  host: "fraterna.ai",
  basePath: "/api/v1",
  reason: "fraterna-supported-endpoint",
}
```

or for an unsupported endpoint:

```ts
{
  selected: "fraterna",
  effective: "venice",
  host: "api.venice.ai",
  basePath: "/api/v1",
  reason: "fraterna-unsupported-endpoint",
}
```

The resolver must be deterministic and testable without Electron.

---

# 5. Architecture Rules

## 5.1 Fraterna is not a fallback provider

Do **not** add Fraterna to the existing fallback-provider chain as though it were Anthropic, Groq, Together, etc.

Reason:

- Fraterna proxies Venice.
- It uses Venice model IDs.
- It uses the user's Venice API key.
- It does not require a distinct model translation layer for the documented endpoints.
- It represents an alternate primary transport path, not a model/vendor substitution.

Keep existing fallback providers semantically separate:

`primary Venice-compatible route → optional third-party fallback-provider chain`

## 5.2 Main-process authority

In Electron:

- Persist the selected primary route in main-process-owned, profile-scoped provider settings.
- The renderer may request a route change through a narrow typed IPC operation.
- Main process validates the route against the exact enum.
- Renderer does not provide a hostname.
- Renderer does not provide a base path.
- Renderer does not provide credentials.
- Main process resolves the effective upstream per request.

## 5.3 No new raw credential path

Fraterna must reuse the existing Venice API key stored through the current secure-storage path.

Do not create:

- `FRATERNA_API_KEY`
- a renderer-visible Fraterna key field
- plaintext persistence
- a second copy of the Venice key under another credential name

unless Fraterna's official authentication model changes in the future.

## 5.4 Web-mode boundary

Web mode currently sends renderer requests to the same-origin `/api/venice` Express proxy.

Preserve that browser network boundary.

The browser should not fetch `https://fraterna.ai` directly.

Preferred implementation:

- server-side proxy resolves the same allowlisted primary route; or
- a narrowly validated route identifier is supplied to the local proxy and converted server-side to one of exactly two hardcoded upstreams.

Do not permit the browser to submit an arbitrary upstream URL.

If web-mode route persistence cannot be made equivalent without widening scope, ship Electron-first with the web control visibly disabled and document the limitation. Do not silently show a switch that affects Electron but is ignored in web mode.

---

# 6. Persistence and Migration

## 6.1 Extend `provider-settings.json`

Current schema is version `1`.

Bump to version `2`.

Suggested shape:

```ts
interface ProviderSettingsSnapshot {
  primaryApiRoute: PrimaryApiRoute;
  enabledProviders: Partial<Record<ProviderId, boolean>>;
  autoFallbackEnabled: boolean;
  fallbackOrdering: ProviderId[];
  nativeFallbackModels: Partial<Record<ProviderId, string>>;
}
```

Suggested stored file:

```json
{
  "version": 2,
  "profiles": {
    "default": {
      "primaryApiRoute": "venice",
      "enabledProviders": {},
      "autoFallbackEnabled": false,
      "fallbackOrdering": []
    }
  }
}
```

## 6.2 Migration requirements

For v1:

- Preserve all existing provider settings.
- Add `primaryApiRoute: "venice"`.
- Write v2 only when a settings mutation occurs, unless the repository's persistence conventions explicitly require eager migration.
- Unknown route values sanitize to `"venice"`.

Tests required:

- v1 → v2 migration.
- malformed route → Venice.
- valid Fraterna route round trip.
- profile isolation.
- no leakage of a route from profile A into profile B.

## 6.3 Renderer mirror

Extend renderer settings state with:

```ts
primaryApiRoute: PrimaryApiRoute;
setPrimaryApiRoute: (route: PrimaryApiRoute) => void;
```

In Electron:

- main-process provider settings remain authoritative.
- bridge hydration updates the renderer mirror.
- failed IPC persistence rolls UI state back.

Do not trust stale persisted Zustand state over main-process provider settings.

---

# 7. Transport Changes

## 7.1 `electron/services/veniceClient.ts`

This is the primary implementation point.

Today, direct Venice requests effectively do:

```ts
const hostname = route ? route.host : VENICE_API_HOST;
const path = route ? route.path : `${VENICE_API_BASE_PATH}${request.endpoint}`;
```

Change only the primary Venice-compatible branch:

1. Resolve selected profile's `primaryApiRoute`.
2. Resolve effective upstream based on endpoint/method/auth constraints.
3. Preserve fallback-provider `route.host` / `route.path` logic unchanged.
4. When Fraterna is effective:
   - hostname = `fraterna.ai`
   - path = `/api/v1${request.endpoint}`
   - Authorization = existing Venice bearer key
5. When endpoint is not Fraterna-supported:
   - route direct to `api.venice.ai`
   - preserve existing behavior
6. Do not redirect X402/crypto/SIWX flows through Fraterna.

Recommended internal names:

- `selectedPrimaryRoute`
- `effectivePrimaryUpstream`
- `effectiveUpstreamId`

Avoid renaming all existing Venice-facing APIs in one feature patch unless necessary. Minimize churn.

## 7.2 Streaming

`/chat/completions` is explicitly documented by Fraterna.

Ensure both:

- non-streaming chat
- SSE streaming chat

can use Fraterna.

Do not alter existing shared SSE decoding.

Validate that:

- multiline SSE remains correct
- `[DONE]` handling remains correct
- abort works
- absolute stream timeout remains correct
- retry/fallback behavior remains correct
- no partial-stream fallback occurs after deltas have been emitted

## 7.3 Fraterna + fallback providers

Expected chain when Fraterna is selected:

1. Primary request goes through Fraterna where supported.
2. If the existing automatic fallback policy decides to try a third-party fallback provider, that provider continues to use its existing adapter/credential.
3. Do not make Fraterna itself a fallback entry.
4. Do not apply Venice-only request semantics to third-party fallback adapters.

## 7.4 Retry semantics

Keep current bounded retry behavior.

However, diagnostics must distinguish:

- selected route = Fraterna
- effective upstream = Fraterna
- effective upstream = Venice due to unsupported endpoint
- final fallback provider, if any

Do not expose the API key in retry logs.

---

# 8. Web Proxy / Server Changes

Inspect and update `server.ts`.

Current proxy uses:

- `VENICE_API_HOST`
- `VENICE_API_BASE_PATH`
- existing API-key injection
- existing request body bounds
- existing family-safety behavior

Required:

- Keep `/api/venice/*` as the browser-facing local route unless renaming is justified and fully migrated.
- Resolve the selected primary upstream server-side.
- Strip any internal selector header before proxying upstream.
- Set `Host` consistently with the chosen upstream.
- Keep Authorization server-side.
- Never proxy cookies from renderer to Fraterna/Venice.
- Maintain body-size limits.
- Maintain response screening behavior where applicable.
- Maintain CORS/CSRF assumptions.
- Add tests proving arbitrary hosts cannot be selected.

If route selection is carried in a header, use a narrow value such as:

`X-Venice-Forge-Primary-Route: venice|fraterna`

Then:

- exact enum validation only
- unknown/missing → Venice
- remove header before upstream dispatch
- no URL values
- no hostname values

Prefer a server-session or persisted authoritative setting if the current architecture supports it cleanly.

---

# 9. API-Key Validation / Connection Testing

## 9.1 Reuse the Venice key

Existing `auth-store.ts` logic saves a Venice key and validates connectivity.

Update connection validation so it can test the **selected primary route** for a Fraterna-capable endpoint.

Preferred test:

`GET /models`

Reason:

- Fraterna explicitly documents `/models`.
- It does not incur generation cost.
- It verifies the user's key can authenticate through the selected route.

## 9.2 Distinguish failure classes

Do not collapse all failures into "Venice API unreachable."

Suggested status classes:

- `valid`
- `invalid`
- `network-error`
- `fraterna-membership-required`
- `fraterna-unavailable`
- `unknown`

Only introduce new persisted enum values if required; otherwise map to safe existing classes and provide route-aware display copy.

For Fraterna, 401/403 may mean:

- invalid Venice key
- key not permitted for Fraterna/consorzio state
- membership/account condition

Do not assert the exact cause unless Fraterna returns a stable documented error code.

## 9.3 Save behavior

If key storage succeeds but route validation fails:

- keep the key stored
- do not delete it automatically
- report "saved but not validated"
- allow re-test
- allow switching back to Venice Direct

---

# 10. Model Discovery and Cache Correctness

`src/hooks/use-models.ts` currently keys model queries on:

- model type
- enabled provider key
- active profile

Add the primary API route.

Example:

```ts
queryKey: [
  "models",
  normalizedType ?? "all",
  enabledProviderKey,
  activeProfileId,
  primaryApiRoute,
]
```

On route change:

- invalidate model queries
- reset `modelCatalogRuntimeStore`
- refetch `/models`
- do not reuse a Venice-direct model response as authoritative Fraterna state
- do not reuse a Fraterna response as authoritative direct-Venice state

Model IDs should remain Venice model IDs for Fraterna-routed requests unless Fraterna documents otherwise.

Do not prefix Fraterna model IDs with `fraterna:`.

---

# 11. Endpoint and Feature Behavior

## 11.1 Chat

Fraterna selected:

- `/chat/completions` → Fraterna
- same Venice model ID
- same Venice key
- preserve stream/non-stream support

## 11.2 Image generation

Fraterna selected:

- `/image/generate` → Fraterna
- `/images/generations` → Fraterna

Do not assume:

- `/image/edit`
- `/image/multi-edit`
- `/image/upscale`
- background removal

are supported.

Those remain direct Venice until documented and tested.

## 11.3 Media Studio

Media Studio may invoke mixed endpoint families.

Do not route the whole UI surface by a single "Media Studio uses Fraterna" flag.

Routing is per endpoint.

Example:

- new text-to-image call → Fraterna if it uses documented generation endpoint
- subsequent upscale → Venice Direct
- video generation → Venice Direct

The UI should not imply every action in a mixed workflow went through the same upstream.

## 11.4 Models

`GET /models` → Fraterna when selected.

Other model/account metadata endpoints remain direct unless explicitly supported.

## 11.5 Audio / video / music / embeddings / research

Keep direct Venice by default because they are outside the documented Fraterna endpoint matrix.

## 11.6 Billing and Venice API-key management

Keep direct Venice.

Fraterna is not the Venice account-management API.

Do not redirect:

- billing calls
- API-key CRUD
- balance/rate-limit account endpoints
- account metadata

through Fraterna unless official docs add them.

---

# 12. Venice API `safe_mode` and Local Family Safe Mode

These are separate concepts and must stay separate.

## 12.1 Local Family Safe Mode

This is Venice Forge local enforcement.

It must behave identically regardless of:

- Venice Direct
- Fraterna Pool

Do not weaken or bypass local guard logic.

## 12.2 Venice provider-side `safe_mode`

Current code has endpoint-specific logic for Venice API `safe_mode`.

Fraterna says clients use the Venice API request/response format, but this handoff does **not** treat that as proof that every Venice-specific optional field is accepted/preserved by Fraterna.

Required approach:

- keep existing payload behavior for documented Fraterna endpoints initially
- add integration/contract tests where practical
- if Fraterna rejects a Venice-only optional field, create a route-specific compatibility rule rather than disabling the field globally
- document the verified result
- do not claim Fraterna guarantees Venice `safe_mode` propagation unless verified from official docs or an authoritative test environment

---

# 13. Security Requirements

## 13.1 No generic custom URL

Do not add:

```text
Custom Base URL: __________________
```

to this feature.

Why:

- current network boundaries intentionally constrain provider traffic
- a generic URL materially changes SSRF/trust assumptions
- host/path validation becomes significantly more complex
- arbitrary hosts could receive user prompts and credentials

This feature needs only two trusted immutable upstream definitions.

## 13.2 Credential custody

Preserve:

- Electron `safeStorage`
- Keychain-backed encryption on macOS
- DPAPI on Windows
- existing profile scoping
- existing secret redaction

Fraterna receives the same Venice bearer key only in trusted outbound main-process/server requests.

## 13.3 Diagnostics

It is safe to expose:

- selected route ID
- effective route ID
- normalized endpoint
- status code
- duration
- retry count

Do not expose:

- raw Authorization
- API key
- cookies
- signed URLs
- raw protected prompts by default

## 13.4 SSRF / host allowlist

The effective primary hostname must be one of exactly:

- `api.venice.ai`
- `fraterna.ai`

No suffix matching.

Reject examples such as:

- `fraterna.ai.attacker.example`
- `api.venice.ai.attacker.example`
- userinfo host tricks
- IP literals
- localhost
- RFC1918 hosts
- arbitrary schemes

Because no user URL should exist, most of these should be impossible by construction.

---

# 14. Traffic Inspector / Diagnostics / Status

Add route visibility to debugging surfaces.

Recommended fields:

```ts
selectedPrimaryRoute: "venice" | "fraterna"
effectiveUpstream: "venice" | "fraterna" | <fallback-provider-id>
routingReason:
  | "selected-venice"
  | "fraterna-supported-endpoint"
  | "fraterna-unsupported-endpoint"
  | "x402-direct-venice"
  | "crypto-direct-venice"
  | "fallback-provider"
```

Update:

- Traffic Inspector
- Status view
- diagnostics snapshot
- safe export schema if applicable

This makes mixed-routing behavior auditable.

Do not label a request "Fraterna" merely because the profile setting is Fraterna; show the **effective** route.

---

# 15. UI / UX Requirements

## 15.1 Primary route control

Suggested visual structure:

### Primary API Route

**Venice Direct**
- Full Venice API feature support.
- Uses your stored Venice API key.

**Fraterna Pool**
- Uses your stored Venice API key through Fraterna.
- Requires active Fraterna consorzio membership.
- Supported Fraterna endpoints use pooled capacity.
- Other Venice Forge features continue directly through Venice.

## 15.2 Connection state

Show separate concepts:

- API key stored
- selected route
- selected-route validation status
- effective routing compatibility

Example:

```text
Venice API key          Stored securely
Primary API route       Fraterna Pool
Fraterna connection     Validated
Unsupported endpoints   Use Venice Direct automatically
```

## 15.3 Link(s)

Add explicit links:

- Fraterna docs
- Venice API docs

Use the application's existing external-link sanitizer.

Do not add links that bypass the existing `shell.openExternal` validation path.

## 15.4 Accessibility

- Radio group or segmented selector must be keyboard accessible.
- Provide proper `aria-describedby`.
- Do not rely on color alone for active route.
- Localize user-visible copy through the existing i18n system.
- Maintain RTL support.
- Update all required locale catalogs with placeholders/status rules consistent with project policy; do not falsely mark machine translations as native-reviewed.

---

# 16. Suggested File-Level Change Map

This list is based on current-main inspection. The implementing agent must re-check the repository before editing.

## Core shared routing

Add:

- `src/shared/primaryApiRoute.ts`
- `src/shared/primaryApiRoute.test.ts`

Potentially modify:

- `src/shared/apiConfig.ts`
- `src/shared/configSchema.ts`

Do not replace Venice's canonical constants with Fraterna globally. Keep them as the Venice direct contract.

## Electron trusted transport

Modify:

- `electron/services/veniceClient.ts`
- `electron/services/veniceClient.adapters.test.ts`
- other focused Venice client tests
- `electron/services/providerSettingsStore.ts`
- `electron/services/providerSettingsStore.test.ts`
- `electron/ipc/handlers/apiKeyHandlers.ts` or the current provider-settings handler owner
- IPC validation/tests as required
- `electron/preload.ts`

## Shared desktop contracts

Modify:

- `src/types/desktop.ts`
- `src/types/provider.ts` only if route types belong there; prefer a dedicated route type if clearer
- `src/services/desktopBridge.ts`

## Renderer settings/auth

Modify:

- `src/stores/settings-store.ts`
- `src/stores/settings-store.test.ts`
- `src/stores/auth-store.ts`
- auth-store tests
- `src/components/settings/SettingsView.tsx`
- `src/components/settings/ApiKeysPanel.tsx` and/or a new `PrimaryApiRoutePanel.tsx`
- `src/components/SettingsView.test.tsx`

Do not place Fraterna in the fallback provider registry unless there is a separate future use case distinct from this transport feature.

## Model discovery

Modify:

- `src/hooks/use-models.ts`
- `src/hooks/use-models.test.tsx`
- model query coordinator/cache tests if present

## Web

Modify as needed:

- `server.ts`
- `server.test.ts`
- `src/services/veniceClient/fetch.ts`
- `src/services/veniceClient/stream.ts`

Renderer network target should remain same-origin.

## Diagnostics/status

Inspect and update where appropriate:

- `src/stores/status-store.ts`
- `src/components/StatusView.tsx`
- `src/components/status/*`
- `src/services/diagnosticsService.ts`
- `src/stores/inspector-store.ts`
- inspector telemetry types/helpers

## i18n

Add canonical English keys under:

- `src/i18n/resources/en-US/`

Propagate per the repository's localization workflow.

Do not add unreviewed translations as "native reviewed."

---

# 17. Documentation Work Order

The user explicitly requested all other GitHub documentation and links be updated.

Do this carefully: update **current/canonical documentation** and current GitHub-facing metadata. Do not rewrite historical audits to make them look as if Fraterna existed at the time.

## 17.1 Root docs

Review and update:

- `README.md`
- `SECURITY.md`
- `PRIVACY.md`
- `LEGAL.md`
- `PRODUCT.md`
- `SUPPORT.md`
- `CONTRIBUTING.md` if setup/validation changes affect contributors
- `AGENTS.md` if primary-upstream rules become a permanent implementation invariant

Required README changes:

- describe optional Fraterna routing
- add setup instructions
- state same Venice key is used
- state active consorzio requirement
- explain endpoint compatibility fallback to Venice Direct
- link Fraterna docs
- avoid implying all requests always go directly to Venice
- preserve unofficial/non-affiliation language

## 17.2 Canonical `docs/`

Review and update at minimum:

- `docs/README.md`
- `docs/ABOUT.md`
- `docs/FAQ.md`
- `docs/DEVELOPMENT/CONFIG.md`
- `docs/DEVELOPMENT/troubleshooting.md`
- `docs/DEVELOPMENT/BRIDGE.md`
- `docs/design/REPOSITORY_TREE.md`
- `docs/discovery/DISCOVERY_DOCUMENT_AGENT.md` if it remains canonical/current
- `docs/legal/PRIVACY.md`
- `docs/legal/DISCLAIMER.md`
- `docs/legal/NOTICE.md`
- `docs/legal/THIRD_PARTY_NOTICES.md`
- `docs/legal/TRADEMARKS.md`
- `docs/reference/VENICE_API_SYSTEM_PROMPT.md` if runtime transport description is displayed there
- `docs/DOCS_INDEX.md`
- `docs/summary_of_work.md`
- `docs/ROADMAP.md` only for genuinely remaining work

Recommended new doc:

- `docs/DEVELOPMENT/FRATERNA_ROUTING.md`

It should document:

- purpose
- route selector
- supported matrix
- direct-Venice exceptions
- credential reuse
- persistence
- privacy differences
- debugging/status fields
- test strategy
- future endpoint expansion procedure

Register the document in `docs/DOCS_INDEX.md`.

## 17.3 Do not corrupt canonical Venice references

Do **not** replace the bundled Venice Swagger with Fraterna.

Do **not** modify Venice API docs to pretend Fraterna is the canonical Venice endpoint.

Preserve:

- `docs/reference/Venice_swagger_api.yaml`
- `docs/reference/Venice_api_LLM_info.md`
- `scripts/sync-venice-api-docs.cjs`
- `scripts/verify-venice-api-docs.cjs`

as Venice contract tooling.

If needed, add separate Fraterna routing docs/verifiers.

## 17.4 Historical audits

Paths under:

`docs/audits/Records/`

are historical evidence unless the repository explicitly marks a specific record as current authority.

Do not mass-edit historical reports merely because they mention `api.venice.ai`.

Only change a historical file if:

- a current link is broken and policy requires repair, or
- it is explicitly still canonical, or
- the task specifically calls for historical errata.

Otherwise preserve the record.

---

# 18. Privacy Documentation — Mandatory Correction

This feature changes the privacy path for some requests.

Current Venice Forge messaging includes strong local privacy and no-telemetry claims.

Keep the app-level statement:

**Venice Forge itself does not collect analytics/telemetry.**

But add a provider-routing distinction.

Recommended wording concept:

> When Fraterna Pool is selected, supported requests are sent through Fraterna rather than directly to Venice. Fraterna states that it records successful requests under pseudonymous member identifiers and may record technical metadata such as endpoint, model, and API consumption. Venice Forge does not control Fraterna's server-side retention. Review Fraterna's current documentation before enabling it.

Do not claim:

- Fraterna has Venice's zero-data-retention guarantees
- Fraterna stores no metadata
- all prompts remain direct to Venice
- Venice Forge can guarantee Fraterna's retention behavior

---

# 19. Legal / Attribution / Non-Affiliation

Add Fraterna to third-party/legal notices where appropriate.

Suggested disclaimer concept:

> Fraterna is a third-party service and is not operated by Venice Forge. Venice Forge is not endorsed by, sponsored by, or affiliated with Fraterna or Venice.ai unless explicitly stated otherwise.

Do not imply partnership.

Retain Venice trademark/non-affiliation statements.

---

# 20. GitHub-Facing Content

Review current repository surfaces outside source/docs.

## 20.1 `.github`

Inspect and update:

- `.github/copilot-instructions.md`
- `.github/ISSUE_TEMPLATE/config.yml`
- issue/bug templates if API-route questions are relevant
- release templates if they exist
- workflows only where validation scripts change

## 20.2 Repository About metadata

If publication/metadata changes are authorized, update GitHub repository metadata to mention optional Fraterna support.

Potential description:

> Unofficial local-first Venice API desktop client with optional Fraterna pooled routing.

Potential topic:

- `fraterna`

Do not remove existing Venice identity.

Do not change repository metadata without explicit publication authorization if the current task is local implementation only.

## 20.3 Links

Audit live/canonical links to:

- Venice API docs
- Fraterna docs
- project security/privacy/legal docs
- setup docs

Run Markdown link verification after edits.

---

# 21. Source Search / Link Audit

The current repository contains active and historical references to:

- `api.venice.ai`
- `docs.venice.ai`
- `VENICE_API_HOST`
- "Venice API key"
- "Venice API"

Do not blindly replace these strings.

Classify each match:

1. **Canonical Venice contract**
   - preserve direct Venice URL
2. **Current architecture description**
   - update to explain route selection
3. **User-facing setup**
   - update to include Fraterna option
4. **Historical audit**
   - preserve
5. **Test fixture**
   - update only if behavior under test changed
6. **Verifier**
   - update only if invariant changed
7. **Legal/privacy**
   - update routing/privacy claims

Examples that require deliberate review include:

- `.env.example`
- `.github/copilot-instructions.md`
- `PRIVACY.md`
- `README.md`
- `SECURITY.md`
- `LEGAL.md`
- `docs/ABOUT.md`
- `docs/DEVELOPMENT/CONFIG.md`
- `docs/DEVELOPMENT/troubleshooting.md`
- `docs/design/REPOSITORY_TREE.md`
- `docs/discovery/DISCOVERY_DOCUMENT_AGENT.md`
- `docs/reference/VENICE_API_SYSTEM_PROMPT.md`
- `src/shared/configSchema.ts`
- `src/shared/apiConfig.ts`
- `server.ts`
- `electron/services/veniceClient.ts`
- `electron/services/videoRetrieveService.ts`
- `scripts/verify-network-boundaries.cjs`
- `scripts/verify-venice-api-docs.cjs`
- `scripts/verify-venice-contract-drift.cjs`

---

# 22. `.env.example` / Developer Configuration

Current Node-side configuration supports:

- `VENICE_API_HOST`
- `VENICE_API_BASE_PATH`

Do not remove these without proving they are obsolete.

Document precedence.

Recommended precedence:

### Electron end-user runtime

1. Profile-scoped selected primary route
2. Immutable route definitions
3. Existing environment overrides only where explicitly intended for development/testing

### Web/development server

Decide and document whether:

- existing `VENICE_API_HOST` remains an explicit developer override, or
- the new route selector is authoritative

Do not create ambiguous precedence where UI says "Fraterna" but an environment variable silently sends to another host.

Recommended development-only env:

```text
VENICE_FORGE_PRIMARY_API_ROUTE=venice|fraterna
```

only if needed for server/headless tests.

If retained, validate exact enum.

---

# 23. Network Boundary Verification

The repository has `scripts/verify-network-boundaries.cjs`.

Update it so the invariant becomes approximately:

- Venice-compatible primary API network calls are still centralized.
- Fraterna network calls are permitted only inside the same trusted Venice transport/server boundaries.
- No React component/store/hook may directly call `fraterna.ai`.
- No new arbitrary provider fetch surfaces are introduced.

A good static rule should reject literal `fraterna.ai` outside approved shared routing definitions/docs/tests unless explicitly allowlisted.

Do not simply add every file that fails the verifier.

Keep the boundary narrow.

---

# 24. Suggested New Verifier

Add a focused verifier only if consistent with the repo's verifier registry.

Possible name:

`verify:primary-api-routing`

Checks:

- exactly two primary route IDs
- exact known hosts
- Fraterna endpoint matrix contains only reviewed endpoints
- unsupported routes fall back to Venice
- no arbitrary base URL setting
- settings default is Venice
- provider settings schema includes route
- no raw renderer credential usage
- no direct `fraterna.ai` fetch in renderer code

Do not invent a `VERIFY-*` number without checking the repository's canonical verifier registry.

---

# 25. Tests — Required

## 25.1 Route resolver unit tests

Test:

- Venice + `/chat/completions` → Venice
- Fraterna + `/chat/completions` → Fraterna
- Fraterna + `/models` → Fraterna
- Fraterna + `/models?type=image` → Fraterna
- Fraterna + `/image/generate` → Fraterna
- Fraterna + `/images/generations` → Fraterna
- Fraterna + `/image/edit` → Venice
- Fraterna + `/image/upscale` → Venice
- Fraterna + `/video/queue` → Venice
- Fraterna + `/audio/speech` → Venice
- Fraterna + `/embeddings` → Venice
- Fraterna + `/augment/search` → Venice
- Fraterna + crypto/X402 → Venice
- malformed route → Venice

## 25.2 Electron transport tests

Mock/capture `https.request`.

Assert:

Fraterna chat:
- `hostname === "fraterna.ai"`
- `path === "/api/v1/chat/completions"`
- bearer key comes from existing Venice secure store

Unsupported endpoint with Fraterna selected:
- `hostname === "api.venice.ai"`

Fallback provider:
- existing provider host remains unchanged

## 25.3 Persistence tests

- v1 migration
- v2 read/write
- profile isolation
- invalid value sanitization
- rollback on write failure

## 25.4 IPC tests

- accepts `"venice"`
- accepts `"fraterna"`
- rejects arbitrary string
- rejects URL
- rejects object
- rejects oversized/unexpected payload
- renderer cannot provide host/path

## 25.5 Settings UI tests

- default Venice selected
- route can switch
- persistence success
- persistence failure rolls back
- Fraterna explanatory copy visible
- same-key explanation visible
- Fraterna docs link uses safe external-open path
- accessibility roles/labels

## 25.6 Model cache tests

- route included in query key
- route change invalidates/refetches
- no stale cross-route catalog
- active profile remains part of key

## 25.7 Web/server tests

- selected Fraterna chat → Fraterna
- unsupported endpoint → Venice
- arbitrary host selector rejected/ignored
- renderer Authorization stripped
- server key inserted
- route selector header removed upstream
- body limits unchanged
- safety behavior unchanged

## 25.8 Privacy/diagnostics tests

- inspector contains selected/effective route
- Authorization redacted
- key not serialized
- route appears in safe diagnostics
- Fraterna privacy copy does not claim zero retention

---

# 26. Integration / Manual QA Matrix

Run with a valid Venice key that is also configured for an active Fraterna consorzio.

## Venice Direct

Verify:

- model list
- streaming chat
- non-stream chat
- image generation
- image edit
- upscale
- background removal
- video
- audio/TTS
- embeddings
- research/search
- billing/API-key management
- status/diagnostics

## Fraterna Pool

Verify:

- `/models` actually reaches Fraterna
- streaming chat reaches Fraterna
- non-stream chat reaches Fraterna
- `/image/generate` reaches Fraterna
- `/images/generations` reaches Fraterna where used
- image edit remains Venice
- upscale remains Venice
- video remains Venice
- audio remains Venice
- embeddings remain Venice
- billing/account endpoints remain Venice
- Traffic Inspector reports effective route accurately
- switching back to Venice works without re-entering key

## Failure cases

Test:

- Fraterna offline
- key valid on Venice but not active for Fraterna
- 401
- 403
- 429
- 5xx
- stream disconnect before first token
- stream disconnect after first token
- malformed JSON
- malformed SSE
- app restart
- profile change

---

# 27. Error Copy

Avoid hardcoded errors that say "Venice API" when the effective route was Fraterna.

Current code contains messages such as:

- "Failed to reach Venice API."
- "Venice response stream error."
- "Venice returned invalid stream data."

Refactor only where needed to prevent misleading user-facing diagnostics.

Suggested route-aware user messages:

- `Failed to reach Fraterna.`
- `Failed to reach Venice API.`
- `Fraterna returned invalid stream data.`
- `Primary API route rejected the request.`

Keep internal type/function names stable unless changing them materially improves correctness.

Do not turn the patch into a wholesale terminology rewrite.

---

# 28. Observability Without Telemetry

Venice Forge currently states it does not collect telemetry.

Preserve that.

Route diagnostics remain local.

No new remote analytics.

Do not send route-choice metrics to Venice, Fraterna, or any analytics service.

---

# 29. Non-Goals

This task does not require:

- generic custom OpenAI-compatible base URL support
- adding Fraterna as a fallback model vendor
- Fraterna account creation
- Fraterna consorzio management UI
- invite-code management
- automatic Fraterna membership enrollment
- storing a separate Fraterna credential
- replacing Venice branding
- redirecting all Venice endpoints to Fraterna
- editing historical audits en masse
- rewriting the Venice OpenAPI spec
- changing local Family Safe Mode policy
- changing provider-side Venice `safe_mode` defaults
- weakening network-boundary verifiers

---

# 30. Recommended Implementation Sequence

## Phase 0 — Reinitialize / verify baseline

Read:

- `AGENTS.md`
- `docs/DEVELOPMENT/agents/AGENT_REINITIALIZATION.md`
- `docs/summary_of_work.md`
- `docs/DOCS_INDEX.md`
- `docs/ROADMAP.md`
- `docs/reference/Venice_swagger_api.yaml`
- `docs/reference/Venice_api_LLM_info.md`
- current Fraterna docs

Capture:

```bash
git rev-parse HEAD
git status --short
node -p "require('./package.json').version"
```

Work only on local `main`.

Never force-push.

## Phase 1 — Shared route contract

Implement:

- route enum
- fixed host map
- endpoint capability matrix
- resolver
- unit tests

## Phase 2 — Persistence / IPC

Extend:

- provider settings v2
- typed desktop contracts
- preload
- IPC validation
- renderer hydration

Add migration tests.

## Phase 3 — Electron transport

Integrate route resolver into primary Venice branch.

Keep fallback provider logic unchanged.

Add request-host tests.

## Phase 4 — Web proxy

Add equivalent allowlisted routing.

Preserve same-origin renderer transport.

Add SSRF/selector tests.

## Phase 5 — Settings UI

Add primary route control and contextual copy.

Add connection/re-test behavior.

## Phase 6 — Model cache

Add route to cache identity.

Invalidate on route change.

## Phase 7 — Diagnostics/status

Expose selected/effective route.

Preserve redaction.

## Phase 8 — Documentation/legal/privacy

Update canonical docs and GitHub-facing content.

Add Fraterna routing doc.

## Phase 9 — Verifiers

Update network/doc verifiers narrowly.

Add focused routing verifier if appropriate.

## Phase 10 — Full validation

Run focused tests first, then complete repository gates.

---

# 31. Validation Commands

Re-check `package.json` because script names may move.

At the inspected baseline, the repository includes a broad verifier suite.

Run at minimum:

```bash
npm ci
npm run typecheck
npm run lint
npm test
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
```

Also run every new focused test/verifier added for Fraterna.

If `npm run verify:contracts:static` already includes some commands, duplication is acceptable during debugging but final reporting should show the actual successful gate set accurately.

Do not report a command as passing unless it was actually run.

---

# 32. CI / GitHub Validation

After implementation and only when publication is authorized:

- push to `main` using the repository's required workflow
- verify GitHub Actions
- verify CodeQL
- verify Markdown-link checks
- verify package/release metadata checks if touched
- verify no secret-scanning alerts were introduced
- verify remote `main` matches intended local commit

Do not create a PR or feature branch if project instructions still require main-only work.

Do not force-push.

---

# 33. Documentation Acceptance Checklist

Before completion:

- [ ] README explains Venice Direct and Fraterna Pool.
- [ ] Fraterna docs link added.
- [ ] Venice docs links preserved.
- [ ] SECURITY explains allowlisted dual upstream.
- [ ] PRIVACY explains Fraterna metadata behavior.
- [ ] LEGAL / third-party notices mention Fraterna.
- [ ] FAQ includes membership/consorzio troubleshooting.
- [ ] CONFIG explains route persistence and dev precedence.
- [ ] troubleshooting explains 401/403/429 differences.
- [ ] repository tree reflects new shared route module.
- [ ] `docs/DOCS_INDEX.md` registers new canonical doc.
- [ ] `docs/summary_of_work.md` updated.
- [ ] `docs/ROADMAP.md` updated only for genuine remaining work.
- [ ] Markdown links pass.
- [ ] Historical audit records were not rewritten as current facts.

---

# 34. Engineering Acceptance Criteria

The feature is complete only when all of the following are true:

1. Existing users remain on Venice Direct after upgrade.
2. A profile can select Fraterna Pool in Settings.
3. Route selection survives restart.
4. Route selection is profile-scoped.
5. The existing Venice API key is reused securely.
6. Renderer never receives the raw key.
7. Fraterna route is hardcoded/allowlisted, not arbitrary.
8. `/chat/completions` routes to Fraterna when selected.
9. `/models` routes to Fraterna when selected.
10. `/image/generate` routes to Fraterna when selected.
11. `/images/generations` routes to Fraterna when selected.
12. Unsupported endpoints remain direct Venice.
13. X402/crypto remain direct Venice.
14. Billing/account/API-key-management routes remain direct Venice.
15. Third-party fallback providers keep existing behavior.
16. Route change invalidates model discovery cache.
17. Traffic Inspector shows selected and effective upstream.
18. Local Family Safe Mode remains unchanged.
19. Existing Venice API `safe_mode` behavior is not weakened.
20. Web mode either has equivalent safe routing or clearly disables the control.
21. No arbitrary URL/SSRF surface is introduced.
22. README/security/privacy/legal/current docs are updated.
23. Fraterna privacy differences are disclosed.
24. Focused tests pass.
25. Full required repository gates pass.
26. Hosted CI/CodeQL are verified if publication is part of the task.

---

# 35. Failure Conditions / Do Not Ship

Do not ship if any of these are true:

- Fraterna is implemented by changing `VENICE_API_HOST` globally at runtime.
- The user can type an arbitrary primary base URL.
- Fraterna appears as a normal fallback provider despite using Venice identity/models/key.
- A second Venice key copy is stored for Fraterna.
- Web renderer connects directly to Fraterna.
- Fraterna receives X402/crypto/account-management requests without documented support.
- image edit/upscale/video/audio/embeddings silently start failing under Fraterna mode.
- route selection is not included in model-cache identity.
- privacy docs still imply all requests go directly to Venice.
- Fraterna is described as zero-retention without evidence.
- renderer controls hostname/path directly.
- a failed settings write leaves renderer and main process disagreeing.
- existing safety/network verifiers are disabled just to get CI green.
- historical records are mass-rewritten.
- API keys appear in logs/tests/artifacts.

---

# 36. Suggested Commit Structure

If repository policy permits multiple commits on `main`, use logically reviewable commits:

1. `feat(api): add primary Venice/Fraterna route contract`
2. `feat(settings): persist profile-scoped primary API route`
3. `feat(transport): route supported inference through Fraterna`
4. `test(api): cover Fraterna route and fallback matrix`
5. `docs: document Fraterna routing and privacy`

If the repository prefers a single implementation commit, keep the same conceptual grouping in the final handoff.

Never force-push.

---

# 37. Final Agent Report Requirements

At completion, report:

- baseline commit
- final local commit
- final remote commit if pushed
- changed files
- exact route matrix implemented
- persistence migration result
- secure-storage behavior
- web-mode behavior
- focused tests run
- full validation commands run
- CI/CodeQL status if applicable
- docs updated
- links updated
- unresolved risks
- any Fraterna behavior that could not be independently verified
- whether Fraterna `safe_mode` propagation was verified or remains unknown

Update:

`docs/summary_of_work.md`

before declaring completion.

---

# 38. Key Design Summary

The correct implementation is **not**:

> "replace Venice's URL everywhere with Fraterna."

The correct implementation is:

> Add a profile-scoped, main-process-authoritative **Primary API Route** selector. Use Fraterna as an alternate Venice-compatible upstream only for endpoints Fraterna explicitly documents. Reuse the existing securely stored Venice API key. Preserve direct Venice routing for unsupported/API-account/X402/crypto endpoints. Keep all routing behind the existing centralized transport/security boundary. Make the selected and effective route visible in local diagnostics, and update all current documentation/privacy/legal/GitHub surfaces accordingly.

That preserves Venice Forge's current feature breadth and security model while adding pooled Fraterna inference cleanly.

---

## Source References

Fraterna:
- https://fraterna.ai/docs
- https://fraterna.ai/api/v1

Venice:
- https://docs.venice.ai
- https://docs.venice.ai/swagger.yaml
- https://api.venice.ai/api/v1

Repository:
- https://github.com/spearchucker667/Venice_Forge
- https://github.com/spearchucker667/Venice_Forge/commit/0a1bfdf45aaa161d0408f7421e7f3f166ba460a3
