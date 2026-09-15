# Venice Forge — Reference UI Redesign Migration Matrix

**Authority:** Work order 'Complete Reference-Driven UI Redesign' (2026-09-14), baseline `b5760db2`.
**Statuses:** REDESIGNED | INHERITS_GLOBAL_SYSTEM | NO_VISUAL_SURFACE | DEFERRED_WITH_REASON | NOT_APPLICABLE.
**PENDING** entries await phase assignment during implementation. As of 2026-09-15, every in-scope renderer surface has reached a terminal status. The single remaining **DEFERRED_WITH_REASON** entry (`accessibility.css`) is the dedicated Phase 8 accessibility/RTL/responsive pass — the source CSS itself is correct, and Phase 8 added dedicated regression guards (`tests/accessibility/reference-rtl-shell.test.tsx`, `tests/accessibility/reference-viewport.test.tsx`) without modifying the file.

## `/` (1 files)

| File | Status | Phase/Notes |
|---|---|---|
| `index.html` | NO_VISUAL_SURFACE — shell HTML entry point, no Tailwind surface classes | |

## `src/` (1 files)

| File | Status | Phase/Notes |
|---|---|---|
| `App.tsx` | REDESIGNED — Phase 2: Shell root graphite cockpit background and panel bg | |

## `src/components/` (25 files)

| File | Status | Phase/Notes |
|---|---|---|
| `CharactersView.test.tsx` | NOT_APPLICABLE (test file) | |
| `CharactersView.tsx` | REDESIGNED — Phase 7: Global overlays/UI graphite cockpit migration | |
| `Chip.tsx` | REDESIGNED — Phase 7: Global overlays/UI graphite cockpit migration | |
| `ConfirmModal.test.tsx` | NOT_APPLICABLE (test file) | |
| `ConfirmModal.tsx` | REDESIGNED — Phase 7: Global overlays/UI graphite cockpit migration | |
| `DiagnosticsPreview.tsx` | REDESIGNED — Phase 7: Global overlays/UI graphite cockpit migration | |
| `ErrorBoundary.test.tsx` | NOT_APPLICABLE (test file) | |
| `ErrorBoundary.tsx` | REDESIGNED — Phase 7: rounded-2xl → rounded-xl alignment | |
| `Field.test.tsx` | NOT_APPLICABLE (test file) | |
| `Field.tsx` | REDESIGNED — Phase 7: Global overlays/UI graphite cockpit migration | |
| `FirstRunModal.test.tsx` | NOT_APPLICABLE (test file) | |
| `FirstRunModal.tsx` | REDESIGNED — Phase 7: Global overlays/UI graphite cockpit migration | |
| `ModelSelect.tsx` | REDESIGNED — Phase 7: Global overlays/UI graphite cockpit migration | |
| `OnboardingSplash.test.tsx` | NOT_APPLICABLE (test file) | |
| `OnboardingSplash.tsx` | REDESIGNED — Phase 7: Global overlays/UI graphite cockpit migration | |
| `SearchScrapeView.tsx` | REDESIGNED — Phase 4: Generate family graphite cockpit migration | |
| `SettingsView.test.tsx` | NOT_APPLICABLE (test file) | |
| `SettingsView.tsx` | REDESIGNED — Phase 6: System/Settings family graphite cockpit migration | |
| `StatusView.tsx` | REDESIGNED — Phase 6: System/Settings family graphite cockpit migration | |
| `ThemeMaker.custom.test.tsx` | NOT_APPLICABLE (test file) | |
| `ThemeMaker.test.ts` | NOT_APPLICABLE (test file) | |
| `ThemeMaker.tsx` | REDESIGNED — Phase 6: System/Settings family graphite cockpit migration | |
| `ThemeMaker.ui.test.tsx` | NOT_APPLICABLE (test file) | |
| `ThemePreview.test.tsx` | NOT_APPLICABLE (test file) | |
| `ThemePreview.tsx` | REDESIGNED — Phase 6: System/Settings family graphite cockpit migration | |

## `src/components/audio/` (2 files)

| File | Status | Phase/Notes |
|---|---|---|
| `audio-view.test.tsx` | NOT_APPLICABLE (test file) | |
| `audio-view.tsx` | REDESIGNED — Phase 4: Generate family graphite cockpit migration | |

## `src/components/character-creator/` (11 files)

