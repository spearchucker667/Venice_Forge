import React, { useEffect, useReducer, useRef, useState } from "react";
import { appReducer, initialState } from "./state/appReducer";
import { validateAppSettings } from "./shared/configSchema";
import StorageService from "./services/storageService";
import { refreshModels } from "./services/modelService";
import { useNetworkStatus } from "./hooks/useNetworkStatus";
import { useSettingsPersistence } from "./hooks/useSettingsPersistence";
import { useThemeLifecycle } from "./hooks/useThemeLifecycle";
import { ChatModule } from "./modules/ChatModule";
import { ImageModule } from "./modules/ImageModule";
import { VideoModule } from "./modules/VideoModule";
import { AudioModule } from "./modules/AudioModule";
import { MusicModule } from "./modules/MusicModule";
import { EmbeddingsModule } from "./modules/EmbeddingsModule";
import { BatchModule } from "./modules/BatchModule";
import { SearchScrapeModule } from "./modules/SearchScrapeModule";
import { ModelsModule } from "./modules/ModelsModule";
import { GalleryModule } from "./modules/GalleryModule";
import { SettingsModule } from "./modules/SettingsModule";
import { DiagnosticsModule } from "./modules/DiagnosticsModule";
import { WorkflowsView } from "./modules/workflows/workflows-view";
import { PlaygroundView } from "./modules/playground/playground-view";
import { TABS } from "./constants/venice";
import { ToastHost } from "./components/ToastHost";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { FirstRunModal } from "./components/FirstRunModal";
import { VeniceSidebar } from "./components/VeniceSidebar";
import { VeniceHeader } from "./components/VeniceHeader";
import { initDesktopBridge, isElectron, desktopApiKey } from "./services/desktopBridge";
import { warn } from "./shared/logger";
import { FIRST_RUN_ACK_KEY } from "./shared/legal";
import { GalleryImage, ChatHistoryItem } from "./types/storage";
import { listConversations, saveConversation, createConversation } from "./services/chatStorage";
import type { ConversationMessage } from "./types/conversation";
import type { ModelInfo } from "./types/venice";

type SettingsRecord = { id: string; timestamp: number; value?: Record<string, unknown> };

const TAB_SUBTITLES: Record<string, string> = {
  chat: 'Conversational AI',
  image: 'Generate images from text',
  video: 'Generate video clips',
  audio: 'Text-to-speech and transcription',
  music: 'AI music generation',
  workflows: 'Create and run AI pipelines',
  playground: 'Experiment with Agent Workflows',
  embeddings: 'Generate vector embeddings',
  batch: 'Batch operations',
  search: 'Search and scrape',
  models: 'Browse available models',
  gallery: 'Your generated media',
  settings: 'Configure application',
  diagnostics: 'System status',
};

const noModelSelectorTabs = new Set(["batch", "search", "gallery", "settings", "diagnostics", "audio", "music", "embeddings"]);

