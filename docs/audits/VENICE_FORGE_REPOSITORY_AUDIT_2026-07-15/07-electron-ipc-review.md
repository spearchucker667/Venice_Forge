# Electron and IPC Review

Reviewed surfaces: `electron/preload.ts`, handler registration and domain modules, IPC validation schemas, desktop bridge, guarded Venice pipeline, storage services, custom protocols, browser/navigation controls and Express parity.

| Control | Result | Evidence |
|---|---|---|
| Context isolation / sandbox / no Node integration | PASS | BrowserWindow construction and production invariant tests. |
| Narrow preload exposure | PASS | ContextBridge API maps to registered/validated channels. |
| Renderer API-key custody | PASS | Auth store configured state does not hydrate the desktop key. |
| Venice request guard | PASS | `performGuardedVeniceRequest`, canonical 451 response and endpoint matrix are contract-tested. |
| IPC input validation | PASS | Zod/allowlist validation precedes privileged handlers. |
| Navigation and external URLs | PASS | HTTPS/public-address checks plus user confirmation. |
| Custom local-file protocols | FIXED | TTS now reads from a validated no-follow descriptor (`VF-AUDIT-002`). |
| Jina/scrape response bounds and safety screening | PASS | 2 MiB cap, cancellation and response-body screening tests. |
| Conversation/storage IDs and atomic writes | PASS | Bounded ID regex, temp+rename, corruption recovery and pagination tests. |

No duplicate IPC registration, unrestricted arbitrary-file read, shell-command injection, renderer credential exposure or unguarded Venice request was confirmed. Generated-media and character-cache protocols remain separately constrained by metadata/containment and renderer-origin checks.
