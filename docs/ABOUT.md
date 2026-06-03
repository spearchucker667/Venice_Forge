# About Venice Forge

## What Is Venice Forge?

Venice Forge is a **private AI creation studio** built as a dual-platform Windows and macOS Electron desktop application. It provides a unified interface for the [Venice API](https://venice.ai), covering text generation, image generation, video generation, web research, batch automation, and local data management.

The project ships as a packaged Electron desktop app for Windows and macOS, plus a Vite/Express web application for local development. Desktop Venice requests are sent from the Electron main process to `api.venice.ai`; web-development Venice requests go through the local Express proxy. Optional research features may contact Venice augment endpoints, Jina AI Reader/Search endpoints, or explicitly requested public URLs through the generic HTTP scrape proxy.

Current public readiness status:

- Source is MIT licensed and suitable for public repository browsing.
- CI runs lint, typecheck, tests, and build on Node 20 and 22.
- Release automation builds Windows NSIS/portable `.exe` artifacts and macOS DMG/ZIP artifacts.
- Root support, security, contribution, code of conduct, issue template, PR template, and Dependabot metadata are present.
- Legal/TOS notes are maintained in [LEGAL.md](LEGAL.md).
- FAQ and troubleshooting guides are maintained in [FAQ.md](FAQ.md) and [DEVELOPMENT/troubleshooting.md](DEVELOPMENT/troubleshooting.md).

## Goals

- **18+ Age Restriction.** Use of the application is strictly restricted to adults aged 18 and older, acknowledging the inherent risks of unfiltered AI image generation (including CSAM).
- **Privacy by default.** The Venice API is privacy-preserving by design. Venice Forge keeps API keys out of the renderer process, never persists keys in plaintext, and never exports them.
- **Offline-first storage.** Images, chat history, and settings live in browser IndexedDB — no cloud sync, no telemetry.
- **Practical security.** The Electron architecture enforces strict IPC validation, a narrow preload surface, and a restrictive CSP. The web proxy enforces the same endpoint allowlist plus rate limiting and security headers.
- **Reproducible builds.** TypeScript strict mode, a CI matrix across Node 20 and 22, and `npm ci` ensure every build starts from a known state.

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
| State | useReducer + Immer | Centralised app state |
| Storage | IndexedDB (via `StorageService`) | `images`, `files`, legacy `chats`, `settings`, `conversations`, and `ai_memory` are encrypted at rest with AES-GCM; `diagnostics` is stored unencrypted and should contain only sanitized timing/status metadata |
| Chat storage | Electron main-process filesystem (`chat-history/*.json`) | Conversation persistence with atomic writes and corruption recovery; filesystem chat JSON is not separately encrypted by Venice Forge |
| Content safety | `src/shared/safety/childExploitationGuard.ts` | Screens every outgoing Venice request at renderer transport, IPC, proxy, and module boundaries; evaluates `negative_prompt` and cross-sentence context; fails closed (500) on extraction errors; returns `SafetyGuardDecision`; never logs raw prompt text |

| Secure storage | Electron `safeStorage` | Venice and Jina API keys (encrypted) |
| IPC bridge | Electron preload + `ipcMain` | Renderer ↔ main transport |
| Web proxy | Express + http-proxy-middleware | Dev/web mode proxy |
| Packaging | electron-builder | Windows NSIS/portable, macOS DMG/ZIP |
| Automation | GitHub Actions + Dependabot | CI, Windows/macOS release, dependency updates |
| QA | Vitest + ESLint (`--max-warnings=0`) | Unit tests, integration tests, static analysis |
| Theme | Token-based CSS variables + Tailwind v4 `@theme` | Built-in and custom themes with WCAG AA contrast checking |

### Application Tabs

| Tab | Feature |
|-----|---------|
| Chat | Streaming chat with Venice text models, memory injection & management, drag & drop context reordering |
| Create | Generate images, **Edit** (single image inpainting), **Combine** (multi-image referencing), and **Upscale** (separate from video upscaling) |
| Video | Asynchronously queue text-to-video, image-to-video, video-to-video, reference-to-video, and video upscale jobs. Settings are model-dependent. |
| Batch | Sequential prompt runs over multiple inputs |
| Research | Multi-provider web search, page scraping, AI research synthesis, and public-profile discovery (Venice, Jina AI, or Generic HTTP) |
| Catalog | Live model browser (type, traits, capability). Requires API key for live discovery. |
| Library | Local image gallery, uploaded files history, recent chats, bulk download/delete/upscale |
| Config | API key management, theme selection (4 built-in + custom export/import), import/export |
| Diagnostics | Diagnostics, rate-limit info, log access |

## Technology Stack

- **Frontend:** React 19, TypeScript strict, Tailwind CSS v4, Vite 6
- **Desktop:** Electron 42, electron-builder 26 (Windows NSIS + portable, macOS DMG + ZIP)
- **Backend (web mode):** Express 4, http-proxy-middleware 4, dotenv
- **State:** React `useReducer` with Immer for immutable updates
- **Testing:** Vitest 4, @testing-library/react, supertest
- **Build:** tsc (Electron main), esbuild (Express server), Vite (renderer)

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
- Venice Forge does not support Linux native packaging in the current release.
- Venice Forge is not an official Venice.ai product and does not replace Venice's legal terms, privacy notices, or API documentation.

## Further Reading

- [README.md](../README.md) — Setup and usage
- [SECURITY.md](../SECURITY.md) — Full security model
- [docs/RELEASE/release.md](RELEASE/release.md) — Release and signing process
- [docs/LEGAL.md](LEGAL.md) — Legal and Venice terms coverage
- [docs/REPOSITORY_TREE.md](REPOSITORY_TREE.md) — Repository structure
- [CONTRIBUTING.md](../CONTRIBUTING.md) — How to contribute
- [CHANGELOG.md](../CHANGELOG.md) — Version history
