# Repository Tree

This document is the public map for the Venice Forge repository. It reflects the current dual-mode app layout: Electron desktop production mode and Express/Vite web development mode.

## Top-Level Structure

```text
.
├── .github/
│   ├── CODEOWNERS
│   ├── ISSUE_TEMPLATE/
│   │   ├── bug_report.md
│   │   ├── config.yml
│   │   └── feature_request.md
│   ├── workflows/
│   │   ├── ci.yml                     # Main CI/CD pipeline (lint, typecheck, test, build)
│   │   ├── macos-release.yml          # macOS build, dmg/zip generation, checksums
│   │   └── windows-release.yml        # Windows build, NSIS setup/portable generation, checksums
│   ├── dependabot.yml
│   ├── copilot-instructions.md
│   └── pull_request_template.md
├── build/
│   ├── icon.icns                  # macOS application icon bundle
│   ├── icon.ico                   # Windows application icon bundle
│   └── icon.png                   # Linux/AppImage icon
├── docs/
│   ├── DEVELOPMENT/
│   │   ├── building.md
│   │   ├── macos.md
│   │   ├── platform-support.md
│   │   └── troubleshooting.md
│   ├── RELEASE/
│   │   ├── release.md
│   │   └── signing-and-notarization.md
│   ├── ABOUT.md
│   ├── FAQ.md
│   ├── JINA_PROVIDER.md
│   ├── LEGAL.md
│   ├── PUBLIC_PROFILE_DISCOVERY.md
│   ├── REPOSITORY_TREE.md
│   ├── RESEARCH_PROVIDERS.md
│   ├── THEME_SYSTEM.md
│   ├── Venice_swagger_api.yaml
│   └── venice_llm_info.md
├── electron/
│   ├── ipc/
│   │   ├── handlers.ts              # IPC handler registration (venice, apiKey, app, files, updates, chat)
│   │   ├── updates.ts               # Auto-update IPC endpoints
│   │   ├── validation.ts            # IPC request validation (endpoint/method allowlist)
│   │   └── validation.test.ts       # IPC validation unit tests
│   ├── services/
│   │   ├── chatStorage.ts           # Main-process filesystem chat persistence (atomic writes, corruption recovery)
│   │   ├── chatStorage.test.ts      # Chat storage unit tests
│   │   ├── logger.ts                # Structured logging with rotation
│   │   ├── logger.test.ts           # Logger unit tests
│   │   ├── secureStore.ts           # OS-encrypted API key persistence (safeStorage)
│   │   ├── veniceClient.ts          # Main-process HTTPS client for api.venice.ai
│   │   ├── veniceClient.error.test.ts      # Error parsing tests
│   │   ├── veniceClient.multipart.test.ts  # Multipart upload tests
│   │   └── veniceClient.stream.test.ts     # Streaming response tests
│   ├── utils/
│   │   ├── navigation.ts            # Path containment and symlink traversal checks
│   │   └── urlSecurity.ts           # isTrustedExternalUrl + isPrivateHostname (no DNS, RFC 1918 blocking)
│   ├── main.test.ts                 # Main process unit tests (navigation guards, isTrustedExternalUrl)
│   ├── main.ts                      # Electron main entry (BrowserWindow, CSP, preload)
│   └── preload.ts                   # Context-bridge preload (narrow renderer API surface)
├── scripts/
│   ├── checksum-release.cjs
│   ├── create-cjs-package.cjs
│   ├── generate-placeholder-icon.cjs
│   ├── start-production.cjs
│   ├── verify-dist.cjs
│   └── verify-icon.cjs
├── src/
│   ├── components/
│   ├── constants/
│   ├── modules/
│   ├── services/
│   ├── shared/
│   │   ├── safety/
│   │   │   ├── childExploitationGuard.ts    # Detection engine: term lists, age extraction, fuzzy match, image-endpoint block
│   │   │   ├── childExploitationGuard.test.ts
│   │   │   ├── guardAudit.ts                # In-memory audit counters (no raw prompt content stored)
│   │   │   ├── index.ts                     # Public barrel re-exporting safety surface
│   │   │   ├── promptPayloadExtractor.ts    # Endpoint-aware field extractor for raw API payloads
│   │   │   └── promptPayloadExtractor.test.ts
│   │   ├── apiConfig.ts
│   │   ├── apiConfig.test.ts
│   │   ├── configSchema.ts
│   │   ├── legal.ts
│   │   ├── limits.ts
│   │   ├── logger.ts
│   │   └── validation.ts
│   ├── research/             # Pluggable research provider subsystem (Venice, Jina, Generic HTTP)
│   ├── state/
│   ├── theme/                # Token types, built-in palettes, applyTheme, contrast utilities
│   ├── types/
│   ├── utils/
│   ├── styles/               # Split CSS: theme vars, components, accessibility
│   ├── App.tsx
│   ├── index.css
│   └── main.tsx
├── .env.example
├── CHANGELOG.md
├── CODE_OF_CONDUCT.md
├── CONTRIBUTING.md
├── CLAUDE.md
├── GEMINI.md
├── LICENSE
├── README.md
├── SECURITY.md
├── SUPPORT.md
├── TODO.md
├── AUDIT_REPORT_2026-05-31.md
├── AGENTS.md
├── .cursorrules
├── .windsurfrules
├── electron-builder.config.cjs
├── eslint.config.mjs
├── metadata.json
├── package-lock.json
├── package.json
├── server.test.ts
├── server.ts
├── tsconfig.electron.json
├── tsconfig.electron.test.json
├── tsconfig.json
├── vite.config.ts
└── vitest.config.ts
```

