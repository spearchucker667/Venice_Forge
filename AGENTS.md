# Venice Forge — Agent Guide

> Human contributors: start with [README.md](README.md) and [CONTRIBUTING.md](CONTRIBUTING.md).
> Sibling agent docs in [docs/AGENTS/AGENTS.md](docs/AGENTS/AGENTS.md) and
> [docs/AGENTS/agent-reinitialization.md](docs/AGENTS/agent-reinitialization.md) are **gitignored** (commit `037900d`) — they are local-only handoff notes, not committed source of truth.

**Version:** 1.0.5 | **Stack:** React 19 + TS strict, Electron 42, Express 4, Vitest 4 | **Node:** 20 or 22, npm 10+

---

## Commands

### Development
```bash
npm run dev:electron   # Desktop app (recommended; runs tsc for electron/ first)
npm run dev:web        # Vite + Express proxy only
```

### Validation order (required before PR)
```bash
npm run lint:eslint          # ESLint — zero warnings enforced (--max-warnings=0)
npm run typecheck            # Renderer (tsconfig.json) + Electron main (tsconfig.electron.json)
npm test                     # Vitest, serial (--fileParallelism=false)
npm run verify:safety-guard  # Mandatory CI gate; see Security below
npm run build                # dist/ + dist-electron/ + dist/server.cjs
npm run ci                   # Full parity: npm ci + lint + typecheck + test + safety-guard + build
```

### Single test, single file
```bash
npx vitest run src/services/foo.test.ts
npx vitest run server.test.ts -t "test name"
npx vitest run tests/smoke/electron-smoke.test.ts   # via npm run smoke:electron
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
npm run build:electron   # Only electron main/preload → dist-electron/
npm run build:web        # Only renderer → dist/ (sets ELECTRON_BUILD=true)
npm run build:server     # Only proxy → dist/server.cjs
npm run smoke:electron   # tests/smoke/electron-smoke.test.ts (Playwright; skipped when no display)
npm run test:coverage    # v8 coverage; thresholds 70/80/80/80
npm run verify:dist      # Generic post-package check
npm run verify:dist:win  # Windows artifacts (NSIS + portable)
npm run verify:dist:mac  # macOS artifacts (DMG + ZIP, both archs)
npm run verify:dist:portable  # Windows portable only
npm run clean            # Remove dist/ dist-electron/ release/
```

---

## Architecture

**Two transports, one renderer.** `isElectron()` in `src/services/desktopBridge.ts` selects:
- **Electron:** renderer → `window.veniceForge` (contextBridge) → IPC → main process → `api.venice.ai` (key in `safeStorage`)
- **Web:** renderer → `fetch('/api/venice/...')` via Express proxy → `api.venice.ai` (key in `.env`)

**Single Venice entry point.** All HTTP calls go through `veniceFetch()` / `veniceStreamChat()` in `src/services/veniceClient.ts`. Modules must not `fetch('/api/venice/...')` directly and must not call `window.veniceForge.venice.*` directly — use `src/services/desktopBridge.ts` instead. **Exception:** `src/stores/chat-store.ts` accesses `window.veniceForge.chat.*` directly (pre-bridge legacy). Do not add new direct calls.

**Dual TypeScript build pipelines:**
- Renderer (`src/`): Vite, `tsconfig.json` (ESNext, `noEmit`, `bundler` resolution)
- Electron main (`electron/`): `tsc --project tsconfig.electron.json` → CommonJS → `dist-electron/`; then `scripts/create-cjs-package.cjs` copies `package.json` as CJS

**State:** Zustand 5 stores (`auth`, `chat`, `playground`, `settings`, `toast`, and `workflow`). Reducer-based state has been fully migrated to lightweight slice stores. Side effects live in services/modules.

**Conversation persistence (dual-mode):**
- Desktop: atomic JSON files under `userData/chat-history/` (temp + rename)
- Web: encrypted IndexedDB `conversations` store
- Legacy flat `chats` auto-migrate on first load — **additive only, never destructive**
- Conversation IDs must pass `VALID_ID_RE = /^[a-zA-Z0-9_.-]{1,128}$/` in main-process storage

**Theme system:** Token-based CSS variables + Tailwind v4 `@theme`. Built-in themes in `src/theme/themes.ts` and configured under `config/themes/`; user themes in ThemeMaker UI supporting custom YAML import/export; bootstrap cache in `localStorage` to prevent FOUC.

---

## Testing

