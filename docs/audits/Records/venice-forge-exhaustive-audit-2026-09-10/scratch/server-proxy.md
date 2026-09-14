# Express / proxy audit — scratch findings

- **Auditor:** Express/proxy tranche
- **Date:** 2026-09-10
- **Baseline SHA:** `c3ae21af2f723111d92b43c7888a60930226d213`
- **Branch:** `main`
- **Package:** `venice-forge@3.0.0-beta.3`
- **Scope:** `server.ts` (1330 lines), `server.test.ts` (1276 lines, 64 `it()` cases)
- **Method:** static review of current source, tests, `http-proxy-middleware@4.2.0` / `httpxy`, and shared contracts. No live server, no `npm test`. Historical audits treated as hypotheses only.

Finding IDs: `VF-AUD-20260910-SRV-NNN`.

## Counts

| Bucket | Count |
| --- | ---: |
| Findings total | 21 |
| P1 confirmed defects | 3 |
| P2 confirmed defects | 8 |
| P2 missing feature / parity | 1 |
| P2 test gaps | 3 |
| P3 | 6 |
| Verified controls (not findings) | 16 |
| False positives / not reproduced | 0 |
| Commands executed | bootstrap only (no `test:server`) |

By class: confirmed defect 14 · missing feature 1 · security risk 2 (also tagged on defects) · test-quality 3 · performance/reliability 3 (overlapping) · documentation drift 1.

---

## Middleware order (verified)

For `/api/venice/*` the live stack is:

1. Shared security headers (CSP / `X-Content-Type-Options` / `X-Frame-Options` / `Referrer-Policy`)
2. Rate limiter → **429**
3. Circuit breaker → **503**
4. Method allowlist (`GET`/`POST` only) → **405**
5. Endpoint allowlist (`isAllowedVeniceRequest`) → **405** wrong method on a known path, **403** unknown path
6. API-key gate → **401** (skipped when `NODE_ENV === "test"`)
7. `express.raw({ type: "*/*", limit: MAX_PROXY_BODY_BYTES })`
8. System-prompt limit on `POST /chat/completions` → **400**
9. `maybeRunLocalFamilyGuard` → **451**
10. http-proxy-middleware → upstream / **502**

`/api/proxy-jina` and `/api/proxy-scrape` share a separate rate limiter, then their own parsers and guards. They are not behind the Venice API-key gate.

---

## P1 findings

### VF-AUD-20260910-SRV-001 — Per-request `createProxyMiddleware()` leaks HTTP `close` listeners

- **Class:** confirmed defect · performance risk
- **Severity:** P1
- **Evidence:** `server.ts:636-868` builds a fresh `proxyConfig` and calls `createProxyMiddleware(proxyConfig)` inside the `/api/venice` request handler (FSM branch at 830; non-FSM branch at 867). `node_modules/http-proxy-middleware/dist/http-proxy-middleware.js:18-24` constructs a new `httpxy` server and `registerPlugins()` per instance. Lines 77–92 of that file then do `server.on("close", …)` the first time `middleware()` sees `req.socket.server`, using a per-instance `activeServers` set.
- **Observed:** every successful Venice proxy request creates a new `HttpProxyMiddleware` whose `activeServers` is empty, so every request adds another `close` listener on the Express HTTP server and retains the proxy EventEmitter until process exit.
- **Expected:** one (or a small fixed set of) long-lived middleware instance(s) registered at `createServerApp()` time.
- **Impact:** `MaxListenersExceededWarning`, unbounded listener/memory growth in web mode, extra keep-alive `httpxy` state per call. Localhost-only bind (`server.ts:1315-1321`) limits who can drive it, but a normal UI session is enough.
- **Tests:** none. `server.test.ts:13-31` mocks `createProxyMiddleware` as a one-shot function, so the leak is invisible.

### VF-AUD-20260910-SRV-002 — FSM media size guard Layer 2 is dead; interceptor buffers unbounded bodies

