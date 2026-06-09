// @vitest-environment jsdom
/** @fileoverview Data & Storage actions extracted from `SettingsView`.
 *
 *  This hook owns the 4 async operations that live under the
 *  "Data & Storage operations" section of the settings panel:
 *
 *    - `clearLocalSettings` — wipes the local `settings` IDB store and
 *      resets the local safety / Venice param toggles to their
 *      defaults, persisting through `desktopConfig.writeSanitized` in
 *      Electron mode.
 *    - `clearAllHistory` — wipes **all** `STORE_NAMES` IDB stores and
 *      resets `useChatStore` to the empty state.
 *    - `exportData` — assembles an `ExportPayload` (sanitized, redacted)
 *      and triggers a download via the Electron main-process
 *      `desktopFiles.exportJson` IPC.
 *    - `importData` — opens the safe Electron file-picker, validates
 *      the JSON via `validateImportJson`, writes a pre-import backup
 *      file, then re-hydrates every store (`images`, `chats`, settings,
 *      conversations, `ai_memory`). The safety-mode 3-way choice
 *      (import-all / keep-current / cancel) is preserved end-to-end.
 *
 *  Extracting these out of `SettingsView` shrinks the view by ~210
 *  lines and gives the data-storage surface its own testable seam.
 *
 *  SECURITY NOTES:
 *    - `exportData` strips API keys and tokens via the
 *      `createExportPayload` sanitizer; it never re-emits raw secrets.
 *    - `importData` writes a pre-import backup **before** touching any
 *      store, so an aborted or partial import can always be recovered.
 *    - The safety-mode 3-way choice (P0) is preserved: when the
 *      imported payload would disable either Family Safe Mode or
 *      Venice API Safe Mode, the user must pick
 *      `import-all` / `keep-current` / `cancel` before any settings
 *      are written.
 *    - Both destructive ops (`clearLocalSettings`, `clearAllHistory`)
 *      are gated by the caller's `setPendingConfirm` confirm/cancel
 *      modal; the hook itself never invokes a modal directly.
 */
import { useCallback, type MutableRefObject } from "react";
import { useChatStore } from "../stores/chat-store";
import { toast } from "../stores/toast-store";
import { isElectron, desktopApp, desktopFiles, desktopConfig } from "../services/desktopBridge";
import {
  listConversations,
  saveConversation,
} from "../services/chatStorage";
import type { Conversation } from "../types/conversation";
import { listMemories, upsertMemory, type Memory } from "../services/memoryService";
import {
  createExportPayload,
  validateImportJson,
  type ExportPayload,
  type RawExportData,
} from "../services/exportImport";
import StorageService from "../services/storageService";
import { STORE_NAMES } from "../constants/venice";

/** Shape of the local-state setters that the hook needs to drive. */
export interface DataStorageActionsOptions {
  setSystemPrompt: (value: string) => void;
  setVeniceParams: (value: {
    include_venice_system_prompt: boolean;
    enable_web_search: "off" | "on" | "auto";
    enable_web_citations: boolean;
  }) => void;
  setLocalFamilySafeModeEnabled: (value: boolean) => void;
  setVeniceApiSafeMode: (value: boolean) => void;
  /** Caller's confirm/cancel wrapper; the hook never invokes a modal directly. */
  setPendingConfirm: (pending: {
    message: string;
    detail?: string;
    onConfirm: () => Promise<void> | void;
  }) => void;
  /** Current safety-mode values; read by the export payload and the import safety-merge. */
  localFamilySafeModeEnabled: boolean;
  veniceApiSafeMode: boolean;
  /**
   * Refs the modal uses to resolve the safety 4-way choice. The hook
   * writes the cancel/tertiary/dismiss resolvers into these refs;
   * the modal's Cancel / "Keep current safety" / Dismiss buttons then
   * resolve the safety-choice Promise through the refs.
   */
  applySafetyCancelRef: MutableRefObject<(() => void) | null>;
  applySafetyTertiaryRef: MutableRefObject<(() => void) | null>;
  applySafetyDismissRef: MutableRefObject<(() => void) | null>;
}

/** Return shape: 4 async action functions grouped for caller convenience. */
export interface DataStorageActions {
  clearLocalSettings: () => Promise<void>;
  clearAllHistory: () => Promise<void>;
  exportData: () => Promise<void>;
  importData: () => Promise<void>;
}

/**
 * Persisted family-safe-mode setting entry. The export / import round-trip
 * uses a stable id `family-safe-mode-settings` so the import safety-mode
 * 3-way choice can find it.
 */
const SAFETY_ENTRY_ID = "family-safe-mode-settings" as const;