| File | Status | Phase/Notes |
|---|---|---|
| `CharacterCreatorCompleted.tsx` | REDESIGNED — Phase 5: Build family graphite cockpit migration | |
| `CharacterCreatorDraftEditor.tsx` | REDESIGNED — Phase 5: Build family graphite cockpit migration | |
| `CharacterCreatorError.tsx` | REDESIGNED — Phase 5: Build family graphite cockpit migration | |
| `CharacterCreatorGenerating.tsx` | REDESIGNED — Phase 5: Build family graphite cockpit migration | |
| `CharacterCreatorLocalPickerModal.tsx` | REDESIGNED — Phase 5: Build family graphite cockpit migration | |
| `CharacterCreatorMascot.tsx` | REDESIGNED — Phase 5: Build family graphite cockpit migration | |
| `CharacterCreatorProcessPanel.tsx` | REDESIGNED — Phase 5: Build family graphite cockpit migration | |
| `CharacterCreatorReady.tsx` | REDESIGNED — Phase 5: Build family graphite cockpit migration | |
| `CharacterCreatorView.test.tsx` | NOT_APPLICABLE (test file) | |
| `CharacterCreatorView.tsx` | REDESIGNED — Phase 5: Build family graphite cockpit migration | |
| `CharacterCreatorWelcome.tsx` | REDESIGNED — Phase 5: Build family graphite cockpit migration | |

## `src/components/characters/` (2 files)

| File | Status | Phase/Notes |
|---|---|---|
| `CharacterAvatar.test.tsx` | NOT_APPLICABLE (test file) | |
| `CharacterAvatar.tsx` | REDESIGNED — Phase 4: Generate family graphite cockpit migration | |

## `src/components/chat/` (20 files)

| File | Status | Phase/Notes |
|---|---|---|
| `CharacterChatsView.test.tsx` | NOT_APPLICABLE (test file) | |
| `CharacterChatsView.tsx` | REDESIGNED — Phase 3: Chat family graphite cockpit migration | |
| `CharacterSceneCard.test.tsx` | NOT_APPLICABLE (test file) | |
| `CharacterSceneCard.tsx` | REDESIGNED — Phase 3: Chat family graphite cockpit migration | |
| `ChatMarkdown.tsx` | REDESIGNED — Phase 3: Chat family graphite cockpit migration | |
| `ChatTtsPlayer.tsx` | REDESIGNED — Phase 3: Chat family graphite cockpit migration | |
| `HistoryView.multiSelect.test.tsx` | NOT_APPLICABLE (test file) | |
| `HistoryView.test.tsx` | NOT_APPLICABLE (test file) | |
| `HistoryView.tsx` | REDESIGNED — Phase 3: Chat family graphite cockpit migration | |
| `StandardChatView.tsx` | REDESIGNED — Phase 3: Chat family graphite cockpit migration | |
| `chat-input.test.tsx` | NOT_APPLICABLE (test file) | |
| `chat-input.tsx` | REDESIGNED — Phase 3: Chat family graphite cockpit migration | |
| `chat-view.test.tsx` | NOT_APPLICABLE (test file) | |
| `chat-view.tsx` | REDESIGNED — Phase 3: Chat family graphite cockpit migration | |
| `codeHighlighting.test.tsx` | NOT_APPLICABLE (test file) | |
| `codeHighlighting.tsx` | REDESIGNED — Phase 3: Chat family graphite cockpit migration | |
| `message-bubble.test.tsx` | NOT_APPLICABLE (test file) | |
| `message-bubble.tsx` | REDESIGNED — Phase 3: Chat family graphite cockpit migration | |
| `message-bubble.unicode-copy.test.tsx` | NOT_APPLICABLE (test file) | |
| `venice-params.tsx` | REDESIGNED — Phase 3: Chat family graphite cockpit migration | |

## `src/components/command-palette/` (2 files)

| File | Status | Phase/Notes |
|---|---|---|
| `CommandPalette.test.tsx` | NOT_APPLICABLE (test file) | |
| `CommandPalette.tsx` | REDESIGNED — Phase 7: Global overlays/UI graphite cockpit migration | |

## `src/components/documents/` (9 files)

| File | Status | Phase/Notes |
|---|---|---|
| `DocumentAgentView.test.tsx` | NOT_APPLICABLE (test file) | |
| `DocumentAgentView.tsx` | REDESIGNED — Phase 5: Build family graphite cockpit migration | |
| `DocumentRenderer.tsx` | REDESIGNED — Phase 5: Build family graphite cockpit migration | |
| `ManagedDocumentAttachmentCard.test.tsx` | NOT_APPLICABLE (test file) | |
| `ManagedDocumentAttachmentCard.tsx` | REDESIGNED — Phase 5: Build family graphite cockpit migration | |
| `WorkspaceTree.test.tsx` | NOT_APPLICABLE (test file) | |
| `WorkspaceTree.tsx` | REDESIGNED — Phase 5: Build family graphite cockpit migration | |
| `documentViewHelpers.test.ts` | NOT_APPLICABLE (test file) | |
| `documentViewHelpers.ts` | NO_VISUAL_SURFACE — utility/type file, no JSX | |

## `src/components/embeddings/` (2 files)

| File | Status | Phase/Notes |
|---|---|---|
| `embeddings-view.test.tsx` | NOT_APPLICABLE (test file) | |
| `embeddings-view.tsx` | REDESIGNED — Phase 4: Generate family graphite cockpit migration | |

## `src/components/gallery/` (16 files)

