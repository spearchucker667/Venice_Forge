import { describe, it, expect, beforeEach, vi } from "vitest";
import { useStoragePrivacyStore } from "./storage-privacy-store";
import { applyMaintenanceAction } from "../services/storageMaintenance";
import { buildStorageInventory } from "../services/storagePrivacyService";
import { toast } from "./toast-store";

// Mock services
vi.mock("../services/storagePrivacyService", () => ({
  buildStorageInventory: vi.fn().mockReturnValue({
    stores: [{ id: "prompts", label: "Prompts", category: "prompts", count: 5, encrypted: true, containsSecrets: false, containsUserContent: true, exportableInSafeSummary: true, severity: "ok", summary: "5 items" }],
    issues: [],
    generatedAt: new Date().toISOString(),
  }),
  buildSafePrivacySummary: vi.fn().mockReturnValue({ version: 1, app: "Venice Forge", stores: [] }),
}));

vi.mock("../services/storageMaintenance", () => ({
  createStorageMaintenancePlan: vi.fn().mockReturnValue({ version: 1, actions: [], issues: [], warnings: [] }),
  applyMaintenanceAction: vi.fn().mockResolvedValue({ succeeded: ["test"], failed: [] }),
}));

// Mock desktop bridge for character image cache
vi.mock("../services/desktopBridge", () => ({
  desktopCharacterImage: {
    getInventory: vi.fn().mockResolvedValue({ ok: true, count: 1, totalBytes: 1024 }),
  },
  isElectron: vi.fn().mockReturnValue(false),
}));

// Mock stores
vi.mock("./project-store", () => ({
  useProjectStore: { getState: () => ({ projects: [] }) },
  ensureProjectsLoaded: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("./prompt-library-store", () => ({
  usePromptLibraryStore: { getState: () => ({ prompts: [], ensureLoaded: vi.fn().mockResolvedValue(undefined) }) },
}));
vi.mock("./scene-composer-store", () => ({
  useSceneComposerStore: { getState: () => ({ scenes: [], ensureLoaded: vi.fn().mockResolvedValue(undefined) }) },
}));
vi.mock("./media-store", () => ({
  useMediaStore: { getState: () => ({ items: [], refresh: vi.fn().mockResolvedValue(undefined) }) },
}));
vi.mock("./workflow-template-store", () => ({
  useWorkflowTemplateStore: { getState: () => ({ workflows: [], ensureWorkflowTemplatesLoaded: vi.fn().mockResolvedValue(undefined) }) },
}));
vi.mock("./scenario-store", () => ({
  useScenarioStore: { getState: () => ({ scenarios: [] }) },
}));
vi.mock("./character-card-store", () => ({
  useCharacterCardStore: { getState: () => ({ cards: [] }) },
}));
vi.mock("./persona-store", () => ({
  usePersonaStore: { getState: () => ({ personas: [] }) },
}));
vi.mock("./lorebook-store", () => ({
  useLorebookStore: { getState: () => ({ lorebooks: [] }) },
}));
vi.mock("./settings-store", () => ({
  useSettingsStore: { getState: () => ({}) },
}));
vi.mock("./auth-store", () => ({
  useAuthStore: {
    getState: () => ({
      isConfigured: true,
      checkConfiguration: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));
vi.mock("./toast-store", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

describe("storage-privacy-store", () => {
  beforeEach(() => {
    useStoragePrivacyStore.getState().clear();
    vi.clearAllMocks();
  });

  it("can refresh inventory", async () => {
    const store = useStoragePrivacyStore.getState();
    await store.refreshInventory();
    expect(useStoragePrivacyStore.getState().hydrated).toBe(true);
    expect(useStoragePrivacyStore.getState().inventory).not.toBeNull();
  });

  it("reports actual Venice API-key configured status in the inventory", async () => {
    await useStoragePrivacyStore.getState().refreshInventory();
    expect(buildStorageInventory).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: expect.objectContaining({
          configured: true,
          storage: "web-environment",
          lastValidationStatus: "configured-not-validated",
        }),
      }),
    );
  });

  it("refreshInventory handles errors gracefully", async () => {
    // Force an error
    vi.mocked(toast.error).mockClear();
    const { ensureProjectsLoaded } = await import("./project-store");
    vi.mocked(ensureProjectsLoaded).mockRejectedValueOnce(new Error("Oops"));

    await useStoragePrivacyStore.getState().refreshInventory();

    expect(toast.error).toHaveBeenCalledWith("Failed to refresh storage inventory");
    expect(useStoragePrivacyStore.getState().refreshing).toBe(false);
  });

  it("copySafeSummary copies to clipboard", async () => {
    const writeTextSpy = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText: writeTextSpy } });

    const store = useStoragePrivacyStore.getState();
    await store.refreshInventory();
    await store.copySafeSummary();

    expect(writeTextSpy).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith("Safe privacy summary copied to clipboard");

    vi.unstubAllGlobals();
  });

  it("copySafeSummary handles unhydrated state", async () => {
    await useStoragePrivacyStore.getState().copySafeSummary();
    expect(toast.error).toHaveBeenCalledWith("No inventory data to copy. Refresh first.");
  });

  it("exportSafeSummary triggers download", async () => {
    const createElementSpy = vi.spyOn(document, "createElement");
    const mockAnchor = { href: "", download: "", click: vi.fn() };
    createElementSpy.mockReturnValue(mockAnchor as any);
    
    const revokeObjectURLSpy = vi.fn();
    const createObjectURLSpy = vi.fn().mockReturnValue("blob:test");
    vi.stubGlobal("URL", { createObjectURL: createObjectURLSpy, revokeObjectURL: revokeObjectURLSpy });

    const store = useStoragePrivacyStore.getState();
    await store.refreshInventory();
    store.exportSafeSummary();

    expect(createElementSpy).toHaveBeenCalledWith("a");
    expect(mockAnchor.click).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith("Safe privacy summary downloaded");

    createElementSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it("exportSafeSummary handles unhydrated state", () => {
    useStoragePrivacyStore.getState().exportSafeSummary();
    expect(toast.error).toHaveBeenCalledWith("No inventory data to export. Refresh first.");
  });

  it("runMaintenanceAction applies successfully", async () => {
    await useStoragePrivacyStore.getState().runMaintenanceAction("test-action");
    expect(applyMaintenanceAction).toHaveBeenCalledWith("test-action");
    expect(toast.success).toHaveBeenCalledWith("Maintenance action completed");
  });

  it("runMaintenanceAction handles partial failure", async () => {
    vi.mocked(applyMaintenanceAction).mockResolvedValueOnce({ actionId: "test-action", requested: 1, succeeded: [], failed: [{ id: "test-action", reason: "Access denied" }] } as any);
    
    await useStoragePrivacyStore.getState().runMaintenanceAction("test-action");
    expect(toast.error).toHaveBeenCalledWith("Maintenance action partially failed: Access denied");
  });

  it("runMaintenanceAction handles exceptions", async () => {
    vi.mocked(applyMaintenanceAction).mockRejectedValueOnce(new Error("Boom"));
    
    await useStoragePrivacyStore.getState().runMaintenanceAction("test-action");
    expect(toast.error).toHaveBeenCalledWith("Maintenance action failed");
  });
});