- **Vitest 4**, jsdom by default. Add `// @vitest-environment node` at the top of any server/IPC/main-process test (e.g., `server.test.ts`, `electron/**/*.test.ts`).
- **Serial execution** (`--fileParallelism=false`): tests touching IndexedDB or global state must not run in parallel.
- Tests live next to source: `src/services/foo.ts` → `src/services/foo.test.ts`. Server test is `server.test.ts` at root.
- Regression guards: `// BUG-NNN regression guard` (or `// VERIFY-NNN`) comment in tests that would have caught a fixed bug.
- Node-level tests (rate-limiting, etc.): create fresh `app` in `beforeEach`, not `beforeAll`, to isolate state.
- Coverage thresholds in `vitest.config.ts`: 70% branches, 80% functions/lines/statements.

### Named regression guards (VERIFY-NNN)

Security-relevant surfaces are protected by named regression guards. Each
guard fails CI if a future change weakens the protection. When adding a
new guard, append it to the list below and reference the ID in the
test's comment header.

| ID | What it locks | Test file |
|----|----------------|-----------|
| `VERIFY-001` | Bridge bearer token never logged to console | `electron/services/bridgeServer.test.ts` |
| `VERIFY-002` | Constant-time token compare (timing-attack safe) | `electron/services/bridgeServer.test.ts` |
| `VERIFY-003` | Bridge aborts upstream on client disconnect | `electron/services/bridgeServer.test.ts` |
| `VERIFY-004` | Bridge JSON body cap (10 MiB) | `electron/services/bridgeServer.test.ts` |
| `VERIFY-005` | Chat-store flush-on-unload (`pagehide` + `beforeunload`) | `src/stores/chat-store.flush.test.ts` |
| `VERIFY-006` | `venice()` forwards `AbortSignal` to IPC | `src/lib/venice-client.test.ts` |
| `VERIFY-007` | Zero JSX inline `style={...}` (production CSP invariant) | `tests/csp/inlineStyleInvariant.test.ts` |
| `VERIFY-008` | `listConversations({ offset, limit })` server-side pagination | `electron/services/chatStorage.test.ts` |
| `VERIFY-009` | Dual Venice client surface contract | `src/lib/venice-client.dual.test.ts` |
| `VERIFY-010` | Zero out-of-allowlist inline colors (theme token invariant) | `tests/theme/inlineColorInvariant.test.ts` |
| `VERIFY-011` | Character-card local storage invariants (atomic write, sidecar avatar, ID validation, corruption backup) | `tests/storage/characterCardStorage.regression.test.ts` |
| `VERIFY-012` | RP chat storage invariants (atomic write, ID validation, MAX_ACTIVE_CHARACTERS, corruption backup) | `tests/storage/rpChatStorage.regression.test.ts` |
| `VERIFY-013` | Scene-generation safety + asset persistence (assessScenePrompt always runs; assets linked by chatId) | `tests/safety/sceneGeneration.regression.test.ts` |
| `VERIFY-014` | Character RP safety wrapper routing (every wrapper produces a real guard decision; no raw prompt text in userMessage) | `tests/safety/characterImportSafety.routing.test.ts` |

---

## Security (non-negotiable)

**API keys:** Never in renderer. Electron: `safeStorage` (DPAPI on Windows, Keychain on macOS). Web: `.env` only. Never commit either. `VENICE_FORGE_ALLOW_PLAINTEXT_KEY_STORAGE=true` is a Linux-only fallback and emits a security warning.

**Content Safety Guard:** Every outgoing prompt path must call `assessChildExploitationSafety()` and `recordDecision()` before forwarding to Venice. Guard runs at every boundary (renderer `veniceClient.ts`, Electron IPC handlers `venice:request` and `venice:streamChat`, Express proxy, and prompt-sending modules `ChatModule`/`ImageModule`/`BatchModule`/`SearchScrapeModule`). **Never log raw prompt text.** Safety tests must use synthetic fixtures only.

**Allowed endpoints only** (enforced in `src/shared/validation.ts` and `electron/ipc/validation.ts`):
```
GET  /models
POST /chat/completions, /image/{generate,upscale,edit,multi-edit},
     /augment/{search,scrape,text-parser},
     /video/{queue,retrieve,quote,complete},
     /embeddings, /audio/{queue,retrieve,speech,transcriptions}
```

**Startup invariant:** `FUZZY_ALLOWLIST ∩ CSAM_GENRE_LABELS = ∅` — adding a CSAM label to the allowlist throws at module load.

**Renderer hardening:** `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`. CSP is set once globally on `session.defaultSession` in `electron/main.ts:183` (not per-window). External links route through `isTrustedExternalUrl()` in `electron/utils/urlSecurity.ts` (https-only, public IPs only — blocks RFC 1918, loopback, IPv6 link-local, IPv4-mapped IPv6, short-form IPv4 via POSIX `inet_aton`).

