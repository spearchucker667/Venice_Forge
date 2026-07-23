# Image Inspector Architecture Map & Phase 0 Findings

This document outlines the existing architecture, files, and conventions relevant to the Image Inspector feature based on the canonical `AGENT_REINITIALIZATION.md`, `image-model-capabilities.md`, and `security-model.md`.

## Core Navigation & UI
- **Navigation and route registration**: Handled in `src/App.tsx` and centralized via `src/config/tabs.ts` (`TAB_IDS`, `TAB_REGISTRY`, `CANONICAL_TAB_ORDER`).
- **Sidebar and command-palette registration**: Sidebar grouping and descriptors are defined in `src/config/tabs.ts` (`TAB_GROUP_LABELS`).
- **Current icon package**: `lucide-react` (version 1.17.0).

## Networking, IPC & API
- **Venice API client and main-process transport**:
  - Renderer uses `src/services/desktopBridge.ts` which exposes `window.veniceForge`.
  - All Venice HTTP requests MUST flow through `veniceFetch()` and `veniceStreamChat()` in `src/services/veniceClient.ts`.
  - Electron main process intercepts requests via `electron/preload.ts` and `electron/ipc/handlers.ts`.
  - Web fallback runs through `server.ts` (Express 5).
- **Current `/models` normalization and model capability metadata**: Model definitions and constraints (e.g., `supportsSeed`, `supportsVariants`) are strictly defined in `src/config/image-model-capabilities.ts`.
- **IPC channel declarations, schemas, preload bridge, and handlers**: `electron/preload.ts` forms the context bridge to handlers in `electron/ipc/` (e.g., `handlers.ts`, `backgroundTaskHandlers.ts`, `chatTtsHandlers.ts`).

## Image & Media Capabilities
- **Existing vision or multimodal request construction**: Handled through `veniceClient.ts`. Vision requests resolve durable local media IDs and treat visible text as untrusted.
- **Current image upload and normalization paths**: Governed by ST Card Studio rules outside the renderer (strict PNG parsing, dimensions, chunk limits, safety assessment, atomic writes) in main IPC handlers.
- **Image Studio and Media Studio stores**: Managed by Zustand 5 stores, specifically `src/stores/media-store.ts` and `src/stores/image-workspace.ts`.
- **App-managed blob and protocol URL systems**: Uses the `venice-media://` custom scheme in the main process with CORS support (`VERIFY-155`).

## Storage, Persistence & Security
- **Secure-storage implementation**: Credentials are held outside the renderer in Electron's `safeStorage` via `electron/services/providerSettingsStore.ts`.
- **Attachment persistence**: Driven by bounded agent tools and IPC handlers, with folder encryption (Argon2id/XChaCha20-Poly1305) and managed document limits. Storage is coordinated by `chatStorage.ts`.
- **Database, IndexedDB, filesystem, or Zustand persistence**: 
  - Reactive state lives in `src/stores/` (19+ slice stores).
  - Storage is managed by `src/services/storageService.ts` and IndexedDB (version 12).
- **Existing migration system**: Uses IndexedDB `toVersion` upgrades.
- **Settings and provider-key UI**: Lives in `src/components/settings/` and `src/stores/settings.ts`, but private keys are never persisted in the renderer.
- **Export/save-dialog infrastructure**: Mediated by `src/services/desktopBridge.ts` (e.g., `saveGeneratedMedia()`, `saveJsonFile()`) which invokes OS-native dialogs and atomic writes from the main process.

## Diagnostics, Prompts & Research
- **Current prompt-layer compiler**: Built around `src/services/rpPromptCompiler.ts` (`compileRpPromptStack()`) and `compileSceneToRecipe` for visual elements.
- **Traffic Inspector request logging and redaction**: Enforced across logs, console, and payloads using `redactSecrets()` and `sanitizeErrorText()` in `src/shared/redaction.ts`.
- **Search or Research provider integrations**: Since the removal of the live WebContents browser (`10d4d9f`), research is handled via `src/components/research/` and API search/scrape.
- **Existing browser search integrations**: Migrated entirely to API-based logic in `src/components/research/`.

## Concurrency & Testing
- **Toast, task, streaming, and cancellation infrastructure**: Managed by `src/stores/toast-store.ts`, `src/stores/status-store.ts`, and `backgroundTaskHandlers`. Heavy use of `AbortSignal` for task cancellation.
- **Current unit, integration, UI, and Electron test conventions**: 
  - Vitest runs serially (`npm test --fileParallelism=false`) due to IndexedDB mocks.
  - Playwright and JSDOM are used for DOM verification.
  - Custom `scripts/verify-*` enforce strict architectural contracts.
