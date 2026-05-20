<div align="center">

# Venice Forge

**Private AI creation studio — Electron desktop app powered by the Venice API**

</div>

Venice Forge is a cross-platform desktop application for interacting with the [Venice.ai](https://venice.ai) inference API. It provides a full-featured studio with:

- **Prompt / Chat** — conversational completions with streaming support
- **Create / Image** — text-to-image generation and upscaling
- **Batch** — parallel multi-prompt processing
- **Research** — web-search-augmented chat
- **Catalog** — live model discovery and selection
- **Library / Gallery** — generated image storage and management
- **Config / Settings** — API key management, model defaults
- **Status / Diagnostics** — request logs, rate limits, balance headers

---

## Screenshots

> _Place screenshots here_

---

## Requirements

- **Node.js** ≥ 20 (v24 recommended)
- **npm** ≥ 10
- A [Venice.ai](https://venice.ai) API key

---

## Development Setup

### 1. Clone and install

```bash
git clone https://github.com/spearchucker667/Test-ai.git
cd Test-ai
npm install
```

### 2. Configure Venice API key

**Desktop (Electron) mode:**
Set the key through the app's **Settings → Venice API Key** panel after launch.

**Web/browser mode:**
Create a `.env` file in the project root (copy from `.env.example`):

```bash
cp .env.example .env
# Edit .env and set VENICE_API_KEY
```

The `.env` file is git-ignored. Never commit a real API key.

---

## Running the App

### Web / browser development mode

Starts the Vite dev server + Express Venice proxy on `http://localhost:3000`.

```bash
npm run dev        # or: npm run dev:web
```

### Electron desktop development mode

Starts Vite, then launches Electron loading the Vite dev server.

```bash
npm run dev:electron
```

On first launch, go to the **Config** tab and enter your Venice API key.

---

## Building

### Web build only

```bash
npm run build:web
```

Output: `dist/`

### Full build (web + Electron main process)

```bash
npm run build
```

Output: `dist/` (renderer) + `dist-electron/` (main process)

### Type-check everything

```bash
npm run typecheck
```

### Run tests

```bash
npm test
```

---

## Packaging — Windows Installer

### Prerequisites

- Windows or a cross-compilation environment
- `build/icon.ico` — provide a real `.ico` file before packaging. See `build/icon-placeholder.md`.

### Build the Windows installer

```bash
npm run dist:win
```

Produces:
- `release/Venice Forge-<version>-x64-setup.exe` — NSIS installer
- `release/Venice Forge-<version>-x64-portable.exe` — single-file portable

### Build all platforms

```bash
npm run dist
```

---

## Where Things Are Stored

| What | Where |
|---|---|
| Generated images | IndexedDB in the app renderer |
| Chat history | IndexedDB in the app renderer |
| App preferences | IndexedDB (renderer) + `secure-prefs.json` (Electron userData) |
| Venice API key | OS-encrypted via Electron `safeStorage` — DPAPI on Windows, Keychain on macOS |
| Electron userData | Windows: `%APPDATA%\Venice Forge\` · macOS: `~/Library/Application Support/Venice Forge/` |
| Build output | `release/` |

---

## Desktop Security Model

- The Venice API key is stored using Electron `safeStorage` (Windows DPAPI / macOS Keychain).
- The renderer (web UI) **never** receives the API key.
- All Venice API traffic is proxied through a local Express server bound to `127.0.0.1` only (not `0.0.0.0`). The port is chosen randomly at startup.
- The renderer receives only the local proxy URL (`http://127.0.0.1:{port}/api/venice`).
- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` are enforced.
- Only the four allowlisted Venice endpoints are proxied: `/models`, `/chat/completions`, `/image/generate`, `/image/upscale`.
- Navigation and new windows are restricted to the app origin.
- Content Security Policy headers are applied to the renderer.

See [docs/SECURITY.md](docs/SECURITY.md) for full details.

---

## Troubleshooting

**"Venice API key is not configured"**
→ Open **Config / Settings**, enter your key, click **Save key**, then **Test connection**.

**"TypeError/fetch failure"**
→ The local proxy might not have started. Restart the app. If the issue persists, check the DevTools console.

**"401 invalid or missing API key"**
→ Your key is invalid or expired. Go to **Config**, delete the key, and re-enter it.

**"429 rate limit"**
→ Venice rate limit hit. Wait a moment and retry. The app will automatically retry transient errors.

**"Model discovery failed"**
→ The app falls back to built-in model IDs. Your API key may be missing or Venice may be unavailable.

**Electron app won't start**
→ Check that `dist-electron/main.js` exists (`npm run build:electron`). Make sure `dist/index.html` exists (`npm run build:web`).

---

## Known Limitations

- Image gallery and chat history are stored in browser IndexedDB, which is cleared if you uninstall and reinstall. Export your data via **Config → Export data** before uninstalling.
- Streaming chat is supported in web mode and Electron mode via the local proxy.
- No auto-update is configured. Update manually by downloading a new installer.
- macOS code signing is not configured. You may need to right-click → Open to bypass Gatekeeper.

---

## Release Checklist

See [docs/RELEASE.md](docs/RELEASE.md).

---

## Contributing

1. Fork and create a feature branch
2. `npm run typecheck && npm test && npm run build`
3. Submit a pull request