- **Class:** confirmed defect · security risk (resource exhaustion)
- **Severity:** P1
- **Evidence:**
  - Intended design: `src/shared/limits.ts:18-23` (`VENICE_PROXY_MAX_FSM_RESPONSE_BYTES = 256 MiB`); comments at `server.ts:671-748` claim a Content-Length pre-check plus a streaming byte counter that destroys the upstream socket *before* `responseInterceptor` buffers the body.
  - Implementation: `server.ts:732-865` assigns `proxyConfig.on.proxyRes = responseInterceptor(...)`, then calls `createProxyMiddleware(proxyConfig)` (line 830), *then* replaces `proxyConfig.on.proxyRes` with `byteLimitedProxyRes`.
  - `http-proxy-middleware` binds `options.on.proxyRes` in the constructor via `proxyEventsPlugin` (`dist/plugins/default/proxy-events.js:32-40`). Mutating `options.on.proxyRes` afterwards does not replace the already-registered listener.
- **Observed:** the streaming counter is never installed. `responseInterceptor` (`dist/handlers/response-interceptor.js:41-47`) concatenates the entire upstream body with no cap. The 256 MiB check at `server.ts:755-758` runs only after `Buffer.concat`.
- **Expected:** byte cap on the raw `proxyRes` stream, destroy + 413 before buffering.
- **Impact:** a large FSM media response (chunked video/audio, or a lying/missing `Content-Length`) can OOM the Express process. The documented two-layer guard does not exist at runtime.

### VF-AUD-20260910-SRV-003 — Layer 1 FSM 413 still uses `res.json()` inside `responseInterceptor` (ERR_HTTP_HEADERS_SENT)

- **Class:** confirmed defect
- **Severity:** P1
- **Evidence:**
  - `server.ts:683-690`: when `Content-Length` > 256 MiB, `proxyRes.destroy()` then `proxyResRes.status(413).json(...)`.
  - That function is `originalProxyRes`, invoked from *inside* the interceptor callback at `server.ts:750-751` — i.e. after `response-interceptor.js:46-51` has already `copyHeaders(proxyRes, res)`.
  - `response-interceptor.js:59-70` then always `setHeader('content-length')`, `res.write()`, `res.end()` with the interceptor return value.
  - Express `res.status(413).json()` sends and finishes the response. The interceptor’s subsequent write is a second send.
- **Observed:** the same `ERR_HTTP_HEADERS_SENT` class as VF-PLAYTEST-002, still present on the FSM media path when a large `Content-Length` is declared. `identifyAndValidateGeneratedMedia` is also `await`ed in the interceptor (`server.ts:784, 811`) with no try/catch; a throw becomes an unhandled rejection in the interceptor `end` callback (no try/catch in `response-interceptor.js:46-70`).
- **Expected:** mutate `res.statusCode` / headers and *return* the 413 JSON (as the post-buffer cap already does at 755-758); never `res.json()` from inside the interceptor. Guard interceptor failures.
- **Tests:** `server.test.ts:343-367` (VF-PLAYTEST-002) cannot see this — see SRV-004.

---

## P2 findings

### VF-AUD-20260910-SRV-004 — VF-PLAYTEST-002 does not exercise real httpxy header flush

- **Class:** test-quality
- **Severity:** P2
- **Evidence:** `server.test.ts:13-31` replaces `createProxyMiddleware` with a stub that optionally calls `options.on.proxyRes` and `res.status(status).json({ mocked: true })`. The stub’s `proxyReq` is never a Node `ClientRequest`, so `removeHeader` cannot throw `ERR_HTTP_HEADERS_SENT`. The media test (`server.test.ts:343-367`) only asserts `res.status !== 0` and a later `/health` 200.
- **Observed:** the regression that previously crashed the process is not covered against `http-proxy-middleware@4.2.0` / httpxy (`proxyReq` is emitted on `socket`, and `applyVeniceProxyHeaders` may `write()` the POST body).
- **Expected:** an integration test with a real ClientRequest (or a stub that throws on `removeHeader`/`setHeader` after `write`) plus a Content-Length > 256 MiB case.

