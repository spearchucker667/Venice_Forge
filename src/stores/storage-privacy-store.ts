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
import { useAuthStore } from "./auth-store";
import { useChatStore } from "./chat-store";
import { toast } from "./toast-store";
import { desktopCharacterImage, isElectron } from "../services/desktopBridge";

function toStorageRecord(
  item: { id: string; title?: string; name?: string; projectId?: string | null; archivedAt?: string | number | null },
): StorageInventoryRecord {
  return {
    id: item.id,
    title: item.title,
    name: item.name,
    projectId: item.projectId ?? null,
    archivedAt: item.archivedAt ?? null,
  };
}

export interface StoragePrivacyState {
  inventory: StorageInventoryResult | null;
  maintenancePlan: StorageMaintenancePlan | null;
  hydrated: boolean;
  refreshing: boolean;
  error: string | null;
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
  error: null,
  lastRefreshedAt: null,

  refreshInventory: async () => {
    set({ refreshing: true, error: null });
    try {
      // Ensure other stores are loaded if needed
      await Promise.all([
        ensureProjectsLoaded(),
        usePromptLibraryStore.getState().ensureLoaded?.() || Promise.resolve(),
        useSceneComposerStore.getState().ensureLoaded?.() || Promise.resolve(),
        useMediaStore.getState().refresh(),
        useWorkflowTemplateStore.getState().ensureWorkflowTemplatesLoaded(),
        useCharacterCardStore.getState().load?.() || Promise.resolve(),
        useLorebookStore.getState().load?.() || Promise.resolve(),
        usePersonaStore.getState().load?.() || Promise.resolve(),
        useScenarioStore.getState().load?.() || Promise.resolve(),
      ]);

      const [cacheInventory] = await Promise.all([
        desktopCharacterImage.getInventory(),
      ]);

      // Refresh the canonical API-key configured state from the secure bridge
      // (desktop safeStorage or web server-side session) rather than trusting
      // a non-existent settings field.
      await useAuthStore.getState().checkConfiguration();
      const veniceConfigured = useAuthStore.getState().isConfigured;

      const conversations = useChatStore.getState().conversations.map((c) => ({
        id: c.id,
        title: c.title,
        projectId: c.memory?.projectRefs?.[0] ?? null,
        archivedAt: c.metadata?.archived ? 1 : null,
      }));

      const inventory = buildStorageInventory({
        projects: useProjectStore.getState().projects.map(toStorageRecord),
        conversations,
        prompts: usePromptLibraryStore.getState().prompts.map(toStorageRecord),
        scenes: useSceneComposerStore.getState().scenes.map(toStorageRecord),
        media: useMediaStore.getState().items.map((m) => toStorageRecord(m as { id: string; title?: string; name?: string; projectId?: string | null; archivedAt?: string | number | null })),
        workflows: useWorkflowTemplateStore.getState().workflows.map((w) => toStorageRecord(w as { id: string; title?: string; name?: string })),
        characters: useCharacterCardStore.getState().cards.map((c) => toStorageRecord(c as { id: string; name?: string })),
        lorebooks: useLorebookStore.getState().lorebooks.map((l) => toStorageRecord(l as { id: string; name?: string })),
        personas: usePersonaStore.getState().personas.map((p) => toStorageRecord(p as { id: string; name?: string })),
        scenarios: useScenarioStore.getState().scenarios.map((s) => toStorageRecord(s as { id: string; name?: string; projectId?: string | null; archivedAt?: string | number | null })),
        apiKey: {
          configured: veniceConfigured,
          storage: isElectron() ? "secure-storage" : "web-environment",
          lastValidationStatus: veniceConfigured ? "configured-not-validated" : "not-configured",
        },
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
        error: null,
        lastRefreshedAt: new Date().toISOString(),
      });
    } catch (err) {
      set({ refreshing: false, error: err instanceof Error ? err.message : String(err) });
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