| File | Status | Phase/Notes |
|---|---|---|
| `compare-view.test.tsx` | NOT_APPLICABLE (test file) | |
| `compare-view.tsx` | REDESIGNED — Phase 4: Generate family graphite cockpit migration | |
| `gallery-view.test.tsx` | NOT_APPLICABLE (test file) | |
| `gallery-view.tsx` | REDESIGNED — Phase 4: Generate family graphite cockpit migration | |
| `lineage-viewer.test.tsx` | NOT_APPLICABLE (test file) | |
| `lineage-viewer.tsx` | REDESIGNED — Phase 4: Generate family graphite cockpit migration | |
| `media-card.tsx` | REDESIGNED — Phase 4: Generate family graphite cockpit migration | |
| `media-detail-dialog.test.tsx` | NOT_APPLICABLE (test file) | |
| `media-detail-dialog.tsx` | REDESIGNED — Phase 4: Generate family graphite cockpit migration | |
| `media-inspector.test.tsx` | NOT_APPLICABLE (test file) | |
| `media-inspector.tsx` | REDESIGNED — Phase 4: Generate family graphite cockpit migration | |
| `media-toolbar.tsx` | REDESIGNED — Phase 4: Generate family graphite cockpit migration | |
| `recipe-comparison.test.tsx` | NOT_APPLICABLE (test file) | |
| `recipe-comparison.tsx` | REDESIGNED — Phase 4: Generate family graphite cockpit migration | |
| `recipe-compatibility-card.test.tsx` | NOT_APPLICABLE (test file) | |
| `recipe-compatibility-card.tsx` | REDESIGNED — Phase 4: Generate family graphite cockpit migration | |

## `src/components/generation/` (4 files)

| File | Status | Phase/Notes |
|---|---|---|
| `GenerationLoadingIndicator.tsx` | REDESIGNED — Phase 4: Generate family graphite cockpit migration | |
| `generation-animation-preloader.ts` | NO_VISUAL_SURFACE — utility/type file, no JSX | |
| `generation-animation-registry.ts` | NO_VISUAL_SURFACE — utility/type file, no JSX | |
| `generation-animation-state.ts` | NO_VISUAL_SURFACE — utility/type file, no JSX | |

## `src/components/image/` (5 files)

| File | Status | Phase/Notes |
|---|---|---|
| `image-page.tsx` | REDESIGNED — Phase 4: Generate family graphite cockpit migration | |
| `image-tools.test.tsx` | NOT_APPLICABLE (test file) | |
| `image-tools.tsx` | REDESIGNED — Phase 4: Generate family graphite cockpit migration | |
| `image-view.test.tsx` | NOT_APPLICABLE (test file) | |
| `image-view.tsx` | REDESIGNED — Phase 4: Generate family graphite cockpit migration | |

## `src/components/image-inspector/` (2 files)

| File | Status | Phase/Notes |
|---|---|---|
| `ImageInspectorView.test.tsx` | NOT_APPLICABLE (test file) | |
| `ImageInspectorView.tsx` | REDESIGNED — Phase 4: Generate family graphite cockpit migration | |

## `src/components/layout/` (10 files)

| File | Status | Phase/Notes |
|---|---|---|
| `AppMeshOverlay.tsx` | INHERITS_GLOBAL_SYSTEM | visual now provided by .app-mesh-overlay grain layer (component unchanged) |
| `api-key-dialog.test.tsx` | NOT_APPLICABLE (test file) | |
| `api-key-dialog.tsx` | REDESIGNED — Phase 7: Global overlays/UI graphite cockpit migration | |
| `header.test.tsx` | NOT_APPLICABLE (test file) | |
| `header.tsx` | REDESIGNED — Phase 2+7: Reference shell header; soft-separator residuals cleaned in Phase 7 | |
| `inspector-pane.test.tsx` | NOT_APPLICABLE (test file) | |
| `inspector-pane.tsx` | REDESIGNED — Phase 2: Graphite utility rail panel, flat instrument tabs, technical filter chips, inset pre views | |
| `memory-panel.tsx` | REDESIGNED — Phase 7: Global overlays/UI graphite cockpit migration | |
| `sidebar.test.tsx` | NOT_APPLICABLE (test file) | |
| `sidebar.tsx` | REDESIGNED — Phase 2: Cockpit sidebar with 1px border, technical uppercase section labels, rounded-md nav buttons, and luminous active rail | |

## `src/components/media/` (2 files)

| File | Status | Phase/Notes |
|---|---|---|
| `ManagedVideoPlayer.tsx` | REDESIGNED — Phase 4: Generate family graphite cockpit migration | |
| `ResolvedMediaImg.tsx` | REDESIGNED — Phase 4: Generate family graphite cockpit migration | |

## `src/components/music/` (2 files)

| File | Status | Phase/Notes |
|---|---|---|
| `music-view.test.ts` | NOT_APPLICABLE (test file) | |
| `music-view.tsx` | REDESIGNED — Phase 4: Generate family graphite cockpit migration | |

## `src/components/notifications/` (5 files)