### VF-AUD-20260910-SRV-005 — Venice proxy error JSON echoes `err.message` to the client

- **Class:** confirmed defect · security risk (info disclosure)
- **Severity:** P2
- **Evidence:** `server.ts:713-726` `on.error` handler. Logs go through `error("Proxy error:", err.message)` (`src/shared/logger.ts` redacts). The *response* is `JSON.stringify({ error: "Proxy error", details: err.message })` with no redaction.
- **Contrast:** Jina (`server.ts:1010-1011`) and scrape (`server.ts:1186-1187`) return generic `"Jina request failed"` / `"Scrape failed"`; tests lock that (`server.test.ts:710-722`).
- **Expected:** generic client body; redacted details only in logs.
- **Note:** production `error()` is a no-op (`logger.ts:66-68`), so the client `details` field is the only remaining diagnostic.

### VF-AUD-20260910-SRV-006 — Jina `fetch()` follows redirects; host allowlist is first-hop only

- **Class:** confirmed defect · security risk (SSRF defense-in-depth)
- **Severity:** P2
- **Evidence:** `server.ts:879-883` allowlists `https:` + `r.jina.ai` | `s.jina.ai`. `server.ts:974-978` `fetch(parsed.toString(), { method: "GET", headers, signal })` does not set `redirect: "error"` / `"manual"`. Node fetch defaults to follow.
- **Contrast:** scrape proxy explicitly rejects 3xx (`server.ts:1114-1117`).
- **Observed:** a 302 from an allowlisted Jina host to `http://127.0.0.1/…` or a link-local address would be followed from the Forge host. The comment at 968-972 (“SSRF to internal services is impossible by construction”) is first-URL only.
- **Expected:** `redirect: "error"` or re-validate scheme/host on every hop. Scrape already has the stricter pattern.

### VF-AUD-20260910-SRV-007 — `TRUST_PROXY` rate-limit key includes spoofable `req.ip`

- **Class:** confirmed defect
- **Severity:** P2
- **Evidence:** `server.ts:412-418` (Venice/Jina/scrape limiter) and the duplicate static limiter at `server.ts:1260-1265`. When `x-forwarded-for` is present *and* `AppConfig.TRUST_PROXY` is set, the key is `` `${socket}|${req.ip}` ``.
- **Observed:** the socket prefix is constant for a given peer; varying `X-Forwarded-For` still creates distinct map entries, so the 10k-entry cap is the only bound. The comment claims this *prevents* XFF bypass; concatenating `req.ip` reintroduces it.
- **Expected:** key on `req.ip` only when the proxy is trusted and overwrites XFF; otherwise key only on `socket.remoteAddress`.
- **Mitigation already present:** `HOST` is forced to loopback (`server.ts:1317-1321`), so a remote client cannot hit this unless an operator later binds more widely *and* sets `TRUST_PROXY`.

### VF-AUD-20260910-SRV-008 — Process-global circuit breaker trips on any Venice 5xx

- **Class:** confirmed defect
- **Severity:** P2
- **Evidence:** `server.ts:466-488` (open/half-open gate on *all* `/api/venice` requests); `server.ts:695-701` increments `circuitFailures` on `statusCode >= 500` and opens for 30s at 5 failures or any half-open failure.
- **Observed:** five `/image/generate` 500s (a documented upstream worker failure mode) return **503** for `/models`, chat, and every other allowlisted route for 30 seconds. The breaker runs *before* the allowlist, so unknown paths also get 503 (see SRV-016).
- **Expected:** isolate by route family, or do not treat application 5xx as “upstream down”.
- **Tests:** `server.test.ts:994-1028` only checks the happy recovery path on `GET /models`.

### VF-AUD-20260910-SRV-009 — Web FSM forces provider `safe_mode: true` (contract drift vs Electron)

