# Architecture Map

| Boundary | Live implementation | Responsibility |
|---|---|---|
| Renderer | `src/`, `App.tsx`, `src/config/tabs.ts` | React 19 UI and Zustand state. |
| Transport selector | `src/services/desktopBridge.ts` | Chooses contextBridge IPC in Electron or Express proxy in web mode. |
| Venice client | `src/services/veniceClient.ts` and submodules | Canonical request/stream entry point. |
| Preload | `electron/preload.ts` | Narrow `window.veniceForge` surface under context isolation. |
| Main IPC | `electron/ipc/handlers.ts`, `electron/ipc/handlers/` | Validated privileged operations and guarded Venice requests. |
| Web proxy | `server.ts` | Endpoint allowlist, secret custody, size/rate/SSRF controls and response screening. |
| Persistence | `src/services/storageService.ts`, `electron/services/*Storage.ts` | Encrypted IndexedDB and main-managed atomic files. |
| Build | Vite + Electron TypeScript + esbuild server | `dist/`, `dist-electron/`, `dist/server.cjs`. |

The renderer never owns the desktop Venice API key; Electron main stores it with `safeStorage`. Web-mode secrets remain server-side or ephemeral. All Venice-facing IPC is expected to pass through the local family guard pipeline. The canonical tab registry contains 19 implemented top-level surfaces and is mounted through the `App.tsx` view map.
