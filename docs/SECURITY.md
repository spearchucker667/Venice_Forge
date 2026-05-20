# Security Model

Venice Forge is an Electron app with a sandboxed React renderer, a preload bridge, and a privileged main process.

## Renderer, Preload, Main

- Renderer: no Node integration, sandbox enabled, context isolation enabled.
- Preload: exposes only `window.veniceForge` with typed methods for Venice requests, API key status/actions, diagnostics, logs, and JSON file dialogs.
- Main: owns filesystem access, OS dialogs, logging, secure storage, and Venice HTTPS requests.

The renderer cannot access arbitrary IPC channels, shell execution, local files, or the raw Venice API key.

## Venice Transport

Desktop mode uses direct IPC, not a loopback proxy. The main process validates every request before sending HTTPS traffic to `api.venice.ai`.

Allowed endpoints:

- `GET /models`
- `POST /chat/completions`
- `POST /image/generate`
- `POST /image/upscale`

Validation rejects unsupported methods, non-relative endpoints, unexpected origins, and payloads larger than 25 MB. Authorization is injected only in the main process. Error messages and logs are redacted before they reach the UI.

Web development mode still uses the Express `/api/venice` proxy from `server.ts` and requires `.env`.

## API Key Storage

On Windows, the API key is stored only when Electron `safeStorage` encryption is available. If Windows encryption is unavailable, saving fails with a user-readable error. On non-Windows platforms, plaintext fallback is disabled unless `VENICE_FORGE_ALLOW_PLAINTEXT_KEY_STORAGE=true` is explicitly set.

The key is never exported, imported, written to IndexedDB, copied into diagnostics, or exposed to the renderer.

## CSP and Navigation

Development CSP allows the Vite dev server and HMR. Production CSP is restrictive and does not allow broad localhost or websocket connections. Unexpected navigation is blocked, malformed URLs fail closed, and trusted external HTTPS links open in the OS browser. Packaged production DevTools are disabled unless `VENICE_FORGE_DEBUG_DEVTOOLS=true`.

## Logs and Diagnostics

Logs are stored under Electron `userData/logs/venice-forge.log`, capped and rotated simply at 1 MB. Authorization headers, API-key-like values, bearer tokens, and secret-like fields are redacted. Diagnostics show app/runtime versions, storage mode, userData path, transport mode, API key configured state, and last sanitized API error.

## Not Protected Against

- Malware or a debugger running as the same OS user.
- Screen capture, clipboard capture, or memory scraping by local compromise.
- Unencrypted IndexedDB contents for images, chats, and non-secret settings.
- Unsigned installer trust warnings.
- Venice account misuse if the user pastes a compromised key.