**Adding a new IPC surface** requires coordinated updates in: `electron/preload.ts` (contextBridge), `electron/ipc/handlers.ts` (handler), `electron/ipc/validation.ts` (Zod/allowlist), `src/services/desktopBridge.ts` (renderer surface), and a test.

**Adding a new Venice endpoint** requires updates in: `src/shared/validation.ts`, `electron/ipc/validation.ts`, and `server.ts` (proxy). The `verify-safety-guard` script enforces guard presence in the three boundary files.

**GitHub Actions pinning:** All third-party Actions in `.github/workflows/*.yml` are pinned to a commit SHA, not a tag, to prevent supply-chain attacks. The version comment is appended after the SHA for maintainer reference. When bumping an action, look up the new SHA with `gh api repos/<owner>/<repo>/git/refs/tags/<tag>` and update both the SHA and the version comment.

**CodeQL suppressions:** Use `// nosec:js/<rule-id>` (with an inline justification comment) to suppress a CodeQL finding. Suppressions are reviewed as code — if a suppression is removed, the allowlist check or clamp logic should be re-verified, not just deleted.

**Audit:** `npm audit --omit=dev --audit-level=moderate` is a release gate.

**Static analysis (CodeQL):** Every push runs CodeQL. Open alerts appear in `Security → Code Scanning`. The current set of defended false positives is documented in `SECURITY.md` and annotated at each call site.

---

## Key File Locations

| Path | Purpose |
|------|---------|
| `config/themes/` | Starter theme YAML templates (venice.yaml, dark.yaml, light.yaml, dracula.yaml, gruvbox_dark.yaml, rosepine.yaml) |
| `src/services/veniceClient.ts` | Single Venice API entry point (with safety guard) |
| `src/lib/venice-client.ts` | Electron-only thin client; safety guard is in the IPC layer — see `electron/ipc/handlers.ts:79`. Kept separate from the canonical services/veniceClient.ts because: (a) this is a passthrough that does not run the safety guard in the renderer (it lives in the IPC layer), (b) it has a simpler `venice<T>()` / `veniceBlob()` / `veniceFormData()` API the legacy hooks prefer, (c) it can be deleted in a future Electron-only refactor. |
| `src/services/desktopBridge.ts` | Electron-vs-web transport abstraction; use this instead of `window.veniceForge` |
| `src/services/storageService.ts` | IndexedDB store set controlled by `STORE_NAMES`; `ENCRYPTED_STORES` for AES-GCM |
| `src/services/chatStorage.ts` (renderer) + `electron/services/chatStorage.ts` (main) | Conversation persistence — **mirror changes across both** |
| `src/services/memoryService.ts` | AI memory layer; 2,000-char injection budget |
| `src/services/attachmentService.ts` | File/URL/image attachments; 256 KiB/file, 1 MiB total, 5-attachment cap, 1024-px image downscale |
| `src/shared/validation.ts` | Venice endpoint allowlist (single source for IPC + proxy) |
| `src/shared/safety/` | `assessChildExploitationSafety`, `recordDecision`, `promptPayloadExtractor` |
| `src/shared/limits.ts` | Shared byte/timeout constants — reuse, do not hardcode |
| `src/shared/logger.ts` | Redacting logger; `console.{log,warn}` is lint-warned |
| `src/utils/image.ts` | `extractImages()` normalises all Venice image response shapes |
| `src/utils/payloadBuilders.ts` | `buildChatPayload`, `buildImagePayload` |
| `src/research/providers/` | Venice + Jina + generic HTTP scrape (SSRF via `dns.lookup`) |
| `src/constants/venice.ts` | `FALLBACK_MODELS`, `TABS`, `modelSupportsVision()`, `DB_VERSION`, `STORE_NAMES` |
| `src/components/{chat,image,audio,music,video,embeddings,workflows,playground,layout,ui}` | Renderer UI: tab views, sidebar, header, dialog, shared primitives |
| `electron/preload.ts` | contextBridge API surface (only place to expose IPC to renderer) |
| `electron/main.ts` | BrowserWindow + CSP + navigation guards; `requestSingleInstanceLock` |
| `electron/ipc/handlers.ts` | IPC channel handlers (incl. `venice:request`, `venice:streamChat`, `chat:*`, `app:*`) |
| `electron/services/bridgeServer.ts` | Headless Express loopback bridge server (`127.0.0.1`) enforcing bearer token auth & child exploitation safety guard |
| `src/stores/inspector-store.ts` | Zustand developer traffic logs and diagnostics store |
| `electron/ipc/validation.ts` | IPC request validation |
| `electron/services/secureStore.ts` | `safeStorage` wrapper with atomic writes (temp + rename) |
| `electron/utils/urlSecurity.ts` | `isTrustedExternalUrl`, `isPrivateHostname` |
| `server.ts` | Express proxy (`/api/venice/*`, `/api/proxy-scrape`); vite only in dev |
| `scripts/verify-safety-guard.cjs` | CI gate — see Security section |
| `scripts/verify-dist.cjs` | Post-package artifact verification (`verify:dist:win`, `verify:dist:mac`, `verify:dist:portable`) |
| `src/shared/safety/childExploitationGuard.ts` | Public safety-guard API + decision orchestration (T15 split: matchTables + normalization extracted) |
| `src/shared/safety/matchTables.ts` | Pattern/term dictionaries for the guard (T15) |
| `src/shared/safety/normalization.ts` | Text normalization + multi-view output (T15) |
| `src/lib/venice-client.test.ts` | Direct unit coverage of `venice/veniceStreamChat/veniceBlob/veniceFormData` (VERIFY-006) |
| `src/lib/venice-client.dual.test.ts` | Dual-client surface contract (VERIFY-009, T8) |
| `src/stores/chat-store.flush.test.ts` | Flush-on-unload regression guard (VERIFY-005) |
| `tests/csp/inlineStyleInvariant.test.ts` | Zero JSX inline `style={...}` invariant (VERIFY-007, T1) |
| `tests/theme/inlineColorInvariant.test.ts` | Zero out-of-allowlist inline colors (VERIFY-010, T11) |
| `tests/safety/enforcementBoundaries.test.ts` | Child-safety-guard enforcement at every boundary (renderer / IPC / web proxy) |
| `tests/storage/characterCardStorage.regression.test.ts` | Local character-card storage invariants (VERIFY-011) |
| `tests/storage/rpChatStorage.regression.test.ts` | RP chat storage invariants (VERIFY-012) |
| `tests/safety/sceneGeneration.regression.test.ts` | Scene-generation safety + assets (VERIFY-013) |
| `tests/safety/characterImportSafety.routing.test.ts` | Character RP safety wrapper routing (VERIFY-014) |
| `docs/AUDIT_FOLLOWUP_2026_06_05.md` | 2026-06-05 full-repo audit report — P0/P1/P2 status, commits, follow-up items |

