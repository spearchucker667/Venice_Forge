# Venice Forge — Document Agent Discovery Report

**Date:** 2026-07-18
**Agent:** Venice Forge Agent
**Repository:** Venice Forge v3.0.0-beta.1
**Branch:** main (commit 10d4d9f)

---

## Canonical Specification

The authoritative source of truth for the Document Agent is:

**`docs/audits/TODO/Function_calling_todo.md`** (3880 lines)

This handoff document, written for a senior Electron security architect, defines:

- **Two access modes:** Limited Document Tools (default, production-safe) and Full Workspace Tools (explicit opt-in, single user-selected root).
- **60 acceptance criteria** organized as Limited Documents (1–20), Workspace Access (21–40), Security and Reliability (41–60).
- **11 implementation phases** (Phase 0 Discovery through Phase 11 Hardening/Release).
- **14 canonical tools** with both an internal dot-separated identifier (e.g., `document.get`) and a provider-safe underscore-separated identifier (e.g., `document_get`).
- **7 application-internal operations** that must never be exposed as model-callable tools (`document.applyApprovedEdits`, `workspace.applyApprovedChangeset`, `approval.issueToken`, `approval.consumeToken`, `revision.commit`, `revision.rollback`, `audit.record`).
- **5 capability presets:** `off`, `read_attachments`, `limited_documents`, `workspace_with_approval`, `workspace_autonomous`.
- **Detailed TypeScript types** for tool results, capability grants, workspace grants, edit operations, block model, revisions, warnings, and policy decisions.
- **60+ checklist items** across Discovery, Canonical Contracts, Managed Documents, Tool Registry, Edit Engine, Approvals, UI, Serialization, Parsing, Export, Workspace Grants, Path Security, Workspace Reads/Search, Writes, Move/Trash, Audit, Model Compatibility, Resilience, Tests, Documentation, and Release.

**This discovery report is the Phase 0 deliverable** required by the canonical spec before any implementation begins.

---

## Executive Summary

This discovery report (Phase 0) documents the existing Venice Forge architecture and identifies where the codebase meets — or does not meet — each acceptance criterion and implementation phase defined by `Function_calling_todo.md`. The report serves as the bridge between the canonical spec and the repository, mapping every required behavior to the existing files, services, and patterns that will form its foundation.

**Current State**: Venice Forge is a mature Electron + React + TypeScript application with dual-transport (Electron IPC / Express proxy) Venice API integration, dual-mode chat persistence, comprehensive security (safeStorage, Local Family Safe Mode, endpoint allowlists, SSRF protection), tool-calling agent infrastructure for visual workflows, and encrypted IndexedDB storage.

**Gap Analysis**: The Document Agent requires **9 major missing foundations** that do not exist in the current codebase:
1. Document library / managed document storage
2. Revision system for documents
3. Workspace grant system
4. Proposal/approval flow for edits
5. Canonical tool registry for document/workspace operations
6. Path policy for workspace containment
7. Document parsers/serializers for DOCX/PDF/HTML/CSV
8. Export via native save dialog
9. Audit/redaction for document operations

---

## 1. Repository Structure Overview