- **Class:** confirmed defect · documentation drift
- **Severity:** P2
- **Evidence:** `server.ts:631-633` calls `forceProviderSafeModeInJsonBody(endpoint, req.body)` whenever local FSM is on; `server.ts:175` always passes `true` into `applyVeniceApiSafeMode`.
- **Contrast:** `src/shared/veniceSafeMode.ts:1-8` and `electron/services/guardPipeline.ts:149-161` state that provider `safe_mode` and local Family Safe Mode are independent; Electron applies `getRuntimeVeniceApiSafeMode()`, not FSM.
- **Observed:** default-ON web FSM (the production web posture) silently rewrites image generate/edit/multi-edit bodies to `safe_mode: true`, overriding the renderer setting. Electron does not.
- **Expected:** proxy must not couple the two flags; request-side local guard is the FSM control.

### VF-AUD-20260910-SRV-010 — Web proxy does not `screenResponseBody` Venice chat/JSON (Electron does)

- **Class:** missing feature / transport parity
- **Severity:** P2
- **Evidence:** Express screens responses only for `/api/proxy-jina` (`server.ts:985-992`) and `/api/proxy-scrape` (`server.ts:1157-1164`), plus FSM *media* structural screening (`server.ts:761-822`). `src/services/veniceClient/` has no `screenResponseBody` call. Electron `electron/services/guardPipeline.ts:246-250` screens Venice response text on the IPC path.
- **Observed:** a blocked phrase in a chat completion (or augment JSON) is filtered in desktop mode and delivered in web mode. `SECURITY.md` documents Jina/scrape-only response screening for web; this is still a real FSM gap on the web trust boundary.
- **Expected:** same response-screening contract as `performGuardedVeniceRequest`, or an explicit product exception at the proxy with a user-visible web warning.

### VF-AUD-20260910-SRV-011 — System-prompt limit ignores non-string `messages[].content`

- **Class:** confirmed defect
- **Severity:** P2
- **Evidence:** `server.ts:567-574` uses `checkSystemPromptMessages(parsed.messages)`. `src/shared/promptLimits.ts:109-125` only concatenates parts where `role === "system"` **and** `typeof content === "string"`. Array/multimodal system content is skipped, so the 8,192-token / 32,768 code-point ceiling is not applied.
- **Contrast:** `src/shared/safety/promptPayloadExtractor.ts:127-138` *does* walk array content for FSM screening.
- **Observed:** `{ role: "system", content: [{ type: "text", text: "a".repeat(40000) }] }` returns no 400 from Express and is forwarded (subject only to `MAX_PROXY_BODY_BYTES`).
- **Tests:** `server.test.ts:523-531` only covers a string of length 32,769. Electron `electron/ipc/validation.ts:294-298` shares the same helper.

### VF-AUD-20260910-SRV-012 — No test that a keyless allowlisted request returns 401

- **Class:** test-quality
- **Severity:** P2
- **Evidence:** the key gate is `server.ts:537-541` (401 when no env key, no dev session, and `NODE_ENV !== "test"`). `server.test.ts:304-334` locks keyless **403** / **405** (VF-PLAYTEST-001) but never `GET /api/venice/models` / `POST /chat/completions` under `NODE_ENV=development` with `VENICE_API_KEY` unset.
- **Observed:** the 500→401 change is unregressed. Vitest sets `NODE_ENV=test`, which *disables* the gate, so the common suite never sees 401.

### VF-AUD-20260910-SRV-013 — Jina proxy reflects unsanitized `Content-Type`

- **Class:** confirmed defect
- **Severity:** P2
- **Evidence:** `server.ts:980-998` `res.setHeader("Content-Type", contentType || "text/plain")` with the raw upstream header. Scrape has `sanitizeScrapeContentTypeHeader` (`server.ts:53-61`, used at 1166-1171) and tests for CRLF/`foo=bar` injection (`server.test.ts:1206-1239`).
- **Observed:** Jina text responses skip that sanitizer. Fetch’s header parser reduces practical CRLF risk versus raw `https.request`, but charset/parameter reflection and non-allowlisted types (`text/html`, etc.) are unfiltered.
- **Expected:** reuse the scrape allowlist + charset sanitizer (or a JSON-only policy).