---

## Vision / Attachment Detection

No live vision flag from Venice API. Use `modelSupportsVision(modelId)` in `src/constants/venice.ts` — checks `VISION_CAPABLE_MODEL_IDS` allowlist and `VISION_CAPABLE_PATTERNS` (`/vision/i`, `/-vl/i`, `/gemini-2\.[05]/i`). **Defaults to OFF** when unknown. Image attachments are passed as base64 `image_url` content parts only when the selected model supports vision.

---

## Update These Files

When changing behavior, packaging, or storage, also update:
- `README.md`, `CHANGELOG.md` (under `[Unreleased]`), `AGENTS.md`, `.github/copilot-instructions.md`
- `docs/ABOUT.md`, `SECURITY.md`, `docs/RELEASE/release.md`, `docs/LEGAL.md`
- `docs/RESEARCH_PROVIDERS.md`, `docs/JINA_PROVIDER.md`, `docs/PUBLIC_PROFILE_DISCOVERY.md` (research changes)
- `docs/THEME_SYSTEM.md` (theming changes)
- `docs/TODO.md` (audit/fix tracking)

---

## Known Gotchas

- `app.entry` writes a static `vite` import at top level → removed in 1.0.3 (C-004); vite is now dynamically imported in dev only. Don't reintroduce.
- `venice:streamChat` must generate a `signalId` if undefined, or delta routing silently breaks (C-002 fix).
- `safeSendToRenderer()` must wrap every IPC send during streaming — closing renderer mid-stream otherwise crashes the main process (C-003).
- Streaming uses `createTimeoutSignal()` (not `AbortSignal.timeout` / `AbortSignal.any`) for older browser compat.
- `indexedDB` exports to `release/`, `dist/`, `dist-electron/`, `coverage/` are gitignored. Build icons under `build/icon.{ico,icns,png}` are tracked; everything else in `build/` is ignored.
- Web-mode `.env` is read at startup; `NODE_ENV=production` is required for `npm start` (use `scripts/start-production.cjs`).
- `npm test` excludes `server.ts` from coverage (see `vitest.config.ts` exclude list); integration coverage for the proxy is via `server.test.ts` only.
