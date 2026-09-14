# Venice Forge — Pages

## Conversation
- **Chat** (`chat/`): transcript + composer (`vf-composer`), StandardChatView/chat-view, message-bubble (user/assistant/tool/reasoning blocks), ChatMarkdown (`.prose-venice` + Refractor syntax), chat-input (attachments, context chips, model controls), venice-params, HistoryView (dense conversation list, search, multi-select delete/export).
- **Character Chats**: CharacterChatsView + CharacterSceneCard — chat plus avatar identity, character metadata, persona state.
- **History**: master list; date grouping; hover/focus actions.

## Generate
- **Image Studio** (`image/`): prompt stack, model/style controls, preview canvas, tools (upscale/background-removal), generation progress.
- **Media Studio** (`gallery/`): media grid (media-card), media-toolbar (bulk actions, filters), compare-view, lineage-viewer, media-detail-dialog, media-inspector, recipe-comparison/compatibility-card.
- **Image Inspector**: central image canvas + analysis rails, histogram-style data surfaces.
- **Prompt Library** (`prompts/`): library rail + framed editor/preview, PromptCreateModal, tags, versions.
- **Scene Composer** (`scenes/`): layers rail + composition canvas + properties.
- **Audio / Music**: voice/model controls, waveform player, queue/history lists.
- **Video**: preview canvas + parameter panel + queue rail.
- **Embeddings**: model selector, input editor, vector/response panel, copy/export.
- **Search/Scrape**: search bar + dense results + scrape preview (SearchTab, ScrapeTab, AiResearchTab, ProfileDiscoveryTab, TextParserTab).
- **Characters**: character grid/list + detail, CharacterAvatar.

## Build
- **Character Creator** (`character-creator/`): welcome → draft editor → generating → ready/completed states, process panel, mascot, local picker modal.
- **RP Studio** (`rp-studio/`): master/detail — CharacterLibrary/Editor, CharacterBookEditor, LorebookManager, PersonaManager, RpChatList/RpChatView, SceneGenerator, AssetGallery, PromptDebugDrawer, `_shared` primitives.
- **Workflow Templates**: template library + graph canvas + inspector, WorkflowTemplatesView.
- **Documents / Document Agent**: WorkspaceTree | DocumentRenderer/editor | agent/approval rail; ManagedDocumentAttachmentCard.
- **Playground**: parameters | request editor | response/metadata, agent-model-picker, workflow-preview.

## System
- **Privacy** (`privacy/StoragePrivacyDashboard.tsx`): storage stats, sync state, encryption state, data management.
- **Settings** (`settings/`): SettingsView + panels (Profile, ApiKeys, Providers, Safety, Defaults, AudioSpeech, DataStorage, BackupSync, FontSettings, LanguageRegion, Config, About, Updates, MasterPasswordDialog) + **ThemeMaker** + ThemePreview (theme families, dark/light, token + code/syntax editing, YAML import/export, live preview).
- **Status** (`status/` + StatusView.tsx): provider/network health, diagnostics summary, task/activity lists; HeaderStatusCluster + StatusIndicator shared with header.

## Global overlays
api-key-dialog, FirstRunModal (age gate), OnboardingSplash, CommandPalette, inspector-pane (Traffic Inspector), DiagnosticsDrawer, TaskCenterDrawer, Toaster, ModalRequestHost, ConfirmModal, ErrorBoundary screens.