export default function App() {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const [apiKeyConfigured, setApiKeyConfigured] = useState<boolean | null>(null);
  const [bridgeReady, setBridgeReady] = useState(!isElectron());
  const [firstRunRouted, setFirstRunRouted] = useState(false);
  const [dbReady, setDbReady] = useState(false);
  const [settingsHydrated, setSettingsHydrated] = useState(false);
  const [showFirstRun, setShowFirstRun] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  useThemeLifecycle(state.settings, settingsHydrated);
  useNetworkStatus(dispatch);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await initDesktopBridge();
        if (!mounted) return;
        if (isElectron()) {
          const configured = await desktopApiKey.isConfigured().catch(() => false);
          if (mounted) setApiKeyConfigured(configured);
        }
      } catch (err) {
        warn("Desktop bridge init failed", err);
        if (!mounted) return;
        if (isElectron()) setApiKeyConfigured(false);
        dispatch({
          type: "ADD_TOAST",
          toast: {
            id: crypto.randomUUID(),
            message: "Desktop bridge diagnostics failed. Continuing with degraded startup checks.",
            type: "warn",
            duration: 7000,
          },
        });
      } finally {
        if (mounted) setBridgeReady(true);
      }
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await StorageService.openDB();
        const [imagesResult, chatsResult, settingsResult, filesResult] = await Promise.all([
          StorageService.getItemsWithMeta("images"),
          StorageService.getItemsWithMeta("chats"),
          StorageService.getItemsWithMeta("settings"),
          StorageService.getItemsWithMeta("files"),
        ]);
        const images = imagesResult.items as GalleryImage[];
        const chats = chatsResult.items as ChatHistoryItem[];
        const settingsItems = settingsResult.items as SettingsRecord[];
        const files = filesResult.items as import("./types/storage").FileRecord[];
        const totalDecryptFailures =
          imagesResult.decryptFailures + chatsResult.decryptFailures + settingsResult.decryptFailures + filesResult.decryptFailures;
        if (!mounted) return;
        dispatch({ type: "SET_GALLERY", items: images });
        dispatch({ type: "SET_FILES", items: files });
        dispatch({ type: "SET_CHATS", items: chats });
        const latestSettings = settingsItems.find(i => i.id === "app-settings")?.value;
        if (latestSettings) {
          const valid = validateAppSettings(latestSettings);
          dispatch({ type: "SET_SETTINGS", settings: valid });
        }

        let conversations = await listConversations();

        if (conversations.length === 0 && chats.length > 0) {
          const lastChat = chats.reduce((latest, c) => (c.timestamp > latest.timestamp ? c : latest), chats[0]);
          const migrated = createConversation(
            lastChat?.model || state.selectedChatModel,
            (latestSettings as Record<string, unknown>)?.defaultSystemPrompt as string || ""
          );
          migrated.title = "Migrated History";
          migrated.messages = chats
            .sort((a, b) => a.timestamp - b.timestamp)
            .flatMap((c) => {
              const msgs: ConversationMessage[] = [];
              if (c.prompt) msgs.push({ id: crypto.randomUUID(), role: "user", content: c.prompt, timestamp: c.timestamp });
              if (c.response) msgs.push({ id: crypto.randomUUID(), role: "assistant", content: c.response, timestamp: c.timestamp });
              return msgs;
            });
          migrated.updatedAt = Date.now();
          if (migrated.messages.length > 0) {
            await saveConversation(migrated);
            conversations = [migrated];
            dispatch({
              type: "ADD_TOAST",
              toast: {
                id: crypto.randomUUID(),
                message: `Migrated ${chats.length} chat record(s) into a new conversation.`,
                type: "info",
                duration: 6000,
              },
            });
          }
        }

        dispatch({ type: "SET_CONVERSATIONS", items: conversations });
        if (conversations.length > 0 && !state.activeConversationId) {
          dispatch({ type: "SET_ACTIVE_CONVERSATION", id: conversations[0].id });
        }

        if (totalDecryptFailures > 0) {
          dispatch({
            type: "ADD_TOAST",
            toast: {
              id: crypto.randomUUID(),
              message:
                `${totalDecryptFailures} local record(s) could not be decrypted and were skipped. ` +
                "This can happen after key-store or profile changes.",
              type: "warn",
              duration: 9000,
            },
          });
        }

        if (!isElectron()) {
          setApiKeyConfigured(true);
        }

        if (mounted) {
          setDbReady(true);
          setSettingsHydrated(true);
        }
      } catch (err) {
        warn("IndexedDB init failed", err);
        if (mounted) {
          setSettingsHydrated(true);
        }
        dispatch({
          type: "ADD_TOAST",
          toast: {
            id: crypto.randomUUID(),
            message: "Local storage (IndexedDB) could not be opened. History and gallery will not persist.",
            type: "error",
            duration: 8000,
          },
        });
      }
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!bridgeReady) return;
    refreshModels(dispatch).catch(() => {});
  }, [bridgeReady]);

  useEffect(() => {
    if (apiKeyConfigured && bridgeReady && state.usingFallbackModels) {
      refreshModels(dispatch, true).catch(() => {});
    }
  }, [apiKeyConfigured, bridgeReady, state.usingFallbackModels]);

  const prevChatModelRef = useRef(state.selectedChatModel);
  const prevImageModelRef = useRef(state.selectedImageModel);
  const prevVideoModelRef = useRef(state.selectedVideoModel);
  const prevModelsRef = useRef(state.models);
  useEffect(() => {
    const modelsChanged = prevModelsRef.current !== state.models;
    if (modelsChanged) {
      if (prevChatModelRef.current !== state.selectedChatModel) {
        dispatch({
          type: "ADD_TOAST",
          toast: {
            id: crypto.randomUUID(),
            message: `Previous chat model was unavailable. Switched to ${state.selectedChatModel}.`,
            type: "warn",
            duration: 6000,
          },
        });
      }
      if (prevImageModelRef.current !== state.selectedImageModel) {
        dispatch({
          type: "ADD_TOAST",
          toast: {
            id: crypto.randomUUID(),
            message: `Previous image model was unavailable. Switched to ${state.selectedImageModel}.`,
            type: "warn",
            duration: 6000,
          },
        });
      }
      if (prevVideoModelRef.current !== state.selectedVideoModel) {
        dispatch({
          type: "ADD_TOAST",
          toast: {
            id: crypto.randomUUID(),
            message: `Previous video model was unavailable. Switched to ${state.selectedVideoModel}.`,
            type: "warn",
            duration: 6000,
          },
        });
      }
    }
    prevChatModelRef.current = state.selectedChatModel;
    prevImageModelRef.current = state.selectedImageModel;
    prevVideoModelRef.current = state.selectedVideoModel;
    prevModelsRef.current = state.models;
  }, [state.models, state.selectedChatModel, state.selectedImageModel, state.selectedVideoModel]);

  useEffect(() => {
    if (isElectron() && apiKeyConfigured === false && !firstRunRouted) {
      dispatch({ type: "SET_TAB", tab: "settings" });
      setFirstRunRouted(true);
    }
  }, [apiKeyConfigured, firstRunRouted]);

  useSettingsPersistence(state.settings, dbReady, settingsHydrated, dispatch);

  useEffect(() => {
    if (!settingsHydrated) return;
    try {
      const ack = localStorage.getItem(FIRST_RUN_ACK_KEY);
      if (!ack) setShowFirstRun(true);
    } catch {
      // Storage unavailable — don't block the app
    }
  }, [settingsHydrated]);

  function acknowledgeFirstRun() {
    try {
      localStorage.setItem(FIRST_RUN_ACK_KEY, "1");
    } catch {
      // Best-effort persistence
    }
    setShowFirstRun(false);
  }

  const handleOpenApiKey = () => {
    dispatch({ type: "SET_TAB", tab: "settings" });
  };

  const activeTabLabel = TABS.find(([id]) => id === state.activeTab)?.[1] || "";
  const activeTabSubtitle = TAB_SUBTITLES[state.activeTab] || "";
  const showModelSelector = !noModelSelectorTabs.has(state.activeTab);
  const modelTypeMap: Record<string, string> = {
    chat: 'text',
    image: 'image',
    video: 'video',
    audio: 'tts',
  };
  const currentModelType = modelTypeMap[state.activeTab] || 'text';
  const currentModel = state.activeTab === 'chat' ? state.selectedChatModel :
                       state.activeTab === 'image' ? state.selectedImageModel :
                       state.activeTab === 'video' ? state.selectedVideoModel : '';

  return (
    <div className="flex h-[100dvh] w-screen overflow-hidden" style={{ background: 'var(--bg)' }}>
      {mobileSidebarOpen && (
        <button
          aria-label="Close menu"
          className="md:hidden fixed inset-0 z-30"
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      <VeniceSidebar
        state={state}
        dispatch={dispatch}
        onMobileClose={() => setMobileSidebarOpen(false)}
      />

      <div className="flex flex-col flex-1 min-w-0">
        <VeniceHeader
          activeTabLabel={activeTabLabel}
          activeTabSubtitle={activeTabSubtitle}
          showModelSelector={showModelSelector}
          modelType={currentModelType}
          currentModel={currentModel}
          models={state.models as { text: ModelInfo[]; image: ModelInfo[]; video: ModelInfo[] }}
          onModelChange={(model) => {
            if (state.activeTab === 'chat') dispatch({ type: "SET_SELECTED_CHAT_MODEL", model });
            else if (state.activeTab === 'image') dispatch({ type: "SET_SELECTED_IMAGE_MODEL", model });
            else if (state.activeTab === 'video') dispatch({ type: "SET_SELECTED_VIDEO_MODEL", model });
          }}
          apiKeyConfigured={apiKeyConfigured}
          onOpenApiKey={handleOpenApiKey}
          onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
        />

        <main className="flex-1 min-h-0 overflow-hidden">
          <ErrorBoundary onReset={() => dispatch({ type: "SET_TAB", tab: "chat" })}>
            {isElectron() && apiKeyConfigured === false && (
              <div
                className="mx-4 mt-4 rounded-xl p-4 text-sm leading-relaxed shadow-sm"
                style={{
                  border: '1px solid var(--warning)',
                  background: 'rgba(212, 168, 67, 0.1)',
                  color: 'var(--warning)'
                }}
              >
                Venice Forge needs a Venice API key before model, chat, image, video, batch, and research requests can run. Add it in Settings, then use Test connection.
              </div>
            )}

            {state.activeTab === "chat" && <ChatModule state={state} dispatch={dispatch} />}
            {state.activeTab === "image" && <ImageModule state={state} dispatch={dispatch} />}
            {state.activeTab === "video" && <VideoModule state={state} dispatch={dispatch} />}
            {state.activeTab === "audio" && <AudioModule state={state} dispatch={dispatch} />}
            {state.activeTab === "music" && <MusicModule state={state} dispatch={dispatch} />}
            {state.activeTab === "workflows" && <WorkflowsView state={state} dispatch={dispatch} />}
            {state.activeTab === "playground" && <PlaygroundView state={state} dispatch={dispatch} />}
            {state.activeTab === "embeddings" && <EmbeddingsModule state={state} dispatch={dispatch} />}
            {state.activeTab === "batch" && <BatchModule state={state} dispatch={dispatch} />}
            {state.activeTab === "search" && <SearchScrapeModule state={state} dispatch={dispatch} />}
            {state.activeTab === "models" && <ModelsModule state={state} dispatch={dispatch} />}
            {state.activeTab === "gallery" && <GalleryModule state={state} dispatch={dispatch} />}
            {state.activeTab === "settings" && (
              <SettingsModule state={state} dispatch={dispatch} apiKeyConfigured={apiKeyConfigured} onApiKeyChange={setApiKeyConfigured} />
            )}
            {state.activeTab === "diagnostics" && (
              <DiagnosticsModule state={state} dispatch={dispatch} apiKeyConfigured={apiKeyConfigured} />
            )}
          </ErrorBoundary>
        </main>
      </div>

      <ToastHost state={state} dispatch={dispatch} />
      <FirstRunModal
        open={showFirstRun}
        onAcknowledge={acknowledgeFirstRun}
        onDismiss={() => setShowFirstRun(false)}
      />
      {!state.isOnline && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-0 left-0 right-0 z-[1000] px-4 py-3 text-center shadow-lg"
          style={{
            background: 'rgba(212, 168, 67, 0.9)',
            backdropFilter: 'blur(12px)',
            color: 'var(--accent-fg)',
            fontFamily: 'var(--display)',
            fontSize: '13px',
            fontWeight: 700,
            letterSpacing: '0.05em',
            textTransform: 'uppercase'
          }}
        >
          You are offline. API requests are unavailable until connectivity is restored.
        </div>
      )}
    </div>
  );
}