## Runtime Segments

| Segment | Path | Responsibility |
|---------|------|----------------|
| Renderer app | `src/` | React shell, tab modules, UI components, state, storage, import/export, Venice client facade |
| Electron desktop | `electron/` | BrowserWindow, CSP, navigation guard, URL security, preload bridge, IPC handlers, safeStorage, HTTPS client |
| Web proxy | `server.ts` | Local development Express server, Venice proxy, security headers, rate limiting, circuit breaker |
| Shared validation | `src/shared/` | Venice endpoint and API host configuration shared by renderer, web proxy, and Electron IPC |
| Content safety | `src/shared/safety/` | Child-exploitation safety guard: multi-signal detection, payload extraction, and audit counters; runs at every enforcement boundary |
| Build scripts | `scripts/` | CJS package marker generation and release artifact validation |
| Release config | `electron-builder.config.cjs`, `.github/workflows/*-release.yml` | Windows and macOS application packaging |
| Governance | `.github/`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `SUPPORT.md` | Public contribution, support, ownership, and automation metadata |

## Source Organization

| Path | Notes |
|------|-------|
| `src/modules/` | One file per app tab: chat, image generation, batch, research, models, gallery, settings, diagnostics |
| `src/components/` | Reusable UI primitives and feature components |
| `src/services/veniceClient.ts` | Only renderer entry point for Venice API calls |
| `src/services/desktopBridge.ts` | Electron-vs-web transport abstraction |
| `src/services/storageService.ts` | IndexedDB persistence for images, chats, settings, diagnostics, and conversations (5 stores; 4 encrypted — diagnostics intentionally excluded) |
| `src/services/chatStorage.ts` | Unified conversation storage abstraction (IPC in Electron, IndexedDB in web) |
| `src/services/cryptoService.ts` | AES-GCM encryption for IndexedDB records |
| `electron/services/chatStorage.ts` | Main-process filesystem storage for conversations (atomic writes, corruption recovery) |
| `src/services/exportImport.ts` | Versioned JSON export/import with secret redaction |
| `src/shared/validation.ts` | Allowed Venice endpoint and method list |
| `src/research/` | Pluggable research providers, research runner, synthesis, and public-profile discovery |
| `src/shared/safety/` | Content safety guard: detection engine, payload extractor, audit counters |
| `electron/ipc/validation.ts` | Electron IPC request validation boundary |
| `electron/services/secureStore.ts` | OS-encrypted API key persistence (Venice + Jina keys) |
| `electron/services/veniceClient.ts` | Main-process HTTPS client for `api.venice.ai` |
| `electron/utils/urlSecurity.ts` | `isTrustedExternalUrl` and `isPrivateHostname` — pure hostname check, RFC 1918 + loopback blocking, no DNS |

## Generated and Ignored Output

The following paths are generated locally and are intentionally not part of the public source tree:

- `node_modules/`
- `dist/`
- `dist-electron/`
- `release/`
- `coverage/`
- `.env`
- `*.log`

## Public Readiness Checklist

- README badges and release ribbon are present.
- `LICENSE`, `CODE_OF_CONDUCT.md`, `CONTRIBUTING.md`, `SECURITY.md`, and `SUPPORT.md` are present.
- CI runs lint, typecheck, tests, and build on Node 20 and 22.
- Windows and macOS release workflows build targets, verify artifacts, and emit SHA-256 checksums.
- Venice API legal/TOS notes are documented in [LEGAL.md](LEGAL.md).
- FAQ and troubleshooting guides are present in [FAQ.md](FAQ.md) and [DEVELOPMENT/troubleshooting.md](DEVELOPMENT/troubleshooting.md).
- Platform support matrix is documented in [PLATFORM_SUPPORT.md](DEVELOPMENT/platform-support.md).