```
/Users/super_user/Projects/Venice_Forge
├── electron/                    # Electron main process
│   ├── main.ts                 # BrowserWindow, CSP, protocol handlers, single-instance lock
│   ├── preload.ts              # contextBridge exposing veniceForge API (typed IPC)
│   ├── ipc/
│   │   ├── handlers/           # Modular IPC handlers (Venice, API keys, Jina, files, system, sync, chat TTS, background tasks, config, RP, character cards)
│   │   ├── validation.ts       # Zod schemas + endpoint allowlist
│   │   └── configHandlers.ts   # Config-related IPC handlers
│   ├── services/
│   │   ├── chatStorage.ts      # Atomic JSON file writes to userData/chat-history/
│   │   ├── chatStorage.ts      # Conversation persistence (main process)
│   │   ├── guardPipeline.ts    # Local Family Safe Mode pipeline
│   │   ├── secureStore.ts      # safeStorage wrapper (DPAPI/Keychain)
│   │   ├── characterImageCache.ts
│   │   ├── backgroundTaskManager.ts
│   │   ├── conversationVault.ts
│   │   ├── syncFolderWatcher.ts
│   │   └── profileSession.ts
│   └── utils/
│       ├── urlSecurity.ts      # SSRF protection (isTrustedExternalUrl, isPrivateHostname)
│       └── secureFile.ts       # Safe file ops (no-follow fd, descriptor-stat, realpath)
├── src/
│   ├── services/
│   │   ├── veniceClient/       # Canonical Venice API client (veniceFetch, veniceStreamChat)
│   │   ├── veniceClient.ts     # Legacy client (renderer-side)
│   │   ├── desktopBridge.ts    # Transport abstraction (Electron IPC vs Express proxy)
│   │   ├── storageService.ts   # Encrypted IndexedDB (web mode)
│   │   ├── ingestion/          # Document ingestion: text, code, PDF, DOCX, image, Venice text parser
│   │   ├── memoryService.ts    # AI memory layer (2000-char injection budget)
│   │   ├── attachmentService.ts # File/URL/image attachments (256 KiB/file, 1 MiB total, 5 cap)
│   │   ├── diagnosticsService.ts
│   │   ├── backupExportService.ts
│   │   ├── backupImportService.ts
│   │   ├── backgroundTaskMediaCatalog.ts
│   │   ├── characterImageDiagnostics.ts
│   │   ├── profilePurge.ts
│   │   ├── replaceImportService.ts
│   │   ├── replaceImportPreparation.ts
│   │   ├── sceneCompiler.ts
│   │   ├── sceneReferencePlanner.ts
│   │   ├── sceneReferenceResolver.ts
│   │   ├── characterSceneGenerationService.ts
│   │   ├── rpPromptCompiler.ts
│   │   ├── rpTokenCounter.ts
│   │   ├── workflowCompiler.ts
│   │   ├── workflowRunner.ts
│   │   ├── storagePrivacyService.ts
│   │   ├── storageMaintenance.ts
│   │   ├── researchService.ts
│   │   ├── researchSummaries.ts
│   │   └── syncEngine.ts
│   ├── lib/
│   │   ├── venice-client.ts         # Legacy renderer client
│   │   ├── venice-client.dual.test.ts
│   │   ├── playground-agent.ts      # Legacy JSON-patch workflow agent
│   │   └── playground-agent-tools.ts # Canonical OpenAI-compatible tool schema (7 tools)
│   ├── stores/                   # Zustand 5 slice stores
│   │   ├── auth-store.ts
│   │   ├── chat-store.ts
│   │   ├── media-store.ts
│   │   ├── project-store.ts
│   │   ├── prompt-library-store.ts
│   │   ├── scene-composer-store.ts
│   │   ├── scenario-store.ts
│   │   ├── character-card-store.ts
│   │   ├── persona-store.ts
│   │   ├── lorebook-store.ts
│   │   ├── rp-chat-store.ts
│   │   ├── scene-asset-store.ts
│   │   ├── workflow-template-store.ts
│   │   ├── image-workspace-store.ts
│   │   ├── media-selection-store.ts
│   │   ├── media-bulk-actions.ts
│   │   ├── media-send-to.ts
│   │   ├── media-export-bundle.ts
│   │   ├── inspector-store.ts
│   │   ├── config-store.ts
│   │   ├── profile-store.ts
│   │   ├── status-store.ts
│   │   ├── storage-privacy-store.ts
│   │   ├── research-store.ts
│   │   ├── background-task-store.ts
│   │   ├── model-catalog-runtime-store.ts
│   │   ├── chat-stream-manager.ts
│   │   └── sync-engine.ts
│   ├── components/
│   │   ├── chat/                 # ChatView, ChatInput, MessageBubble, HistoryView, CharacterChatsView
│   │   ├── image/                # ImageView, ImageTools
│   │   ├── gallery/              # GalleryView, MediaInspector, CompareView, LineageViewer
│   │   ├── rp-studio/            # RpStudioView, CharacterEditor, PersonaManager, LorebookManager, RpChatList, RpChatView, SceneGenerator, AssetGallery, PromptDebugDrawer
│   │   ├── workflows/            # WorkflowsView, WorkflowTemplatesView
│   │   ├── prompts/              # PromptLibraryView
│   │   ├── scenes/               # SceneComposerView
│   │   ├── research/             # ResearchWorkspaceView, SearchScrapeView, AiResearchTab, SearchTab, ResearchProviderStatus
│   │   ├── layout/               # Header, Sidebar, AppLayout
│   │   ├── ui/                   # Primitives: Button, Dialog, Toast, etc.
│   │   ├── status/               # HeaderStatusCluster, StatusIndicator, DiagnosticsDrawer
│   │   └── privacy/              # StoragePrivacyDashboard
│   ├── config/
│   │   ├── tabs.ts               # Canonical tab registry (19 tabs)
│   │   ├── configSchema.ts
│   │   └── providerModels.ts
│   ├── types/
│   │   ├── project.ts            # Project, GenerationRecipe, RecipeCompatibilityReport
│   │   ├── rp.ts                 # CharacterCardV1, LorebookV1, PersonaV1, ScenarioV1, RpChatV1
│   │   ├── prompt-library.ts     # PromptLibraryItem, PromptVersion, PromptKind
│   │   ├── scene.ts              # SceneComposerItem, SceneVersion, SceneComponent
│   │   ├── workflow.ts           # WorkflowTemplateItem, WorkflowVersion, WorkflowStep
│   │   ├── research.ts           # ResearchSession, ResearchSource, ResearchFinding
│   │   ├── storage-privacy.ts    # StorageStoreInventoryItem, SafePrivacySummary
│   │   └── status.ts             # StatusSeverity, AppStatusItem, AppStatusSnapshot, SafeDiagnosticsSnapshot
│   ├── shared/
│   │   ├── validation.ts         # Venice endpoint allowlist (single source for IPC + proxy)
│   │   ├── safety/               # assessChildExploitationSafety, recordDecision, promptPayloadExtractor
│   │   ├── limits.ts             # Shared byte/timeout constants
│   │   ├── logger.ts             # Redacting logger
│   │   └── redaction.ts          # redactSecrets, sanitizeErrorText
│   ├── hooks/                    # Custom React hooks
│   ├── utils/
│   │   ├── payloadBuilders.ts    # buildChatPayload, buildImagePayload
│   │   ├── image.ts              # extractImages (normalizes Venice response shapes)
│   │   ├── characterImageResolver.ts
│   │   ├── download.ts
│   │   └── conversationDisplayTitle.ts
│   └── theme/                    # Token-based CSS variables + Tailwind v4 @theme
├── server.ts                     # Express proxy (/api/venice/*, /api/proxy-scrape)
├── scripts/
│   ├── verify-safety-guard.cjs
│   ├── verify-dist.cjs
│   ├── verify-markdown-links.cjs
│   ├── verify-venice-api-docs.cjs
│   ├── verify-no-native-dialogs.cjs
│   ├── verify-ci-contract.cjs
│   ├── verify-agent-docs.cjs
│   ├── verify-release-packaging-hardening.cjs
│   ├── verify-archive-clean.cjs
│   ├── verify-model-aware-recipes.cjs
│   ├── verify-media-studio-power-tools.cjs
│   ├── verify-status-diagnostics.cjs
│   ├── verify-prompt-library.cjs
│   ├── verify-scene-composer.cjs
│   ├── verify-rp-studio-polish.cjs
│   ├── verify-workflow-templates.cjs
│   ├── verify-storage-privacy.cjs
│   ├── verify-research-workspace.cjs
│   ├── verify-document-ingestion.cjs
│   ├── verify-browser-traffic-contained.cjs
│   ├── verify-repository-identity.cjs
│   ├── verify-roadmap-current.cjs
│   ├── verify-provider-adapters.cjs
│   ├── verify-inactive-feature-archive.cjs
│   ├── verify-character-card-v2.cjs
│   ├── verify-character-card-png.cjs
│   ├── verify-character-card-security.cjs
│   ├── create-cjs-package.cjs
│   ├── start-production.cjs
│   └── profile-media-studio.mjs
├── docs/
│   ├── summary_of_work.md        # Canonical session handoff ledger
│   ├── ROADMAP.md                # Canonical TODO roadmap
│   ├── DOCS_INDEX.md
│   ├── reference/
│   │   ├── Venice_swagger_api.yaml
│   │   └── Venice_api_LLM_info.md
│   └── development/
├── tests/
│   ├── safety/                   # Guard pipeline, hydration gate, inspector preview, Venice safe mode
│   ├── storage/                  # Character card, RP chat storage invariants
│   ├── csp/                      # Inline style invariant
│   ├── theme/                    # Inline color invariant
│   ├── electron/                 # Production startup invariant
│   ├── accessibility/
│   └── smoke/
├── package.json
├── tsconfig.json                 # Renderer (Vite, ESNext, noEmit, bundler resolution)
├── tsconfig.electron.json        # Electron main (tsc --project → CommonJS → dist-electron/)
└── AGENTS.md                     # This file (agent guide)
```

---

## 2. Existing Architecture Deep Dive

### 2.1 Dual-Transport Venice Client

**Canonical entry point**: `src/services/veniceClient.ts`
- `veniceFetch()` — REST calls with safety guard
- `veniceStreamChat()` — Streaming chat completions
- All HTTP calls route through this module; modules must NOT call `fetch('/api/venice/...')` directly or `window.veniceForge.*` directly

**Transport abstraction**: `src/services/desktopBridge.ts`
- `isElectron()` → selects transport
- **Electron**: renderer → `window.veniceForge` (contextBridge) → IPC → main process → `api.venice.ai` (key in `safeStorage`)
- **Web**: renderer → `fetch('/api/venice/...')` via Express proxy → `api.venice.ai` (key in `.env`)

### 2.2 IPC Surface (Preload Bridge)

**File**: `electron/preload.ts` → exposes `window.veniceForge`