### VF-AUD-20260910-SRV-014 — Dev session-key TTL is untested

- **Class:** test-quality
- **Severity:** P2
- **Evidence:** `server.ts:182-199` — 24h `expiresAt`; `getDevSessionKey` returns `""` after expiry. `server.test.ts:139-191` covers store/clear/empty/oversize and Jina Authorization override. No `vi.useFakeTimers()` / clock injection on `expiresAt`.
- **Observed:** an expired in-memory key would keep `configured: true` until the next `getDevSessionKey` call on a proxied request; the TTL path is dead in tests.

### VF-AUD-20260910-SRV-015 — FSM request screening sees only the first 8,000 chars per field

- **Class:** confirmed defect (shared extractor, enforced at this proxy)
- **Severity:** P2
- **Evidence:** web proxy always calls `maybeRunLocalFamilyGuard` on POST (`server.ts:587-590`). `src/shared/safety/promptPayloadExtractor.ts:42,125-126` slices each `messages[].content` to `MAX_FIELD_CHARS = 8_000`. The prompt *limit* allows 32,768 code points (`promptLimits.ts` + `server.ts:567-574`). Guard scan windows (`MAX_SCAN_CHARS = 16_384` plus tail/middle) never run on the truncated tail.
- **Observed:** CSAM/adult terms placed after byte 8,000 of an otherwise-legal system prompt are not screened on web (or Electron, same helper) but are still dispatched.
- **Expected:** extract at least `SYSTEM_PROMPT_MAX_CODE_POINTS`, or scan head+middle+tail of each field the way `screenResponseBody` does.

---

## P3 findings

### VF-AUD-20260910-SRV-016 — Circuit breaker can mask 403/405

- **Class:** confirmed defect
- **Severity:** P3
- **Evidence:** circuit middleware (`server.ts:473-488`) is mounted before the allowlist (`server.ts:491-527`). VF-PLAYTEST-001 fixed the same masking bug for the API-key gate, not for 503.
- **Observed:** while the breaker is open, `GET /api/venice/totally-fake-endpoint` is 503 rather than 403.

### VF-AUD-20260910-SRV-017 — `startServer` failure uses raw `console.error`

- **Class:** confirmed defect
- **Severity:** P3
- **Evidence:** `server.ts:1226-1228` `console.error("Failed to start server:", err)` instead of `src/shared/logger.ts`. Listen-path errors at 1326 use the redacting `error()`. Unlikely to contain keys; violates the single logging sink.

### VF-AUD-20260910-SRV-018 — CSP/base headers present; COOP/COEP/HSTS/Permissions-Policy absent

- **Class:** missing feature (hardening)
- **Severity:** P3
- **Evidence:** `server.ts:349-387` sets `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, and a per-request CSP (production: nonce + `strict-dynamic`; `img-src 'self' data: blob:` with no `https:` — tested at `server.test.ts:370-378`). No `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy`, `Permissions-Policy`, or HSTS.
- **Context:** bind is loopback-only; HSTS is not meaningful on `http://127.0.0.1`. Residual browser-isolation hardening only.

### VF-AUD-20260910-SRV-019 — FSM env disable is case-sensitive

- **Class:** confirmed defect
- **Severity:** P3
- **Evidence:** `server.ts:100-104` disables only when the value is exactly `"false"` or `"0"`. `"FALSE"` / `"False"` leave FSM on (fail-safe, but surprising). Tests only use `"false"` and `"0"` (`server.test.ts:872-902`).

### VF-AUD-20260910-SRV-020 — 429 responses omit `Retry-After`

