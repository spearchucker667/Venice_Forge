# Venice Forge — Routes / Tabs (source-grounded init)

> **Authority:** `src/config/tabs.ts` (`TAB_REGISTRY`, `CANONICAL_TAB_ORDER`). Legacy aliases in `TAB_IDS` are persisted-state compatibility only.
>
> **Source fingerprint:** 6a637a1e0e209613

| # | Tab id | Group | View source | Selector |
|---:|---|---|---|---|
| 1 | `chat` | conversation | `src/components/chat/StandardChatView.tsx` / `chat-view.tsx` | header text |
| 2 | `character-chats` | conversation | `src/components/chat/CharacterChatsView.tsx` | header text |
| 3 | `history` | conversation | `src/components/chat/HistoryView.tsx` | none |
| 4 | `image` | generate | `src/components/image/image-page.tsx` | header image |
| 5 | `media` | generate | `src/components/gallery/gallery-view.tsx` | none |
| 6 | `image-inspector` | generate | `src/components/image-inspector/ImageInspectorView.tsx` | none |
| 7 | `image-editor` | generate | `src/components/image/image-editor-view.tsx` | in-view edit |
| 8 | `prompts` | generate | `src/components/prompts/PromptLibraryView.tsx` | none |
| 9 | `scenes` | generate | `src/components/scenes/SceneComposerView.tsx` | none |
| 10 | `audio` | generate | `src/components/audio/audio-view.tsx` | header TTS |
| 11 | `music` | generate | `src/components/music/music-view.tsx` | header music |
| 12 | `video` | generate | `src/components/video/video-view.tsx` | in-view video |
| 13 | `embeddings` | generate | `src/components/embeddings/embeddings-view.tsx` | header embedding |
| 14 | `search` | generate | `src/components/SearchScrapeView.tsx` | none |
| 15 | `characters` | generate | `src/components/CharactersView.tsx` | none |
| 16 | `character-creator` | build | `src/components/character-creator/CharacterCreatorView.tsx` | none |
| 17 | `rp-studio` | build | `src/components/rp-studio/RpStudioView.tsx` | none |
| 18 | `workflows` | build | `src/components/workflows/WorkflowTemplatesView.tsx` | none |
| 19 | `documents` | build | `src/components/documents/DocumentAgentView.tsx` | none |
| 20 | `privacy` | system | `src/components/privacy/StoragePrivacyDashboard.tsx` | none |
| 21 | `playground` | build | `src/components/playground/playground-view.tsx` | none |
| 22 | `settings` | system | `src/components/SettingsView.tsx` | none |
| 23 | `status` | system | `src/components/StatusView.tsx` | none |

Non-tab global surfaces: API key dialog, First Run, onboarding, command palette, Traffic Inspector, Diagnostics Drawer, Task Center Drawer, Toaster, Modal Request Host, and master-password/security dialogs.

Never hardcode a tab count in generated guidance. Re-read `CANONICAL_TAB_ORDER` when planning navigation or visual acceptance.
