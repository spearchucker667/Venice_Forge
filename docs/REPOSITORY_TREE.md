# Repository Tree

This document is the public map for the Venice Forge repository. It reflects the current dual-mode app layout: Electron desktop production mode and Express/Vite web development mode.

> [!NOTE]
> The repository is post-merge stabilized. All stale `src/modules/` have been removed in favor of `src/components/` layout groups.

## Top-Level Structure

```text
.
├── .github/
│   ├── CODEOWNERS
│   ├── workflows/
│   │   ├── ci.yml                     # Main CI pipeline (lint, typecheck, test, safety guard, build)
│   │   └── release.yml                # Combined Windows/macOS packaging, checksums, and GitHub Release publish
│   ├── dependabot.yml
│   └── pull_request_template.md
├── assets/
│   └── branding/                  # Venice AI brand assets (SVGs for logos, wordmarks, seals, keys)
├── build/
│   ├── icon.icns                  # macOS application icon bundle
│   ├── icon.ico                   # Windows application icon bundle
│   └── icon.png                   # Linux/AppImage icon
├── docs/                          # Extensive project documentation
├── electron/                      # Electron main process source
│   ├── ipc/                       # IPC handlers and validation
│   │   ├── services/                  # Main-process services (storage, logging, secure store, Venice client, chat history)
│   ├── utils/                     # Main-process utilities
│   ├── main.ts                    # Electron entry point
│   └── preload.ts                 # Context bridge preload script
├── public/                        # Static assets and theme bootstrap
├── scripts/                       # Build and verification scripts
│   ├── verify-safety-guard.cjs    # CI gate: ensures the safety guard is wired at every boundary
│   ├── verify-dist.cjs            # Post-package artifact verification
│   └── dev-tools/                 # Local-only developer tooling (Playwright captures)
├── src/                           # React frontend source
│   ├── components/                # UI components (Layout, Chat, Image, Audio, Video, Workflows, etc.)
│   ├── hooks/                     # Custom React hooks (including ported donor hooks)
│   ├── lib/                       # Core library logic (Venice client, workflow engine)
│   │   ├── playground-agent-tools.ts
│   │   ├── playground-agent-tools.test.ts # Added in audit
│   │   ├── playground-agent.ts
│   │   ├── playground-agent.test.ts       # Added in audit
│   │   ├── safe-storage.ts
│   │   ├── safe-storage.test.ts
│   │   ├── stream.ts
│   │   ├── stream.test.ts
│   │   ├── utils.ts
│   │   ├── utils.test.ts
│   │   ├── venice-client.ts
│   │   ├── venice-client.test.ts          # Added in audit (VERIFY-006)
│   │   ├── venice-client.dual.test.ts     # Dual-client contract (VERIFY-009, T8)
│   │   ├── workflow-engine.ts
│   │   ├── workflow-engine.test.ts        # Added in audit
│   │   ├── workflow-mutations.ts
│   │   ├── workflow-mutations.test.ts     # Added in audit
│   │   ├── workflow-schema.ts
│   │   ├── workflow-schema.test.ts        # Added in audit
│   │   ├── workflow-validator.ts
│   │   └── workflow-validator.test.ts
│   ├── research/                  # Web research providers
│   ├── services/                  # Frontend services and bridge abstractions
│   ├── shared/                    # Code shared between frontend and backend (validation, safety)
│   │   └── safety/                 # Child exploitation safety guard
│   │       ├── childExploitationGuard.ts # Public API + decision orchestration (T15)
│   │       ├── matchTables.ts           # Pattern/term dictionaries (T15)
│   │       ├── normalization.ts         # Text normalization + multi-view output (T15)
│   │       ├── promptPayloadExtractor.ts # Endpoint-aware prompt field extraction
│   │       ├── guardAudit.ts            # In-memory audit counters
│   │       └── index.ts                 # Public barrel re-export
│   ├── stores/                    # Zustand state management
│   ├── theme/                     # Token-based theme system
│   ├── types/                     # TypeScript type definitions
│   ├── App.tsx                    # Main React App component
│   └── main.tsx                   # Frontend entry point
├── tests/                         # Cross-cutting invariant tests
│   ├── csp/                       # CSP invariant tests (VERIFY-007)
│   ├── safety/                    # Safety guard enforcement boundary tests
│   ├── theme/                     # Theme token invariant tests (VERIFY-010)
│   └── smoke/                     # Playwright Electron smoke tests (display-required, skipped in CI)
├── package.json                   # Project manifest and scripts
├── tsconfig.json                  # TypeScript configuration
└── vite.config.ts                 # Vite build configuration
```

## Runtime Segments

| Segment | Path | Responsibility |
|---------|------|----------------|
| Renderer app | `src/` | React shell, integrated studios, state, storage, Venice client facade |
| Electron desktop | `electron/` | BrowserWindow, CSP, navigation guard, preload bridge, IPC handlers, safeStorage, HTTPS client |
| Web proxy | `server.ts` | Local development Express server, Venice proxy, security headers |
| Shared validation | `src/shared/` | Venice endpoint and API host configuration shared by renderer and Electron IPC |
| Content safety | `src/shared/safety/` | Child-exploitation safety guard; runs at every enforcement boundary |
| Theme engine | `src/theme/` | Token-based CSS variables + Tailwind v4 `@theme` integration |

## Source Organization (Post-Merge)

| Path | Notes |
|------|-------|
| `src/components/` | Subdirectories for `chat`, `image`, `audio`, `music`, `video`, `workflows`, `playground`, `embeddings`, `layout`, and `ui` |
| `src/stores/` | Zustand stores for `auth`, `chat`, `playground`, `settings`, `toast`, and `workflow` |
| `src/lib/venice-client.ts` | Unified Venice API client; proxies all calls through `desktopBridge` |
| `src/services/desktopBridge.ts` | Secure transport abstraction (IPC in Electron, proxy in web) |
| `src/shared/safety/` | Mandatory content safety screen for all prompt-sending paths |
| `electron/services/secureStore.ts` | OS-encrypted API key persistence (Venice + Jina keys) using `safeStorage` |
| `electron/ipc/handlers.ts` | Secure IPC entry points with validation and safety hooks |

## Generated and Ignored Output

- `node_modules/`
- `dist/` / `dist-electron/`
- `release/`
- `coverage/`
- `.env`
- `docs/AGENTS/` (locally-generated agent session state)
