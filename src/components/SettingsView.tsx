import React, { useState, useEffect, useRef } from "react";
import { useAuthStore } from "../stores/auth-store";
import { useChatStore } from "../stores/chat-store";
import { useSettingsStore } from "../stores/settings-store";
import { useModels } from "../hooks/use-models";
import { ModelSelect } from "./ModelSelect";
import { ThemeMaker } from "./ThemeMaker";
import { ConfirmModal } from "./ConfirmModal";
import { toast } from "../stores/toast-store";
import { isElectron, desktopApiKey, desktopJinaApiKey, desktopApp, desktopFiles, desktopUpdates } from "../services/desktopBridge";
import { listConversations, saveConversation } from "../services/chatStorage";
import { listMemories, upsertMemory } from "../services/memoryService";
import { createExportPayload, validateImportJson } from "../services/exportImport";
import StorageService from "../services/storageService";
import { STORE_NAMES } from "../constants/venice";
import { APP_NAME, OFFICIAL_LINKS, FIRST_RUN_ACK_KEY } from "../shared/legal";
import type { UpdateInfo, ProgressInfo } from "electron-updater";

type PendingConfirm = { message: string; detail?: string; onConfirm: () => Promise<void> | void };

export function SettingsView() {
  const { isConfigured: veniceConfigured, setApiKey, clearApiKey } = useAuthStore();
  const { selectedModels, setSelectedModel } = useSettingsStore();
  
  // Chat store settings
  const { 
    systemPrompt, 
    setSystemPrompt, 
    veniceParams, 
    setVeniceParams 
  } = useChatStore();

  const [activeSection, setActiveSection] = useState("api-keys");
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);

  // Venice key entry state
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [apiKeyTesting, setApiKeyTesting] = useState(false);

  // Jina key state
  const [jinaKeyInput, setJinaKeyInput] = useState("");
  const [jinaKeyTesting, setJinaKeyTesting] = useState(false);
  const [jinaKeyConfigured, setJinaKeyConfigured] = useState<boolean | null>(null);

  // Updates state (Electron only)
  const [updateStatus, setUpdateStatus] = useState("");
  const [isUpdateChecking, setIsUpdateChecking] = useState(false);
  const [updateDownloaded, setUpdateDownloaded] = useState(false);
  const updateEventSeenRef = useRef(false);

  // Load models
  const { data: textModels } = useModels("text");
  const { data: imageModels } = useModels("image");

  const currentChatModel = selectedModels["chat"] || textModels?.[0]?.id || "";
  const currentImageModel = selectedModels["image"] || imageModels?.[0]?.id || "";

  // Check Jina configuration on mount
  useEffect(() => {
    if (!isElectron()) return;
    let mounted = true;
    desktopJinaApiKey.isConfigured().then((v) => {
      if (mounted) setJinaKeyConfigured(v);
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Update listeners for Electron
  useEffect(() => {
    if (!isElectron()) return;

    const unsubs = [
      desktopUpdates.onUpdateAvailable((info: UpdateInfo) => {
        updateEventSeenRef.current = true;
        setUpdateStatus(`Update available: v${info?.version || "new"}`);
        setIsUpdateChecking(false);
      }),
      desktopUpdates.onUpdateNotAvailable(() => {
        updateEventSeenRef.current = true;
        setUpdateStatus("App is up to date.");
        setIsUpdateChecking(false);
      }),
      desktopUpdates.onDownloadProgress((progress: ProgressInfo) => {
        updateEventSeenRef.current = true;
        setUpdateStatus(`Downloading update: ${Math.round(progress?.percent || 0)}%`);
      }),
      desktopUpdates.onUpdateDownloaded(() => {
        updateEventSeenRef.current = true;
        setUpdateStatus("Update downloaded and ready to install.");
        setUpdateDownloaded(true);
        setIsUpdateChecking(false);
      }),
      desktopUpdates.onUpdateError((err: string) => {
        updateEventSeenRef.current = true;
        setUpdateStatus(`Update error: ${err}`);
        setIsUpdateChecking(false);
      }),
    ];

    return () => unsubs.forEach((unsub) => unsub());
  }, []);

  async function checkForUpdates() {
    setIsUpdateChecking(true);
    updateEventSeenRef.current = false;
    setUpdateStatus("Checking for updates...");
    try {
      const res = await desktopUpdates.checkForUpdates();
      if (!res.ok) {
        const raw = res.error ?? "Unknown error";
        const msg = raw.startsWith("Error: ") ? raw.slice(7) : raw;
        setUpdateStatus(`Update check failed: ${msg}`);
      } else if (!updateEventSeenRef.current) {
        setUpdateStatus("Update check completed.");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown update error";
      setUpdateStatus(`Update check failed: ${message}`);
    } finally {
      setIsUpdateChecking(false);
    }
  }

  async function installUpdate() {
    try {
      await desktopUpdates.installUpdate();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown install error";
      setUpdateStatus(`Install failed: ${message}`);
    }
  }

  // Key operations
  async function handleSaveApiKey() {
    if (!apiKeyInput.trim()) return;
    try {
      await setApiKey(apiKeyInput.trim());
      setApiKeyInput("");
      toast.success("Venice API key saved securely.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save API key.");
    }
  }

  async function handleDeleteApiKey() {
    setPendingConfirm({
      message: "Delete Venice API key?",
      detail: "This will remove your Venice API key from OS secure storage. You will need to re-enter it to make requests.",
      onConfirm: async () => {
        try {
          await clearApiKey();
          toast.success("Venice API key deleted.");
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Failed to delete API key.");
        }
      }
    });
  }

  async function handleTestApiKey() {
    setApiKeyTesting(true);
    try {
      const result = await desktopApiKey.test();
      if (result.ok) {
        toast.success(`Connection successful${result.status ? ` (HTTP ${result.status})` : ""}.`);
      } else {
        toast.error(`Connection failed: ${result.message}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Test connection failed.");
    } finally {
      setApiKeyTesting(false);
    }
  }

  async function handleSaveJinaKey() {
    if (!jinaKeyInput.trim()) return;
    try {
      await desktopJinaApiKey.set(jinaKeyInput.trim());
      setJinaKeyInput("");
      setJinaKeyConfigured(true);
      toast.success("Jina API key saved securely.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save Jina API key.");
    }
  }

  async function handleDeleteJinaKey() {
    setPendingConfirm({
      message: "Delete Jina API key?",
      detail: "This will remove your Jina API key from OS secure storage.",
      onConfirm: async () => {
        try {
          await desktopJinaApiKey.delete();
          setJinaKeyConfigured(false);
          toast.success("Jina API key deleted.");
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Failed to delete Jina API key.");
        }
      }
    });
  }

  async function handleTestJinaKey() {
    setJinaKeyTesting(true);
    try {
      const result = await desktopJinaApiKey.test();
      if (result.ok) {
        toast.success(`Jina connection successful${result.status ? ` (HTTP ${result.status})` : ""}.`);
      } else {
        toast.error(`Jina connection failed: ${result.message}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Jina test connection failed.");
    } finally {
      setJinaKeyTesting(false);
    }
  }

  // Data & Storage operations
  async function clearLocalSettings() {
    setPendingConfirm({
      message: "Clear local settings?",
      detail: "This will reset default system prompts, citation toggles, and UI model configurations to standard defaults.",
      onConfirm: async () => {
        await StorageService.clearStore("settings");
        setSystemPrompt("");
        setVeniceParams({
          include_venice_system_prompt: false,
          enable_web_search: "off",
          enable_web_citations: false,
        });
        toast.success("Local settings cleared.");
      }
    });
  }

  async function clearAllHistory() {
    setPendingConfirm({
      message: "Delete all IndexedDB history?",
      detail: "This will permanently delete all saved images, chats, configurations, and settings from local database. This cannot be undone.",
      onConfirm: async () => {
        await Promise.all(
          STORE_NAMES.map((store) => StorageService.clearStore(store))
        );
        useChatStore.setState({ conversations: [], activeConversationId: null });
        toast.success("IndexedDB history cleared successfully.");
      }
    });
  }

  async function exportData() {
    try {
      const [images, chats, settings, conversations, memories] = await Promise.all([
        StorageService.getItems("images"),
        StorageService.getItems("chats"),
        StorageService.getItems("settings"),
        listConversations(),
        listMemories(),
      ]);
      const appVersion = await desktopApp.getVersion();
      const payload = createExportPayload({ images, chats, settings, conversations, ai_memory: memories }, appVersion);
      const ok = await desktopFiles.exportJson(
        payload,
        `venice-forge-export-${new Date().toISOString().slice(0, 10)}.json`
      );
      if (ok) toast.success("Data exported successfully.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed.");
    }
  }

  async function importData() {
    try {
      const json = await desktopFiles.importJsonString();
      if (!json) return;
      const [imagesBefore, chatsBefore, settingsBefore, conversationsBefore, memoriesBefore] = await Promise.all([
        StorageService.getItems("images"),
        StorageService.getItems("chats"),
        StorageService.getItems("settings"),
        listConversations(),
        listMemories(),
      ]);
      const backup = createExportPayload(
        { images: imagesBefore, chats: chatsBefore, settings: settingsBefore, conversations: conversationsBefore, ai_memory: memoriesBefore },
        await desktopApp.getVersion()
      );

      const dateTimeStr = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
      const backupOk = await desktopFiles.exportJson(
        backup,
        `venice-forge-pre-import-backup-${dateTimeStr}.json`
      );
      if (!backupOk) {
        toast.error("Pre-import backup could not be saved. Import aborted.");
        return;
      }

      const { payload, summary } = validateImportJson(json);

      await Promise.all(payload.data.images.map((img) => StorageService.saveItem("images", img)));
      await Promise.all(payload.data.chats.map((chat) => StorageService.saveItem("chats", chat)));
      await Promise.all(payload.data.settings.map((s) => StorageService.saveItem("settings", s)));
      
      const convResults = await Promise.all(
        payload.data.conversations.map((conv) => saveConversation(conv as unknown as import("../types/conversation").Conversation))
      );
      const failedConvCount = convResults.filter((ok) => !ok).length;
      if (failedConvCount > 0) {
        throw new Error(`Failed to import ${failedConvCount} conversation(s).`);
      }

      await Promise.all(
        payload.data.ai_memory.map((mem) => {
          const id = typeof mem.id === "string" && mem.id ? mem.id : crypto.randomUUID();
          const createdAt = typeof mem.timestamp === "number" ? mem.timestamp : Date.now();
          return upsertMemory({
            id,
            content: (mem.content as string) || "",
            createdAt,
            tags: Array.isArray(mem.tags) ? (mem.tags as string[]) : [],
            conversationId: typeof mem.conversationId === "string" ? mem.conversationId : undefined,
          });
        })
      );

      // Hydrate stores
      const convs = await listConversations();
      useChatStore.setState({ conversations: convs });
      
      toast.success(
        `Imported ${summary.conversationsFound} conversations and ${summary.aiMemoryFound} memories successfully.`
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed.");
    }
  }

  const sectionButtonClass = (section: string) => `
    w-full text-left px-3.5 py-2 rounded-lg text-[13.5px] font-medium transition-all duration-150
    ${activeSection === section 
      ? "bg-white/[0.06] text-white border border-white/[0.04]" 
      : "text-white/50 hover:text-white/80 hover:bg-white/[0.02] border border-transparent"}
  `;

  return (
    <div className="flex flex-col h-full bg-surface">
      {/* Header */}
      <div className="flex-none p-5 border-b border-white/[0.05] bg-surface">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-[17px] font-semibold text-white/95">Config</h2>
            <p className="text-[12.5px] text-white/40 mt-0.5">
              {isElectron() ? "Manage API endpoints, defaults, and appearance styles." : "Configure default prompts and styling templates."}
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Navigation Rail */}
        <div className="w-52 border-r border-white/[0.05] p-3 space-y-1 overflow-y-auto shrink-0 hidden sm:block">
          <button onClick={() => setActiveSection("api-keys")} className={sectionButtonClass("api-keys")}>
            API Keys
          </button>
          <button onClick={() => setActiveSection("defaults")} className={sectionButtonClass("defaults")}>
            Defaults & Behavior
          </button>
          <button onClick={() => setActiveSection("appearance")} className={sectionButtonClass("appearance")}>
            Appearance
          </button>
          <button onClick={() => setActiveSection("data")} className={sectionButtonClass("data")}>
            Data & Storage
          </button>
          <button onClick={() => setActiveSection("about")} className={sectionButtonClass("about")}>
            About & Legal
          </button>
          {isElectron() && (
            <button onClick={() => setActiveSection("updates")} className={sectionButtonClass("updates")}>
              Updates
              {updateDownloaded && <span className="ml-2 inline-flex w-1.5 h-1.5 rounded-full bg-green-400"></span>}
            </button>
          )}
        </div>

        {/* Content panel */}
        <div className="flex-1 overflow-y-auto p-6 max-w-3xl">
          {activeSection === "api-keys" && (
            <div className="space-y-6">
              {/* Venice key */}
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 shadow-lg space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-[14.5px] font-medium text-white/85">Venice.ai Integration</h3>
                  <span className={`text-[11.5px] px-2 py-0.5 rounded font-medium ${veniceConfigured ? "bg-green-500/10 text-green-400 border border-green-500/20" : "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"}`}>
                    {veniceConfigured ? "Configured" : "Unset"}
                  </span>
                </div>
                <p className="text-[12.5px] text-white/40 leading-relaxed">
                  Your API key is saved using OS-level secure storage encryption and is never exposed to the web sandbox.
                </p>
                <div className="space-y-3">
                  {!veniceConfigured ? (
                    <div className="flex gap-2">
                      <input
                        type="password"
                        value={apiKeyInput}
                        onChange={(e) => setApiKeyInput(e.target.value)}
                        placeholder="sk-..."
                        autoComplete="off"
                        className="flex-1 bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-1.5 text-[13.5px] text-white outline-none focus:border-white/[0.2] transition-all font-mono"
                      />
                      <button 
                        onClick={handleSaveApiKey} 
                        disabled={!apiKeyInput.trim()}
                        className="px-4 py-1.5 rounded-lg text-[13px] font-medium bg-white text-black hover:bg-white/95 disabled:opacity-40 transition-colors"
                      >
                        Save Key
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        disabled
                        value="••••••••••••••••••••••••••••••••"
                        className="flex-1 bg-white/[0.01] border border-white/[0.04] rounded-lg px-3 py-1.5 text-[13.5px] text-white/30 font-mono"
                      />
                      <button 
                        onClick={handleTestApiKey} 
                        disabled={apiKeyTesting}
                        className="px-3.5 py-1.5 rounded-lg text-[13px] font-medium bg-white/[0.04] border border-white/[0.08] text-white/80 hover:bg-white/[0.08] transition-colors disabled:opacity-50"
                      >
                        {apiKeyTesting ? "Testing..." : "Test Key"}
                      </button>
                      <button 
                        onClick={handleDeleteApiKey} 
                        className="px-3.5 py-1.5 rounded-lg text-[13px] font-medium bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/25 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Jina key */}
              {isElectron() && (
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 shadow-lg space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[14.5px] font-medium text-white/85">Jina.ai Integration</h3>
                    <span className={`text-[11.5px] px-2 py-0.5 rounded font-medium ${jinaKeyConfigured ? "bg-green-500/10 text-green-400 border border-green-500/20" : "bg-white/[0.04] text-white/40 border border-white/[0.06]"}`}>
                      {jinaKeyConfigured ? "Configured" : "Optional"}
                    </span>
                  </div>
                  <p className="text-[12.5px] text-white/40 leading-relaxed">
                    Provides deep web searching, scraping, and social profile discovery mapping capabilities. Jina API keys are saved with the same OS secure storage.
                  </p>
                  <div className="space-y-3">
                    {!jinaKeyConfigured ? (
                      <div className="flex gap-2">
                        <input
                          type="password"
                          value={jinaKeyInput}
                          onChange={(e) => setJinaKeyInput(e.target.value)}
                          placeholder="jina_..."
                          autoComplete="off"
                          className="flex-1 bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-1.5 text-[13.5px] text-white outline-none focus:border-white/[0.2] transition-all font-mono"
                        />
                        <button 
                          onClick={handleSaveJinaKey} 
                          disabled={!jinaKeyInput.trim()}
                          className="px-4 py-1.5 rounded-lg text-[13px] font-medium bg-white text-black hover:bg-white/95 disabled:opacity-40 transition-colors"
                        >
                          Save Key
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          disabled
                          value="••••••••••••••••••••••••••••••••"
                          className="flex-1 bg-white/[0.01] border border-white/[0.04] rounded-lg px-3 py-1.5 text-[13.5px] text-white/30 font-mono"
                        />
                        <button 
                          onClick={handleTestJinaKey} 
                          disabled={jinaKeyTesting}
                          className="px-3.5 py-1.5 rounded-lg text-[13px] font-medium bg-white/[0.04] border border-white/[0.08] text-white/80 hover:bg-white/[0.08] transition-colors disabled:opacity-50"
                        >
                          {jinaKeyTesting ? "Testing..." : "Test Key"}
                        </button>
                        <button 
                          onClick={handleDeleteJinaKey} 
                          className="px-3.5 py-1.5 rounded-lg text-[13px] font-medium bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/25 transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeSection === "defaults" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-[12.5px] text-white/50 block mb-1.5 font-medium">Default Chat Model</label>
                  <ModelSelect
                    value={currentChatModel}
                    models={textModels || []}
                    onChange={(val) => setSelectedModel("chat", val)}
                  />
                </div>
                <div>
                  <label className="text-[12.5px] text-white/50 block mb-1.5 font-medium">Default Image Model</label>
                  <ModelSelect
                    value={currentImageModel}
                    models={imageModels || []}
                    onChange={(val) => setSelectedModel("image", val)}
                  />
                </div>
              </div>

              <div className="border-t border-white/[0.05] pt-5 space-y-4">
                <div>
                  <label className="text-[12.5px] text-white/50 block mb-1.5 font-medium">Default Web Search</label>
                  <select
                    value={veniceParams.enable_web_search || "off"}
                    onChange={(e) => setVeniceParams({ enable_web_search: e.target.value as "off" | "on" | "auto" })}
                    className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-3.5 py-2 text-[14px] text-white outline-none focus:border-white/[0.2] transition-all"
                  >
                    <option value="off">Off</option>
                    <option value="on">On</option>
                    <option value="auto">Auto</option>
                  </select>
                </div>

                <div>
                  <label className="text-[12.5px] text-white/50 block mb-1.5 font-medium">Default System Prompt</label>
                  <textarea
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    placeholder="You are a helpful assistant..."
                    rows={4}
                    className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-3.5 py-2 text-[14px] text-white outline-none focus:border-white/[0.2] transition-all placeholder:text-white/25 resize-none"
                  />
                </div>

                <div className="flex flex-col gap-3.5 p-4 rounded-xl border border-white/[0.06] bg-white/[0.02]">
                  <label className="flex items-center gap-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={veniceParams.include_venice_system_prompt !== false}
                      onChange={(e) => setVeniceParams({ include_venice_system_prompt: e.target.checked })}
                      className="rounded border-white/[0.08] bg-white/[0.02] text-white focus:ring-offset-0 focus:ring-0 w-4 h-4"
                    />
                    <span className="text-[13.5px] text-white/70">Venice System Prompt Toggle</span>
                  </label>

                  <label className="flex items-center gap-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={veniceParams.enable_web_citations === true}
                      onChange={(e) => setVeniceParams({ enable_web_citations: e.target.checked })}
                      className="rounded border-white/[0.08] bg-white/[0.02] text-white focus:ring-offset-0 focus:ring-0 w-4 h-4"
                    />
                    <span className="text-[13.5px] text-white/70">Enable Citations by Default</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {activeSection === "appearance" && (
            <div className="space-y-4">
              <ThemeMaker />
            </div>
          )}

          {activeSection === "data" && (
            <div className="space-y-5">
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 shadow-lg space-y-4">
                <h3 className="text-[14.5px] font-medium text-white/85">Data Backups</h3>
                <p className="text-[12.5px] text-white/40 leading-relaxed">
                  Export your conversations, images, settings, and memories to a JSON file, or restore them from a previous backup.
                </p>
                <div className="flex flex-wrap gap-2.5">
                  <button 
                    onClick={exportData}
                    className="px-4 py-1.5 rounded-lg text-[13px] font-medium bg-white text-black hover:bg-white/95 transition-colors"
                  >
                    Export Backup
                  </button>
                  <button 
                    onClick={importData}
                    className="px-4 py-1.5 rounded-lg text-[13px] font-medium bg-white/[0.04] border border-white/[0.08] text-white/90 hover:bg-white/[0.08] transition-colors"
                  >
                    Import Backup
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-red-500/10 bg-red-500/[0.02] p-5 shadow-lg space-y-4">
                <h3 className="text-[14.5px] font-medium text-red-400">Danger Zone</h3>
                <p className="text-[12.5px] text-white/40 leading-relaxed">
                  These operations are destructive and cannot be undone. Always export a backup first if you have important history.
                </p>
                <div className="flex flex-wrap gap-2.5">
                  <button 
                    onClick={clearLocalSettings}
                    className="px-4 py-1.5 rounded-lg text-[13px] font-medium bg-white/[0.04] border border-white/[0.08] text-white/80 hover:bg-red-400/10 hover:text-red-400 hover:border-red-400/25 transition-colors"
                  >
                    Clear App Defaults
                  </button>
                  <button 
                    onClick={clearAllHistory}
                    className="px-4 py-1.5 rounded-lg text-[13px] font-medium bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-colors"
                  >
                    Clear All Local History
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeSection === "about" && (
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <div className="text-[17px] font-semibold text-white/90">{APP_NAME}</div>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 uppercase tracking-wider font-semibold">Unofficial</span>
              </div>

              <div className="text-[13px] text-white/50 leading-relaxed space-y-4">
                <p>
                  Venice Forge is a third-party desktop client configured to interface directly with the Venice.ai inference API endpoints. It is not affiliated with, endorsed by, sponsored by, or approved by Venice.ai, Inc.
                </p>
                
                <div className="p-3 bg-white/[0.02] border border-white/[0.06] rounded-lg">
                  <div className="text-[11.5px] uppercase tracking-wider text-white/35 font-bold mb-1">Official Links</div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                    <a href={OFFICIAL_LINKS.terms} target="_blank" rel="noopener noreferrer" className="text-white/60 hover:text-white underline">Terms of Service</a>
                    <a href={OFFICIAL_LINKS.privacy} target="_blank" rel="noopener noreferrer" className="text-white/60 hover:text-white underline">Privacy Policy</a>
                    <a href={OFFICIAL_LINKS.apiDocs} target="_blank" rel="noopener noreferrer" className="text-white/60 hover:text-white underline">API Documentation</a>
                  </div>
                </div>

                <div className="text-[11px] text-white/30 space-y-2">
                  <p>
                    “Venice”, “Venice.ai”, and related logos are trademarks of Venice.ai, Inc. Use of these names is solely for nominative identification of API compatibility.
                  </p>
                  <p>
                    Reset legal acknowledgment gate:
                  </p>
                  <button
                    onClick={() => {
                      try {
                        localStorage.removeItem(FIRST_RUN_ACK_KEY);
                        toast.success("Legal acknowledgment reset. It will appear on next reload.");
                      } catch {
                        toast.error("Could not reset acknowledgment.");
                      }
                    }}
                    className="px-3 py-1 rounded bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] transition-colors"
                  >
                    Reset gate
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeSection === "updates" && isElectron() && (
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 shadow-lg space-y-4">
              <h3 className="text-[14.5px] font-medium text-white/85 font-semibold">Application Updates</h3>
              <p className="text-[12.5px] text-white/40 leading-relaxed">
                Check for desktop application updates securely via GitHub Releases.
              </p>
              <div className="space-y-4">
                <div className="text-[13px] text-white/60">
                  <span className="text-white/30 mr-2">Status:</span>
                  <span className="font-mono bg-white/[0.03] border border-white/[0.06] rounded px-2 py-0.5">{updateStatus || "Idle"}</span>
                </div>
                <div className="flex flex-wrap gap-2.5">
                  <button 
                    onClick={checkForUpdates} 
                    disabled={isUpdateChecking || updateDownloaded}
                    className="px-4 py-1.5 rounded-lg text-[13px] font-medium bg-white/[0.04] border border-white/[0.08] text-white/90 hover:bg-white/[0.08] transition-colors disabled:opacity-50"
                  >
                    {isUpdateChecking ? "Checking..." : "Check for updates"}
                  </button>
                  {updateDownloaded && (
                    <button 
                      onClick={installUpdate}
                      className="px-4 py-1.5 rounded-lg text-[13px] font-medium bg-green-500 text-black hover:bg-green-400 transition-colors"
                    >
                      Restart and Install
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <ConfirmModal
        open={!!pendingConfirm}
        message={pendingConfirm?.message || ""}
        detail={pendingConfirm?.detail}
        confirmLabel="Confirm"
        onConfirm={async () => {
          try {
            await pendingConfirm?.onConfirm();
            setPendingConfirm(null);
          } catch {
            setPendingConfirm(null);
          }
        }}
        onCancel={() => setPendingConfirm(null)}
      />
    </div>
  );
}
