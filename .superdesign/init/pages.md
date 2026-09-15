# Venice Forge — Pages / Dependency Trees (source-grounded init)

> Each tree starts at the canonical view source and names the principal local dependencies. Read imports from the current source before extending a surface; this is a navigational baseline, not implementation authority.

## Conversation

- **Chat** — `src/components/chat/StandardChatView.tsx` → `src/components/chat/chat-view.tsx` → `message-bubble.tsx`, `chat-input.tsx`, `ChatMarkdown.tsx`, `venice-params.tsx`, `src/hooks/use-chat.ts` → `src/services/veniceClient.ts` / `src/services/desktopBridge.ts` → chat stores and prompt compiler.
- **Character Chats** — `src/components/chat/CharacterChatsView.tsx` → `CharacterSceneCard.tsx`, character picker/dialog primitives, `src/stores/chat-store.ts` → shared chat stream and character scene services.
- **History** — `src/components/chat/HistoryView.tsx` → conversation summaries, folders, context menu, `AccessibleDialog`, chat storage/store actions.

## Generate

- **Image Studio** — `src/components/image/image-page.tsx` → `image-view.tsx`, recipe/model capability controls, media persistence and generation task services.
- **Media Studio** — `src/components/gallery/gallery-view.tsx` → media cards, toolbar, compare/lineage/detail surfaces, `src/stores/media-store.ts`, content/media bridge.
- **Image Inspector** — `src/components/image-inspector/ImageInspectorView.tsx` → source ingestion, analysis panels, image-inspector store, research service.
- **Prompt Library** — `src/components/prompts/PromptLibraryView.tsx` → prompt editor/list, version chain, prompt-library store, shared `Toolbar`/`Card`/`EmptyState`.
- **Scene Composer** — `src/components/scenes/SceneComposerView.tsx` → layer list, canvas/properties, scene compiler, scene-composer store.
- **Audio** — `src/components/audio/audio-view.tsx` → TTS controls, task center/background task store, audio playback bridge.
- **Music** — `src/components/music/music-view.tsx` → music request controls, queue/task store, managed media player.
- **Video** — `src/components/video/video-view.tsx` → video request controls, queue/retrieve service, managed video player and media store.
- **Embeddings** — `src/components/embeddings/embeddings-view.tsx` → embedding model/input/result panels and canonical Venice client.
- **Search/Scrape** — `src/components/SearchScrapeView.tsx` → SearchTab, ScrapeTab, TextParserTab, AiResearchTab, ProfileDiscoveryTab, ResearchWorkspacePanel → research providers/services.
- **Characters** — `src/components/CharactersView.tsx` → `src/components/characters/`, character store, avatar/cache services.

## Build

- **Character Creator** — `src/components/character-creator/CharacterCreatorView.tsx` → creator steps, mascot, local picker/modal, character-card services.
- **RP Studio** — `src/components/rp-studio/RpStudioView.tsx` → character library/editor, character book, lorebook/persona managers, RP chat, scene/asset tools, prompt compiler.
- **Workflows** — `src/components/workflows/WorkflowTemplatesView.tsx` → workflow library/canvas/inspector, workflow store, workflow runner and persistence.
- **Documents** — `src/components/documents/DocumentAgentView.tsx` → workspace tree/editor/agent rail → typed document bridge → main-process workspace/document services.
- **Playground** — `src/components/playground/playground-view.tsx` → request editor, model picker, workflow preview, canonical request boundary.

## System

- **Privacy** — `src/components/privacy/StoragePrivacyDashboard.tsx` → storage/privacy service, profile/sync status, secure persistence controls.
- **Settings** — `src/components/SettingsView.tsx` → settings panels, settings/config stores and theme service.
- **Theme Maker** — `src/components/ThemeMaker.tsx` → `ThemePreview.tsx`, Theme Family resolver/application, YAML import/export, and settings/config persistence.
- **Status** — `src/components/StatusView.tsx` → status cards, `src/components/status/`, diagnostics/task stores and provider health services.

## Global surfaces

`src/components/layout/api-key-dialog.tsx`, `FirstRunModal.tsx`, `OnboardingSplash.tsx`, `src/components/command-palette/CommandPalette.tsx`, `src/components/layout/inspector-pane.tsx`, `DiagnosticsDrawer.tsx`, `TaskCenterDrawer.tsx`, `src/components/ui/modal-requests.tsx`, and security/master-password dialogs are mounted by `src/App.tsx` and are not canonical tabs.
