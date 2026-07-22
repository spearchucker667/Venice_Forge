# 01 — Repository State & Subsystem Inventory

**Audit Snapshot Date:** 2026-07-20 (Executed: 2026-07-22)  
**Application:** Venice Forge  
**Package Version:** `3.0.0-beta.1` (from `package.json`)  
**Git Branch:** `main`  
**Latest Verified Commit:** `ae1db1badf7d08ca32daf9c47ebc1181e3a288b9`  
**Base Target Commit:** `d21e9fd3af64f67bf4fc50429eb1d3c35ae2ae71` ("venice forge: chat folders, agent media, documents, video (9-phase work order)")  
**Worktree Status:** Clean  

---

## 1. Metadata Verification Summary

| Metadata Field | Reported Value | Verified Value | Match Status | Notes |
| -------------- | -------------- | -------------- | ------------ | ----- |
| Application Name | Venice Forge | Venice Forge | MATCH | Verified in `package.json` and `AGENTS.md` |
| Version | `3.0.0-beta.1` | `3.0.0-beta.1` | MATCH | `package.json` line 3: `"version": "3.0.0-beta.1"` |
| Git Branch | `main` | `main` | MATCH | `git branch --show-current` = `main` |
| Target Commit | `d21e9fd...` | `d21e9fd...` | MATCH (HISTORICAL BASE) | 9-Phase work order baseline commit |
| Latest Commit | `ae1db1b...` | `ae1db1b...` | MATCH (CURRENT HEAD) | `feat(ui): integrate Bas Milius Meteocons icons...` |
| Worktree State | `dirty` (reported) | `clean` | RECONCILED | Current snapshot worktree is clean (`git status --short` returns empty) |

---

## 2. File Inventory by Subsystem

The Venice Forge codebase contains the following primary file tree structure:

- **`electron/`** (Electron Main Process & Node Runtime):
  - `main.ts` — Main process lifecycle, window creation, protocol scheme registration (`venice-media://`, `vf-avatar://`, `vf-character-avatar://`).
  - `preload.ts` — Context-isolated IPC preload bridge enforcing `contextBridge.exposeInMainWorld('electronAPI', ...)`.
  - `agent/` — Agent runtime engine, including `chat-agent-runner.ts`, `agent-tool-executor.ts`, `trusted-agent-request.ts`, and document/workspace tool bridges.
  - `ipc/` — Main-process IPC handler registrations, including `chatFolderHandlers.ts`, `documentAgentHandlers.ts`, `syncHandlers.ts`, `rpHandlers.ts`, `fileHandlers.ts`.
  - `services/` — Node.js service implementations: `chatFolderStorage.ts`, `chatFolderBackupService.ts`, `chatFolderLockService.ts`, `chatStorage.ts`, `guardPipeline.ts`, `generatedMediaStore.ts`, `videoRetrieveService.ts`, `syncEngine.ts`, `secureStore.ts`.
  - `utils/` — Utility modules: `idValidation.ts`, `profileIdValidation.ts`, `rendererCsp.ts`, `customProtocolAccess.ts`.

- **`src/`** (React Renderer Application):
  - `App.tsx`, `main.tsx`, `index.html` — Web UI entry points and route/view dispatchers.
  - `components/` — Modular React UI views:
    - `chat/` — `chat-view.tsx`, `HistoryView.tsx`, `CharacterChatsView.tsx`, `message-bubble.tsx`, `ChatTtsPlayer.tsx`, `venice-params.tsx`.
    - `gallery/` — `gallery-view.tsx`, `ManagedVideoPlayer.tsx`.
    - `rp-studio/` — `CharacterEditor.tsx`, `rp-studio.tsx`.
    - `research/` — `ResearchWorkspaceView.tsx`, `SearchScrapeView.tsx`.
    - `settings/` — `SettingsView.tsx`, `BackupSyncPanel.tsx`, `AboutPanel.tsx`.
    - `ui/` — Design tokens, dialogs, icons, including `Meteocon.tsx`.
  - `stores/` — Zustand application state stores: `chat-store.ts`, `chat-folder-store.ts`, `media-store.ts`, `character-store.ts`, `auth-store.ts`, `settings-store.ts`, `profile-store.ts`.
  - `shared/` — Cross-boundary typed contracts: `chatFolderContracts.ts`, `chatMediaReferenceContracts.ts`, `agentRuntimeContracts.ts`, `promptLimits.ts`, `redaction.ts`.
  - `services/` — Web-side services: `veniceClient.ts`, `desktopBridge.ts`, `chatTtsController.ts`, `ingestion/`.
  - `types/` — TypeScript interfaces: `conversation.ts`, `venice.ts`, `chatFolder.ts`, `character.ts`.

- **`server.ts`** — Express proxy server for standalone browser development (`npm run dev:server`).

- **`scripts/`** — Build, verification, and maintenance scripts (`verify-contracts.cjs`, `verify-release-metadata.cjs`, `verify-stack-facts.cjs`, `clean-repo-zip.sh`).

- **`docs/`** — Project documentation, roadmap (`ROADMAP.md`), doc index (`DOCS_INDEX.md`), session handoff (`summary_of_work.md`), active audits (`docs/audits/active/`), historical records (`docs/audits/Records/`), work orders (`docs/work-orders/`).

---

## 3. Subsystem Architecture Map

```mermaid
graph TD
    subgraph "Renderer Process (React + Vite + Zustand)"
        UI[React UI Components]
        CS[chat-store.ts / chat-folder-store.ts]
        DB[desktopBridge.ts]
        VC[veniceClient.ts]
    end

    subgraph "Main Process Boundary (Electron / IPC)"
        PL[preload.ts Bridge]
        IPC[IPC Handlers electron/ipc/]
        GP[Guard Pipeline guardPipeline.ts]
    end

    subgraph "Agent & Tool Runtime"
        TAR[trusted-agent-request.ts]
        CAR[chat-agent-runner.ts]
        ATE[agent-tool-executor.ts]
    end

    subgraph "Persistence & Local Security"
        CFS[chatFolderStorage.ts]
        CFB[chatFolderBackupService.ts]
        CFL[chatFolderLockService.ts]
        GMS[generatedMediaStore.ts]
        SST[secureStore.ts (OS Keychain / Encryption)]
    end

    UI --> CS
    CS --> DB
    DB -->|IPC Invoke| PL
    PL --> IPC
    IPC --> GP
    GP --> TAR
    TAR --> CAR
    CAR --> ATE
    ATE -->|Guarded Venice Request| GP
    IPC --> CFS
    IPC --> CFB
    IPC --> CFL
    CFL --> SST
    ATE --> GMS
```

---

## 4. Worktree Cleanliness Analysis

The current working copy is completely clean (`git status --short` output is empty).
Previously reported dirty/untracked files from earlier session reports (`patch_runner.js`, dirty edits in `docs/summary_of_work.md`, `scripts/clean-repo-zip.sh`) have been committed or reconciled into HEAD commit `ae1db1b`.

`patch_runner.js` exists in the repository root as a tracked utility script (479 bytes) used for deterministic patch execution.
