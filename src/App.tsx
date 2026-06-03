// Code Owner: fayeblade (@spearchucker667)
// Root application shell — all state, routing, and bridge initialization lives here.
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
import { BatchModule } from "./modules/BatchModule";
import { SearchScrapeModule } from "./modules/SearchScrapeModule";
import { ModelsModule } from "./modules/ModelsModule";
import { GalleryModule } from "./modules/GalleryModule";
import { SettingsModule } from "./modules/SettingsModule";
import { DiagnosticsModule } from "./modules/DiagnosticsModule";
import { TABS } from "./constants/venice";
import { ToastHost } from "./components/ToastHost";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { FirstRunModal } from "./components/FirstRunModal";
import { VeniceShell } from "./components/VeniceShell";
import { initDesktopBridge, isElectron, desktopApiKey } from "./services/desktopBridge";
import { warn } from "./shared/logger";
import { FIRST_RUN_ACK_KEY } from "./shared/legal";
import { GalleryImage, ChatHistoryItem } from "./types/storage";
import { listConversations, saveConversation, createConversation } from "./services/chatStorage";
import type { ConversationMessage } from "./types/conversation";


type SettingsRecord = { id: string; timestamp: number; value?: Record<string, unknown> };

export default function App() {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const [apiKeyConfigured, setApiKeyConfigured] = useState<boolean | null>(null);
  // bridgeReady gates all initial API calls: in web mode it is true immediately
  // (bridge init is a no-op); in Electron it becomes true once preload diagnostics resolve.
  const [bridgeReady, setBridgeReady] = useState(!isElectron());
  const [firstRunRouted, setFirstRunRouted] = useState(false);
  const [dbReady, setDbReady] = useState(false);
  const [settingsHydrated, setSettingsHydrated] = useState(false);
  const [showFirstRun, setShowFirstRun] = useState(false);

  useThemeLifecycle(state.settings, settingsHydrated);
  useNetworkStatus(dispatch);

  // Initialise the desktop bridge (no-op in web mode)
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
        if (mounted) {
          setBridgeReady(true);
        }
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

        // Load conversations (Electron filesystem or IndexedDB fallback)
        let conversations = await listConversations();

        // Migrate old flat chat history into a default conversation if none exist yet
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
          // Web mode uses the server-side .env key; no local key check needed.
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
    return () => {
      mounted = false;
    };
  }, []);

  // Gate initial model refresh until the proxy URL is resolved (critical in Electron)
  useEffect(() => {
    if (!bridgeReady) return;
    refreshModels(dispatch).catch(() => {});
  }, [bridgeReady]);

  // Auto-fetch models when API key becomes configured
  useEffect(() => {
    if (apiKeyConfigured && bridgeReady && state.usingFallbackModels) {
      refreshModels(dispatch, true).catch(() => {});
    }
  }, [apiKeyConfigured, bridgeReady, state.usingFallbackModels]);

  // LOW-004: Detect auto-switched models after SET_MODELS and dispatch toasts from
  // the component layer instead of inside the reducer, keeping the reducer pure.
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

  // First-run legal acknowledgment
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

  return (
    <VeniceShell state={state} dispatch={dispatch} apiKeyConfigured={apiKeyConfigured}>
      {/* Workspace Content */}
      <main className="relative flex min-w-0 flex-1 flex-col overflow-y-auto bg-transparent">
        <ErrorBoundary onReset={() => dispatch({ type: "SET_TAB", tab: "chat" })}>
          {isElectron() && apiKeyConfigured === false && (
            <div className="m-4 rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm leading-relaxed text-warning shadow-sm">
              Venice Forge needs a Venice API key before model, chat, image, video, batch, and research requests can run. Add it in Config, then use Test connection.
            </div>
          )}

          {/* Mobile horizontal tabs (small screens only) */}
          <nav className="sticky top-0 z-10 flex gap-3 overflow-x-auto border-b border-border/40 bg-bg p-4 md:hidden">
            {TABS.map(([id, label]) => (
              <button
                key={id}
                onClick={() => dispatch({ type: "SET_TAB", tab: id })}
                className={`shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-all ${
                  state.activeTab === id
                    ? "bg-accent/20 text-accent-fg border border-accent/30"
                    : "bg-transparent text-text-secondary hover:bg-surface-elevated hover:text-text-primary"
                }`}
              >
                {label}
              </button>
            ))}
          </nav>
            {state.activeTab === "chat" && <ChatModule state={state} dispatch={dispatch} />}
            {state.activeTab === "image" && <ImageModule state={state} dispatch={dispatch} />}
            {state.activeTab === "video" && <VideoModule state={state} dispatch={dispatch} />}
            {state.activeTab === "audio" && <AudioModule state={state} dispatch={dispatch} />}
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
      <ToastHost state={state} dispatch={dispatch} />
      <FirstRunModal
        open={showFirstRun}
        onAcknowledge={acknowledgeFirstRun}
        onDismiss={() => {
          setShowFirstRun(false);
        }}
      />
      {!state.isOnline && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-0 left-0 right-0 z-[1000] bg-warning/90 px-4 py-3 text-center font-display text-[13px] font-bold uppercase tracking-widest text-accent-fg shadow-[0_-4px_20px_var(--glow)] backdrop-blur-xl"
        >
          You are offline. API requests are unavailable until connectivity is restored.
        </div>
      )}
    </VeniceShell>
  );
}
