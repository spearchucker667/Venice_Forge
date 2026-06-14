import { create } from "zustand";
import {
  type StorageInventoryResult,
  type StorageMaintenancePlan,
} from "../types/storage-privacy";
import { buildStorageInventory, buildSafePrivacySummary, type StorageInventoryRecord } from "../services/storagePrivacyService";
import { createStorageMaintenancePlan, applyMaintenanceAction } from "../services/storageMaintenance";
import { useProjectStore, ensureProjectsLoaded } from "./project-store";
import { usePromptLibraryStore } from "./prompt-library-store";
import { useSceneComposerStore } from "./scene-composer-store";
import { useMediaStore } from "./media-store";
import { useWorkflowTemplateStore } from "./workflow-template-store";
import { useScenarioStore } from "./scenario-store";
import { useCharacterCardStore } from "./character-card-store";
import { usePersonaStore } from "./persona-store";
import * as logger from "../shared/logger";
import { useLorebookStore } from "./lorebook-store";
import { useSettingsStore } from "./settings-store";
import { toast } from "./toast-store";
import { desktopCharacterImage } from "../services/desktopBridge";

export interface StoragePrivacyState {
  inventory: StorageInventoryResult | null;
  maintenancePlan: StorageMaintenancePlan | null;
  hydrated: boolean;
  refreshing: boolean;
  lastRefreshedAt: string | null;

  refreshInventory(): Promise<void>;
  copySafeSummary(): Promise<void>;
  exportSafeSummary(): void;
  runMaintenanceAction(actionId: string): Promise<void>;
  clear(): void;
}

export const useStoragePrivacyStore = create<StoragePrivacyState>((set, get) => ({
  inventory: null,
  maintenancePlan: null,
  hydrated: false,
  refreshing: false,
  lastRefreshedAt: null,

  refreshInventory: async () => {
    set({ refreshing: true });
    try {
      // Ensure other stores are loaded if needed
      await Promise.all([
        ensureProjectsLoaded(),
        usePromptLibraryStore.getState().ensureLoaded?.() || Promise.resolve(),
        useSceneComposerStore.getState().ensureLoaded?.() || Promise.resolve(),
        useMediaStore.getState().refresh(),
        useWorkflowTemplateStore.getState().ensureWorkflowTemplatesLoaded(),
      ]);

      const [cacheInventory] = await Promise.all([
        desktopCharacterImage.getInventory(),
      ]);

      const inventory = buildStorageInventory({
        projects: useProjectStore.getState().projects as unknown as StorageInventoryRecord[],
        prompts: usePromptLibraryStore.getState().prompts as unknown as StorageInventoryRecord[],
        scenes: useSceneComposerStore.getState().scenes as unknown as StorageInventoryRecord[],
        media: useMediaStore.getState().items as unknown as StorageInventoryRecord[],
        workflows: useWorkflowTemplateStore.getState().workflows as unknown as StorageInventoryRecord[],
        characters: useCharacterCardStore.getState().cards as unknown as StorageInventoryRecord[],
        lorebooks: useLorebookStore.getState().lorebooks as unknown as StorageInventoryRecord[],
        personas: usePersonaStore.getState().personas as unknown as StorageInventoryRecord[],
        scenarios: useScenarioStore.getState().scenarios as unknown as StorageInventoryRecord[],
        settings: useSettingsStore.getState() as unknown as { veniceApiKey?: string },
        characterImageCache: cacheInventory.ok
          ? { count: cacheInventory.count ?? 0, totalBytes: cacheInventory.totalBytes ?? 0 }
          : undefined,
      });

      const maintenancePlan = createStorageMaintenancePlan(inventory);

      set({
        inventory,
        maintenancePlan,
        hydrated: true,
        refreshing: false,
        lastRefreshedAt: new Date().toISOString(),
      });
    } catch (err) {
      set({ refreshing: false });
      toast.error("Failed to refresh storage inventory");
      logger.error(err);
    }
  },

  copySafeSummary: async () => {
    const { inventory } = get();
    if (!inventory) {
      toast.error("No inventory data to copy. Refresh first.");
      return;
    }
    const summary = buildSafePrivacySummary(inventory);
    const json = JSON.stringify(summary, null, 2);
    await navigator.clipboard.writeText(json);
    toast.success("Safe privacy summary copied to clipboard");
  },

  exportSafeSummary: () => {
    const { inventory } = get();
    if (!inventory) {
      toast.error("No inventory data to export. Refresh first.");
      return;
    }
    const summary = buildSafePrivacySummary(inventory);
    const json = JSON.stringify(summary, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `venice-forge-privacy-summary-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Safe privacy summary downloaded");
  },

  runMaintenanceAction: async (actionId) => {
    set({ refreshing: true });
    try {
      const result = await applyMaintenanceAction(actionId);
      if (result.failed.length > 0) {
        toast.error(`Maintenance action partially failed: ${result.failed[0].reason}`);
      } else {
        toast.success("Maintenance action completed");
        if (actionId === "clear-model-cache") {
            // we might want to trigger a refresh of models here if we had access to the models store
        }
      }
      await get().refreshInventory();
    } catch (err) {
      set({ refreshing: false });
      toast.error("Maintenance action failed");
      logger.error(err);
    }
  },

  clear: () => set({ inventory: null, maintenancePlan: null, hydrated: false, lastRefreshedAt: null }),
}));
