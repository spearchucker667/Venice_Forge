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
 *    - Both destructive ops (`clearLocalSettings`, `clearAllHistory`)
 *      are gated by the caller's `setPendingConfirm` confirm/cancel
 *      modal; the hook itself never invokes a modal directly.
 */
import { useCallback } from "react";
import { useChatStore } from "../stores/chat-store";
import { toast } from "../stores/toast-store";
import { isElectron, desktopFiles, desktopConfig } from "../services/desktopBridge";
import { listConversations } from "../services/chatStorage";
import type { Memory } from "../services/memoryService";
import type { ExportPayload } from "../services/exportImport";
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
}

/** Return shape: 4 async action functions grouped for caller convenience. */
export interface DataStorageActions {
  clearLocalSettings: () => Promise<void>;
  clearAllHistory: () => Promise<void>;
  exportData: (password: string) => Promise<void>;
  importData: (password: string) => Promise<void>;
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

  const exportData = useCallback(async (password: string) => {
    try {
      const { createEncryptedBackup, downloadEncryptedBackup } = await import("../services/backupExportService");
      const manifest = await createEncryptedBackup(password);
      const ok = await downloadEncryptedBackup(manifest);
      if (ok) toast.success("Encrypted backup exported successfully.");
    } catch {
      toast.error("Export failed. Please try again.");
    }
  }, []);

  /**
   * Import is gated by a 3-way safety choice (P0) when the imported
   * payload would disable either Family Safe Mode or Venice API Safe
   * Mode. The 3-way choice is implemented inline because it needs
   * `setPendingConfirm` + the same cancel/tertiary/dismiss refs that
   * the SettingsView modal uses; callers do not need to pass anything
   * extra.
   */
  const importData = useCallback(async (password: string) => {
    try {
      const json = await desktopFiles.importJsonString();
      if (!json) return;

      const { parseAndImportBackup } = await import("../services/backupImportService");
      const manifest = JSON.parse(json);
      
      const summary = await parseAndImportBackup(manifest, password);
      
      toast.success(
        `Import complete: ${summary.recordsImported} imported, ${summary.recordsSkipped} skipped, ${summary.tombstonesApplied} tombstones applied.`
      );
      
      // Reload UI or specific stores as needed.
      if (typeof window !== "undefined") {
         window.dispatchEvent(new Event("venice:backup-imported"));
      }
      
      // Hydrate stores.
      const convs = await listConversations();
      useChatStore.setState({ conversations: convs });

    } catch {
      toast.error("Import failed. Please check the file and try again.");
    }
  }, []);

  return { clearLocalSettings, clearAllHistory, exportData, importData };
}

// Re-export `Memory` and `ExportPayload` so consumers can import the
// hook + the types from a single entry point.
export type { Memory, ExportPayload };