| File | Status | Phase/Notes |
|---|---|---|
| `ProgressToast.tsx` | REDESIGNED — Phase 7: Global overlays/UI graphite cockpit migration | |
| `ToastItem.tsx` | REDESIGNED — Phase 7: Global overlays/UI graphite cockpit migration | |
| `ToastProvider.test.tsx` | NOT_APPLICABLE (test file) | |
| `ToastProvider.tsx` | REDESIGNED — Phase 7: Global overlays/UI graphite cockpit migration | |
| `ToastViewport.tsx` | REDESIGNED — Phase 7: Global overlays/UI graphite cockpit migration | |

## `src/components/playground/` (7 files)

| File | Status | Phase/Notes |
|---|---|---|
| `agent-model-picker.tsx` | REDESIGNED — Phase 5: Build family graphite cockpit migration | |
| `playground-chat.test.tsx` | NOT_APPLICABLE (test file) | |
| `playground-chat.tsx` | REDESIGNED — Phase 5: Build family graphite cockpit migration | |
| `playground-view.tsx` | REDESIGNED — Phase 5: Build family graphite cockpit migration | |
| `preview-node.test.tsx` | NOT_APPLICABLE (test file) | |
| `preview-node.tsx` | REDESIGNED — Phase 5: Build family graphite cockpit migration | |
| `workflow-preview.tsx` | REDESIGNED — Phase 5: Build family graphite cockpit migration | |

## `src/components/privacy/` (2 files)

| File | Status | Phase/Notes |
|---|---|---|
| `StoragePrivacyDashboard.test.tsx` | NOT_APPLICABLE (test file) | |
| `StoragePrivacyDashboard.tsx` | REDESIGNED — Phase 6: System/Settings family graphite cockpit migration | |

## `src/components/prompts/` (5 files)

| File | Status | Phase/Notes |
|---|---|---|
| `PromptCreateModal.test.tsx` | NOT_APPLICABLE (test file) | |
| `PromptCreateModal.tsx` | REDESIGNED — Phase 4: Generate family graphite cockpit migration | |
| `PromptLibrarySelection.test.ts` | NOT_APPLICABLE (test file) | |
| `PromptLibraryView.test.tsx` | NOT_APPLICABLE (test file) | |
| `PromptLibraryView.tsx` | REDESIGNED — Phase 4: Generate family graphite cockpit migration | |

## `src/components/research/` (2 files)

| File | Status | Phase/Notes |
|---|---|---|
| `ResearchWorkspaceView.test.tsx` | NOT_APPLICABLE (test file) | |
| `ResearchWorkspaceView.tsx` | REDESIGNED — Phase 5: Build family graphite cockpit migration | |

## `src/components/rp-studio/` (22 files)

| File | Status | Phase/Notes |
|---|---|---|
| `AssetGallery.tsx` | REDESIGNED — Phase 5: Build family graphite cockpit migration | |
| `CharacterBookEditor.test.tsx` | NOT_APPLICABLE (test file) | |
| `CharacterBookEditor.tsx` | REDESIGNED — Phase 5: Build family graphite cockpit migration | |
| `CharacterEditor.test.tsx` | NOT_APPLICABLE (test file) | |
| `CharacterEditor.tsx` | REDESIGNED — Phase 5: Build family graphite cockpit migration | |
| `CharacterLibrary.test.tsx` | NOT_APPLICABLE (test file) | |
| `CharacterLibrary.tsx` | REDESIGNED — Phase 5: Build family graphite cockpit migration | |
| `LorebookManager.test.tsx` | NOT_APPLICABLE (test file) | |
| `LorebookManager.tsx` | REDESIGNED — Phase 5: Build family graphite cockpit migration | |
| `PersonaManager.test.tsx` | NOT_APPLICABLE (test file) | |
| `PersonaManager.tsx` | REDESIGNED — Phase 5: Build family graphite cockpit migration | |
| `PromptDebugDrawer.test.tsx` | NOT_APPLICABLE (test file) | |
| `PromptDebugDrawer.tsx` | REDESIGNED — Phase 5: Build family graphite cockpit migration | |
| `RpChatList.test.tsx` | NOT_APPLICABLE (test file) | |
| `RpChatList.tsx` | REDESIGNED — Phase 5: Build family graphite cockpit migration | |
| `RpChatView.test.tsx` | NOT_APPLICABLE (test file) | |
| `RpChatView.tsx` | REDESIGNED — Phase 5: Build family graphite cockpit migration | |
| `RpStudioView.tsx` | REDESIGNED — Phase 5: Build family graphite cockpit migration | |
| `SceneGenerator.tsx` | REDESIGNED — Phase 5: Build family graphite cockpit migration | |
| `_shared.test.tsx` | NOT_APPLICABLE (test file) | |
| `_shared.tsx` | REDESIGNED — Phase 5: Build family graphite cockpit migration | |
| `index.ts` | NO_VISUAL_SURFACE — re-export barrel, no JSX | |

## `src/components/scenes/` (2 files)