- **Class:** missing feature
- **Severity:** P3
- **Evidence:** `server.ts:432-433` and `1278-1279`. Upstream `Retry-After` *is* copied on Venice proxy responses (`server.ts:666-667`). Local limiter 429s are unadorned JSON.

### VF-AUD-20260910-SRV-021 — Stale comments vs VF-WEB-001 implementation

- **Class:** documentation drift
- **Severity:** P3
- **Evidence:** `server.ts:745-746` still says “Accept-Encoding is stripped on outbound FSM requests (see proxyReq above)”. The live path sets `headers: { "Accept-Encoding": "identity" }` at `server.ts:648-659` and does **not** `removeHeader("Accept-Encoding")` in `applyVeniceProxyHeaders` (`server.ts:144-168`). Layer 1/2 comments (`server.ts:671-748`) describe header-time and pre-buffer behavior that SRV-002/003 show is not what runs.

---

## Verified controls (not findings)

1. **Endpoint allowlist** — `ALLOWED_VENICE_ENDPOINTS` + `VENICE_ENDPOINT_METHODS` + `isAllowedCharactersRequest` (`src/shared/validation.ts`); Express uses `isAllowedVeniceRequest` (`server.ts:512-525`). Tests: valid `/models`, augment, `/characters` and slug; 403 on unknown, nested characters, proxy root; 405 on DELETE, POST `/models`, GET `/chat/completions`, POST `/characters` (`server.test.ts:201-291`).
2. **Method allowlist** — `GET`/`POST` only (`server.ts:494-496`). OPTIONS/PUT/TRACE → 405.
3. **API-key gate order vs 403/405** — gate is *after* allowlist (`server.ts:529-541`). Keyless unknown path 403 and wrong method 405 are tested (`server.test.ts:304-334`). 451 cannot mask those codes. Residual: 401 vs allowlisted path untested (SRV-012); 503 can mask (SRV-016).
4. **Family Safe Mode on web** — default ON; env override wins; `X-Venice-Forge-Family-Safe-Mode` ignored unless `VENICE_FORGE_ALLOW_CLIENT_SAFETY_OVERRIDE=true` (`server.ts:77-113`). Matrix tests `server.test.ts:760-903`. Mandatory child-safety still 451 when the optional filter is off (`server.test.ts:534-551, 823-837, 872-902`).
5. **Accept-Encoding / VF-WEB-001 intent** — FSM media sets `Accept-Encoding: identity` via the proxy `headers` option at request construction (`server.ts:640-659`), which httpxy applies in `setupOutgoing` before `ClientRequest`. That is the correct fix *for that header*. Remaining crash/OOM issues are SRV-001–003, not a regression of the identity overlay itself.
6. **CORS** — no `Access-Control-*` middleware (grep on `server.ts` is empty). Same-origin by construction: Vite `server.proxy["/api"]` → `http://127.0.0.1:3000` (`vite.config.ts:86-95`); production serves `dist` from the same Express app (`server.ts:1246-1311`). Absence of ACAO is correct, not a hole.
7. **CSP + baseline headers** — see SRV-018. `x-powered-by` disabled (`server.ts:223`). Production `script-src` nonce + `strict-dynamic`; `object-src 'none'`; `frame-ancestors 'none'`; `form-action 'none'`.
8. **Jina proxy** — HTTPS + host allowlist; renderer `Authorization` / `x-jina-api-key` dropped; forward-header allowlist + CRLF/NUL rejection; 2 MiB bounded read with cancel; 451 on blocked bodies without echoing upstream text; 502 generic on fetch errors (`server.ts:872-1012`, tests 93-128, 611-757).
9. **Scrape proxy SSRF** — HTTPS only; `isPrivateHostname` on hostname and *every* A/AAAA; custom `lookup` pins the pre-checked address; 3xx destroyed; content-type allowlist; 2 MiB cap; response screening; raw-mode Content-Type sanitizer (`server.ts:1015-1188`, tests 906-1274).
10. **Prompt-limit enforcement (string system messages)** — `POST /chat/completions` parses JSON and rejects over-limit combined system strings with the shared message (`server.ts:567-574`, `server.test.ts:523-531`). Split string messages are combined in the helper.
11. **Secrets not in application logs** — request log is method/path/status/duration, non-production only (`server.ts:225-234`). Session-key responses never echo the key (`server.test.ts:145-146, 162-163`). `error()`/`warn()` run through `sanitizeArg` → `sanitizeErrorText` (Bearer / `vn-` / `sk-` / env assignments / paths). HPM default logger is a noop unless `options.logger` is set (`http-proxy-middleware/dist/logger.js:14-21`); `server.ts` does not pass one. Residual client leak is SRV-005; residual raw `console.error` is SRV-017.
12. **Renderer credential stripping on Venice proxy** — `FORBIDDEN_RENDERER_PROXY_HEADERS = Authorization, Cookie, Host` (`server.ts:142-154`); tests `server.test.ts:381-428`.
13. **Dev session keys** — production 404; non-loopback 403; 2 kb JSON; 512-char cap; in-memory TTL structure; process-exit/SIGINT/SIGTERM nulling with test cleanup of listeners (`server.ts:260-333, 207-222`, tests 73-90, 139-191).
14. **Loopback bind** — `HOST` not in `{127.0.0.1, localhost, ::1}` falls back to `127.0.0.1` (`server.ts:1315-1321`).
15. **Rate limiter in front of allowlist** — every `/api/venice` request counts, including 403s (`server.ts:459-462`, tests 431-460). Jina/scrape share `proxyRateLimiter` (SRV-020/021-adjacent, not a bypass).
16. **Health** — `GET /health` 200 `{ status, version }` without proxying (`server.ts:256-258`).

