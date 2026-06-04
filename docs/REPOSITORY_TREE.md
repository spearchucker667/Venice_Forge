# Repository Tree

This document is the public map for the Venice Forge repository. It reflects the current dual-mode app layout: Electron desktop production mode and Express/Vite web development mode.

> [!NOTE]
> The repository is currently undergoing major restructuring. Some paths below may be in transition.

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
│   ├── services/                  # Main-process services (storage, logging, secure store, Venice client)
│   ├── utils/                     # Main-process utilities
│   ├── main.ts                    # Electron entry point
│   └── preload.ts                 # Context bridge preload script
├── public/                        # Static assets and theme bootstrap
├── scripts/                       # Build and verification scripts
├── src/                           # React frontend source
│   ├── components/                # UI components (Layout, Chat, Image, Audio, Video, Workflows, etc.)
│   ├── hooks/                     # Custom React hooks (including ported donor hooks)
│   ├── lib/                       # Core library logic (Venice client, workflow engine)
│   ├── research/                  # Web research providers
│   ├── services/                  # Frontend services and bridge abstractions
│   ├── shared/                    # Code shared between frontend and backend (validation, safety)
│   ├── stores/                    # Zustand state management
│   ├── theme/                     # Token-based theme system
│   ├── types/                     # TypeScript type definitions
│   ├── App.tsx                    # Main React App component
│   └── main.tsx                   # Frontend entry point
├── tests/                         # End-to-end and smoke tests
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