| File | Status | Phase/Notes |
|---|---|---|
| `SceneComposerView.test.tsx` | NOT_APPLICABLE (test file) | |
| `SceneComposerView.tsx` | REDESIGNED — Phase 4: Generate family graphite cockpit migration | |

## `src/components/search/` (13 files)

| File | Status | Phase/Notes |
|---|---|---|
| `AiResearchTab.tsx` | REDESIGNED — Phase 4: Generate family graphite cockpit migration | |
| `ProfileDiscoveryTab.tsx` | REDESIGNED — Phase 4: Generate family graphite cockpit migration | |
| `ResearchProviderStatus.test.tsx` | NOT_APPLICABLE (test file) | |
| `ResearchProviderStatus.tsx` | REDESIGNED — Phase 4: Generate family graphite cockpit migration | |
| `ResearchWorkspacePanel.tsx` | REDESIGNED — Phase 4: Generate family graphite cockpit migration | |
| `ScrapeTab.test.tsx` | NOT_APPLICABLE (test file) | |
| `ScrapeTab.tsx` | REDESIGNED — Phase 4: Generate family graphite cockpit migration | |
| `SearchScrapeView.test.tsx` | NOT_APPLICABLE (test file) | |
| `SearchScrapeView.tsx` | REDESIGNED — Phase 4: Generate family graphite cockpit migration | |
| `SearchTab.tsx` | REDESIGNED — Phase 4: Generate family graphite cockpit migration | |
| `TextParserTab.tsx` | REDESIGNED — Phase 4: Generate family graphite cockpit migration | |
| `searchScrapeTypes.ts` | NO_VISUAL_SURFACE — utility/type file, no JSX | |
| `searchScrapeUtils.ts` | NO_VISUAL_SURFACE — utility/type file, no JSX | |

## `src/components/settings/` (24 files)

| File | Status | Phase/Notes |
|---|---|---|
| `AboutPanel.tsx` | REDESIGNED — Phase 6: System/Settings family graphite cockpit migration | |
| `ApiKeysPanel.tsx` | REDESIGNED — Phase 6: System/Settings family graphite cockpit migration | |
| `AudioSpeechPanel.test.tsx` | NOT_APPLICABLE (test file) | |
| `AudioSpeechPanel.tsx` | REDESIGNED — Phase 6: System/Settings family graphite cockpit migration | |
| `BackupSyncPanel.test.tsx` | NOT_APPLICABLE (test file) | |
| `BackupSyncPanel.tsx` | REDESIGNED — Phase 6: System/Settings family graphite cockpit migration | |
| `ConfigPanel.tsx` | REDESIGNED — Phase 6: System/Settings family graphite cockpit migration | |
| `DataStoragePanel.test.tsx` | NOT_APPLICABLE (test file) | |
| `DataStoragePanel.tsx` | REDESIGNED — Phase 6: System/Settings family graphite cockpit migration | |
| `DefaultsPanel.tsx` | REDESIGNED — Phase 6: System/Settings family graphite cockpit migration | |
| `FontSettingsPanel.test.tsx` | NOT_APPLICABLE (test file) | |
| `FontSettingsPanel.tsx` | REDESIGNED — Phase 6: System/Settings family graphite cockpit migration | |
| `ImportPlanModal.tsx` | REDESIGNED — Phase 6: System/Settings family graphite cockpit migration | |
| `LanguageRegionPanel.test.tsx` | NOT_APPLICABLE (test file) | |
| `LanguageRegionPanel.tsx` | REDESIGNED — Phase 6: System/Settings family graphite cockpit migration | |
| `MasterPasswordDialog.test.tsx` | NOT_APPLICABLE (test file) | |
| `MasterPasswordDialog.tsx` | REDESIGNED — Phase 6: System/Settings family graphite cockpit migration | |
| `ProfilePanel.test.tsx` | NOT_APPLICABLE (test file) | |
| `ProfilePanel.tsx` | REDESIGNED — Phase 6: System/Settings family graphite cockpit migration | |
| `ProvidersPanel.tsx` | REDESIGNED — Phase 6: System/Settings family graphite cockpit migration | |
| `SafetyPanel.tsx` | REDESIGNED — Phase 6: System/Settings family graphite cockpit migration | |
| `SettingsView.tsx` | REDESIGNED — Phase 6: System/Settings family graphite cockpit migration | |
| `UpdatesPanel.tsx` | REDESIGNED — Phase 6: System/Settings family graphite cockpit migration | |
| `types.ts` | NO_VISUAL_SURFACE — utility/icon/type file, no themeable surface tokens | |

## `src/components/status/` (7 files)

