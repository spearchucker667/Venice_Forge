# Security Model — Venice Forge

## Overview

Venice Forge is an Electron desktop application. The primary security concern is protecting the user's Venice API key and preventing it from being exposed to renderer code (the web UI layer).

---

## API Key Storage

- The Venice API key is stored using **Electron `safeStorage`**, which provides OS-level encryption:
  - **Windows**: DPAPI (Data Protection API) — key is encrypted per user/machine
  - **macOS**: Keychain
  - **Linux**: libsecret / Secret Service (may fall back to plaintext if unavailable; a warning is logged)
- The encrypted key is saved to `secure-prefs.json` in the Electron `userData` directory.
- The raw key is **never** written to disk unencrypted (except on Linux without Secret Service).
- The raw key is **never** sent to the renderer process or stored in IndexedDB.

## Renderer Isolation

- `contextIsolation: true` — preload and renderer run in separate contexts
- `nodeIntegration: false` — renderer cannot use Node.js APIs
- `sandbox: true` — renderer runs in a sandboxed Chromium process
- The preload exposes a narrow `window.veniceForge` API via `contextBridge`
- The renderer can ask **whether** a key is configured, but **cannot read** the key

## Local Venice Proxy

- When the app starts, the main process starts a local Express server on `127.0.0.1` with a randomly assigned port
- **Only loopback (127.0.0.1)** — no external network access
- The proxy injects the Venice API key on every outgoing request
- Only four endpoints are proxied: `/models`, `/chat/completions`, `/image/generate`, `/image/upscale`
- All other paths return `403 Forbidden`
- The proxy has in-memory rate limiting (120 req/min per IP)

## Navigation and Content Security Policy

- Renderer navigation is restricted to `file://` (production) or `http://localhost:5173` (dev)
- External URLs are opened in the OS browser, not in Electron
- New window creation (`window.open`) is denied
- CSP is applied via response headers:
  - `default-src 'self'`
  - `connect-src 'self' http://127.0.0.1:* ws://localhost:*` (allows the local proxy and Vite HMR)
  - `img-src 'self' data: blob:` (allows base64 images from the API)
  - No `unsafe-eval`, no `unsafe-inline` scripts

## IPC Payload Validation

- All IPC handlers validate input types and lengths before acting
- API key input is validated: must be a non-empty string, max 512 characters
- File paths are validated as strings before any filesystem operations
- No arbitrary shell execution is exposed via IPC

## What Is NOT Hardened (Known Risks)

1. **Local proxy access from other local processes**: Any process on the same machine can call `http://127.0.0.1:{port}/api/venice`. For a single-user desktop app this is acceptable; the threat model assumes the local machine is not compromised.

2. **IndexedDB data is not encrypted**: Chat history and generated images in IndexedDB are not encrypted. A user with access to the Chromium profile directory can read this data.

3. **Linux key storage**: If the Secret Service / libsecret is not available (some minimal Linux desktops), the API key is stored in plaintext. A warning is logged.

4. **No auto-update**: Updates must be installed manually. Users may run outdated versions with known vulnerabilities.

5. **No code signing by default**: The packaged app is not signed. On Windows, SmartScreen may warn users. Sign with a certificate for trusted distribution.

## Reporting Vulnerabilities

Please report security issues privately before public disclosure.
Open a GitHub Security Advisory or contact the maintainers directly.
