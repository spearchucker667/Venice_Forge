# Repository Tree

This document is the public map for the Venice Forge repository. It reflects the
current dual-mode app layout: Electron desktop production mode and
Express/Vite web development mode.

> [!NOTE]
> The repository is post-merge stabilized. All stale `src/modules/` have been
> removed in favor of the layout-grouped `src/components/` tree. The Media
> Studio implementation lives under `src/components/gallery/` (canonical id
> `media`); the legacy `gallery` id is preserved as a tab-registry alias for
> back-compat. All paths in this document are derived from `git ls-files` at
> HEAD `c2afcfac` (601 tracked files).

## Top-Level Structure

```text
.
├── .config/                            # Example templates copied by `npm run config:init`
│   ├── config.example.yaml
│   └── themes.example.yaml
├── .github/
│   ├── CODEOWNERS
│   ├── ISSUE_TEMPLATE/
│   │   ├── bug_report.md
│   │   ├── config.yml
│   │   └── feature_request.md
│   ├── dependabot.yml
│   ├── pull_request_template.md
│   ├── copilot-instructions.md        # Cross-link surface for the AGENTS.md rules
│   └── workflows/
│       ├── ci.yml                      # Main CI pipeline (lint, typecheck, test, safety guard, build)
│       └── release.yml                 # Combined Windows/macOS/Linux packaging, checksums, GitHub Release publish
├── assets/
│   └── branding/                       # Venice AI brand assets (SVGs for logos, wordmarks, seals, keys)
├── build/                              # Build-time icon bundles (tracked; required by electron-builder)
│   ├── icon.icns                       # macOS application icon bundle
│   ├── icon.ico                        # Windows application icon bundle
│   └── icon.png                        # Linux/AppImage icon
├── config/
│   └── themes/                         # Built-in theme YAML templates
│       ├── dark.yaml
│       ├── dracula.yaml
│       ├── example.theme.yaml
│       ├── gruvbox_dark.yaml
│       ├── light.yaml
│       ├── rosepine.yaml
│       └── venice.yaml
├── docs/                               # Public project documentation (see docs/summary_of_work.md for ledger)
├── electron/                           # Electron main process source
│   ├── ipc/                            # IPC handlers and validation
│   │   ├── handlers.ts
│   │   ├── handlers.test.ts
│   │   ├── rpHandlers.ts               # 20 RP Studio IPC channels
│   │   ├── updates.ts
│   │   ├── updates.test.ts
│   │   ├── validation.ts
│   │   └── validation.test.ts
│   ├── services/                       # Main-process services (storage, logging, secure store, Venice client, chat history, media)
│   │   ├── bridgeServer.ts             # Loopback Express headless bridge (127.0.0.1, bearer token, safety)
│   │   ├── characterCardStorage.ts     # Atomic-write + corruption-recovery local character-card store
│   │   ├── chatStorage.ts              # Conversation persistence (atomic write, pagination)
│   │   ├── configService.ts            # YAML config load + key import/redaction (VERIFY-024)
│   │   ├── conversationVault.ts        # Encrypted at-rest conversation vault
│   │   ├── conversationWriteQueue.ts
│   │   ├── guardPipeline.ts            # performGuardedVeniceRequest / checkLocalFamilyGuard (VERIFY-015)
│   │   ├── logger.ts                   # Redacting main-process logger
│   │   ├── mediaService.ts             # Disk service for app:media:{export,import,reveal,meta,thumb} (path containment)
│   │   ├── memoryPuller.ts
│   │   ├── rpChatStorage.ts
│   │   ├── rpSingleFileStore.ts
│   │   ├── rpStores.ts
│   │   ├── runtimeSafetySettings.ts    # Canonical source of truth for localFamilySafeModeEnabled
│   │   ├── secureStore.ts              # safeStorage wrapper for Venice + Jina API keys
│   │   ├── vaultMigration.ts
│   │   └── veniceClient.ts             # Main-process HTTPS client to api.venice.ai
│   ├── utils/                          # Main-process utilities
│   │   ├── navigation.ts               # Renderer navigation guard
│   │   └── urlSecurity.ts              # isTrustedExternalUrl / isPrivateHostname
│   ├── main.ts                         # Electron entry point (CSP, BrowserWindow, navigation, single-instance lock)
│   ├── main.test.ts
│   └── preload.ts                      # contextBridge surface (only place exposing IPC to renderer)
├── public/                             # Static assets and theme bootstrap
│   ├── assets/branding/                # Symlink-style branding assets
│   └── bootstrap-theme.js
├── scripts/                            # Build, packaging, and verification scripts
│   ├── checksum-release.cjs
│   ├── create-cjs-package.cjs          # Builds the CJS package.json next to dist-electron/
│   ├── dev-tools/                      # Local-only developer tooling (Playwright captures)
│   ├── generate-placeholder-icon.cjs
│   ├── init-config.ts                  # `npm run config:init` — copy example templates
│   ├── print-config.ts                 # `npm run config:print` — print sanitized effective config
│   ├── profile-media-studio.mjs        # Playwright Electron profile (1,000 encrypted records)
│   ├── start-production.cjs            # `npm start` entrypoint
│   ├── validate-config.ts              # `npm run config:validate`
│   ├── verify-archive-clean.cjs        # CI gate: tracked-contaminant scan
│   ├── verify-dist.cjs                 # Post-package artifact verification
│   ├── verify-icon.cjs
│   ├── verify-markdown-links.cjs       # Local Markdown + heading-fragment resolver (VERIFY-029, VERIFY-034)
│   ├── verify-media-studio-power-tools.cjs   # Phase 2B contract guard
│   ├── verify-model-aware-recipes.cjs        # Phase 2A contract guard
│   ├── verify-prompt-library.cjs             # Phase 2D contract guard
│   ├── verify-release-packaging-hardening.cjs # Phase 2J single-source-of-truth audit
│   ├── verify-research-workspace.cjs         # Phase 2I contract guard
│   ├── verify-rp-studio-polish.cjs           # Phase 2F contract guard
│   ├── verify-safety-guard.cjs               # Mandatory CI gate (safety guard at every boundary)
│   ├── verify-scene-composer.cjs             # Phase 2E contract guard
│   ├── verify-status-diagnostics.cjs         # Phase 2C contract guard
│   ├── verify-storage-privacy.cjs            # Phase 2H contract guard
│   └── verify-workflow-templates.cjs         # Phase 2G contract guard
├── server.ts                           # Express proxy (`/api/venice/*`, `/api/proxy-scrape`); vite only in dev
├── server.test.ts                      # Supertest coverage for the proxy + endpoint allowlist
├── src/                                # React frontend source
│   ├── components/                     # UI components, grouped by feature (see below)
│   ├── hooks/                          # Custom React hooks (models, chat, focus trap, media thumb, theme lifecycle)
│   ├── lib/                            # Renderer-side workflow engine and Venice client surface
│   │   ├── playground-agent.ts         # + tests
│   │   ├── playground-agent-tools.ts   # + tests
│   │   ├── safe-storage.ts             # + tests
│   │   ├── stream.ts                   # + tests
│   │   ├── utils.ts                    # + tests
│   │   ├── venice-client.ts            # Electron-only thin client; safety guard lives in the IPC layer
│   │   ├── venice-client.test.ts       # VERIFY-006
│   │   ├── venice-client.dual.test.ts  # VERIFY-009
│   │   ├── workflow-engine.ts          # + tests
│   │   ├── workflow-mutations.ts       # + tests
│   │   ├── workflow-schema.ts          # + tests
│   │   └── workflow-validator.ts       # + tests
│   ├── research/                       # Web research providers (Venice + Jina + Generic HTTP)
│   │   ├── index.ts
│   │   ├── providerTypes.ts            # + tests
│   │   ├── agent/                      # citationBuilder / evidenceStore / researchRunner / researchSynthesis / socialDiscovery
│   │   └── providers/                  # veniceResearchProvider / jinaResearchProvider / genericHttpScrapeProvider
│   ├── services/                       # Frontend services and transport abstractions (see below)
│   ├── shared/                         # Code shared between renderer and backend (validation, safety)
│   │   ├── apiConfig.ts                # + tests
│   │   ├── configSchema.ts             # Defensive YAML config validator (+ tests)
│   │   ├── legal.ts
│   │   ├── limits.ts                   # Shared byte/timeout constants — reuse, do not hardcode
│   │   ├── logger.ts                   # Redacting renderer-side logger
│   │   ├── readBoundedFetchBody.ts
│   │   ├── validation.ts               # Venice endpoint allowlist (single source for IPC + proxy)
│   │   └── safety/                     # Child exploitation safety guard
│   │       ├── childExploitationGuard.ts   # Public API + decision orchestration (T15)
│   │       ├── characterImportSafety.ts    # Thin wrappers routing character/persona/RP/scene inputs
│   │       ├── guardAudit.ts               # In-memory audit counters
│   │       ├── index.ts                    # Public barrel re-export
│   │       ├── localFamilyGuardRules.ts
│   │       ├── localFamilySafeGuard.ts     # Conditional Family Safe Mode pipeline
│   │       ├── matchTables.ts              # Pattern/term dictionaries (T15)
│   │       ├── normalization.ts            # Text normalization + multi-view output (T15)
│   │       └── promptPayloadExtractor.ts   # Endpoint-aware prompt field extraction
│   ├── stores/                         # Zustand state management (40+ stores; see below)
│   ├── theme/                          # Token-based theme system (29 canonical roles, WCAG AA)
│   ├── types/                          # TypeScript type definitions
│   ├── App.tsx                         # Main React App component
│   ├── App.navigation.test.ts
│   └── main.tsx                        # Frontend entry point
├── tests/                              # Cross-cutting invariant tests
│   ├── csp/                            # CSP invariant tests (VERIFY-007)
│   ├── electron/                       # Packaged startup invariants (VERIFY-036)
│   ├── rp/                             # RP service invariants
│   ├── safety/                         # Safety guard enforcement boundary tests
│   │   ├── characterImportSafety.routing.test.ts   # VERIFY-014
│   │   ├── enforcementBoundaries.test.ts
│   │   ├── guardPipeline.test.ts                  # VERIFY-015
│   │   ├── hydrationGate.test.ts                  # VERIFY-017
│   │   ├── inspectorPreview.test.ts               # VERIFY-016
│   │   ├── sceneGeneration.regression.test.ts     # VERIFY-013
│   │   └── veniceSafeMode.test.ts                 # VERIFY-018
│   ├── smoke/                          # Playwright Electron smoke tests (display-required, skipped in CI)
│   ├── storage/                        # Local storage regression tests
│   │   ├── characterCardStorage.regression.test.ts # VERIFY-011
│   │   └── rpChatStorage.regression.test.ts        # VERIFY-012
│   └── theme/                          # Theme token invariant tests (VERIFY-010)
├── package.json                        # Project manifest and scripts
├── tsconfig.json                       # Renderer TypeScript configuration (ESNext, noEmit, bundler)
├── tsconfig.electron.json              # Electron main-process TypeScript configuration
├── tsconfig.electron.test.json
├── vite.config.ts                      # Vite build configuration
├── vitest.config.ts                    # Vitest configuration (serial, 70/80/80/80 thresholds)
├── eslint.config.mjs                   # Flat ESLint config
├── package-scripts.test.ts             # Locks the canonical `dev:web` / verify:* script strings
├── electron-builder.config.cjs         # Windows/macOS/Linux packaging config (VERIFY-052)
├── .env.example                        # Documented env-var template
├── .gitignore                          # Excludes node_modules/, dist/, dist-electron/, release/, coverage/, .env*, docs/AGENTS/, docs/HQE_AUDIT_REPORT.md, docs/design/, todo.md, Thumbs.db, desktop.ini, *.tmp
├── LICENSE                             # MIT
└── Root governance docs                # README.md, AGENTS.md, CHANGELOG.md, CLAUDE.md, GEMINI.md, CODE_OF_CONDUCT.md, CONTRIBUTING.md, SECURITY.md, SUPPORT.md, PRIVACY.md
```

## `src/components/` Layout Groups

The renderer UI is grouped by feature. The canonical tab order is owned by
`src/config/tabs.ts`.

| Subdir | Purpose | Key files |
|--------|---------|-----------|
| `audio/` | Audio Studio (TTS + Whisper STT) | `audio-view.tsx` |
| `chat/` | Chat Studio (streaming, attachments, vision gate) | `chat-view.tsx`, `chat-input.tsx`, `message-bubble.tsx`, `venice-params.tsx` |
| `command-palette/` | Ctrl/Cmd-K command palette (selection-aware) | `CommandPalette.tsx`, `CommandPalette.test.tsx` |
| `embeddings/` | Embeddings Studio | `embeddings-view.tsx` |
| `gallery/` | Media Studio (gallery, compare, lineage, recipe cards) | `gallery-view.tsx`, `compare-view.tsx`, `lineage-viewer.tsx`, `media-card.tsx`, `media-detail-dialog.tsx`, `media-inspector.tsx`, `media-toolbar.tsx`, `recipe-comparison.tsx`, `recipe-compatibility-card.tsx` (+ tests) |
| `image/` | Image Studio (generate, edit, combine, upscale) | `image-view.tsx`, `image-tools.tsx`, `image-page.tsx` (+ tests) |
| `layout/` | App shell (header, sidebar, inspector pane, memory panel) | `header.tsx`, `sidebar.tsx`, `inspector-pane.tsx`, `memory-panel.tsx`, `api-key-dialog.tsx` (+ tests) |
| `music/` | Music Studio | `music-view.tsx` |
| `playground/` | Playground agent + live workflow canvas | `playground-view.tsx`, `playground-chat.tsx`, `agent-model-picker.tsx`, `preview-node.tsx`, `workflow-preview.tsx` |
| `privacy/` | Storage / Privacy Dashboard (Phase 2H) | `StoragePrivacyDashboard.tsx` (+ test) |
| `prompts/` | Prompt Library Foundation (Phase 2D) | `PromptLibraryView.tsx` (+ test) |
| `research/` | Research Workspace (Phase 2I) | `ResearchWorkspaceView.tsx` (+ test) |
| `rp-studio/` | Character RP Studio (cards, personas, lorebooks, chats, scene generator) | `RpStudioView.tsx`, `CharacterLibrary.tsx`, `CharacterEditor.tsx`, `PersonaManager.tsx`, `LorebookManager.tsx`, `RpChatList.tsx`, `RpChatView.tsx`, `SceneGenerator.tsx`, `AssetGallery.tsx`, `PromptDebugDrawer.tsx`, `_shared.tsx`, `index.ts` (+ tests) |
| `scenes/` | Scene Composer (Phase 2E) | `SceneComposerView.tsx` (+ test) |
| `status/` | Header Status Cluster + Diagnostics Drawer (Phase 2C) | `HeaderStatusCluster.tsx`, `StatusIndicator.tsx`, `DiagnosticsDrawer.tsx` (+ tests) |
| `ui/` | Shared primitives | `error-boundary.tsx`, `generation-view.tsx`, `logo.tsx`, `select.tsx`, `shared.tsx`, `spinner.tsx`, `toaster.tsx` |
| `video/` | Video Studio (queue + upscale) | `video-view.tsx` |
| `workflows/` | Workflows visual editor + Templates (Phase 2G) | `workflows-view.tsx`, `workflow-node.tsx`, `WorkflowTemplatesView.tsx` (+ test) |
| (root) | Top-level view shells | `App.tsx`, `CharactersView.tsx`, `SettingsView.tsx`, `StatusView.tsx`, `SearchScrapeView.tsx`, `ThemeMaker.tsx`, `DiagnosticsPreview.tsx`, `MemoryManagerModal.tsx`, `ModelRefreshButton.tsx`, `ModelSelect.tsx`, `FirstRunModal.tsx`, `AttachmentTray.tsx`, `Chip.tsx`, `CollapsibleSection.tsx`, `ConfirmModal.tsx`, `ErrorBoundary.tsx`, `Field.tsx`, `ImageActionModal.tsx`, `ImageGenerationPreview.tsx`, `StatusBlock.tsx`, `TabButton.tsx`, `ThemePreview.tsx`, `ToastHost.tsx`, `VideoGenerationForm.tsx`, `VideoGenerationPreview.tsx`, `icons.tsx` |

## `src/services/` Surface

| File / area | Purpose |
|-------------|---------|
| `desktopBridge.ts` + `.test.ts` | Secure transport abstraction (IPC in Electron, proxy in web); single renderer entry point |
| `veniceClient.ts` (canonical) | Single Venice HTTP entry point with safety guard |
| `modelService.ts` / `modelClassification.ts` | Live model list and capability classification |
| `storageService.ts` + `dbMigrations.ts` | IndexedDB store set controlled by `STORE_NAMES`; `ENCRYPTED_STORES` for AES-GCM |
| `chatStorage.ts` (renderer) + `electron/services/chatStorage.ts` (main) | Conversation persistence — mirror changes across both |
| `mediaMigration.ts` | Idempotent `migrateGalleryImageToMediaItem` migrator |
| `exportImport.ts` | IDB data export / import with secret redaction and corruption recovery |
| `cryptoService.ts` | AES-GCM helpers used by `storageService` |
| `memoryService.ts` | AI memory layer; 2,000-char injection budget |
| `attachmentService.ts` | File / URL / image attachments; 256 KiB/file, 1 MiB total, 5-attachment cap, 1024-px downscale |
| `imageWorkflowService.ts` | Image Studio workflow dispatch (Generate, Edit, Combine, Upscale) |
| `prompt-enhancer-service.ts` / `promptStarterService.ts` | Prompt assistance helpers |
| `pdfParserService.ts` | PDF attachment parsing |
| `inspectorTelemetry.ts` | Developer traffic log telemetry |
| `redaction.ts` | Secret redaction primitives used by exports and diagnostics |
| `researchService.ts` / `researchSummaries.ts` | Research providers + citation-aware summaries (Phase 2I) |
| `characterCardImportExport.ts` | Character card import/export redaction (Phase 2F) |
| `rpPromptCompiler.ts` + tests | RP prompt stack compiler (Phase 2F) |
| `rp/` | Renderer-side wrappers (assetService, characterCardService, lorebookRendererService, lorebookService, personaService, promptBuilderService, rpChatService) — Electron IPC + web IDB |
| `sceneGenerationService.ts` (in `src/shared/safety/`) | Scene prompt extraction + `/image/generate` dispatch with hydration-gated `assessScenePrompt` |

## `src/stores/` Surface (40+ Zustand stores)

| Store | Purpose |
|-------|---------|
| `auth-store.ts` | OS-secure Venice key state (VERIFY-037) |
| `chat-store.ts` (+ helpers, + dirty/flush/character tests) | Conversation CRUD, dirty-map flush on unload (VERIFY-005, VERIFY-021) |
| `config-store.ts` | Optional YAML config state surfaced to the UI |
| `playground-store.ts` | Playground agent state |
| `project-store.ts` (+ tests) | Project lifecycle, archive, exact gallery filter (VERIFY-042) |
| `prompt-library-store.ts` (+ tests) | Prompt Library CRUD with secret redaction (Phase 2D) |
| `scene-composer-store.ts` (+ tests) | Scene Composer CRUD (Phase 2E) |
| `workflow-template-store.ts` (+ tests) | Workflow Templates CRUD (Phase 2G) |
| `research-store.ts` (+ tests) | Research Workspace persistence (Phase 2I) |
| `storage-privacy-store.ts` | Storage / Privacy Dashboard orchestration (Phase 2H) |
| `status-store.ts` | Header Status Cluster state (Phase 2C) |
| `media-store.ts` (+ tests) | Media Studio cache; encrypted IDB is source of truth (VERIFY-028, VERIFY-040) |
| `media-selection-store.ts` (+ tests) | Multi-select + compare-mode preconditions (Phase 2B, VERIFY-044) |
| `media-bulk-actions.ts` (+ tests) | Uniform `BulkMediaActionResult` contract (Phase 2B) |
| `media-send-to.ts` (+ tests) | Send-to Image Studio / Image Tools / Chat / Video (Phase 2B) |
| `media-export-bundle.ts` (+ tests) | Safe export manifest + sidecar JSON (Phase 2B) |
| `media-command-handlers.ts` | Gallery-view command-palette handler registry (Phase 2B) |
| `image-workspace-store.ts` (+ tests) | Transient, non-persisted production handoff queue (VERIFY-040) |
| `inspector-store.ts` | Developer traffic logs / diagnostics (VERIFY-016) |
| `character-card-store.ts` (+ tests) | Local character cards |
| `character-store.ts` | Venice hosted characters (proxy) |
| `persona-store.ts` | RP personas |
| `lorebook-store.ts` | RP lorebooks |
| `rp-chat-store.ts` (+ tests) | RP chats (VERIFY-025) |
| `scene-asset-store.ts` | RP scene assets |
| `scenario-store.ts` (+ tests) | RP scenarios (Phase 2F) |
| `use-models.ts` / `use-models-mock.ts` (in `src/hooks/`) | Live `/models` query + mock |

## Runtime Segments

| Segment | Path | Responsibility |
|---------|------|----------------|
| Renderer app | `src/` | React shell, integrated studios, state, storage, Venice client facade |
| Electron desktop | `electron/` | BrowserWindow, CSP, navigation guard, preload bridge, IPC handlers, safeStorage, HTTPS client |
| Web proxy | `server.ts` | Local development Express server, Venice proxy, security headers |
| Shared validation | `src/shared/` | Venice endpoint and API host configuration shared by renderer and Electron IPC |
| Content safety | `src/shared/safety/` | Child-exploitation safety guard; runs at every enforcement boundary |
| Theme engine | `src/theme/` | Token-based CSS variables + Tailwind v4 `@theme` integration |
| Media Studio | `src/components/gallery/` + `src/stores/media-store.ts` + `src/stores/image-workspace-store.ts` + `src/services/mediaMigration.ts` + `electron/services/mediaService.ts` | Local-first generated-media library. Renderer reads from the encrypted `images` IDB store, enriches in place into a canonical `MediaItem` shape, and renders a searchable / filterable / sortable / batch-selectable grid. A transient non-persisted handoff store routes production actions to Image Studio. Electron adds 5 IPC channels (export, import, reveal, meta, thumb) with strict path-containment validation. See [`MEDIA_STUDIO.md`](MEDIA_STUDIO.md). |

## Source Organization (Post-Merge)

| Path | Notes |
|------|-------|
| `src/components/` | Subdirectories for `audio`, `chat`, `command-palette`, `embeddings`, `gallery`, `image`, `layout`, `music`, `playground`, `privacy`, `prompts`, `research`, `rp-studio`, `scenes`, `status`, `ui`, `video`, `workflows`. The legacy filesystem directory name `gallery/` contains the canonical Media Studio implementation |
| `src/stores/` | Zustand 5 stores — see the `src/stores/` table above for the full surface |
| `src/lib/venice-client.ts` | Electron-only thin client; safety guard is in the IPC layer — see `electron/ipc/handlers.ts:79`. Kept separate from the canonical `services/veniceClient.ts` because: (a) this is a passthrough that does not run the safety guard in the renderer (it lives in the IPC layer), (b) it has a simpler `venice<T>()` / `veniceBlob()` / `veniceFormData()` API the legacy hooks prefer, (c) it can be deleted in a future Electron-only refactor |
| `src/services/desktopBridge.ts` | Secure transport abstraction (IPC in Electron, proxy in web) |
| `src/shared/safety/` | Mandatory content safety screen for all prompt-sending paths |
| `electron/services/secureStore.ts` | OS-encrypted API key persistence (Venice + Jina keys) using `safeStorage` |
| `electron/ipc/handlers.ts` | Secure IPC entry points with validation and safety hooks |
| `electron/services/guardPipeline.ts` | Central IPC entry point combining runtime snapshot + local guard (VERIFY-015) |

## Generated and Ignored Output

- `node_modules/`
- `dist/` / `dist-electron/`
- `release/`
- `coverage/`
- `.env*` (with `.env.example` allowlisted)
- `.config/*.local.yaml` (with `*.example.yaml` allowlisted)
- `docs/AGENTS/` (local-only agent session state)
- `docs/HQE_AUDIT_REPORT.md` (local-only dev auditor)
- `docs/design/` (local-only design scratch)
- `todo.md` / `TODO.md` (case-insensitive on macOS HFS+/APFS; identical to `docs/TODO.md`)
- `chat-history/` (per-user, in userData — never tracked)
- `*.db` (developer SQLite scratch)
- `*.log` / `*.tmp` (build and runtime logs)
- `Thumbs.db` / `desktop.ini` (Windows metadata)
- `build/` — only `build/icon.{ico,icns,png}` are tracked; everything else is ignored

See `.gitignore` for the canonical list. `scripts/verify-archive-clean.cjs`
locks the tracked-contaminant contract (VERIFY-052) and
`scripts/verify-dist.cjs` locks the build-output hygiene contract.