| File | Status | Phase/Notes |
|---|---|---|
| `DiagnosticsDrawer.test.tsx` | NOT_APPLICABLE (test file) | |
| `DiagnosticsDrawer.tsx` | REDESIGNED — Phase 2: Graphite utility rail drawer with vf-utility-rail-section cards and technical action buttons | |
| `HeaderStatusCluster.test.tsx` | NOT_APPLICABLE (test file) | |
| `HeaderStatusCluster.tsx` | REDESIGNED — Phase 6: System/Settings family graphite cockpit migration | |
| `StatusIndicator.test.tsx` | NOT_APPLICABLE (test file) | |
| `StatusIndicator.tsx` | REDESIGNED — Phase 6: System/Settings family graphite cockpit migration | |
| `TaskCenterDrawer.tsx` | REDESIGNED — Phase 2: Graphite utility rail drawer with dark overlay backdrop and technical generation cards | |

## `src/components/ui/` (21 files)

| File | Status | Phase/Notes |
|---|---|---|
| `AccessibleDialog.test.tsx` | NOT_APPLICABLE (test file) | |
| `AccessibleDialog.tsx` | REDESIGNED — Phase 7: Global overlays/UI graphite cockpit migration | |
| `ContextMenu.tsx` | REDESIGNED — Phase 7: Global overlays/UI graphite cockpit migration | |
| `Meteocon.test.tsx` | NOT_APPLICABLE (test file) | |
| `Meteocon.tsx` | NO_VISUAL_SURFACE — utility/icon/type file, no themeable surface tokens | |
| `error-boundary.test.tsx` | NOT_APPLICABLE (test file) | |
| `error-boundary.tsx` | REDESIGNED — Phase 7: Global overlays/UI graphite cockpit migration | |
| `generation-view.tsx` | REDESIGNED — Phase 7: Global overlays/UI graphite cockpit migration | |
| `logo.tsx` | NO_VISUAL_SURFACE — utility/icon/type file, no themeable surface tokens | |
| `meteoconSvgTransformer.ts` | NO_VISUAL_SURFACE — utility/icon/type file, no themeable surface tokens | |
| `modal-requests.test.tsx` | NOT_APPLICABLE (test file) | |
| `modal-requests.tsx` | REDESIGNED — Phase 7: Global overlays/UI graphite cockpit migration | |
| `primitives.test.tsx` | NOT_APPLICABLE (test file) | |
| `primitives.tsx` | REDESIGNED — Phase 1: six shell primitives added (existing exports untouched) | |
| `select.test.tsx` | NOT_APPLICABLE (test file) | |
| `select.tsx` | REDESIGNED — Phase 7: Global overlays/UI graphite cockpit migration | |
| `shared.i18n.test.tsx` | NOT_APPLICABLE (test file) | |
| `shared.test.tsx` | NOT_APPLICABLE (test file) | |
| `shared.tsx` | REDESIGNED — Phase 7: Global overlays/UI graphite cockpit migration | |
| `spinner.tsx` | NO_VISUAL_SURFACE — utility/icon/type file, no themeable surface tokens | |
| `toaster.tsx` | NO_VISUAL_SURFACE — utility/icon/type file, no themeable surface tokens | |

## `src/components/video/` (2 files)

| File | Status | Phase/Notes |
|---|---|---|
| `video-view.test.tsx` | NOT_APPLICABLE (test file) | |
| `video-view.tsx` | REDESIGNED — Phase 4: Generate family graphite cockpit migration | |

## `src/components/workflows/` (2 files)

| File | Status | Phase/Notes |
|---|---|---|
| `WorkflowTemplatesView.test.tsx` | NOT_APPLICABLE (test file) | |
| `WorkflowTemplatesView.tsx` | REDESIGNED — Phase 5: Build family graphite cockpit migration | |

## `src/styles/` (3 files)

| File | Status | Phase/Notes |
|---|---|---|
| `accessibility.css` | DEFERRED_WITH_REASON — dedicated accessibility/RTL pass (Phase 8); unchanged in Phase 1 | |
| `components.css` | REDESIGNED — Phase 1: static grain ambient layer + reference material classes | |
| `theme.css` | REDESIGNED — Phase 1: derived --color-vf-* material layer; radii contracted (panel 10px, dialog 14px) | |

## `src/theme/` (23 files)

