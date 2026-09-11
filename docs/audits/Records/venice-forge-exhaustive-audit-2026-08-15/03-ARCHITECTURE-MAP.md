# Architecture Map

| Boundary | Primary implementation | State/persistence | Trust boundary |
|---|---|---|---|
| Renderer shell/UI | `src/App.tsx`, `src/components/**` | Zustand stores in `src/stores/**` | Unprivileged renderer; no Node integration |
| Web transport | `src/services/veniceClient/**`, `server.ts` | Browser session/runtime state | Browser → local proxy → provider |
| Desktop bridge | `src/services/desktopBridge.ts`, `electron/preload.ts` | Typed callback/request envelopes | contextBridge/IPC boundary |
| Main transport/guard | `electron/services/veniceClient.ts`, `guardPipeline.ts` | secure key lookup, safety settings | Main process owns provider credentials |
| Agent runtime | `electron/agent/runtime/**` | Tool messages and approvals | Model output → validated tool dispatcher |
| Documents/workspaces | `electron/agent/documents/**`, `electron/agent/workspace/**` | bounded file grants, journals/revisions | Explicit filesystem grants and review |
| App data | `electron/services/*Storage*`, profile services | encrypted/local profile-scoped files | Main-owned filesystem access |
| Generated media | generated-media store/protocol/export services | content-addressed durable media | Renderer receives controlled custom schemes |
| Background jobs | main-process background-task manager/IPC | durable task journal, ephemeral signed URLs | Paid queue submission and polling |
| Model catalog | `/models`, traits and classification stores | runtime cache | Provider metadata is authoritative |
| Build/release | Vite/esbuild/Electron Builder, `.github/workflows/**` | packaged artifacts/checksums | Hosted signing and platform runners |

## Critical traced flows

- Chat: composer/store → prompt compiler → tool assembly → Web or preload transport → main guard → Venice stream → renderer accumulator → chat persistence.
- Image: UI/workflow/agent → payload builder → request guard → provider response → generated-media persistence → custom protocol/render/export.
- Video/audio queue: workflow/UI → quote/approval → canonical builder → main task submission → durable queue ID → bounded retrieve polling → private download → local persistence.
- Research: Search UI/research orchestrator → Venice/Jina provider adapter → normalized result → research store/workspace.
- Credentials: settings renderer → validated IPC → main secure store; request-time credential selection ignores renderer-supplied profile identifiers.

The findings concentrate where parallel abstractions drifted: logical-to-wire builders, duplicate SSE implementations, and callback envelope types repeated across IPC layers.