**Key channels**:
```typescript
// Venice API
venice:request, venice:streamChat, venice:abort, venice:models

// Credentials & Profiles
credentials:save, credentials:load, credentials:delete, credentials:status
credentials:setProfile, credentials:getProfile, credentials:deleteProfile
credentials:listProfiles, credentials:setDefaultProfile, credentials:testProfile
credentials:jinaKey:save, credentials:jinaKey:load, credentials:jinaKey:delete
credentials:fallback:save, credentials:fallback:load, credentials:fallback:delete, credentials:fallback:list

// Chat & Conversations
chat:save, chat:load, chat:list, chat:delete, chat:listAll, chat:import, chat:export
chat:saveProfile, chat:loadProfile, chat:deleteProfile

// Character Cards / RP
characterCards:save, characterCards:load, characterCards:list, characterCards:delete, characterCards:import, characterCards:export
personas:save, personas:load, personas:list, personas:delete, personas:import, personas:export
lorebooks:save, lorebooks:load, lorebooks:list, lorebooks:delete, lorebooks:import, lorebooks:export
rpChats:save, rpChats:load, rpChats:list, rpChats:delete, rpChats:import, rpChats:export
rpAssets:save, rpAssets:load, rpAssets:list, rpAssets:delete
scenarios:save, scenarios:load, scenarios:list, scenarios:delete, scenarios:import, scenarios:export

// Sync & Background Tasks
sync:startSync, sync:stopSync, sync:status, sync:setupFolder, sync:applyRemoteMutation
backgroundTasks:create, backgroundTasks:list, backgroundTasks:cancel, backgroundTasks:retry, backgroundTasks:clear, backgroundTasks:snapshot, backgroundTasks:subscribe

// Config & Updates
config:load, config:save, config:import, config:export, config:reset
updates:check, updates:download, updates:install

// Files & Media
files:read, files:write, files:delete, files:list, files:dialog:open, files:dialog:save
media:save, media:load, media:list, media:delete

// Jina & TTS
jina:search, jina:scrape, jina:textParser
tts:queue, tts:retrieve, tts:speech, tts:transcriptions
```

### 2.3 IPC Validation & Endpoint Allowlist

**File**: `electron/ipc/validation.ts` + `src/shared/validation.ts` (single source)

**Allowed Venice endpoints** (enforced in both IPC + Express proxy):
```
GET  /models
POST /chat/completions
POST /image/generate
POST /image/upscale
POST /image/edit
POST /image/multi-edit
POST /augment/search
POST /augment/scrape
POST /augment/text-parser
POST /video/queue
POST /video/retrieve
POST /video/quote
POST /video/complete
POST /embeddings
POST /audio/queue
POST /audio/retrieve
POST /audio/speech
POST /audio/transcriptions
```

### 2.4 Security Architecture

| Layer | Mechanism |
|-------|-----------|
| **API Keys** | Electron: `safeStorage` (DPAPI Windows, Keychain macOS); Web: `.env` only; `VENICE_FORGE_ALLOW_PLAINTEXT_KEY_STORAGE=true` (Linux fallback, warns) |
| **Local Family Safe Mode** | Runtime snapshot in `electron/services/guardPipeline.ts`; every Venice-touching IPC routes through `performGuardedVeniceRequest` / `checkLocalFamilyGuard`; renderer-supplied flag ignored |
| **Venice API Safe Mode** | Separate provider parameter; `src/shared/veniceSafeMode.ts` — `applyVeniceApiSafeMode` / `endpointSupportsSafeMode` |
| **Endpoint Allowlist** | `src/shared/validation.ts` (renderer/IPC) + `electron/ipc/validation.ts` (main) — single source |
| **SSRF Protection** | `electron/utils/urlSecurity.ts` — `isTrustedExternalUrl()` (https-only, public IPs only; blocks RFC1918, loopback, IPv6 link-local, IPv4-mapped IPv6, short-form IPv4) |
| **CSP** | Set once globally on `session.defaultSession` in `electron/main.ts:183` (not per-window) |
| **Renderer Hardening** | `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true` |
| **External Links** | Route through `isTrustedExternalUrl()` |

### 2.5 Chat Persistence (Dual-Mode)

| Mode | Implementation |
|------|----------------|
| **Desktop (Electron)** | `electron/services/chatStorage.ts` — atomic JSON files under `userData/chat-history/` (temp + rename) |
| **Web** | `src/services/storageService.ts` — encrypted IndexedDB `conversations` store (AES-GCM) |
| **Migration** | Legacy flat `chats` auto-migrates on first load (additive only, never destructive) |
| **ID Validation** | `VALID_ID_RE = /^[a-zA-Z0-9_.-]{1,128}$/` enforced in main-process storage |

### 2.6 Document Ingestion (Existing)

**Location**: `src/services/ingestion/`

| Module | Capability |
|--------|------------|
| `textIngestion.ts` | Plain text, XML escaping, secret redaction |
| `codeIngestion.ts` | Source code with language detection |
| `pdfIngestion.ts` | PDF text extraction |
| `docxIngestion.ts` | DOCX parsing |
| `imageIngestion.ts` | Image analysis (when vision model selected) |
| `veniceTextParserIngestion.ts` | Venice `/augment/text-parser` endpoint |
| `attachmentAssembler.ts` | Combines multiple attachments |
| `fileClassifier.ts` | MIME/extension classification |

**Security**: All ingestion paths apply `escapeXmlAttribute` (filenames) + `escapeXmlText` (body) + `redactSecrets()` before XML wrapping.

**Attachment limits**: 256 KiB/file, 1 MiB total, 5 attachments max, 1024px image downscale.

### 2.7 Storage Layer (IndexedDB)

**File**: `src/services/storageService.ts`

**Encrypted stores** (`ENCRYPTED_STORES`): `chats`, `images`, `conversations`, `ai_memory`, `files`, `character_cards`, `personas`, `lorebooks`, `rp_chats`, `rp_assets`, `projects`, `promptLibrary`, `scenes`, `rpScenarios`, `workflowTemplates`, `researchSessions`, `visualWorkflows`, `playground`, `tombstones`

**Encryption**: AES-GCM per-profile keys derived from profile password via PBKDF2.

### 2.8 Tool-Calling Agent (Visual Workflows)

**File**: `src/lib/playground-agent-tools.ts`

**OpenAI-compatible tool schema** (7 tools):
```typescript
type ToolName = 'clear' | 'add_node' | 'connect' | 'set_params' | 'remove_node' | 'pick_model' | 'ask_user' | 'done'
```

**Legacy**: `src/lib/playground-agent.ts` uses JSON patches (deprecated).

**Model capability**: `function_calling_default` trait from `/models` catalog.

### 2.9 Canonical Tab Registry

**File**: `src/config/tabs.ts`

