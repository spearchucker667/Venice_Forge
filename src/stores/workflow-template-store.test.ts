import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock StorageService before importing stores that use it
vi.mock("../services/storageService", () => {
  return {
    default: {
      getEncrypted: vi.fn().mockResolvedValue([]),
      getItems: vi.fn().mockResolvedValue([]),
      saveItem: vi.fn().mockResolvedValue(undefined),
      deleteItem: vi.fn().mockResolvedValue(undefined),
    },
  };
});

import { useWorkflowTemplateStore } from "./workflow-template-store";
import { useProjectStore } from "./project-store";

describe("workflow-template-store", () => {
  beforeEach(() => {
    useWorkflowTemplateStore.setState({
      workflows: [],
      activeWorkflowId: null,
      hydrated: true,
    });
    useProjectStore.setState({
      projects: [],
    });
    vi.clearAllMocks();
  });

  describe("createWorkflow", () => {
    it("creates a new workflow and sets it active", async () => {
      const store = useWorkflowTemplateStore.getState();
      const workflow = await store.createWorkflow({ title: "My Workflow" });
      
      const updatedStore = useWorkflowTemplateStore.getState();
      expect(updatedStore.workflows).toHaveLength(1);
      expect(updatedStore.workflows[0].title).toBe("My Workflow");
      expect(updatedStore.activeWorkflowId).toBe(workflow.id);
      expect(updatedStore.workflows[0].versions).toHaveLength(1);
    });
  });

  describe("updateWorkflow", () => {
    it("updates workflow metadata", async () => {
      const store = useWorkflowTemplateStore.getState();
      const workflow = await store.createWorkflow({ title: "Old Title" });
      
      const updatedStoreBefore = useWorkflowTemplateStore.getState();
      await updatedStoreBefore.updateWorkflow(workflow.id, { title: "New Title", favorite: true });
      
      const updatedStore = useWorkflowTemplateStore.getState();
      expect(updatedStore.workflows[0].title).toBe("New Title");
      expect(updatedStore.workflows[0].favorite).toBe(true);
    });
  });

  describe("steps management", () => {
    it("adds, updates, removes, and reorders steps", async () => {
      const store = useWorkflowTemplateStore.getState();
      const workflow = await store.createWorkflow({ title: "Steps Workflow" });
      
      // Add
      const updatedStoreBeforeAdd = useWorkflowTemplateStore.getState();
      await updatedStoreBeforeAdd.addStep(workflow.id, { kind: "prompt", target: "chat", title: "Step 1", enabled: true });
      
      const updatedStoreBeforeAdd2 = useWorkflowTemplateStore.getState();
      await updatedStoreBeforeAdd2.addStep(workflow.id, { kind: "scene", target: "scene_composer", title: "Step 2", enabled: true });
      
      let updatedStore = useWorkflowTemplateStore.getState();
      let currentVersion = updatedStore.getCurrentVersion(workflow.id)!;
      expect(currentVersion.steps).toHaveLength(2);
      expect(currentVersion.steps[0].title).toBe("Step 1");
      expect(currentVersion.steps[1].title).toBe("Step 2");
      
      // Update
      const step1Id = currentVersion.steps[0].id;
      await updatedStore.updateStep(workflow.id, step1Id, { title: "Updated Step 1" });
      
      updatedStore = useWorkflowTemplateStore.getState();
      currentVersion = updatedStore.getCurrentVersion(workflow.id)!;
      expect(currentVersion.steps[0].title).toBe("Updated Step 1");
      
      // Reorder
      const step2Id = currentVersion.steps[1].id;
      await updatedStore.reorderSteps(workflow.id, [step2Id, step1Id]);
      
      updatedStore = useWorkflowTemplateStore.getState();
      currentVersion = updatedStore.getCurrentVersion(workflow.id)!;
      expect(currentVersion.steps[0].id).toBe(step2Id); // Step 2 is now first
      
      // Remove
      await updatedStore.removeStep(workflow.id, step2Id);
      
      updatedStore = useWorkflowTemplateStore.getState();
      currentVersion = updatedStore.getCurrentVersion(workflow.id)!;
      expect(currentVersion.steps).toHaveLength(1);
      expect(currentVersion.steps[0].id).toBe(step1Id);
    });
  });
});