# Repository Map

This document is a durable navigation map, not a generated file-count snapshot. The live filesystem, `package.json`, `src/config/tabs.ts`, `electron/preload.ts`, and the handler registries are authoritative.

## Root

| Path | Responsibility |
|---|---|
| `src/` | React renderer and shared web UI |
| `electron/` | Trusted Electron main process, preload bridge, IPC, security, and desktop persistence |
| `server.ts` | Express web-mode proxy |
| `scripts/` | Build, validation, packaging, and repository-contract tools |
| `tests/` | Cross-cutting safety, storage, CSP, theme, backup, accessibility, and smoke suites |
| `config/` | Tracked starter configuration and theme YAML |
| `public/`, `assets/`, `build/` | Runtime assets and tracked packaging resources |
| `docs/` | Current documentation, references, release guidance, and historical-report routing |
| `.github/` | CI, release workflows, and repository templates |

Generated `dist/`, `dist-electron/`, `release/`, and `coverage/` trees are ignored outputs and are never source-of-truth inputs.

## Renderer (`src/`)

| Path | Responsibility |
|---|---|
| `src/App.tsx` | Application view host |
| `src/config/tabs.ts` | Canonical tab IDs, ordering, sidebar groups, shortcuts, and legacy aliases |
| `src/components/` | Feature UI: standard/character chat, history, image/media/audio/music/video studios, prompts, scenes, research, characters/RP, workflows, privacy, settings, status, and command palette |
| `src/components/rp-studio/` | RP Studio and ST Card Studio UI, including the ten-step character editor, character-book editor, library, chats, prompt trace, and scene tools |
| `src/services/desktopBridge.ts` | Only renderer boundary for Electron preload capabilities; web-safe fallbacks live here |
| `src/services/characterCards/` | Character Card V1/V2 adapters, generation/refinement proposals, drafts, Studio handoffs, character-book mapping, and sync merge policy |
| `src/services/veniceClient.ts` | Canonical renderer Venice request/stream entry point |
| `src/services/storageService.ts`, `src/services/dbMigrations.ts` | IndexedDB storage and migration authority |
| `src/stores/` | Zustand application and content stores |
| `src/shared/` | Validation, safety, redaction, limits, and code shared with trusted runtimes |
| `src/theme/` | Semantic theme registry, validation, application, and compatibility |
| `src/types/` | Versioned domain and IPC-facing types |

The visible workspace list must be read from `CANONICAL_TAB_ORDER`; do not copy a numeric tab count into this map.

## Electron (`electron/`)

| Path | Responsibility |
|---|---|
| `electron/main.ts` | BrowserWindow lifecycle, protocol registration, navigation policy, and handler bootstrap |
| `electron/preload.ts` | Context-isolated renderer API and IPC channel allowlist |
| `electron/ipc/handlers/` | Domain-specific IPC registration and main-authoritative input handling |
| `electron/ipc/characterCardFileHandlers.ts` | Main-owned card file selection, preview handles, collision-aware apply, and verified JSON/PNG export |
| `electron/ipc/validation.ts` | IPC request validation |
| `electron/services/veniceClient.ts` | Trusted Venice/provider transport and automatic fallback routing |
| `electron/services/guardPipeline.ts` | Main-process local-safety enforcement and response screening |
| `electron/services/providerSettingsStore.ts` | Profile-scoped provider consent, ordering, and native fallback models |
| `electron/services/secureStore.ts` | Profile-scoped OS-secure credential custody |
| `electron/services/conversationVault.ts`, `electron/services/chatStorage.ts` | Encrypted vault and legacy desktop conversation persistence |
| `electron/services/backgroundTaskManager.ts` | Profile-scoped durable generation-task recovery |
| `electron/services/syncFolderWatcher.ts` | Authenticated encrypted sync-folder ingestion and outbox handling |
| `electron/services/characterCardPngCodec.ts` | Bounded Character Card V2 PNG metadata parsing, validation, replacement, and semantic round-trip verification |
| `inactive-features/research-browser/` | Inactive archive of the former embedded Research Browser; excluded from active build, test, and package surfaces |
| `electron/utils/` | CSP, navigation, external-link, URL, rate-limit, and custom-protocol helpers |

Renderer code must use typed services from `src/services/desktopBridge.ts`; it must not call `window.veniceForge` directly.

## Web Runtime

`server.ts` owns server-side Venice/Jina credentials, endpoint/method validation, request size/rate limits, Local Family Safe Mode enforcement, response screening, and bounded proxy behavior. Browser code never receives server credentials.

## Tests and Contracts

- Colocated `*.test.ts` / `*.test.tsx` files cover source modules.
- `tests/` contains cross-runtime and policy invariants.
- `scripts/verify-*.cjs` are executable repository contracts wired through `npm run verify:contracts`.
- `AGENTS.md` is the canonical validation-order and named `VERIFY-NNN` registry.

## Documentation Authority

- `docs/DOCS_INDEX.md`: current versus historical documentation routing.
- `docs/ROADMAP.md`: current unfinished work only.
- `docs/summary_of_work.md`: active session handoff and commands actually run.
- `docs/audits/Venice_Forge-audit-results-20260716-224749/`: 22:47 snapshot audit report and manifest; current unfinished work is reconciled into `docs/ROADMAP.md`.

## Regenerating a Mechanical Inventory

Use tracked files for a release-facing inventory:

```bash
git ls-files | sort
```

Use the audit exclusion rules before counting a full working-tree inventory. Do not commit generated inventories, ignored scratch directories, dependency trees, or build output as canonical documentation.
