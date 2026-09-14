# Venice Forge — Routes / Tabs

Canonical registry: `src/config/tabs.ts`. 22 canonical views in 4 sidebar groups (legacy aliases `gallery→media`, `models`, `batch`, `diagnostics` preserved for persisted state).

| # | Tab id | Group | View component | Model selector |
|---|--------|-------|----------------|----------------|
| 1 | chat | conversation | `src/components/chat/StandardChatView.tsx` / `chat-view.tsx` | header (text) |
| 2 | character-chats | conversation | `src/components/chat/CharacterChatsView.tsx` | header (text) |
| 3 | history | conversation | `src/components/chat/HistoryView.tsx` | — |
| 4 | image | generate | `src/components/image/image-view.tsx` / `image-page.tsx` | header (image) |
| 5 | media | generate | `src/components/gallery/gallery-view.tsx` | — |
| 6 | image-inspector | generate (lazy) | `src/components/image-inspector/ImageInspectorView.tsx` | — |
| 7 | prompts | generate | `src/components/prompts/PromptLibraryView.tsx` | — |
| 8 | scenes | generate | `src/components/scenes/SceneComposerView.tsx` | — |
| 9 | audio | generate | `src/components/audio/audio-view.tsx` | header (tts) |
| 10 | music | generate | `src/components/music/music-view.tsx` | header (music) |
| 11 | video | generate | `src/components/video/video-view.tsx` | in-view (video) |
| 12 | embeddings | generate | `src/components/embeddings/embeddings-view.tsx` | header (embedding) |
| 13 | search | generate | `src/components/search/SearchScrapeView.tsx` (supersedes root `SearchScrapeView.tsx`) | — |
| 14 | characters | generate | `src/components/CharactersView.tsx` + `characters/` | — |
| 15 | character-creator | build (lazy) | `src/components/character-creator/CharacterCreatorView.tsx` | — |
| 16 | rp-studio | build (lazy) | `src/components/rp-studio/RpStudioView.tsx` | — |
| 17 | workflows | build (lazy) | `src/components/workflows/WorkflowTemplatesView.tsx` | — |
| 18 | documents | build (lazy) | `src/components/documents/DocumentAgentView.tsx` | — |
| 19 | privacy | system | `src/components/privacy/StoragePrivacyDashboard.tsx` | — |
| 20 | playground | build (lazy) | `src/components/playground/playground-view.tsx` | — |
| 21 | settings | system | `src/components/settings/SettingsView.tsx` + `settings/` + `ThemeMaker.tsx` | — |
| 22 | status | system | `src/components/StatusView.tsx` + `status/` | — |

Non-tab global surfaces: API key dialog, First Run (age gate), OnboardingSplash, CommandPalette (⌘K), Traffic Inspector (`layout/inspector-pane.tsx`), DiagnosticsDrawer, TaskCenterDrawer, Toaster, ModalRequestHost, master-password dialogs.

Shell composition in `src/App.tsx`: skip-link → AppMeshOverlay → mobile drawer scrim → Sidebar → [Header → main (lazy view) + InspectorPane].
