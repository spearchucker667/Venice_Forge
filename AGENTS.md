# Venice Forge — Agent Guide

> Human contributors: start with [README.md](README.md) and [CONTRIBUTING.md](CONTRIBUTING.md).

**Version:** 1.0.3 | **Stack:** React 19 + TS strict, Electron 42, Express 4, Vitest 4 | **Node:** 20 or 22, npm 10+

---

## Commands

### Development
```bash
npm run dev:electron   # Desktop app (recommended; runs tsc for electron/ first)
npm run dev:web        # Vite + Express proxy only
```

### Validation order (required before PR)
```bash
npm run lint:eslint    # ESLint — zero warnings enforced
npm run typecheck      # TypeScript: renderer + electron main (both tsconfigs)
npm test               # Vitest (serial, --fileParallelism=false)
npm run verify:safety-guard   # Mandatory safety guard check
npm run build          # dist/ (renderer) + dist-electron/ (main) + dist/server.cjs
```

### Single test, single file
```bash
npx vitest run src/services/foo.test.ts
npx vitest run server.test.ts -t "test name"
```

### Packaging
```bash
npm run dist:win         # NSIS + portable
npm run dist:mac         # DMG + ZIP (both archs)
npm run dist:mac:arm64   # Apple Silicon only
npm run dist:mac:x64      # Intel only
npm run checksum:release  # SHA-256 after packaging
```

### Misc
```bash
npm run ci               # parity with CI: npm ci + lint + typecheck + test + safety-guard + build
npm run build:electron    # Only electron main/preload (output: dist-electron/)
npm run build:web        # Only renderer (output: dist/)
npm run build:server     # Only proxy (output: dist/server.cjs)
npm run smoke:electron    # Electron smoke tests in tests/smoke/
npm run test:coverage    # With v8 coverage report
npm run clean            # Remove dist/ dist-electron/ release/
```

---

## Architecture

**Two transports, same renderer.** `isElectron()` in `src/services/desktopBridge.ts` selects:
- **Electron:** renderer → `window.veniceForge` (contextBridge) → IPC → main process → `api.venice.ai` (API key in `safeStorage`)
- **Web:** renderer → `fetch('/api/venice/...')` → Express proxy → `api.venice.ai` (API key in `.env`)

**All Venice HTTP calls go through `veniceFetch()` or `veniceStreamChat()` in `src/services/veniceClient.ts`.** Never `fetch` directly, never call `window.veniceForge.venice` directly from modules. Pass `dispatch` to emit `SET_DIAGNOSTICS` automatically.

**Dual TypeScript build pipelines:**
- Renderer (`src/`): Vite, `tsconfig.json` (ESNext, `noEmit`)
- Electron main (`electron/`): `tsc --project tsconfig.electron.json` → CommonJS → `dist-electron/`; then `scripts/create-cjs-package.cjs` copies `package.json` as CJS

**State:** Single global `useReducer` in `App.tsx` using Immer (`produce`). All action types in `src/types/app.ts` as a discriminated union.

---

## Testing

- **Vitest 4**, jsdom by default. File-level `// @vitest-environment node` for server tests.
- **Serial execution** (`--fileParallelism=false`): tests that touch IndexedDB or global state must not run in parallel.
- Tests live next to source: `src/services/foo.ts` → `src/services/foo.test.ts`. Server test is `server.test.ts` at root.
- Regression guards: `// BUG-NNN regression guard` comment in tests that would have caught a fixed bug.
- Node-level tests (rate-limiting, etc.): create fresh `app` in `beforeEach`, not `beforeAll`, to isolate state.

---

## Security (non-negotiable)

**API keys:** Never in renderer. Electron: `safeStorage` only. Web: `.env` only. Never commit either.

**Content Safety Guard:** Every outgoing prompt path must call `assessChildExploitationSafety()` and `recordDecision()` before forwarding to Venice. Guard runs at every boundary (renderer `veniceClient.ts`, Electron IPC, Express proxy). **Never log raw prompt text.** Safety tests must use synthetic fixtures only.

**Allowed endpoints only** (enforced in `src/shared/validation.ts` and `electron/ipc/validation.ts`):
```
GET  /models
POST /chat/completions
POST /image/generate
POST /image/upscale
POST /augment/search
POST /augment/scrape
POST /augment/text-parser
POST /video/queue
POST /video/retrieve
POST /video/quote
POST /video/complete
```

**Startup invariant:** `FUZZY_ALLOWLIST ∩ CSAM_GENRE_LABELS = ∅` — adding a CSAM label to the allowlist throws at module load.

---

## Key File Locations

| Path | Purpose |
|------|---------|
| `src/modules/` | One file per tab: Chat, Image, Video, Audio, Batch, SearchScrape, Models, Gallery, Settings, Diagnostics |
| `src/services/veniceClient.ts` | Single Venice API entry point |
| `src/services/desktopBridge.ts` | Electron-vs-web transport abstraction; use this instead of `window.veniceForge` |
| `src/shared/safety/` | Content safety guard (`assessChildExploitationSafety`, `recordDecision`) |
| `src/shared/validation.ts` | Allowed Venice endpoints allowlist |
| `src/research/` | Plug-in research providers (Venice, Jina, generic) + agent |
| `electron/preload.ts` | contextBridge API surface |
| `electron/ipc/handlers.ts` | IPC channel handlers |
| `electron/ipc/validation.ts` | IPC request validation |
| `src/services/imageWorkflowService.ts` | Gallery image save with `saveImageRecord()` |
| `src/utils/image.ts` | `extractImages()` normalises all Venice image response shapes |
| `src/services/exportImport.ts` | Versioned JSON export/import; `redactSecrets()` scrubs API keys from strings |

---

## Vision / Attachment Detection

No live vision flag from Venice API. Use `modelSupportsVision(modelId)` which checks `VISION_CAPABLE_MODEL_IDS` (allowlist) and `VISION_CAPABLE_PATTERNS` (`/vision/i`, `/-vl/i`, `/gemini-2\.[05]/i`). **Defaults to OFF** when unknown.

Attachment service (`src/services/attachmentService.ts`): text files capped 256 KiB; images downscaled ≤1024 px if over 2 MiB; 1 MiB total text budget + 5 attachments cap.

---

## Update These Files

When changing behavior, packaging, or storage, also update:
- `README.md`, `CHANGELOG.md`, `AGENTS.md`, `.github/copilot-instructions.md`
- `docs/ABOUT.md`, `SECURITY.md`, `docs/RELEASE/release.md`, `docs/LEGAL.md`
- `docs/RESEARCH_PROVIDERS.md`, `docs/JINA_PROVIDER.md`, `docs/PUBLIC_PROFILE_DISCOVERY.md` (research changes)
- `docs/THEME_SYSTEM.md` (theming changes)
