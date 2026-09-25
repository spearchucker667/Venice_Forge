# Fraterna primary API routing

**Status:** Active (Venice Forge 3.1.0)
**Authority:** `docs/ROADMAP.md` (FRATERNA routing workstream)
**Owner:** fayeblade (@spearchucker667)
**Implementation contract:** `src/shared/primaryApiRoute.ts`

This document is the canonical reference for Venice Forge's primary API
route selection. It is the single source of truth for the user-facing
behaviour, the per-endpoint capability matrix, and the security/privacy
posture of the Fraterna upstream. Implementation code MUST defer to this
document; if implementation disagrees, fix the implementation.

---

## 1. Purpose

Venice Forge historically sent every primary-API request to a single
host (`api.venice.ai`). With v3.1.0 the user (desktop build) or the
server operator (web build) can switch the primary route to the public
**Fraterna** upstream, which mirrors a curated subset of the same
contract. Fraterna is not a separate provider — it accepts the Venice
API key, the same base path, and the same JSON shapes — so the change is
a **host switch**, not a credential or contract change.

This unlocks three product outcomes:

1. **Capacity diversity for chat / image / embeddings.** The most-used
   endpoints are forwarded to a second canonical origin without
   requiring the user to manage a second credential.
2. **Zero new privacy surface.** No separate key, no separate billing,
   no separate transport. The credential boundary is unchanged.
3. **Predictable fallback.** Endpoints that Fraterna does not mirror
   automatically fall back to `api.venice.ai`, so the user keeps the
   full surface area regardless of which route is selected.

---

## 2. Routes

| Route id   | Canonical host      | Base path | Auth          | Surface area                              |
|------------|---------------------|-----------|---------------|-------------------------------------------|
| `venice`   | `api.venice.ai`     | `/api/v1` | Venice API key | Full endpoint allowlist (default)         |
| `fraterna` | `fraterna.ai`        | `/api/v1` | Venice API key | Curated subset (see §3)                  |

The route id is the single source of truth. The host and base path are
derived from the id via the shared resolver in
`src/shared/primaryApiRoute.ts`. Hard-coding either host elsewhere in
the codebase is a violation of the contract — the network-boundaries
verifier enforces this.

The default route is `venice`. A freshly-installed app, a freshly-created
profile, and any persisted state that pre-dates v3.1.0 all use this
default.

---

## 3. Per-endpoint capability matrix

The `venice` route supports every endpoint in the canonical allowlist
(`src/shared/validation.ts`). The `fraterna` route supports the
following curated subset, and falls back to the Venice host for every
other endpoint:

| Endpoint                | Venice (default) | Fraterna | Notes                                                    |
|-------------------------|------------------|----------|----------------------------------------------------------|
| `/chat/completions`     | ✅                | ✅        | Headline use-case; identical schema + key.               |
| `/image/generate`       | ✅                | ✅        | Same request body, same response shape.                  |
| `/image/edit`           | ✅                | ✅        | Multipart and JSON variants both supported.              |
| `/image/upscale`        | ✅                | ✅        |                                                            |
| `/image/multi-edit`     | ✅                | ✅        |                                                            |
| `/embeddings`           | ✅                | ✅        |                                                            |
| `/models`               | ✅                | ↩ Venice  | The model catalog is canonical to `api.venice.ai`.      |
| `/models/traits`        | ✅                | ↩ Venice  |                                                            |
| `/models/compatibility_mapping` | ✅         | ↩ Venice  |                                                            |
| `/image/styles`         | ✅                | ↩ Venice  |                                                            |
| `/image/background-remove` | ✅             | ↩ Venice  |                                                            |
| `/augment/*`            | ✅                | ↩ Venice  | Search, scrape, text-parser.                             |
| `/audio/*`              | ✅                | ↩ Venice  | Speech, voices, transcriptions, queue/retrieve/complete. |
| `/video/*`              | ✅                | ↩ Venice  | Queue, retrieve, quote, complete, transcriptions.        |
| `/billing/*`            | ✅                | ↩ Venice  | Balance, usage-history, usage-analytics.                 |
| `/api_keys/*`           | ✅                | ↩ Venice  | API-key administration.                                  |
| `/characters/*`         | ✅                | ↩ Venice  | Hosted character catalog.                                |
| `/x402/*`               | ✅                | ↩ Venice  | Keyless wallet authentication.                           |
| `/crypto/rpc/*`         | ✅                | ↩ Venice  | Blockchain RPC proxy.                                    |
| `/responses`            | ✅                | ↩ Venice  | Responses API (alpha).                                   |

`↩ Venice` means the request is forwarded to the canonical Venice host
when the user-selected route does not support the endpoint. The
fallback is transparent to the renderer — the same request, the same
response shape, the same authorization header.

The matrix is module-private inside `primaryApiRoute.ts`; new routes
must add their own set with a comment explaining the contract. Tests in
`src/shared/primaryApiRoute.test.ts` are the canonical regression guard.

---

## 4. End-user behaviour

### Desktop

* Open **Settings → Fallback Providers → Primary API Route**.
* Pick **Venice (default)** or **Fraterna**.
* The setting is profile-scoped — each profile can choose its own route.
* Selection is main-process authoritative. The renderer mirror
  (`src/stores/settings-store.ts`) is hydrated by the desktop bridge
  (`desktopProviderSettings.get()`) and pushed back via
  `desktopProviderSettings.update({ primaryApiRoute })`.