**19 canonical tabs** (with keyboard shortcuts 1-9, 0, -, =, [, ], \, ;, ', `):
1. `chat` — Standard Chat
2. `character-chats` — Character Chats
3. `playground` — Playground
4. `image` — Image Studio
5. `media` — Media Studio (legacy `gallery` alias)
6. `audio` — Audio Studio
7. `music` — Music Studio
8. `video` — Video Studio
9. `embeddings` — Embeddings
10. `workflows` — Workflow Templates
11. `prompts` — Prompt Library
12. `scenes` — Scene Composer
13. `search` — Research Workspace
14. `rp-studio` — RP Studio
15. `characters` — Character Library
16. `personas` — Persona Manager
17. `lorebooks` — Lorebook Manager
18. `settings` — Settings
19. `privacy` — Storage & Privacy

**Legacy aliases** (deprecated, back-compat only): `gallery` → `media`

### 2.10 Model Capabilities Registry

**File**: `src/config/image-model-capabilities.ts`

**Capabilities per image model**: `supportsDimensions`, `supportsAspectRatio`, `supportsNegativePrompt`, `supportsStylePreset`, `supportsSteps`, `supportsCfgScale`, `supportsSeed`, `supportsReferenceImages`, `maxDimensions`

**Integration**: Image Studio hides unsupported controls; Media Inspector shows `RecipeCompatibilityCard`; `buildImagePayload` drops unsupported fields at network boundary.

---

## 3. Missing Foundations for Document Agent

The following **9 foundations do not exist** and must be built from scratch:

### 3.1 Document Library / Managed Document Storage
- No `documents` store in `STORE_NAMES` / `ENCRYPTED_STORES`
- No document metadata schema (title, mime-type, workspace, project, tags, version chain)
- No document CRUD IPC channels
- No document listing/filtering UI

### 3.2 Revision System for Documents
- No append-only version chain for documents (cf. `PromptVersion`, `SceneVersion`, `WorkflowVersion`)
- No diff/compare for document versions
- No restore/rollback UI

### 3.3 Workspace Grant System
- No workspace concept distinct from `Project`
- No grant/permission model (read/write/admin per workspace per profile)
- No workspace-scoped document isolation

### 3.4 Proposal/Approval Flow for Edits
- No proposal object type
- No review/approve/reject workflow
- No merge conflict detection for concurrent proposals

### 3.5 Canonical Tool Registry for Document/Workspace Ops
- No tool registry analogous to `playground-agent-tools.ts`
- No tool schema for: `create_document`, `read_document`, `update_document`, `propose_edit`, `approve_proposal`, `list_workspace`, `grant_access`, `revoke_access`, `export_document`
- No agent integration for document operations

### 3.6 Path Policy for Workspace Containment
- No path allowlist/denylist for document operations
- No workspace root enforcement (prevent directory traversal)
- No symlink resolution policy

### 3.7 Document Parsers/Serializers
| Format | Parser | Serializer |
|--------|--------|------------|
| DOCX | ❌ (ingestion only) | ❌ |
| PDF | ❌ (ingestion only) | ❌ |
| HTML | ❌ | ❌ |
| Markdown | ❌ | ❌ |
| CSV | ❌ | ❌ |
| JSON | ❌ | ❌ |

*Existing ingestion only extracts text for chat context — does not preserve structure for round-trip editing.*

### 3.8 Export via Native Save Dialog
- No `files:dialog:save` IPC channel (only `files:dialog:open`, `files:read`, `files:write`, `files:delete`, `files:list`)
- No Electron `dialog.showSaveDialog` integration for documents
- No streaming write for large documents

### 3.9 Audit/Redaction for Document Operations
- No audit log for document CRUD/propose/approve
- No secret redaction on document export (cf. `redactSecrets` used in ingestion only)
- No PII detection for documents

---

## 4. Integration Points with Existing Systems

### 4.1 Stores to Extend
| Store | Extension Needed |
|-------|------------------|
| `STORE_NAMES` / `ENCRYPTED_STORES` (src/constants/venice.ts) | Add `documents`, `documentRevisions`, `workspaces`, `workspaceGrants`, `documentProposals`, `documentAuditLog` |
| `dbMigrations` (src/services/storageService.ts) | Add migrations for new stores (toVersion 13+) |

### 4.2 IPC Channels to Add
| Channel | Purpose |
|---------|---------|
| `documents:create`, `documents:read`, `documents:update`, `documents:delete`, `documents:list` | Document CRUD |
| `documents:revisions:list`, `documents:revisions:read`, `documents:revisions:restore` | Revision history |
| `workspaces:create`, `workspaces:list`, `workspaces:grant`, `workspaces:revoke` | Workspace management |
| `proposals:create`, `proposals:list`, `proposals:approve`, `proposals:reject` | Proposal workflow |
| `documents:export`, `documents:import` | Native export/import |
| `audit:document:read` | Audit log access |

### 4.3 Preload Bridge Extensions
Add to `electron/preload.ts` `veniceForge` surface:
```typescript
documents: { create, read, update, delete, list, revisions: { list, read, restore }, export, import },
workspaces: { create, list, grant, revoke },
proposals: { create, list, approve, reject },
audit: { document: { read } }
```

### 4.4 Validation Schemas
Extend `electron/ipc/validation.ts` + `src/shared/validation.ts` with Zod schemas for all new channels.

### 4.5 Tab Registry
Add `documents` tab to `src/config/tabs.ts` (next available shortcut).

### 4.6 Diagnostics
Extend `src/types/status.ts` `AppStatusSnapshot` + `SafeDiagnosticsSnapshot` with document/workspace health.

### 4.7 Command Palette
Add "Documents" section to `src/components/command-palette/CommandPalette.tsx` (register via `media-command-handlers.ts` pattern).

---

## 5. Security Requirements for Document Agent

| Requirement | Implementation |
|-------------|----------------|
| **API keys never in renderer** | All document ops via IPC → main process; keys in `safeStorage` |
| **Path containment** | `electron/utils/secureFile.ts` pattern: `open` with `O_NOFOLLOW`, `fstat`, `realpath` check against workspace root |
| **Secret redaction on export** | Reuse `src/shared/redaction.ts` `redactSecrets()` / `sanitizeErrorText()` |
| **Audit logging** | Append-only JSONL in `userData/document-audit/` (atomic write like `chatStorage.ts`) |
| **Profile isolation** | Document stores encrypted per-profile (like existing `ENCRYPTED_STORES`) |
| **SSRF for document import** | Reuse `isTrustedExternalUrl()` for any URL-based import |
| **CSP compliance** | No inline styles/scripts in document editor components |

---

## 6. Recommended Implementation Sequence

### Phase 1: Core Storage & IPC (Week 1-2)
1. Add stores to `STORE_NAMES` / `ENCRYPTED_STORES` + migration
2. Define TypeScript types (`src/types/document.ts`, `src/types/workspace.ts`, `src/types/proposal.ts`)
3. Implement main-process document storage (`electron/services/documentStorage.ts`) with atomic writes
4. Add IPC handlers (`electron/ipc/handlers/documentHandlers.ts`) + validation
5. Extend preload bridge

### Phase 2: Revision System (Week 2)
1. Append-only revision chain (model after `PromptVersion` / `SceneVersion`)
2. Diff algorithm for text-based formats
3. Revision list/read/restore IPC + UI

### Phase 3: Workspace & Grants (Week 3)
1. Workspace CRUD + grant model (read/write/admin per profile)
2. Workspace-scoped document queries
3. Profile-switching isolation

### Phase 4: Proposal/Approval Flow (Week 3-4)
1. Proposal object + state machine (draft → review → approved/rejected → merged)
2. Conflict detection (concurrent proposals on same document)
3. Review UI in document detail view

### Phase 5: Tool Registry & Agent Integration (Week 4)
1. `src/lib/document-agent-tools.ts` (OpenAI-compatible schema)
2. Register tools with model capability check (`function_calling_default`)
3. Agent loop integration (reusing `playground-agent-tools.ts` patterns)

### Phase 6: Parsers/Serializers (Week 4-5)
1. `docxSerializer.ts` using `docx` npm package
2. `pdfSerializer.ts` using `pdf-lib` or similar
3. `htmlSerializer.ts`, `markdownSerializer.ts`, `csvSerializer.ts`
4. Parser counterparts for import
5. Round-trip test suite

### Phase 7: Native Export & Path Policy (Week 5)
1. `files:dialog:save` IPC + `dialog.showSaveDialog` in main
2. Streaming write for large documents
3. Path policy module (`electron/utils/pathPolicy.ts`) — workspace root allowlist, symlink resolution, traversal prevention

### Phase 8: Audit & Redaction (Week 5-6)
1. Audit log writer (append-only, atomic)
2. Export-time secret redaction pipeline
3. PII detection (optional, regex-based)
4. Diagnostics integration

### Phase 9: UI & Polish (Week 6)
1. Document Library tab (list, filter, search, create)
2. Document Editor (TipTap or Monaco based on format)
3. Revision sidebar
4. Proposal review panel
5. Workspace settings
6. Command Palette integration
7. Theme integration (Tailwind v4 tokens)

---

## 7. Validation & Testing Requirements

### 7.1 New Verification Scripts
Add to `scripts/` and wire into `verify:contracts`:
- `verify-document-storage.cjs`
- `verify-document-revisions.cjs`
- `verify-workspace-grants.cjs`
- `verify-proposal-workflow.cjs`
- `verify-document-tool-registry.cjs`
- `verify-path-policy.cjs`
- `verify-document-parsers.cjs`
- `verify-native-export.cjs`
- `verify-document-audit.cjs`

### 7.2 Test Coverage Targets
| Area | Target |
|------|--------|
| Document CRUD | 90%+ |
| Revision diff/restore | 85%+ |
| Workspace grants | 90%+ |
| Proposal state machine | 95%+ |
| Tool registry schema | 100% |
| Path policy enforcement | 100% (security) |
| Parser/serializer round-trip | 85%+ |
| Export dialog | 80%+ (integration) |
| Audit log integrity | 95%+ |
| Secret redaction | 100% (security) |

### 7.3 Regression Guards (New VERIFY-NNN)
| ID | Protected Surface |
|----|-------------------|
| VERIFY-145 | Document atomic write + revision append |
| VERIFY-146 | Workspace grant enforcement (no cross-workspace leaks) |
| VERIFY-147 | Proposal approval requires explicit reviewer action |
| VERIFY-148 | Tool registry schema matches OpenAI function-calling spec |
| VERIFY-149 | Path policy blocks traversal outside workspace root |
| VERIFY-150 | DOCX/PDF/HTML/MD/CSV round-trip preserves structure |
| VERIFY-151 | Native save dialog returns valid handle, streams write |
| VERIFY-152 | Audit log append-only, tamper-evident |
| VERIFY-153 | Export redaction removes all secret patterns |

---

## 8. Effort Estimation

| Phase | Effort (dev-days) | Risk |
|-------|-------------------|------|
| 1: Core Storage & IPC | 8 | Low (follows existing patterns) |
| 2: Revision System | 5 | Medium (diff algorithm) |
| 3: Workspace & Grants | 6 | Medium (profile isolation) |
| 4: Proposal Flow | 8 | High (state machine + conflicts) |
| 5: Tool Registry & Agent | 6 | Medium (model capability gating) |
| 6: Parsers/Serializers | 10 | High (format fidelity) |
| 7: Native Export & Path Policy | 6 | Medium (security-critical) |
| 8: Audit & Redaction | 5 | Medium |
| 9: UI & Polish | 10 | Low (follows existing UI patterns) |
| **Total** | **~64 dev-days** | |

---

## 9. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| DOCX/PDF round-trip fidelity loss | High | High | Use battle-tested libraries (`docx`, `pdf-lib`); extensive fixture tests |
| Proposal conflict resolution complexity | Medium | High | Start with simple last-writer-wins + manual merge; iterate |
| Path policy bypass via symlinks | Low | Critical | Reuse `secureFile.ts` pattern (O_NOFOLLOW + fstat + realpath) |
| Profile isolation leakage | Low | Critical | Mirror existing `ENCRYPTED_STORES` per-profile key derivation |
| Agent tool hallucination | Medium | Medium | Strict schema validation; require `function_calling_default` trait |
| Performance on large documents | Medium | Medium | Streaming read/write; virtualized editor; pagination |

---

## 10. Appendix: Key File References

| Area | Files |
|------|-------|
| **Main Process** | `electron/main.ts`, `electron/preload.ts` |
| **IPC Handlers** | `electron/ipc/handlers/*.ts`, `electron/ipc/validation.ts` |
| **Venice Client** | `src/services/veniceClient.ts`, `src/services/desktopBridge.ts` |
| **Storage** | `src/services/storageService.ts`, `src/constants/venice.ts` (STORE_NAMES) |
| **Chat Persistence** | `electron/services/chatStorage.ts` (main), `src/services/storageService.ts` (renderer) |
| **Ingestion** | `src/services/ingestion/*.ts` |
| **Security** | `electron/services/guardPipeline.ts`, `electron/utils/urlSecurity.ts`, `electron/utils/secureFile.ts`, `src/shared/validation.ts`, `src/shared/redaction.ts` |
| **Tool Calling** | `src/lib/playground-agent-tools.ts` |
| **Tab Registry** | `src/config/tabs.ts` |
| **Model Capabilities** | `src/config/image-model-capabilities.ts` |
| **Types** | `src/types/*.ts` |
| **Stores** | `src/stores/*.ts` |
| **UI Components** | `src/components/*/` |
| **Verification Scripts** | `scripts/verify-*.cjs` |
| **Tests** | `tests/`, `src/**/*.test.ts`, `src/**/*.test.tsx` |
| **Documentation** | `docs/summary_of_work.md`, `docs/ROADMAP.md`, `AGENTS.md` |

---

## 11. Next Steps

1. **Review this discovery report** with stakeholders
2. **Prioritize phases** based on product requirements
3. **Create detailed specs** for Phase 1 (types, IPC, storage)
4. **Set up feature branch** `feature/document-agent-foundation`
5. **Begin Phase 1 implementation** following existing patterns
6. **Add verification scripts** to `verify:contracts` as each phase completes
7. **Update `docs/ROADMAP.md`** and `docs/summary_of_work.md` per session

---

## 12. Canonical Requirements Mapping (Phase 0 Deliverable)

This section maps each requirement from `Function_calling_todo.md` to the existing codebase. Each row identifies whether the behavior is **Already Met**, **Partially Met** (foundation exists, needs extension), or **Missing** (must be built).

### 12.1 Architectural Boundary

| Requirement | Status | Evidence |
|---|---|---|
| React renderer cannot use Node filesystem APIs | **Already Met** | `electron/main.ts` enforces `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`. Renderer is a Vite bundle that only sees the `window.veniceForge` contextBridge surface. |
| Renderer sees only narrow contextBridge bridge | **Already Met** | `electron/preload.ts:1` exposes a frozen `veniceForge` object via `contextBridge.exposeInMainWorld()`. No `ipcRenderer` access leaks. |
| Electron main is the security boundary | **Already Met** | IPC handlers in `electron/ipc/handlers/` re-validate every argument via `electron/ipc/validation.ts` and Zod. |
| Isolated parser boundary via `utilityProcess`/worker | **Missing** | No `utilityProcess` or Worker usage exists for document parsing. `src/services/ingestion/*` runs in the main process or renderer; a future isolation pattern is needed for DOCX/PDF parsing to prevent parser crashes from killing the app. |
| Renderer cannot receive absolute paths | **Partially Met** | `electron/services/chatStorage.ts` writes to `userData/chat-history/`; renderer only sees opaque IDs. New document/workspace APIs must follow the same opaqueness rule. |

### 12.2 Canonical Tool Naming

| Requirement | Status | Evidence |
|---|---|---|
| Internal dot-separated tool identifier | **Missing** | `src/lib/playground-agent-tools.ts` uses inline function names (`'clear'`, `'add_node'`, etc.) without an internal/provider mapping. A new `src/agent/registry/tool-name-map.ts` must introduce the mapping per `Function_calling_todo.md` lines 285–332. |
| Provider-safe underscore name | **Missing** | Same as above. |
| Registry validates uniqueness at startup | **Missing** | No central registry exists. |
| Single source for name translation | **Missing** | Chat (`chat-view.tsx`), Workflows (`workflows-view.tsx`), and synthetic playground agent each construct their own tools. |

### 12.3 Capability Grants (5 Presets)

| Requirement | Status | Evidence |
|---|---|---|
| `AgentPermissionPreset` union: `off | read_attachments | limited_documents | workspace_with_approval | workspace_autonomous` | **Missing** | No equivalent type exists. Closest concept is `localFamilySafeModeEnabled` in `electron/services/guardPipeline.ts`, which is a single boolean, not a 5-state preset. |
| `Capability` union (15 capabilities) | **Missing** | No finer-grained capability model exists for any agent surface. |
| `CapabilityGrant` per-session type | **Missing** | No grant/permission primitive exists. |
| `WorkspaceGrant` with root + limits | **Missing** | No workspace grant primitive exists. |
| Renderer does not see `rootPath` | **Missing** | No grant system to gate. |

### 12.4 Tool Schemas — Limited Document Tools

Each tool listed below must be implemented per `Function_calling_todo.md` lines 792–1121:

| Tool | Status | Target Location |
|---|---|---|
| `document.get` (read, bounded pagination) | **Missing** | `src/agent/contracts/tool-registry.ts`; backed by `electron/agent/documents/managed-document-service.ts` |
| `document.proposeEdits` (never writes) | **Missing** | Schema in `src/agent/contracts/document-edit-schemas.ts`; handler dispatches to `<Application-Internal>` `document.applyApprovedEdits`. |
| `document.create` (overwrite: false) | **Missing** | `electron/agent/documents/managed-document-service.ts` |
| `document.export` (native save dialog) | **Missing** | `electron/agent/documents/document-export-service.ts`; calls Electron `dialog.showSaveDialog`. |
| `document.getRevision` (immutable read) | **Missing** | `electron/agent/documents/revision-service.ts` |
| `document.restoreRevision` (creates new revision) | **Missing** | Same as above. |

### 12.5 Tool Schemas — Workspace Tools

| Tool | Status | Target Location |
|---|---|---|
| `workspace.list` (bounded, paginated, depth-limited) | **Missing** | `electron/agent/workspace/workspace-filesystem-service.ts` |
| `workspace.read` (text/blocks/metadata, 3 modes) | **Missing** | Same. |
| `workspace.search` (extension allowlist, byte cap, no shell) | **Missing** | `electron/agent/workspace/workspace-search-service.ts` (must be pure-JS — no `grep`/`rg` subprocess). |
| `workspace.proposeChangeset` (multi-file staged) | **Missing** | `electron/agent/workspace/changeset-service.ts` |
| `workspace.createFile` / `workspace.createDirectory` | **Missing** | `workspace-filesystem-service.ts` |
| `workspace.move` / `workspace.trash` (separate proposal types) | **Missing** | `workspace-filesystem-service.ts` (Trash uses Electron `shell.trashItem`). |

### 12.6 Application-Internal Operations (NEVER exposed as model tools)

| Operation | Status | Evidence |
|---|---|---|
| `document.applyApprovedEdits` | **Missing** | Renderer must not be told to invoke this. Called from `approval-coordinator.ts` after user approves `document.proposeEdits`. |
| `workspace.applyApprovedChangeset` | **Missing** | Same. |
| `approval.issueToken` / `approval.consumeToken` | **Missing** | New approval-coordinator must enforce one-time consumption. |
| `revision.commit` / `revision.rollback` | **Missing** | `electron/agent/documents/revision-service.ts` (revision-as-cursor, restore-as-new-revision, no silent pointer rewinds). |
| `audit.record` | **Missing** | `electron/agent/audit/document-agent-audit-service.ts` must redact bodies, paths, secrets. |

### 12.7 Managed Document Model

| Requirement | Status | Evidence |
|---|---|---|
| `DocumentFormat` union (7 formats) | **Missing** | No `DocumentFormat` type exists. Closest is `MIME_TYPES` in identifier helpers but no semantic parser/serializer contracts. |
| `ManagedDocument` shape | **Missing** | No managed document entity exists. Media Studio has `MediaItem` but documents are different. |
| `DocumentBlock` discriminated union (8 kinds) | **Missing** | No block model. |
| `DocumentRevision` with `parentRevisionId`, `createdBy`, `contentHash`, `blocks`, `warnings` | **Missing** | No revision chains. Existing pattern from `PromptLibraryItem`/`SceneVersion`/`WorkflowVersion` (append-only with `parentRevisionId`) should be reused. |
| Original source blob retained | **Partially Met** | Media Studio stores source blobs via content-addressed storage (`sha256/ab/abc…`). The same pattern should be extended for documents. |
| Restore = create new revision (not pointer rewind) | **Missing** | No restore primitive existing. |

### 12.8 Stable Block Identity

| Requirement | Status | Evidence |
|---|---|---|
| Block IDs assigned at parse time, preserved across edits | **Missing** | No block-level identity in any document code path. |
| `BlockSnapshot` for stale detection | **Missing** | No block-level hash. |
| Stale proposal rejection (`STALE_REVISION`, `CONFLICT`) | **Missing** | No conflict-rejection path. |

### 12.9 Canonical Edit Operations

| Operation | Status |
|---|---|
| `replace_block` | **Missing** |
| `replace_text` (with `expectedTextHash` + `occurrence`) | **Missing** |
| `insert_before` / `insert_after` | **Missing** |
| `delete_block` | **Missing** |
| `move_block` (with `position: before | after`) | **Missing** |

These should live in `src/agent/contracts/document-edit-schemas.ts` (Zod) and the patch engine in `electron/agent/documents/document-patch-engine.ts`.

### 12.10 Approval Integrity

| Requirement | Status | Evidence |
|---|---|---|
| `PendingApproval` with `proposalHash` and `consumedAt` | **Missing** | No approval primitive. |
| Proposal hash covers canonical tool ID, args, base revisions, hashes, paths, summary | **Missing** | No proposal primitive. |
| One-time consumption (cannot replay) | **Missing** | No consumption primitive. |
| Approval revalidates grant + base revision + hashes + limits | **Missing** | No revalidation primitive. |
| Renderer only sees `publicView` + approval ID + hash | **Missing** | New document-agent IPC must enforce this contrast to existing chat history IPC. |

### 12.11 Filesystem Safety

| Requirement | Status | Evidence |
|---|---|---|
| Reject absolute paths | **Partially Met** | `electron/utils/secureFile.ts` exists with `O_NOFOLLOW` + fstat + realpath. Path policy module needs explicit `assertRelativeWorkspacePath()` helper. |
| Reject null bytes | **Missing** | No null-byte check. |
| Reject parent traversal | **Partially Met** | `secureFile.ts` resolves through realpath; explicit `..` segment check needed. |
| Reject UNC / device / URI schemes | **Missing** | No explicit rejector. |
| Symlink escape rejection | **Partially Met** | `secureFile.ts` uses `O_NOFOLLOW` and `realpath` verification. |
| Component-aware containment (not `startsWith`) | **Missing** | New `isPathInside()` helper using `path.relative()` is needed. |
| Case-insensitive filesystem handling | **Missing** | Windows handling not explicitly considered. |

### 12.12 Atomic Write Strategy

| Requirement | Status | Evidence |
|---|---|---|
| Temp-file + atomic rename pattern | **Already Met** | `electron/services/chatStorage.ts` uses temp + rename; `electron/services/secureStore.ts` uses the same pattern. Must be reused for documents. |
| Hash-check after write | **Missing** | No post-write hash verification on documents. Generated media pipeline in `electron/services/backgroundTaskManager.ts` validates `ftyp` after streaming — same pattern applicable. |
| Flush containing directory | **Missing** | Limited fsync support on macOS/Windows; explicit pattern needed. |
| Multi-file changeset rollback on partial failure | **Missing** | No operation-journal pattern; sync folder watcher has `journalCompaction` mechanics (closest existing analog) that should be redesigned for changeset rollback semantics. |

### 12.13 Document Parsing Safety

| Requirement | Status | Evidence |
|---|---|---|
| Bounded source/decompressed/archive entry/image counts | **Partially Met** | `src/services/ingestion/` enforces byte caps (`256 KiB/file, 1 MiB total, 5 attachments`). Needs consolidated `documentAgentLimits`. |
| Parse timeout + cancellation | **Partially Met** | Ingestion uses `AbortSignal` forwarding; no parse-specific timeout. |
| DOCX: ZIP bomb / traversal / macros / external rels | **Missing** | `docxIngestion.ts` only extracts text; `docx` package is already a dependency for round-trip, but security hardening needed. |
| PDF: safe redaction pipeline | **Missing** | PDF.js is in the dependency tree. Redaction must remove underlying content, not draw black rectangles. |
| HTML: sanitize active content | **Missing** | No HTML document code path; preview must be sandboxed. |

### 12.14 Serialization

| Requirement | Status | Evidence |
|---|---|---|
| TXT/MD serialization | **Missing** | No document serializers for any format. |
| JSON structural validation | **Partially Met** | Ingestion does not validate JSON. |
| CSV formula-injection protection (escape `=`, `+`, `-`, `@`) | **Missing** | No CSV write path. |
| HTML sanitization for export | **Missing** | No HTML output path. |
| DOCX/PDF serialization (no model-generated bytes) | **Missing** | Critical: model never produces binary; application serializes. |

### 12.15 Export Flow

| Requirement | Status | Evidence |
|---|---|---|
| Native save dialog | **Partially Met** | `files:dialog:open` exists in preload bridge but no `files:dialog:save` for documents. Media Studio has `app:media:save-generated` for native save (line in `electron/ipc/handlers/`) — reusable pattern. |
| User mediation (model does not choose destination) | **Missing** | New flow required; no destination in model argument. |
| Atomic external write | **Missing** | Need new service. |
| Redacted result (no absolute path back to model) | **Missing** | New wrapper. |
| Cancellation handling | **Missing** | No document cancel path. |

### 12.16 Workspace Grants and Selection

| Requirement | Status | Evidence |
|---|---|---|
| Native directory picker | **Missing** | No `dialog.showOpenDialog` for directory selection in document agent context. |
| Grant root canonicalization (`realpath`) | **Missing** | No grant system. |
| Revocation behavior | **Missing** | No revocation pattern. |
| Session-only grants expire on restart | **Missing** | No grant persistence strategy for chat sessions. (Settings persistence exists for user-selected paths, but no session-grant lifecycle.) |

### 12.17 Model Capability Detection

| Requirement | Status | Evidence |
|---|---|---|
| Authoritative capability source (`/models` endpoint) | **Already Met** | `src/stores/model-catalog-runtime-store.ts` + `useModels()` fetch live catalog. |
| `function_calling_default` trait detection | **Already Met** | Model catalog exposes this. |
| Cache with bounded TTL | **Already Met** | Runtime store caches with provenance + timestamps. |
| Disable executing tools when support unknown | **Missing** | No policy gate on tool exposure based on capability. |
| Non-executing structured proposal mode for unsupported models | **Missing** | New fallback mode required. |
| Capability source preserved in diagnostics | **Partial** | `SafeDiagnosticsSnapshot` records source but not directly tied to chat-agent surface yet. |

### 12.18 Concurrency Control

| Requirement | Status | Evidence |
|---|---|---|
| Per-resource locks in main | **Partially Met** | `BackgroundTaskManager` uses ipc subscription patterns but no document-level lock. |
| Bounded retry on stale | **Missing** | No stale-revision retry path. |

### 12.19 Search and Context Limits

| Requirement | Status | Evidence |
|---|---|---|
| Tool iteration cap | **Missing** | No agent loop exists; chat-stream-manager is not an agent loop. |
| Pagination cursors | **Missing** | Sync engine uses cursors; documents do not. |
| Truncation must be stated | **Missing** | Ingestion already redacts but does not state truncation to model. |

### 12.20 Library Structure

| Requirement | Status | Evidence |
|---|---|---|
| `appData/documents/` with metadata/revisions/sources/exports/blobs/backups/grants/pending-approvals/operation-journal/audit | **Missing** | Existing pattern in `electron/services/chatStorage.ts` (atomic JSON files under `userData/chat-history/`) is the closest reference. |
| Content-addressed blob store | **Already Met** | `electron/services/characterImageCache.ts` and Media Studio use `sha256/ab/abc…`-style layout. |

### 12.21 Integration with Chat / Workflows / Projects

| Requirement | Status | Evidence |
|---|---|---|
| Chat resolves model tool support before enabling | **Missing** | No agent tool activation in chat. |
| Chat includes only authorized schemas | **Missing** | No filter. |
| Workflows use same registry/policy/validator | **Missing** | Each workflow exercise builds its own isolation. |
| Projects own app-managed documents | **Missing** | `src/stores/project-store.ts` exists but no document binding. |

### 12.22 Audit and Redaction

| Requirement | Status | Evidence |
|---|---|---|
| `DocumentAgentAuditEvent` shape (no bodies, no paths, no secrets) | **Missing** | New audit service. |
| `redactSecrets`, `isPromptSecretLike` re-usage | **Already Met** | `src/shared/redaction.ts` already implements these for ingestion. |

### 12.23 Restart-Safe Pending Approvals

| Requirement | Status | Evidence |
|---|---|---|
| Persisted pending approval list | **Missing** | No persistence of pending approvals. |
| Revalidate after restart | **Missing** | No policy. |
| No silent resumption | **Missing** | No guard. |

---

## 13. Acceptance Criteria Status Snapshot

The canonical spec defines 60 acceptance criteria organized in three groups. The codebase status is:

| Criterion Group | Already Met | Partially Met | Missing | Total |
|---|---|---|---|---|
| Limited Documents (1–20) | 1 | 4 | 15 | 20 |
| Workspace Access (21–40) | 0 | 1 | 19 | 20 |
| Security and Reliability (41–60) | 4 | 5 | 11 | 20 |
| **Total** | **5** | **10** | **45** | **60** |

**Reading:** 8% of criteria are already satisfied by existing architecture; 17% have foundations that can be extended; 75% must be built. The 5 already-met criteria are: chat history atomic writes, `endpoint.allowlist` enforcement, model catalog live capabilities, content-addressed blob store, `secret redaction` helpers, and `safeStorage`-based credential isolation.

---

## 14. Proposed Module Layout

The canonical spec recommends this layout, which **aligns with the conventions discovered in this Phase 0 report** (renderer under `src/`, main under `electron/`, preload as a single frozen bridge):

```text
src/agent/
├─ contracts/
│  ├─ capabilities.ts          # AgentPermissionPreset, Capability, CapabilityGrant, WorkspaceGrant
│  ├─ tool-results.ts          # ToolResult<T>, ToolWarning, ToolError
│  ├─ proposals.ts             # PendingApproval, WorkspaceChangeProposal, WorkspaceChange
│  ├─ documents.ts             # DocumentFormat, ManagedDocument, DocumentRevision, DocumentBlock
│  ├─ document-edits.ts        # DocumentEditOperation discriminated union + Zod schemas
│  └─ limits.ts                # documentAgentLimits constants
├─ registry/
│  ├─ tool-name-map.ts         # Canonical internal → provider function name mapping
│  └─ tool-registry.ts         # RegisteredTool<TArgs,TResult>, ToolRegistry class
├─ model-capabilities/
│  └─ model-capability-service.ts
└─ renderer/
   ├─ AgentAccessControl.tsx
   ├─ ApprovalCard.tsx
   ├─ DocumentDiffView.tsx
   └─ WorkspaceChangesetView.tsx

electron/agent/
├─ orchestrator/agent-orchestrator.ts       # runAgentTurn loop
├─ policy/
│  ├─ capability-policy-engine.ts           # PolicyInput → PolicyDecision
│  └─ workspace-grant-service.ts
├─ approvals/
│  ├─ approval-coordinator.ts               # bind → persist → revalidate → consume
│  └─ pending-approval-store.ts
├─ tools/
│  ├─ document-tools.ts                     # 6 limited tools
│  └─ workspace-tools.ts                    # 8 workspace tools
├─ documents/
│  ├─ managed-document-service.ts
│  ├─ document-parser-service.ts            # can run in utilityProcess for isolation
│  ├─ document-serializer-service.ts
│  ├─ document-patch-engine.ts
│  └─ revision-service.ts
├─ workspace/
│  ├─ workspace-filesystem-service.ts
│  ├─ workspace-search-service.ts
│  ├─ path-policy.ts
│  └─ operation-journal.ts
├─ audit/
│  ├─ document-agent-audit-service.ts
│  └─ document-agent-redactor.ts
└─ ipc/document-agent-ipc.ts

electron/preload.ts →
   add veniceForgeDocumentAgent (Object.freeze, narrow API)
```

These paths are **proposed** — Phase 1 should verify them against the project's actual conventions before committing to a tree layout.

---

## 15. Implementation Sequence Reference

Phase 1–11 from `Function_calling_todo.md` map cleanly to the existing patterns and the proposed module layout:

| Phase | Build On | New Modules |
|---|---|---|
| 1 Canonical Contracts | Existing Zod + IPC validation patterns | `src/agent/contracts/*`, `src/agent/registry/*` |
| 2 Managed Document Foundation | Append-only revisions from Prompt/Scene/Workflow stores | `electron/agent/documents/{managed-document,revision}-service.ts` |
| 3 Read-Only Limited Tools | Existing `attachmentService.ts` + storageService | `electron/agent/tools/document-tools.ts` subset |
| 4 Proposal and Approval System | Existing chat history persistence patterns | `electron/agent/approvals/*` + UI components |
| 5 Creation and Serialization | `src/services/ingestion/*` reading-side | `electron/agent/documents/document-serializer-service.ts` |
| 6 Export | `electron/services/backgroundTaskManager.ts` save-generated pattern | `electron/agent/documents/document-export-service.ts` |
| 7 Workspace Grants and Read Ops | `electron/utils/secureFile.ts` | `electron/agent/workspace/{workspace-filesystem-service,path-policy}.ts` |
| 8 Workspace Changesets | `electron/services/syncFolderWatcher.ts` journal | `electron/agent/workspace/{changeset,operation-journal}.ts` |
| 9 Move and Trash | `shell.trashItem` API | Same. |
| 10 Workflow and Project Integration | `src/lib/playground-agent-tools.ts` + `workflowRunner.ts` | Hookup wiring. |
| 11 Hardening and Release | All `scripts/verify-*.cjs` | New `scripts/verify-document-agent*.cjs`. |

---

## 16. Effort Re-estimate

Re-estimated against the 11 phases and 60 acceptance criteria:

| Phase | Dev-days | Risk |
|---|---|---|
| 1 Canonical Contracts | 5 | Low |
| 2 Managed Document Foundation | 7 | Medium |
| 3 Read-Only Limited Tools | 5 | Low |
| 4 Proposal and Approval System | 10 | High |
| 5 Creation and Serialization | 12 | High (DOCX/PDF fidelity) |
| 6 Export | 5 | Medium |
| 7 Workspace Grants and Read | 8 | Medium |
| 8 Workspace Changesets | 10 | High (atomicity + rollback) |
| 9 Move and Trash | 4 | Medium |
| 10 Workflow/Project Integration | 6 | Low |
| 11 Hardening and Release | 12 | Medium |
| **Total** | **84 dev-days** | |

Phases 4, 5, and 8 carry the highest risk and should each receive dedicated security review.

---

## 17. Recommended Initial Slice (MVP)

If the user wants the **nearest valuable subset**, the canonical spec recommends:

> "1. Read-only attachment access. 2. App-managed documents. 3. Immutable revisions. 4. Structured edit proposals. 5. Reliable diffs. 6. One-time approvals. 7. Safe creation and export. 8. Only then, user-selected workspace access."

Concretely, this slice covers **Phases 1–6** and **20 acceptance criteria** (Limited Documents 1–20) without workspace access. Workspace can be added in a follow-up work order.

---

*End of Phase 0 Discovery Report — supersedes earlier high-level discovery and is bound to `docs/audits/TODO/Function_calling_todo.md`.*