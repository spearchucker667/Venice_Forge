# About Venice Forge

## What Is Venice Forge?

Venice Forge is a **private AI creation studio** built as a dual-platform Windows and macOS Electron desktop application. It provides a unified interface for the [Venice API](https://venice.ai), covering text generation, image generation, video generation, web research, batch automation, and local data management.

Safety controls are independent: **Family Safe Mode** runs Venice Forge's local child/family-safe filter, **Adult Mode** skips that local filter entirely, and **Venice API Safe Mode** controls only the provider-side `safe_mode` parameter.

The project ships as a packaged Electron desktop app for Windows and macOS, plus a Vite/Express web application for local development. Desktop Venice requests are sent from the Electron main process to `api.venice.ai`; web-development Venice requests go through the local Express proxy. Optional research features may contact Venice augment endpoints, Jina AI Reader/Search endpoints, or explicitly requested public URLs through the generic HTTP scrape proxy.

Current public readiness status:

- Source is MIT licensed and suitable for public repository browsing.
- CI runs lint, typecheck, tests, and build on the supported Node 22 runtime.
- Release automation builds Windows NSIS/portable `.exe` artifacts and macOS DMG/ZIP artifacts.
- Root support, security, contribution, code of conduct, issue template, PR template, and Dependabot metadata are present.
- Legal/TOS notes are maintained in [LEGAL.md](LEGAL.md).
- FAQ and troubleshooting guides are maintained in [FAQ.md](FAQ.md) and [DEVELOPMENT/troubleshooting.md](DEVELOPMENT/troubleshooting.md).

## Goals

- **18+ Age Restriction.** Use of the application is strictly restricted to adults aged 18 and older, acknowledging the inherent risks of unfiltered AI image generation (including CSAM).
- **Privacy by default.** The Venice API is privacy-preserving by design. Venice Forge keeps API keys out of the renderer process, never persists keys in plaintext, and never exports them.
- **Offline-first storage.** Images and settings live in browser IndexedDB. Desktop chat history is stored as local plaintext JSON under the app data directory, while web-mode conversations use IndexedDB. There is no cloud sync or telemetry.
- **Unified Creative Suite.** Provide a seamless, visual interface for the full spectrum of Venice multimodal capabilities.
- **Reproducible builds.** TypeScript strict mode, Node 22 CI, and `npm ci` ensure every build starts from a known state.

> [!NOTE]
> Venice Forge is currently in a "restructuring" phase following a major codebase merge. Architectural consistency is being actively restored.

## Architecture

```
┌────────────────────────────────────────────────────────────┐
│  Electron Process Boundary                                 │
│                                                            │
│  ┌─────────────────────┐        ┌──────────────────────┐  │
│  │  Renderer (React)   │  IPC   │  Main Process        │  │
│  │  - No Node.js       │◄──────►│  - venice HTTPS      │  │
│  │  - Sandbox enabled  │        │  - safeStorage       │  │
│  │  - Context isolated │        │  - Logger            │  │
│  │  - window.venice    │        │  - IPC validation    │  │
│  │    Forge bridge     │        │  - OS dialogs        │  │
│  └─────────────────────┘        └──────────────────────┘  │
│                                          │                 │
│                                          ▼                 │
│                                  api.venice.ai (HTTPS)     │
└────────────────────────────────────────────────────────────┘

Web mode (development only):
  Browser → Vite dev server → Express /api/venice → api.venice.ai
```

### Key Layers

| Layer | Technology | Responsibility |
|-------|-----------|----------------|
| UI | React 19 + Tailwind v4 | All user-facing screens |
| State | Zustand 5 stores | Centralised app state (slice stores; `auth`, `chat`, `playground`, `settings`, `toast`, `workflow`) |
| Storage | IndexedDB (via `StorageService`) | `images`, `files`, legacy `chats`, `settings`, `conversations`, and `ai_memory` are encrypted at rest with AES-GCM; `diagnostics` is stored unencrypted and should contain only sanitized timing/status metadata |
| Chat storage | Electron main-process filesystem (`chat-history/*.json`) | Conversation persistence with atomic writes and corruption recovery; filesystem chat JSON is not separately encrypted by Venice Forge |
| Content safety | `src/shared/safety/childExploitationGuard.ts` | Screens every outgoing Venice request at renderer transport, IPC, proxy, and module boundaries; evaluates `negative_prompt` and cross-sentence context; fails closed (500) on extraction errors; returns `SafetyGuardDecision`; never logs raw prompt text |
| Headless Bridge | `electron/services/bridgeServer.ts` | Loopback-only Express API server running on `127.0.0.1` for CLI and mobile integrations; enforces bearer token auth and active safety guards |
| Traffic Inspector | `src/stores/inspector-store.ts` | Captures and displays raw developer requests, masked headers, and safety audit logs; toggleable side-by-side with active view |

| Secure storage | Electron `safeStorage` | Venice and Jina API keys (encrypted) |
| IPC bridge | Electron preload + `ipcMain` | Renderer ↔ main transport |
| Web proxy | Express + http-proxy-middleware | Dev/web mode proxy |
| Packaging | electron-builder | Windows NSIS/portable, macOS DMG/ZIP |
| Automation | GitHub Actions + Dependabot | CI, Windows/macOS release, dependency updates |
| QA | Vitest + ESLint (`--max-warnings=0`) | Unit tests, integration tests, static analysis |
| Theme | Token-based CSS variables + Tailwind v4 `@theme` | Built-in and custom themes with WCAG AA contrast checking |

### Application Tabs

The canonical tab registry lives in `src/config/tabs.ts` (single source of
truth for `Tab` type, sidebar order, group, and aliases). The visible
tabs are:

| Tab | Feature |
|-----|---------|
| Chat | Streaming chat with Venice text models, memory injection & management, drag & drop context reordering, Agent vs Classic toggle, and optional character-bound scene generation |
| History | Browse prior conversations and restore or inspect saved chat state |
| Image Studio | Generate images, **Edit** (single image inpainting), **Combine** (multi-image referencing), and **Upscale** (separate from video upscaling) |
| Media Studio | Generated-image and -video library with local persistence, full-size preview, batch favorite/unstar/delete, lineage (parent + children) tracking, and per-model capability hints |
| Prompts | Versioned prompt library for chat, image, system, recipe, and workflow prompts |
| Scene Composer | Structured scene components that compile into image-generation recipes |
| Audio Studio | Text-to-speech with 50+ voices and formats, plus audio transcription via Whisper |
| Music Studio | AI music generation with text-to-music, optional lyrics, duration control, and instrumental mode |
| Video Studio | Asynchronously queue text-to-video, image-to-video, video-to-video, reference-to-video, and video upscale jobs. Settings are model-dependent. |
| Embeddings | Vector embeddings generation for text with selectable models and dimension display |
| Research | Multi-provider web search, page scraping, AI research synthesis, and public-profile discovery (Venice, Jina AI, or Generic HTTP) |
| Characters | Browse Venice hosted characters via the official `/characters` API, filter by adult / web-enabled flags, and start character chats using `venice_parameters.character_slug` |
| RP Studio | Local-first Character RP Studio: character cards, personas, lorebooks, multi-character RP chats, scoped memory, scene image generation. Lazy-loaded. |
| Workflows | Visual node editor for chaining models (Input → LLM → Image Gen → Output) with parallel branching. Lazy-loaded. |
| Privacy | Storage inventory, safe privacy summaries, and non-destructive maintenance actions |
| Playground | Conversational agent that builds and edits workflows on a live canvas using plain language. Lazy-loaded. |
| Config | API key management, theme selection (built-in + custom export/import), import/export |
| Status | Diagnostics, rate-limit info, log access (renamed from "Diagnostics") |

## Technology Stack

- **Frontend:** React 19, TypeScript strict, Tailwind CSS v4, Vite 6
- **Desktop:** Electron 42, electron-builder 26 (Windows NSIS + portable, macOS DMG + ZIP)
- **Backend (web mode):** Express 4, http-proxy-middleware 4, dotenv
- **State:** Zustand 5 stores (slice stores per `AGENTS.md`). Reducer-based state has been fully migrated to lightweight slice stores.
- **Testing:** Vitest 4, @testing-library/react, supertest
- **Build:** tsc (Electron main), esbuild (Express server), Vite (renderer)
- **Local config:** `yaml@^2.9.0` (renderer + main); custom defensive validator in `src/config/configSchema.ts`; runtime service in `electron/services/configService.ts` (path resolution, parse, key import/redaction, sanitized IPC payloads)

## Local Master YAML Config

Venice Forge reads two optional files at startup: `config.yaml` and `themes.yaml`. They are the canonical way for developers and power users to configure behavior without opening the app. The schema is strict and the security model is non-negotiable.

### Locations (precedence)

1. `VENICE_FORGE_CONFIG_FILE` / `VENICE_FORGE_THEMES_FILE` env override (absolute path).
2. `<repo>/.config/config.local.yaml` (development).
3. `<app.getPath("userData")>/.config/config.yaml` (packaged desktop).
4. Built-in defaults in `src/config/defaultConfig.ts`.

### Security model

- Renderer never sees `secrets.venice_api_key` or `secrets.jina_api_key`. Only booleans (`has_venice_api_key`, `has_jina_api_key`) cross the IPC boundary.
- Default generated files never contain real keys.
- Plaintext keys are imported into OS secure storage (`safeStorage`) on startup and redacted from the YAML afterwards (unless `secrets.keep_plaintext_keys: true`).
- Existing secure-store keys are not overwritten unless `developer.force_import_keys: true`.
- Path values are rejected if they look like URLs or contain control characters.
- Generic config patches cannot set plaintext keys; the patch path strips `secrets.*` regardless of input.
- Raw keys are never logged or exported. The local-files-only rule is enforced at the schema level.

See [`docs/CONFIG.md`](DEVELOPMENT/CONFIG.md) for the full schema, examples, and recovery steps.

## Data Flow

```
User input
  └─► React component
        └─► assessChildExploitationSafety()   ← content safety screen
              ├─ blocked: surface error, do not forward
              └─ allowed:
                    └─► veniceFetch() / desktopBridge IPC
                          ├─ Electron: main process validates → HTTPS → api.venice.ai
                          └─ Web:      Express /api/venice → HTTPS → api.venice.ai
                                                    ↓
                                           Response data
                                                    ↓
                                        IndexedDB (images / legacy chats)
                                                    ↓
                              Electron: chat-history/*.json (atomic writes)
                                                    ↓
                                        React state update → UI
```

## Non-Goals

- Venice Forge auto-update support depends on GitHub Releases availability and packaging configuration.
- IndexedDB records are encrypted with a browser-managed AES-GCM key stored in same-origin IndexedDB; this is not equivalent to OS credential storage.
- Venice Forge is not a multi-user or server-deployed application; it is a single-user desktop tool.
- Linux packaging is produced by the release workflow (AppImage/deb/rpm for x64+arm64). Local cross-build from macOS/Windows is not supported; use the CI artifacts or build on a Linux runner.
- Venice Forge is not an official Venice.ai product and does not replace Venice's legal terms, privacy notices, or API documentation.

## Further Reading

- [README.md](../README.md) — Setup and usage
- [SECURITY.md](../SECURITY.md) — Full security model
- [docs/RELEASE/release.md](RELEASE/release.md) — Release and signing process
- [docs/LEGAL.md](LEGAL.md) — Legal and Venice terms coverage
- [docs/REPOSITORY_TREE.md](design/REPOSITORY_TREE.md) — Repository structure
- [CONTRIBUTING.md](../CONTRIBUTING.md) — How to contribute
- [CHANGELOG.md](audits/CHANGELOG.md) — Version history
