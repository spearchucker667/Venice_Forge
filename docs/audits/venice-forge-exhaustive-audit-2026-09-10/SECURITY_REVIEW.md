# Security review

Baseline: `c3ae21af2f723111d92b43c7888a60930226d213`

## Trust boundaries

```text
Renderer (sandboxed, no Node)
  → preload contextBridge (window.veniceForge)
    → privileged IPC (validateIpcSender + rate limit)
      → main-process services (secureStore, guardPipeline, files, sync)
        → Venice API (veniceFetch / electron veniceClient)
Web renderer
  → Express proxy (server.ts allowlist + 451 safety)
    → Venice API
```

## Electron window hardening — verified

`electron/main.ts:181-188`:

- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`
- `webSecurity: true`
- navigation and `setWindowOpenHandler` deny in-app popups
- `shell.openExternal` only after `isTrustedExternalUrl` (https, non-private hostname) and a confirmation dialog

## IPC

Privileged channels use `registerPrivilegedIpcChannel` (`electron/ipc/handlers/common.ts:30-46`): sender-frame validation then rate limit.

Venice requests replace renderer `profileId` with `getProfileSessionId(event.sender)` before validation (`electron/ipc/handlers/veniceHandlers.ts:55-60`). Renderer-supplied Family Safe Mode is ignored; main `runtimeSafetySettings` is authoritative.

`app:proxyScrape` pins DNS results into `https.request` `lookup` and rejects redirects (`electron/ipc/handlers/systemHandlers.ts:98-169`).

Web `/api/proxy-jina` allowlists `r.jina.ai` / `s.jina.ai` over HTTPS but `fetch()` follows redirects (P2-016). Venice proxy `on.error` returns `details: err.message` (P2-015). FSM media `responseInterceptor` buffers unbounded bodies because Layer 2 is assigned after http-proxy-middleware binds `on.proxyRes` (P1-007).

## Secrets

- Venice keys: `apiKey:set` / `getStatus` / `delete`. No raw `apiKey:get`.
- Master/profile passwords: typed channels, reserved names blocked on generic credential IPC.
- Generic `credential:get` still returns values for non-reserved keys — **VF-AUD-20260910-P2-002**.
- Renderer console in production is redacted via `redactErrorMessage` before log persistence. Dev stdout prints unredacted renderer console (dev-only).

## Custom protocols

`venice-media`, `venice-tts`, `venice-character-cache` are registered privileged (`secure`, `standard`, `supportFetchAPI`, `corsEnabled`; media/tts also `stream`). Originless Chromium media requests are allowed by design. Capability-token scaffolding exists but is not wired — **design risk**, ROADMAP `VF-CAPABILITY-PROVENANCE-2026-08-31`.

## XSS

`dangerouslySetInnerHTML` in `Meteocon` injects bundled SVG after `sanitizeSvgDocument` and fail-closed empty SVG on parse error. Chat markdown uses `rehype-sanitize`.

## Hosted scanning (this SHA)

- CodeQL run `34044151609`: success
- Open code-scanning alerts: 0
- Open secret-scanning alerts: 0
- Dependabot: #31, #32 (joi, low, dev), #33 (vitest mocker, medium, dev)
- Local production npm audit: **js-yaml high** — VF-AUD-20260910-P1-001
- Express FSM media size guard: streaming cap never registers — VF-AUD-20260910-P1-007
- Document Agent attachment session mismatch — VF-AUD-20260910-P1-008

## Taint-chain summary for P1-001

```text
Source: GitHub Releases latest.yml (or other electron-updater YAML)
Transform: electron-updater js-yaml load (merge keys enabled in 4.x)
Validation: maxTotalMergeKeys does not count empty mappings (GHSA-2883-xcg3-v3hh)
Sink: CPU in updater process
Impact: DoS of update check; not RCE
```
