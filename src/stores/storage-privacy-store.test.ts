import { describe, it, expect, beforeEach, vi } from "vitest";
import { useStoragePrivacyStore } from "./storage-privacy-store";

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
vi.mock("./toast-store", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

describe("storage-privacy-store", () => {
  beforeEach(() => {
    useStoragePrivacyStore.getState().clear();
  });

  it("can refresh inventory", async () => {
    const store = useStoragePrivacyStore.getState();
    await store.refreshInventory();
    expect(useStoragePrivacyStore.getState().hydrated).toBe(true);
    expect(useStoragePrivacyStore.getState().inventory).not.toBeNull();
  });

  it("can copy safe summary", async () => {
    // Mock clipboard
    const writeTextSpy = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText: writeTextSpy } });

    const store = useStoragePrivacyStore.getState();
    await store.refreshInventory();
    await store.copySafeSummary();
    expect(writeTextSpy).toHaveBeenCalled();
  });
});