| File | Status | Phase/Notes |
|---|---|---|
| `applyTheme.test.ts` | NOT_APPLICABLE (test file) | |
| `applyTheme.ts` | REDESIGNED — Phase 1 + Phase 7: theme engine token values; architecture preserved | |
| `codeSyntax.ts` | REDESIGNED — Phase 1 + Phase 7: theme engine token values; architecture preserved | |
| `codeSyntaxPresets.ts` | REDESIGNED — Phase 1 + Phase 7: theme engine token values; architecture preserved | |
| `codeSyntaxTypes.ts` | REDESIGNED — Phase 1 + Phase 7: theme engine token values; architecture preserved | |
| `contrast.test.ts` | NOT_APPLICABLE (test file) | |
| `contrast.ts` | REDESIGNED — Phase 1 + Phase 7: theme engine token values; architecture preserved | |
| `fallbacks.test.ts` | NOT_APPLICABLE (test file) | |
| `fallbacks.ts` | REDESIGNED — Phase 1 + Phase 7: theme engine token values; architecture preserved | |
| `index.ts` | REDESIGNED — Phase 1 + Phase 7: theme engine token values; architecture preserved | |
| `migration.ts` | REDESIGNED — Phase 1 + Phase 7: theme engine token values; architecture preserved | |
| `registry.ts` | REDESIGNED — Phase 1 + Phase 7: theme engine token values; architecture preserved | |
| `resolver.ts` | REDESIGNED — Phase 1 + Phase 7: theme engine token values; architecture preserved | |
| `schema.ts` | REDESIGNED — Phase 1 + Phase 7: theme engine token values; architecture preserved | |
| `test-helpers.ts` | REDESIGNED — Phase 1 + Phase 7: theme engine token values; architecture preserved | |
| `themeTypes.ts` | REDESIGNED — Phase 1 + Phase 7: theme engine token values; architecture preserved | |
| `themes.test.ts` | NOT_APPLICABLE (test file) | |
| `themes.ts` | REDESIGNED — Phase 1 + Phase 7: theme engine token values; architecture preserved | |
| `validateColor.test.ts` | NOT_APPLICABLE (test file) | |
| `validateColor.ts` | REDESIGNED — Phase 1 + Phase 7: theme engine token values; architecture preserved | |
| `validation.ts` | REDESIGNED — Phase 1 + Phase 7: theme engine token values; architecture preserved | |
| `yamlTheme.test.ts` | NOT_APPLICABLE (test file) | |
| `yamlTheme.ts` | REDESIGNED — Phase 1 + Phase 7: theme engine token values; architecture preserved | |

## `src/theme/builtins/` (44 files)

| File | Status | Phase/Notes |
|---|---|---|
| `amberArchive.ts` | REDESIGNED — Phase 1 + Phase 7: theme engine token values; architecture preserved | |
| `arcticGlass.ts` | REDESIGNED — Phase 1 + Phase 7: theme engine token values; architecture preserved | |
| `auroraBoreal.ts` | REDESIGNED — Phase 1 + Phase 7: theme engine token values; architecture preserved | |
| `basaltNoir.ts` | REDESIGNED — Phase 1 + Phase 7: theme engine token values; architecture preserved | |
| `catppuccin.ts` | REDESIGNED — Phase 1 + Phase 7: theme engine token values; architecture preserved | |
| `circuitMint.ts` | REDESIGNED — Phase 1 + Phase 7: theme engine token values; architecture preserved | |
| `copper.ts` | REDESIGNED — Phase 1 + Phase 7: theme engine token values; architecture preserved | |
| `cottonCandyConsole.ts` | REDESIGNED — Phase 1 + Phase 7: theme engine token values; architecture preserved | |
| `cyberOrchid.ts` | REDESIGNED — Phase 1 + Phase 7: theme engine token values; architecture preserved | |
| `dark.ts` | REDESIGNED — Phase 1 + Phase 7: theme engine token values; architecture preserved | |
| `desertCopperfield.ts` | REDESIGNED — Phase 1 + Phase 7: theme engine token values; architecture preserved | |
| `dracula.ts` | REDESIGNED — Phase 1 + Phase 7: theme engine token values; architecture preserved | |
| `dualPersona.ts` | REDESIGNED — Phase 1 + Phase 7: theme engine token values; architecture preserved | |
| `emberMonastery.ts` | REDESIGNED — Phase 1 + Phase 7: theme engine token values; architecture preserved | |
| `githubLight.ts` | REDESIGNED — Phase 1 + Phase 7: theme engine token values; architecture preserved | |
| `glacialInk.ts` | REDESIGNED — Phase 1 + Phase 7: theme engine token values; architecture preserved | |
| `gruvboxDark.ts` | REDESIGNED — Phase 1 + Phase 7: theme engine token values; architecture preserved | |
| `harborFog.ts` | REDESIGNED — Phase 1 + Phase 7: theme engine token values; architecture preserved | |
| `index.ts` | REDESIGNED — Phase 1 + Phase 7: theme engine token values; architecture preserved | |
| `light.ts` | REDESIGNED — Phase 1 + Phase 7: theme engine token values; architecture preserved | |
| `midnightCobalt.ts` | REDESIGNED — Phase 1 + Phase 7: theme engine token values; architecture preserved | |
| `midnightVelvet.ts` | REDESIGNED — Phase 1 + Phase 7: theme engine token values; architecture preserved | |
| `monokai.ts` | REDESIGNED — Phase 1 + Phase 7: theme engine token values; architecture preserved | |
| `mossCircuit.ts` | REDESIGNED — Phase 1 + Phase 7: theme engine token values; architecture preserved | |
| `neonDusk.ts` | REDESIGNED — Phase 1 + Phase 7: theme engine token values; architecture preserved | |
| `nord.ts` | REDESIGNED — Phase 1 + Phase 7: theme engine token values; architecture preserved | |
| `obsidianBloom.ts` | REDESIGNED — Phase 1 + Phase 7: theme engine token values; architecture preserved | |
| `obsidianEmber.ts` | REDESIGNED — Phase 1 + Phase 7: theme engine token values; architecture preserved | |
| `oneDark.ts` | REDESIGNED — Phase 1 + Phase 7: theme engine token values; architecture preserved | |
| `polaroidBoard.ts` | REDESIGNED — Phase 1 + Phase 7: theme engine token values; architecture preserved | |
| `porcelainDaybreak.ts` | REDESIGNED — Phase 1 + Phase 7: theme engine token values; architecture preserved | |
| `porcelainSky.ts` | REDESIGNED — Phase 1 + Phase 7: theme engine token values; architecture preserved | |
| `rosepine.ts` | REDESIGNED — Phase 1 + Phase 7: theme engine token values; architecture preserved | |
| `sakuraTerminal.ts` | REDESIGNED — Phase 1 + Phase 7: theme engine token values; architecture preserved | |
| `sandstone.ts` | REDESIGNED — Phase 1 + Phase 7: theme engine token values; architecture preserved | |
| `solarAsh.ts` | REDESIGNED — Phase 1 + Phase 7: theme engine token values; architecture preserved | |
| `solarized.ts` | REDESIGNED — Phase 1 + Phase 7: theme engine token values; architecture preserved | |
| `sweetNightmare.ts` | REDESIGNED — Phase 1 + Phase 7: theme engine token values; architecture preserved | |
| `synthwaveHarbor.ts` | REDESIGNED — Phase 1 + Phase 7: theme engine token values; architecture preserved | |
| `terminalForest.ts` | REDESIGNED — Phase 1 + Phase 7: theme engine token values; architecture preserved | |
| `tokyoNight.ts` | REDESIGNED — Phase 1 + Phase 7: theme engine token values; architecture preserved | |
| `toxicLimewire.ts` | REDESIGNED — Phase 1 + Phase 7: theme engine token values; architecture preserved | |
| `ultravioletRain.ts` | REDESIGNED — Phase 1 + Phase 7: theme engine token values; architecture preserved | |
| `venice.ts` | REDESIGNED — Phase 1: default family retuned to graphite/crimson reference palette | |