function buildSafetyEntry(
  localFamilySafeModeEnabled: boolean,
  veniceApiSafeMode: boolean,
): Record<string, unknown> {
  return {
    id: SAFETY_ENTRY_ID,
    timestamp: Date.now(),
    value: { localFamilySafeModeEnabled, veniceApiSafeMode },
  };
}

/**
 * Custom hook that owns the Data & Storage async operations for the
 * Settings panel. The hook reads no global state directly; it depends
 * on the local React state setters passed in via `options`, which
 * keeps the data-flow explicit and the test surface narrow.
 */
export function useDataStorageActions(
  options: DataStorageActionsOptions,
): DataStorageActions {
  const {
    setSystemPrompt,
    setVeniceParams,
    setLocalFamilySafeModeEnabled,
    setVeniceApiSafeMode,
    setPendingConfirm,
    localFamilySafeModeEnabled,
    veniceApiSafeMode,
    applySafetyCancelRef,
    applySafetyTertiaryRef,
    applySafetyDismissRef,
  } = options;

  const clearLocalSettings = useCallback(async () => {
    setPendingConfirm({
      message: "Clear local settings?",
      detail:
        "This will reset default system prompts, citation toggles, and UI model configurations to standard defaults.",
      onConfirm: async () => {
        await StorageService.clearStore("settings");
        setSystemPrompt("");
        setVeniceParams({
          include_venice_system_prompt: false,
          enable_web_search: "off",
          enable_web_citations: false,
        });
        setLocalFamilySafeModeEnabled(true);
        setVeniceApiSafeMode(true);
        if (isElectron()) {
          await desktopConfig.writeSanitized({
            safety: { local_family_safe_mode_enabled: true, venice_api_safe_mode: true },
          });
        }
        toast.success("Local settings cleared.");
      },
    });
  }, [
    setPendingConfirm,
    setSystemPrompt,
    setVeniceParams,
    setLocalFamilySafeModeEnabled,
    setVeniceApiSafeMode,
  ]);

  const clearAllHistory = useCallback(async () => {
    setPendingConfirm({
      message: "Delete all IndexedDB history?",
      detail:
        "This will permanently delete all saved images, chats, configurations, and settings from local database. This cannot be undone.",
      onConfirm: async () => {
        await Promise.all(STORE_NAMES.map((store) => StorageService.clearStore(store)));
        useChatStore.setState({ conversations: [], activeConversationId: null });
        toast.success("IndexedDB history cleared successfully.");
      },
    });
  }, [setPendingConfirm]);

  const exportData = useCallback(async () => {
    try {
      const [images, chats, settings, conversations, memories] = await Promise.all([
        StorageService.getItems("images"),
        StorageService.getItems("chats"),
        StorageService.getItems("settings"),
        listConversations(),
        listMemories(),
      ]);
      const appVersion = await desktopApp.getVersion();
      const persistedSafetySettings = buildSafetyEntry(
        localFamilySafeModeEnabled,
        veniceApiSafeMode,
      );
      const payload: ExportPayload = createExportPayload(
        {
          images,
          chats,
          settings: [...settings, persistedSafetySettings],
          conversations,
          ai_memory: memories,
        } as RawExportData,
        appVersion,
      );
      const ok = await desktopFiles.exportJson(
        payload,
        `venice-forge-export-${new Date().toISOString().slice(0, 10)}.json`,
      );
      if (ok) toast.success("Data exported successfully.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed.");
    }
  }, [localFamilySafeModeEnabled, veniceApiSafeMode]);

  /**
   * Import is gated by a 3-way safety choice (P0) when the imported
   * payload would disable either Family Safe Mode or Venice API Safe
   * Mode. The 3-way choice is implemented inline because it needs
   * `setPendingConfirm` + the same cancel/tertiary/dismiss refs that
   * the SettingsView modal uses; callers do not need to pass anything
   * extra.
   */
  const importData = useCallback(async () => {
    try {
      const json = await desktopFiles.importJsonString();
      if (!json) return;

      // 1. Pre-import backup (always written, even if the user later
      //    cancels the safety choice).
      const [imagesBefore, chatsBefore, settingsBefore, conversationsBefore, memoriesBefore] =
        await Promise.all([
          StorageService.getItems("images"),
          StorageService.getItems("chats"),
          StorageService.getItems("settings"),
          listConversations(),
          listMemories(),
        ]);
      const backup: ExportPayload = createExportPayload(
        {
          images: imagesBefore,
          chats: chatsBefore,
          settings: [
            ...settingsBefore,
            buildSafetyEntry(localFamilySafeModeEnabled, veniceApiSafeMode),
          ],
          conversations: conversationsBefore,
          ai_memory: memoriesBefore,
        } as RawExportData,
        await desktopApp.getVersion(),
      );
      const dateTimeStr = new Date()
        .toISOString()
        .slice(0, 19)
        .replace("T", "_")
        .replace(/:/g, "-");
      const backupOk = await desktopFiles.exportJson(
        backup,
        `venice-forge-pre-import-backup-${dateTimeStr}.json`,
      );
      if (!backupOk) {
        toast.error("Pre-import backup could not be saved. Import aborted.");
        return;
      }

      // 2. Parse + validate.
      const { payload, summary } = validateImportJson(json);

      // P0: parse + extract safety settings BEFORE writing anything.
      const importedSafetyEntry = payload.data.settings.find(
        (entry) => entry.id === SAFETY_ENTRY_ID,
      );
      const rawSafety = importedSafetyEntry?.value;
      const value =
        rawSafety && typeof rawSafety === "object"
          ? (rawSafety as Record<string, unknown>)
          : null;
      const familyEnabled =
        value && typeof value.localFamilySafeModeEnabled === "boolean"
          ? value.localFamilySafeModeEnabled
          : true;
      const apiSafeMode =
        value && typeof value.veniceApiSafeMode === "boolean" ? value.veniceApiSafeMode : true;
      const wouldDisable = !familyEnabled || !apiSafeMode;

      // 3. Safety-mode 3-way choice (only when the payload would
      //    actually disable something; otherwise default to
      //    "import-all").
      let safetyChoice: "import-all" | "keep-current" | "cancel" = "import-all";
      if (value && wouldDisable) {
        safetyChoice = await new Promise<"import-all" | "keep-current" | "cancel">(
          (resolve) => {
            setPendingConfirm({
              message: "This backup would change one or more safety settings.",
              detail:
                "Family Safe Mode is Venice Forge's local family-oriented filter. " +
                "Adult Mode bypasses only that local filter. " +
                "Venice API Safe Mode is a separate provider-side setting and is not affected by Adult Mode. " +
                "Choose how to handle these imported safety settings.",
              onConfirm: () => resolve("import-all"),
            });
            applySafetyCancelRef.current = null;
            applySafetyTertiaryRef.current = () => resolve("keep-current");
            applySafetyDismissRef.current = () => resolve("cancel");
          },
        );
        applySafetyCancelRef.current = null;
        applySafetyTertiaryRef.current = null;
        applySafetyDismissRef.current = null;
      }

      if (safetyChoice === "cancel") {
        toast.info("Import cancelled. No settings were written.");
        return;
      }

      // 4. Write non-safety data FIRST so a safety-write failure
      //    can't half-import.
      await Promise.all(
        payload.data.images.map((img) => StorageService.saveItem("images", img)),
      );
      await Promise.all(
        payload.data.chats.map((chat) => StorageService.saveItem("chats", chat)),
      );

      if (safetyChoice === "import-all") {
        await Promise.all(
          payload.data.settings.map((s) => StorageService.saveItem("settings", s)),
        );
        if (value) {
          setLocalFamilySafeModeEnabled(familyEnabled);
          setVeniceApiSafeMode(apiSafeMode);
          if (isElectron()) {
            await desktopConfig.writeSanitized({
              safety: {
                local_family_safe_mode_enabled: familyEnabled,
                venice_api_safe_mode: apiSafeMode,
              },
            });
          }
        }
      } else {
        // "keep-current": drop the safety entry from the imported
        // settings, then persist the rest. The caller's current
        // safety state (Zustand + YAML + Electron runtime snapshot)
        // is left untouched.
        const filteredSettings = payload.data.settings.filter(
          (entry) => entry.id !== SAFETY_ENTRY_ID,
        );
        await Promise.all(
          filteredSettings.map((s) => StorageService.saveItem("settings", s)),
        );
        toast.info("Imported data kept current safety settings.");
      }

      const convResults = await Promise.all(
        payload.data.conversations.map((conv) => saveConversation(conv as unknown as Conversation)),
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
            conversationId:
              typeof mem.conversationId === "string" ? mem.conversationId : undefined,
          });
        }),
      );

      // 5. Hydrate stores.
      const convs: Conversation[] = await listConversations();
      useChatStore.setState({ conversations: convs });

      toast.success(
        `Imported ${summary.conversationsFound} conversations and ${summary.aiMemoryFound} memories successfully.`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed.");
    }
  }, [
    setPendingConfirm,
    setLocalFamilySafeModeEnabled,
    setVeniceApiSafeMode,
    localFamilySafeModeEnabled,
    veniceApiSafeMode,
    applySafetyCancelRef,
    applySafetyTertiaryRef,
    applySafetyDismissRef,
  ]);

  return { clearLocalSettings, clearAllHistory, exportData, importData };
}

// Re-export `Memory` and `ExportPayload` so consumers can import the
// hook + the types from a single entry point.
export type { Memory, ExportPayload };
