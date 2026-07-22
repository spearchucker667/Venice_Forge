# 04 Feature Implementation Matrix

| Feature ID | Feature area | Intended behavior | Evidence of intent | Current entry point | Runtime result | Status | Missing pieces | Priority |
|---|---|---|---|---|---|---|---|---|
| F-CHAT-01 | Chat | New chat, conversation persistence, streaming | `ROADMAP.md`, `App.tsx` | Main chat view | Works | COMPLETE_AND_VERIFIED | None | - |
| F-CHAT-02 | Chat | Chat Folders, drag-and-drop, locking | `ROADMAP.md`, UI | `HistoryView.tsx` | Works | COMPLETE_AND_VERIFIED | None | - |
| F-CHAT-03 | Media | Media generation (tools) inside chat | `ROADMAP.md`, Agent work | `use-chat.ts` | Works | COMPLETE_AND_VERIFIED | None | - |
| F-CHAR-01 | Character chat | Hosted & local characters, avatars, specific model | Docs, `CharacterHub` | Character Hub | Works | COMPLETE_AND_VERIFIED | None | - |
| F-MED-01 | Media generation | Text-to-image, background remove, video queue | Venice API docs | Media Studio | Works | COMPLETE_AND_VERIFIED | None | - |
| F-RES-01 | Research | URL research, Jina support | `RESEARCH_PROVIDERS.md` | Research browser | UI_ONLY / PARTIALLY_IMPLEMENTED | Verification of screenshot repro | P3 |
| F-WRK-01 | Workflows | Graph editor, node execution | `workflow-template-store.ts` | Workflows tab | Works | COMPLETE_AND_VERIFIED | None | - |
| F-DOC-01 | Document Agent | Staged expected-hash mutations, review UI | `DOCUMENT_AGENT.md` | Document Agent | PARTIALLY_IMPLEMENTED | Source-blob retention, full QA | P1 |
| F-BKP-01 | Backup & Sync | Encrypted backup/export | `backupExportService.ts` | Settings | Works | COMPLETE_AND_VERIFIED | None | - |
| F-SET-01 | Settings | Venice API key, Safe-mode, Theme | Settings UI | Settings tab | Works | COMPLETE_AND_VERIFIED | None | - |
| F-PKG-01 | Packaging | macOS/Windows signed releases | `ROADMAP.md` (VF-VERIFY-005) | CI/CD | EXTERNALLY_BLOCKED | External signing credentials | P1 |

*Note: This matrix relies on verified features from the recent rigorous Agent testing sessions.*