* Persistence: the route is stored in
  `electron/userData/provider-settings.json` under each profile, in the
  `v2` schema. v1 files migrate transparently on the next write.
* Model cache key: the `useModels` hook includes `primaryApiRoute` in
  its `queryKey` so a route switch drops any cached catalog from the
  prior host. See `src/hooks/use-models.ts` for the regression test.
* Diagnostics: the route id is included in `SafeDiagnosticsSnapshot` so
  support engineers can see what the user is configured for. See
  `src/services/diagnosticsService.ts`.

### Web

* The route is **not** user-selectable from the UI; the web proxy is
  single-tenant.
* Operators set the route via the `VENICE_FORGE_PRIMARY_API_ROUTE` env
  var (`venice` or `fraterna`). Unknown values fall back to `venice`.
* The proxy dispatches to the Fraterna pair (or the Venice pair,
  identically configured) when the env var selects a supported route.
* All Family Safe Mode, body-size, prompt-limit, and circuit-breaker
  guards apply to both hosts identically.

---

## 5. Security & privacy posture

### Authentication

* Both routes use the **same Venice API key**. The credential lives in
  the existing main-process secure-storage boundary; the renderer never
  sees the raw key.
* The transport attaches `Authorization: Bearer <key>` to the outbound
  request regardless of which host receives the request.

### No new privacy surface

* No new credential is collected.
* No new secret persistence layer is added.
* No new outbound allowlist is created — the network-boundaries
  verifier treats the Fraterna host as a fixed allowlist entry, on par
  with `api.venice.ai`.
* No telemetry is sent to either host that the user has not already
  opted into.

### Diagnostics export

* The diagnostics drawer + JSON export include
  `primaryApiRoute: "<id>"` so support can confirm which route the
  user is on. The export bundle remains free of API keys, raw
  prompts, base64 media, and absolute paths.

### Endpoint allowlist

* The shared IPC validator
  (`electron/ipc/validation.ts:validateVeniceIpcRequest`) does NOT
  change. It still enforces the canonical Venice endpoint allowlist
  via `isAllowedVeniceRequest(...)`. The route resolver chooses the
  host AFTER endpoint validation has passed.

### Network boundaries

* `scripts/verify-network-boundaries.cjs` enumerates `fraterna.ai`
  as a fixed allowlist entry. A renderer-side or proxy-side fetch
  outside this allowlist is a verifier failure.

---

## 6. Failure modes

| Failure                                             | Behaviour                                                |
|-----------------------------------------------------|-----------------------------------------------------------|
| Fraterna returns `5xx`                              | The transport surfaces the error verbatim. The fallback chain does NOT auto-failover to Venice — that would mask billing/rate-limit signals. |
| Fraterna is unreachable (DNS, TLS, connect)         | The transport surfaces a transport error. The `venice` fallback is offered only via explicit `provider:` prefix. |
| User selects an unsupported route id                | The IPC validator rejects the update with a typed error; the store is unchanged. |
| Persisted state carries an unknown route id         | The sanitizer coerces it to the default (`venice`). The store never persists an unknown id. |
| Web env var carries an unknown value                | The resolver coerces it to the default (`venice`). The proxy continues to use `api.venice.ai`. |

---

## 7. Implementation seams

| Concern                    | File                                                        |
|----------------------------|-------------------------------------------------------------|
| Route id + host + matrix   | `src/shared/primaryApiRoute.ts`                             |
| Renderer mirror            | `src/stores/settings-store.ts`                              |
| Desktop IPC + persistence  | `electron/services/providerSettingsStore.ts`, `electron/ipc/handlers/apiKeyHandlers.ts` |
| Electron transport         | `electron/services/providerAdapters.ts:resolvePrimaryApiRouteForRequest`, `electron/services/veniceClient.ts:performSingleVeniceRequest` |
| Web proxy                  | `server.ts` (`resolveServerPrimaryApiRoute`, `fraternaProxyBase`, `fsmChatStreamFraternaProxy`, …) |
| Settings UI                | `src/components/settings/ProvidersPanel.tsx`                |
| Model cache key            | `src/hooks/use-models.ts`                                   |
| Diagnostics                | `src/services/diagnosticsService.ts`, `src/types/status.ts` |
| Network allowlist          | `scripts/verify-network-boundaries.cjs`                     |

If you are adding a new primary route, every file above must be updated
in lockstep. The README of this document is the entry point for any
new route audit.

---

## 8. Versioning

* `provider-settings.json` schema bumped from `1` to `2`. Existing
  v1 records are read transparently and re-emitted as v2 on the next
  write. Default for every legacy field is the documented
  pre-routing value.
* Renderer `useSettingsStore` persistence version bumped from `18`
  to `19`. The migration coerces unknown `primaryApiRoute` values to
  the default.

---

## 9. References

* `src/shared/primaryApiRoute.ts` — contract + resolver
* `docs/audits/VENICE_FORGE_FRATERNA_PRIMARY_API_ROUTING_AGENT_HANDOFF.md`
  — implementation handoff
* `docs/legal/PRIVACY.md` — privacy posture
* `docs/security/security-model.md` — security posture
* `docs/reference/Venice_swagger_api.yaml` — canonical Venice API