---

## Residual notes (not separate findings)

- `applyVeniceProxyHeaders` still `removeHeader`/`setHeader` in the `proxyReq` event (`server.ts:144-168`). httpxy emits `proxyReq` on `socket` (`httpxy/dist/index.mjs:287-290`) and, when `followRedirects` is off, immediately `pipe`s on a non-pending socket (325-327). For POST, `write(body)` in `applyVeniceProxyHeaders` flushes headers; that is why *subsequent* `removeHeader("Accept-Encoding")` crashed. Current code does not remove Accept-Encoding there. Residual risk is any future header mutation after `write()`.
- FSM media JSON screening keys (`dataBase64`, `image`, `images`, `dataUrl`, `audio`, `video` at `server.ts:768`) match Electron’s `stringifyResponseForScreening` strip list. Remote `https://` items fail closed via `identifyAndValidateGeneratedMedia` (`mediaScreener.ts:372-382`).
- `NODE_ENV === "test"` skips the 401 key gate so unit tests can hit the mock proxy without credentials. Production/development do not skip it.
- Scrape `lookup` uses only `lookupResults[0]` after proving *all* records are public (`server.ts:1071-1110`). Conservative on mixed public/private; no Happy-Eyeballs fallback if the first address is unroutable.

---

## Suggested fix order

1. Hoist `createProxyMiddleware` to app lifetime (two instances: FSM-media interceptor vs pass-through) — closes SRV-001 and makes SRV-002’s wrapper actually register.
2. Install the byte counter *before* `createProxyMiddleware` (or as an HPM plugin), and never `res.json()` from inside `responseInterceptor` — closes SRV-002/003.
3. Replace VF-PLAYTEST-002 with a real-httpxy (or throwing-ClientRequest) test, plus Content-Length > 256 MiB — closes SRV-004.
4. Generic-ize proxy 502 bodies; `redirect: "error"` on Jina fetch; stop forcing provider `safe_mode` from FSM — SRV-005/006/009.
5. Prompt-limit array content + extractor window vs 32k ceiling — SRV-011/015.
6. Add keyless 401 + session TTL tests — SRV-012/014.
