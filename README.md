# Venice Forge

Venice Forge is a Windows-first Electron desktop app for the Venice API. It provides a private AI creation studio with chat, image generation, batch prompting, web research, model discovery, a local gallery, data import/export, diagnostics, and Windows `.exe` packaging.

<img width="2816" height="1536" alt="Gemini_Generated_Image_3tkcjm3tkcjm3tkc" src="https://github.com/user-attachments/assets/079845cb-0eb2-4ba1-858a-189a1d90f6b7" />

See [docs/ABOUT.md](docs/ABOUT.md) for project background and architecture overview.

## Features

| Tab | Name | Description |
|-----|------|-------------|
| Prompt | Chat | Streaming chat completions with system-prompt control and conversation history |
| Create | Image generation | Single and batch image generation with upscaling and gallery save |
| Batch | Batch runner | Run one prompt across multiple inputs or run many prompts in sequence |
| Research | Web research | Venice-augmented web search, page scraping, and document text extraction |
| Catalog | Models | Live Venice model catalog with type, traits, and capability details |
| Library | Gallery | Local image library with download, upscale, and bulk-export |
| Config | Settings | API key management, theme, model defaults, data import/export |
| Status | Diagnostics | Transport mode, runtime info, rate-limit headers, and log access |

## Requirements

- Windows 10/11 for release builds
- Node.js 20 or 22
- npm 10+
- A Venice API key ([venice.ai](https://venice.ai))

## Development

```bash
npm install
npm run dev:electron   # Electron desktop mode (recommended)
npm run dev:web        # Vite + Express web mode
```

Useful scripts:

| Command | Description |
|---------|-------------|
| `npm run typecheck` | TypeScript check for renderer and Electron |
| `npm test` | Vitest unit and integration tests |
| `npm run build` | Build `dist/` (web) and `dist-electron/` (main process) |
| `npm run clean` | Remove all generated build output |
| `npm run test:watch` | Re-run tests on file changes |

## Windows Builds

```bash
npm run verify:icon
npm run dist:win
npm run verify:dist
```

Artifacts are written to `release/`:

- `Venice-Forge-<version>-x64-Setup.exe` — NSIS installer
- `Venice-Forge-<version>-x64-Portable.exe` — portable executable

`build/icon.ico` is required before packaging. This repo includes a generated placeholder; run `npm run generate:icon` if it is missing, then replace it with final artwork before public release.

Local builds are unsigned unless standard electron-builder signing environment variables are set (`CSC_LINK`, `CSC_KEY_PASSWORD`, `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD`). Unsigned installers can trigger Windows SmartScreen warnings.

## API Key Setup

**Desktop mode:** open **Config**, paste the Venice API key, click **Save key**, then **Test connection**. On Windows, Venice Forge refuses to store the key if Electron `safeStorage` encryption is unavailable.

**Web mode:** copy `.env.example` to `.env` and set `VENICE_API_KEY`.

```
VENICE_API_KEY="your-venice-inference-key"
```

## Storage

| Data | Location |
|------|----------|
| API key | Electron `safeStorage` — `%APPDATA%\Venice Forge\secure-prefs.json` |
| Logs | `%APPDATA%\Venice Forge\logs\venice-forge.log` |
| Images, chats, settings | Renderer IndexedDB |
| Exports | Versioned JSON with `version`, `exportedAt`, `appVersion`, and `data` |

Import validates JSON size and schema, rejects unexpected stores, strips secret-like fields, and merges by ID rather than clearing existing data. API keys are never imported or exported. A backup of existing data is saved to disk before any import is applied.

## Security Model

Desktop Venice API calls go through a narrow preload API and main-process IPC transport. The renderer cannot read the raw API key, cannot invoke arbitrary IPC channels, and cannot choose arbitrary Venice endpoints. Allowed endpoints:

- `GET /models`
- `POST /chat/completions`
- `POST /image/generate`
- `POST /image/upscale`
- `POST /augment/search`
- `POST /augment/scrape`
- `POST /augment/text-parser`

Production CSP does not allow localhost networking. Navigation is blocked except for the app files; trusted external HTTPS links open in the OS browser. Packaged production DevTools are disabled unless `VENICE_FORGE_DEBUG_DEVTOOLS=true`. Web proxy mode adds `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, and `Content-Security-Policy` headers to all responses.

See [docs/SECURITY.md](docs/SECURITY.md) for the full security model.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Missing icon | `npm run generate:icon` then `npm run verify:icon` |
| Packaging failure | `npm run clean && npm install && npm run dist:win` |
| SmartScreen warning | Expected for unsigned local builds; see [docs/RELEASE.md](docs/RELEASE.md) for signing |
| No API key prompt at launch | Open **Config**, save a key, then test connection |
| `401` / `403` | Invalid key or insufficient key scope |
| `429` | Venice rate limit; wait for the reset period shown in the Status tab |
| Transport failure | Open **Status**, copy diagnostics, inspect the logs folder |

## Known Limitations

- No auto-update is configured.
- Release signing is optional and not required for local builds.
- IndexedDB data is durable but not encrypted at rest; export before risky upgrades.
- Malware running as the same OS user is out of scope and may access user data or process memory.

## Further Reading

- [docs/ABOUT.md](docs/ABOUT.md) — Project background and architecture
- [docs/SECURITY.md](docs/SECURITY.md) — Full security model
- [docs/RELEASE.md](docs/RELEASE.md) — Release checklist
- [CHANGELOG.md](CHANGELOG.md) — Version history
- [CONTRIBUTING.md](CONTRIBUTING.md) — How to contribute
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) — Community standards