## `src/theme/yaml/` (10 files)

| File | Status | Phase/Notes |
|---|---|---|
| `index.ts` | REDESIGNED — Phase 1 + Phase 7: theme engine token values; architecture preserved | |
| `legacy.ts` | REDESIGNED — Phase 1 + Phase 7: theme engine token values; architecture preserved | |
| `normalize.test.ts` | NOT_APPLICABLE (test file) | |
| `normalize.ts` | REDESIGNED — Phase 1 + Phase 7: theme engine token values; architecture preserved | |
| `parse.test.ts` | NOT_APPLICABLE (test file) | |
| `parse.ts` | REDESIGNED — Phase 1 + Phase 7: theme engine token values; architecture preserved | |
| `serialize.test.ts` | NOT_APPLICABLE (test file) | |
| `serialize.ts` | REDESIGNED — Phase 1 + Phase 7: theme engine token values; architecture preserved | |
| `validate.test.ts` | NOT_APPLICABLE (test file) | |
| `validate.ts` | REDESIGNED — Phase 1 + Phase 7: theme engine token values; architecture preserved | |

## `tests/theme/` (1 files)

| File | Status | Phase/Notes |
|---|---|---|
| `venice-builtin.test.ts` | NOT_APPLICABLE (test file) | relocated from src/theme/builtins/ in Phase 1 (verify:theme-tokens family-shape scope) |

## `tests/accessibility/` (5 files)

| File | Status | Phase/Notes |
|---|---|---|
| `reduced-motion.test.tsx` | INHERITS_GLOBAL_SYSTEM | pre-existing Phase 8 a11y test, retained unchanged |
| `theme-focus.test.ts` | INHERITS_GLOBAL_SYSTEM | pre-existing Phase 8 a11y test, retained unchanged |
| `reference-rtl-shell.test.tsx` | REDESIGNED — Phase 8: RTL shell regression guards (3 tests) |
| `reference-viewport.test.tsx` | REDESIGNED — Phase 8: viewport collapse regression guards (2 tests) |
| `reference-keyboard-nav.test.tsx` | REDESIGNED — Phase 8: keyboard Tab/Shift+Tab regression guards (3 tests) |
| `reference-focus-restore.test.tsx` | REDESIGNED — Phase 8: InspectorPane close + AccessibleDialog role guards (3 tests) |
| `reference-aria-live.test.tsx` | REDESIGNED — Phase 8: ToastViewport aria-live=polite regression guards (2 tests) |

## `tests/chat/` (1 files)

| File | Status | Phase/Notes |
|---|---|---|
| `referenceChatFamily.test.tsx` | REDESIGNED — Phase 3: chat-family surface invariant suite |

## `tests/shell/` (1 files)

| File | Status | Phase/Notes |
|---|---|---|
| `referenceShell.test.tsx` | REDESIGNED — Phase 2: shell navigation/resize/accessibility invariant suite |
