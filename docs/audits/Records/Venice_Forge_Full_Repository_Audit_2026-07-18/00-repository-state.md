# 00 Repository State

Date: 2026-07-18
Path: /Users/super_user/Projects/Venice_Forge
Branch: main
Commit: dab1b02ef0310357d4f2f40f550c6dd6f9ed645c (docs: add VENICE_API_SYSTEM_PROMPT.md and fix broken links)

## Environment
Node: v22.13.0
NPM: 10.9.2
OS: Darwin 53iii9i3.local 27.0.0 Darwin Kernel Version 27.0.0: Mon Jun 29 21:25:51 PDT 2026; root:xnu-13432.0.50.501.3~1/RELEASE_ARM64_T8140 arm64

## Git Status
```
 M docs/ROADMAP.md
 M docs/summary_of_work.md
 M electron/ipc/handlers/documentAgentHandlers.ts
 M electron/ipc/handlers/index.ts
 M electron/ipc/handlers/veniceHandlers.ts
 M electron/main.ts
 M electron/preload.ts
 M electron/services/generatedMediaStore.test.ts
 M electron/services/generatedMediaStore.ts
 M electron/services/guardPipeline.ts
 M electron/services/veniceClient.ts
 M src/agent/contracts/capabilities.ts
 M src/agent/registry/tool-name-map.ts
 M src/agent/registry/tool-registry.ts
 M src/components/chat/HistoryView.tsx
 M src/components/chat/chat-input.tsx
 M src/components/chat/message-bubble.tsx
 M src/components/chat/venice-params.tsx
 M src/components/gallery/gallery-view.tsx
 M src/components/gallery/media-card.tsx
 M src/components/gallery/media-detail-dialog.tsx
 M src/constants/venice.ts
 M src/hooks/use-chat.ts
 M src/services/backupExportService.ts
 M src/services/characterImageDiagnostics.ts
 M src/services/chatPromptCompiler.ts
 M src/services/desktopBridge.ts
 M src/services/storagePrivacyService.ts
 M src/services/storageService.ts
 M src/services/taskMediaCatalog.ts
 M src/services/veniceClient/fetch.ts
 M src/services/veniceClient/stream.ts
 M src/stores/chat-store.ts
 M src/stores/chat-stream-manager.ts
 M src/stores/media-bulk-actions.test.ts
 M src/stores/media-selection-store.test.ts
 M src/stores/media-selection-store.ts
 M src/types/conversation.ts
 M src/types/conversationVault.ts
 M src/types/desktop.ts
 M src/types/venice.ts
 M src/utils/mediaItem.test.ts
 M src/utils/mediaItem.ts
?? docs/audits/
?? electron/agent/runtime/
?? electron/ipc/handlers/chatFolderHandlers.ts
?? electron/services/chatFolderStorage.ts
?? rewrite_history.py
?? scratch.diff
?? src/stores/chat-folder-store.ts
?? src/types/chatAttachment.ts
?? src/types/chatFolder.ts
?? update_history.py
```

## Repository Size
- Total: 975M (813M is node_modules)
- Code sizes:
  - `electron`: 1.6M
  - `src`: 6.5M
  - `tests`: 11M
  - `assets`: 3.3M
  - `docs`: 3.6M

## Top-Level Layout
```
.
./.config
./.design-captures
./.design-captures/venice
./.impeccable
./.impeccable/live
./.superpowers
./.superpowers/sdd
./.vscode
./assets
./assets/branding
./assets/mio-xc3-nerdprofeta-gifs
./build
./config
./config/themes
./coverage
./coverage/Venice_Forge
./dist
./dist-electron
./dist-electron/electron
./dist/assets
./dist/audio
./docs
./docs/AGENTS
./docs/archives
./docs/audits
./docs/design
./docs/developer
./docs/DEVELOPMENT
./docs/discovery
./docs/features
./docs/legal
./docs/reference
./docs/RELEASE
./docs/reports
./docs/security
./docs/superpowers
./docs/testing
./docs/user
./electron
./electron/agent
./electron/ipc
./electron/security
./electron/services
./electron/utils
./inactive-features
./inactive-features/research-browser
./public
./public/assets
./public/audio
./scratch
./scripts
./scripts/dev-tools
./src
./src/agent
./src/components
./src/config
./src/constants
./src/data
./src/hooks
./src/lib
./src/research
./src/services
./src/shared
./src/stores
./src/styles
./src/theme
./src/types
./src/utils
./tests
./tests/accessibility
./tests/backup
./tests/csp
./tests/electron
./tests/fixtures
./tests/rp
./tests/safety
./tests/smoke
./tests/storage
./tests/theme
```
