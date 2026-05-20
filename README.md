# Venice Forge

Venice Forge is a Windows-first Electron desktop app for the Venice API. It includes chat, image generation, batch prompting, model discovery, a local library, settings, import/export, diagnostics, and Windows `.exe` packaging.

## Requirements

- Windows 10/11 for release builds
- Node.js 20 or 22
- npm 10+
- A Venice API key

## Development

```bash
npm install
npm run dev:electron
```

Useful scripts:

- `npm run dev:web` runs the Vite/Express web mode.
- `npm run typecheck` checks renderer and Electron TypeScript.
- `npm test` runs Vitest.
- `npm run build` builds `dist/` and `dist-electron/`.
- `npm run clean` removes generated build output with `rimraf`.

## Windows Builds

```bash
npm run verify:icon
npm run dist:win
npm run verify:dist
```

Artifacts are written to `release/`:

- `Venice-Forge-<version>-x64-Setup.exe`
- `Venice-Forge-<version>-x64-Portable.exe`

`build/icon.ico` is required before packaging. This repo includes a generated placeholder; run `npm run generate:icon` if it is missing, then replace it with final artwork before public release.

Local builds are unsigned unless standard electron-builder signing environment variables are set (`CSC_LINK`, `CSC_KEY_PASSWORD`, `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD`). Unsigned installers can trigger Windows SmartScreen warnings.

## API Key Setup

In desktop mode, open `Config`, paste the Venice API key, click `Save key`, then `Test connection`. On Windows, Venice Forge refuses to store the key if Electron `safeStorage` encryption is unavailable.

In web mode, copy `.env.example` to `.env` and set `VENICE_API_KEY`.

## Storage

- API key: Electron `safeStorage` in `%APPDATA%\Venice Forge\secure-prefs.json`
- Logs: `%APPDATA%\Venice Forge\logs\venice-forge.log`
- Images, chats, and non-secret settings: renderer IndexedDB
- Exports: versioned JSON with `version`, `exportedAt`, `appVersion`, and `data`

Import validates JSON size and schema, rejects unexpected stores, strips secret-like fields, and merges by ID rather than clearing existing data. API keys are never imported or exported.

## Security Model

Desktop Venice API calls use a narrow preload API and main-process IPC transport. The renderer cannot read the raw API key, cannot invoke arbitrary IPC channels, and cannot choose arbitrary Venice endpoints. Allowed endpoints are `/models`, `/chat/completions`, `/image/generate`, and `/image/upscale`.

Production CSP does not allow localhost networking. Navigation is blocked except for the app files; trusted external HTTPS links open in the OS browser. Packaged production DevTools are disabled unless `VENICE_FORGE_DEBUG_DEVTOOLS=true`.

See [docs/SECURITY.md](docs/SECURITY.md).

## Troubleshooting

- Missing icon: run `npm run generate:icon`, then `npm run verify:icon`.
- Packaging failure: run `npm run clean && npm install && npm run dist:win`.
- Unsigned warning: expected for local builds; sign with electron-builder env vars for distribution.
- API key missing: open `Config`, save a key, then test connection.
- `401` or `403`: invalid key or insufficient key scope.
- `429`: Venice rate limit; retry after the reset period.
- Transport failure: open `Status`, copy diagnostics, and inspect the logs folder.

## Known Limitations

- No auto-update is configured.
- Release signing is optional and not required for local builds.
- IndexedDB data is durable but not encrypted; export before risky upgrades.
- Malware running as the same OS user is out of scope and may access user data or process memory.

See [docs/RELEASE.md](docs/RELEASE.md) for the release checklist.
