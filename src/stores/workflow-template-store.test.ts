/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/* eslint-disable @typescript-eslint/no-unused-vars */
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

import StorageService from "../services/storageService";
import { useWorkflowTemplateStore } from "./workflow-template-store";
import { useSettingsStore } from "./settings-store";
import { WORKFLOW_TEMPLATE_VERSION, type WorkflowTemplateExport, type WorkflowTemplateItem } from "../types/workflow";

describe("workflow-template-store", () => {
  beforeEach(() => {
    useWorkflowTemplateStore.setState({
      workflows: [],
      activeWorkflowId: null,
      hydrated: false,
      loadError: null,
    });
    useSettingsStore.setState({
      activeProjectId: null,
    });
    vi.clearAllMocks();
  });

  describe("ensureWorkflowTemplatesLoaded", () => {
    it("skips if already hydrated", async () => {
      useWorkflowTemplateStore.setState({ hydrated: true });
      const store = useWorkflowTemplateStore.getState();
      await store.ensureWorkflowTemplatesLoaded();
      expect(StorageService.getItems).not.toHaveBeenCalled();
    });

    it("loads and sanitizes workflows when valid array returned", async () => {
      const mockRaw = [{ id: "w1", title: "Raw Workflow", versions: [] }];
      vi.mocked(StorageService.getItems).mockResolvedValue(mockRaw);
      const store = useWorkflowTemplateStore.getState();
      await store.ensureWorkflowTemplatesLoaded();
      
      const updatedStore = useWorkflowTemplateStore.getState();
      expect(updatedStore.hydrated).toBe(true);
      expect(updatedStore.workflows).toHaveLength(1);
      expect(updatedStore.workflows[0].title).toBe("Raw Workflow");
    });

    it("sets empty array if non-array returned", async () => {
      vi.mocked(StorageService.getItems).mockResolvedValue({ notAnArray: true });
      const store = useWorkflowTemplateStore.getState();
      await store.ensureWorkflowTemplatesLoaded();
      
      const updatedStore = useWorkflowTemplateStore.getState();
      expect(updatedStore.hydrated).toBe(true);
      expect(updatedStore.workflows).toHaveLength(0);
    });

    it("handles errors during load", async () => {
      vi.mocked(StorageService.getItems).mockRejectedValueOnce(new Error("Load fail"));
      const store = useWorkflowTemplateStore.getState();
      await store.ensureWorkflowTemplatesLoaded();
      
      const updatedStore = useWorkflowTemplateStore.getState();
      expect(updatedStore.hydrated).toBe(true);
      expect(updatedStore.workflows).toHaveLength(0);
      expect(updatedStore.loadError).toBe("Load fail");
    });

    it("handles string errors during load", async () => {
      vi.mocked(StorageService.getItems).mockRejectedValueOnce("String error");
      const store = useWorkflowTemplateStore.getState();
      await store.ensureWorkflowTemplatesLoaded();
      
      const updatedStore = useWorkflowTemplateStore.getState();
      expect(updatedStore.loadError).toBe("String error");
    });
  });

  describe("createWorkflow", () => {
    it("creates a new global workflow and sets it active", async () => {
      const store = useWorkflowTemplateStore.getState();
      const workflow = await store.createWorkflow({ title: "My Global", scope: "global" });
      
      const updatedStore = useWorkflowTemplateStore.getState();
      expect(updatedStore.workflows).toHaveLength(1);
      expect(updatedStore.workflows[0].title).toBe("My Global");
      expect(updatedStore.workflows[0].scope).toBe("global");
      expect(updatedStore.activeWorkflowId).toBe(workflow.id);
      expect(updatedStore.workflows[0].versions).toHaveLength(1);
      expect(StorageService.saveItem).toHaveBeenCalled();
    });

    it("infers project scope when projectId is present", async () => {
      useSettingsStore.setState({ activeProjectId: "proj1" });
      const store = useWorkflowTemplateStore.getState();
      await store.createWorkflow({ title: "My Project", steps: [{ kind: "note", target: "none", title: "S1", enabled: true, order: 0 }] });
      
      const updatedStore = useWorkflowTemplateStore.getState();
      expect(updatedStore.workflows[0].scope).toBe("project");
      expect(updatedStore.workflows[0].projectId).toBe("proj1");
      expect(updatedStore.workflows[0].versions[0].steps).toHaveLength(1);
    });

    it("infers global scope when scope and projectId are missing", async () => {
      useSettingsStore.setState({ activeProjectId: null });
      const store = useWorkflowTemplateStore.getState();
      await store.createWorkflow({ title: "No Scope" });
      const updatedStore = useWorkflowTemplateStore.getState();
      expect(updatedStore.workflows[0].scope).toBe("global");
    });

    it("creates with explicit project scope and no active project", async () => {
      useSettingsStore.setState({ activeProjectId: null });
      const store = useWorkflowTemplateStore.getState();
      await store.createWorkflow({ title: "Proj Scope", scope: "project" });
      const updatedStore = useWorkflowTemplateStore.getState();
      expect(updatedStore.workflows[0].scope).toBe("project");
      expect(updatedStore.workflows[0].projectId).toBeNull();
    });

    it("uses provided projectId", async () => {
      const store = useWorkflowTemplateStore.getState();
      await store.createWorkflow({ title: "Explicit Proj", projectId: "p1" });
      const updatedStore = useWorkflowTemplateStore.getState();
      expect(updatedStore.workflows[0].projectId).toBe("p1");
      expect(updatedStore.workflows[0].scope).toBe("project");
    });

    it("rolls back state if persistOne fails with string", async () => {
      vi.mocked(StorageService.saveItem).mockRejectedValueOnce("String error");
      const store = useWorkflowTemplateStore.getState();
      
      await expect(store.createWorkflow({ title: "Fail Workflow" })).rejects.toThrow("String error");
      
      const updatedStore = useWorkflowTemplateStore.getState();
      expect(updatedStore.loadError).toBe("String error");
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

    it("does nothing if workflow not found", async () => {
      const store = useWorkflowTemplateStore.getState();
      await store.updateWorkflow("non-existent", { title: "New Title" });
      expect(StorageService.saveItem).not.toHaveBeenCalled();
    });

    it("rolls back state if persistOne fails with string", async () => {
      const store = useWorkflowTemplateStore.getState();
      const workflow = await store.createWorkflow({ title: "Old Title" });
      
      vi.mocked(StorageService.saveItem).mockRejectedValueOnce("String update fail");
      const updatedStoreBefore = useWorkflowTemplateStore.getState();
      
      await expect(updatedStoreBefore.updateWorkflow(workflow.id, { title: "New Title" })).rejects.toThrow("String update fail");
      
      const updatedStore = useWorkflowTemplateStore.getState();
      expect(updatedStore.loadError).toBe("String update fail");
    });
  });

  describe("addWorkflowVersion", () => {
    it("adds a new version to existing workflow", async () => {
      const store = useWorkflowTemplateStore.getState();
      const workflow = await store.createWorkflow({ title: "Workflow" });
      
      const storeBefore = useWorkflowTemplateStore.getState();
      const newVer = await storeBefore.addWorkflowVersion(workflow.id, {
        title: "Version 2",
        steps: [{ kind: "prompt", target: "chat", title: "S1", enabled: true, order: 0 }]
      });
      
      const updatedStore = useWorkflowTemplateStore.getState();
      const updatedWorkflow = updatedStore.getWorkflow(workflow.id)!;
      expect(updatedWorkflow.versions).toHaveLength(2);
      expect(updatedWorkflow.currentVersionId).toBe(newVer.id);
      expect(newVer.title).toBe("Version 2");
    });

    it("throws if workflow not found", async () => {
      const store = useWorkflowTemplateStore.getState();
      await expect(store.addWorkflowVersion("non-existent", { steps: [] })).rejects.toThrow("Workflow not found");
    });

    it("rolls back state if persistOne fails with string", async () => {
      const store = useWorkflowTemplateStore.getState();
      const workflow = await store.createWorkflow({ title: "Workflow" });
      
      vi.mocked(StorageService.saveItem).mockRejectedValueOnce("String version fail");
      const storeBefore = useWorkflowTemplateStore.getState();
      
      await expect(storeBefore.addWorkflowVersion(workflow.id, { steps: [] })).rejects.toThrow("String version fail");
      
      const updatedStore = useWorkflowTemplateStore.getState();
      expect(updatedStore.loadError).toBe("String version fail");
    });
  });

  describe("setCurrentWorkflowVersion", () => {
    it("sets current version id successfully", async () => {
      const store = useWorkflowTemplateStore.getState();
      const workflow = await store.createWorkflow({ title: "Workflow" });
      const version1Id = workflow.currentVersionId;
      
      const storeBefore = useWorkflowTemplateStore.getState();
      const newVer = await storeBefore.addWorkflowVersion(workflow.id, { steps: [] });
      
      const storeAfterAdd = useWorkflowTemplateStore.getState();
      expect(storeAfterAdd.getWorkflow(workflow.id)?.currentVersionId).toBe(newVer.id);
      
      await storeAfterAdd.setCurrentWorkflowVersion(workflow.id, version1Id);
      
      const finalStore = useWorkflowTemplateStore.getState();
      expect(finalStore.getWorkflow(workflow.id)?.currentVersionId).toBe(version1Id);
    });

    it("does nothing if workflow not found", async () => {
      const store = useWorkflowTemplateStore.getState();
      await store.setCurrentWorkflowVersion("non-existent", "v1");
      // No errors thrown
    });

    it("does nothing if version not found", async () => {
      const store = useWorkflowTemplateStore.getState();
      const workflow = await store.createWorkflow({ title: "Workflow" });
      const storeBefore = useWorkflowTemplateStore.getState();
      await storeBefore.setCurrentWorkflowVersion(workflow.id, "non-existent-version");
      
      const finalStore = useWorkflowTemplateStore.getState();
      expect(finalStore.getWorkflow(workflow.id)?.currentVersionId).toBe(workflow.currentVersionId);
    });

    it("does nothing if already current version", async () => {
      const store = useWorkflowTemplateStore.getState();
      const workflow = await store.createWorkflow({ title: "Workflow" });
      vi.mocked(StorageService.saveItem).mockClear();
      
      const storeBefore = useWorkflowTemplateStore.getState();
      await storeBefore.setCurrentWorkflowVersion(workflow.id, workflow.currentVersionId);
      
      expect(StorageService.saveItem).not.toHaveBeenCalled();
    });

    it("rolls back state if persistOne fails with string", async () => {
      const store = useWorkflowTemplateStore.getState();
      const workflow = await store.createWorkflow({ title: "Workflow" });
      const version1Id = workflow.currentVersionId;
      
      const storeBefore = useWorkflowTemplateStore.getState();
      const newVer = await storeBefore.addWorkflowVersion(workflow.id, { steps: [] });
      
      vi.mocked(StorageService.saveItem).mockRejectedValueOnce("String set version fail");
      const storeAfterAdd = useWorkflowTemplateStore.getState();
      
      await expect(storeAfterAdd.setCurrentWorkflowVersion(workflow.id, version1Id)).rejects.toThrow("String set version fail");
      
      const finalStore = useWorkflowTemplateStore.getState();
      expect(finalStore.loadError).toBe("String set version fail");
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
      await updatedStoreBeforeAdd2.addStep(workflow.id, { kind: "scene", target: "scene_composer", title: "Step 2", enabled: true, order: 5 }); // test specific order
      
      const updatedStoreBeforeAdd3 = useWorkflowTemplateStore.getState();
      await updatedStoreBeforeAdd3.addStep(workflow.id, { kind: "note", target: "none", title: "Step 3", enabled: true }); // maxOrder > 0

      // Add version to cover the : v branch in maps
      await updatedStoreBeforeAdd3.addWorkflowVersion(workflow.id, { steps: [] });
      
      let updatedStore = useWorkflowTemplateStore.getState();
      let currentVersion = updatedStore.getCurrentVersion(workflow.id)!;
      // We are now on version 2, which has 0 steps! Let's add steps to version 2
      await updatedStore.addStep(workflow.id, { kind: "prompt", target: "chat", title: "Step 1", enabled: true });
      await updatedStore.addStep(workflow.id, { kind: "scene", target: "scene_composer", title: "Step 2", enabled: true, order: 5 });
      await updatedStore.addStep(workflow.id, { kind: "note", target: "none", title: "Step 3", enabled: true });
      
      updatedStore = useWorkflowTemplateStore.getState();
      currentVersion = updatedStore.getCurrentVersion(workflow.id)!;
      expect(currentVersion.steps).toHaveLength(3);
      expect(currentVersion.steps[0].title).toBe("Step 1");
      expect(currentVersion.steps[1].title).toBe("Step 2");
      expect(currentVersion.steps[1].order).toBe(5);
      
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
      
      // Reorder subset (leaving some step out of orderedStepIds, hitting newOrder === -1 branch)
      await updatedStore.reorderSteps(workflow.id, [step1Id]);
      
      // Remove
      await updatedStore.removeStep(workflow.id, step2Id);
      
      updatedStore = useWorkflowTemplateStore.getState();
      currentVersion = updatedStore.getCurrentVersion(workflow.id)!;
      expect(currentVersion.steps).toHaveLength(2);
      expect(currentVersion.steps[0].id).toBe(step1Id);
    });

    it("addStep: does nothing if workflow not found", async () => {
      const store = useWorkflowTemplateStore.getState();
      await store.addStep("non-existent", { kind: "prompt", target: "chat", title: "S", enabled: true });
      expect(StorageService.saveItem).not.toHaveBeenCalled();
    });

    it("addStep: does nothing if current version not found", async () => {
      const store = useWorkflowTemplateStore.getState();
      const workflow = await store.createWorkflow({ title: "W" });
      
      // manually mess up the current version
      const s = useWorkflowTemplateStore.getState();
      useWorkflowTemplateStore.setState({
        workflows: [{ ...s.workflows[0], currentVersionId: "invalid-id" }]
      });
      
      vi.mocked(StorageService.saveItem).mockClear();
      await useWorkflowTemplateStore.getState().addStep(workflow.id, { kind: "prompt", target: "chat", title: "S", enabled: true });
      expect(StorageService.saveItem).not.toHaveBeenCalled();
    });

    it("addStep: handles save errors", async () => {
      const store = useWorkflowTemplateStore.getState();
      const workflow = await store.createWorkflow({ title: "W" });
      await store.createWorkflow({ title: "W2" }); // for map branch coverage
      
      vi.mocked(StorageService.saveItem).mockRejectedValueOnce(new Error("Add step fail"));
      const s = useWorkflowTemplateStore.getState();
      await expect(s.addStep(workflow.id, { kind: "prompt", target: "chat", title: "S", enabled: true })).rejects.toThrow("Add step fail");
      
      const currentVersion = useWorkflowTemplateStore.getState().getCurrentVersion(workflow.id)!;
      expect(currentVersion.steps).toHaveLength(0);
    });

    it("addStep: handles string save errors", async () => {
      const store = useWorkflowTemplateStore.getState();
      const workflow = await store.createWorkflow({ title: "W" });
      await store.createWorkflow({ title: "W2" }); // for map branch coverage
      
      vi.mocked(StorageService.saveItem).mockRejectedValueOnce("String add step fail");
      const s = useWorkflowTemplateStore.getState();
      await expect(s.addStep(workflow.id, { kind: "prompt", target: "chat", title: "S", enabled: true })).rejects.toThrow("String add step fail");
    });

    it("updateStep: does nothing if step not found", async () => {
      const store = useWorkflowTemplateStore.getState();
      const workflow = await store.createWorkflow({ title: "W" });
      const s = useWorkflowTemplateStore.getState();
      await s.updateStep(workflow.id, "non-existent-step", { title: "New" });
    });

    it("updateStep: does nothing if current version not found", async () => {
      const store = useWorkflowTemplateStore.getState();
      const workflow = await store.createWorkflow({ title: "W" });
      const s = useWorkflowTemplateStore.getState();
      useWorkflowTemplateStore.setState({
        workflows: [{ ...s.workflows[0], currentVersionId: "invalid-id" }]
      });
      await useWorkflowTemplateStore.getState().updateStep(workflow.id, "some-step", { title: "New" });
    });

    it("updateStep: handles save errors", async () => {
      const store = useWorkflowTemplateStore.getState();
      const workflow = await store.createWorkflow({ title: "W" });
      await store.createWorkflow({ title: "W2" }); // for map branch coverage
      const s1 = useWorkflowTemplateStore.getState();
      await s1.addStep(workflow.id, { kind: "prompt", target: "chat", title: "S", enabled: true });
      
      const s2 = useWorkflowTemplateStore.getState();
      const stepId = s2.getCurrentVersion(workflow.id)!.steps[0].id;
      
      vi.mocked(StorageService.saveItem).mockRejectedValueOnce(new Error("Update step fail"));
      await expect(s2.updateStep(workflow.id, stepId, { title: "New" })).rejects.toThrow("Update step fail");
    });

    it("updateStep: handles string save errors", async () => {
      const store = useWorkflowTemplateStore.getState();
      const workflow = await store.createWorkflow({ title: "W" });
      await store.createWorkflow({ title: "W2" }); // for map branch coverage
      const s1 = useWorkflowTemplateStore.getState();
      await s1.addStep(workflow.id, { kind: "prompt", target: "chat", title: "S", enabled: true });
      
      const s2 = useWorkflowTemplateStore.getState();
      const stepId = s2.getCurrentVersion(workflow.id)!.steps[0].id;
      
      vi.mocked(StorageService.saveItem).mockRejectedValueOnce("String update step fail");
      await expect(s2.updateStep(workflow.id, stepId, { title: "New" })).rejects.toThrow("String update step fail");
    });

    it("removeStep: does nothing if workflow not found", async () => {
      const store = useWorkflowTemplateStore.getState();
      await store.removeStep("non-existent", "step1");
    });

    it("removeStep: does nothing if current version not found", async () => {
      const store = useWorkflowTemplateStore.getState();
      const workflow = await store.createWorkflow({ title: "W" });
      const s = useWorkflowTemplateStore.getState();
      useWorkflowTemplateStore.setState({
        workflows: [{ ...s.workflows[0], currentVersionId: "invalid-id" }]
      });
      await useWorkflowTemplateStore.getState().removeStep(workflow.id, "step1");
    });

    it("removeStep: handles save errors", async () => {
      const store = useWorkflowTemplateStore.getState();
      const workflow = await store.createWorkflow({ title: "W" });
      await store.createWorkflow({ title: "W2" }); // Cover the w.id !== workflowId branch
      const s1 = useWorkflowTemplateStore.getState();
      await s1.addStep(workflow.id, { kind: "prompt", target: "chat", title: "S", enabled: true });
      
      const s2 = useWorkflowTemplateStore.getState();
      const stepId = s2.getCurrentVersion(workflow.id)!.steps[0].id;
      
      vi.mocked(StorageService.saveItem).mockRejectedValueOnce(new Error("Remove step fail"));
      await expect(s2.removeStep(workflow.id, stepId)).rejects.toThrow("Remove step fail");
    });

    it("removeStep: handles string save errors", async () => {
      const store = useWorkflowTemplateStore.getState();
      const workflow = await store.createWorkflow({ title: "W" });
      await store.createWorkflow({ title: "W2" }); // Cover the w.id !== workflowId branch
      const s1 = useWorkflowTemplateStore.getState();
      await s1.addStep(workflow.id, { kind: "prompt", target: "chat", title: "S", enabled: true });
      
      const s2 = useWorkflowTemplateStore.getState();
      const stepId = s2.getCurrentVersion(workflow.id)!.steps[0].id;
      
      vi.mocked(StorageService.saveItem).mockRejectedValueOnce("String remove step fail");
      await expect(s2.removeStep(workflow.id, stepId)).rejects.toThrow("String remove step fail");
    });

    it("reorderSteps: does nothing if workflow not found", async () => {
      const store = useWorkflowTemplateStore.getState();
      await store.reorderSteps("non-existent", ["step1"]);
    });

    it("reorderSteps: does nothing if current version not found", async () => {
      const store = useWorkflowTemplateStore.getState();
      const workflow = await store.createWorkflow({ title: "W" });
      const s = useWorkflowTemplateStore.getState();
      useWorkflowTemplateStore.setState({
        workflows: [{ ...s.workflows[0], currentVersionId: "invalid-id" }]
      });
      await useWorkflowTemplateStore.getState().reorderSteps(workflow.id, ["step1"]);
    });

    it("reorderSteps: handles save errors", async () => {
      const store = useWorkflowTemplateStore.getState();
      const workflow = await store.createWorkflow({ title: "W" });
      const s1 = useWorkflowTemplateStore.getState();
      await s1.addStep(workflow.id, { kind: "prompt", target: "chat", title: "S1", enabled: true });
      const s2 = useWorkflowTemplateStore.getState();
      await s2.addStep(workflow.id, { kind: "prompt", target: "chat", title: "S2", enabled: true });
      
      const s3 = useWorkflowTemplateStore.getState();
      const steps = s3.getCurrentVersion(workflow.id)!.steps;
      
      vi.mocked(StorageService.saveItem).mockRejectedValueOnce(new Error("Reorder step fail"));
      await expect(s3.reorderSteps(workflow.id, [steps[1].id, steps[0].id])).rejects.toThrow("Reorder step fail");
    });

    it("reorderSteps: handles string save errors", async () => {
      const store = useWorkflowTemplateStore.getState();
      const workflow = await store.createWorkflow({ title: "W" });
      await store.createWorkflow({ title: "W2" }); // Cover the w.id !== workflowId branch
      const s1 = useWorkflowTemplateStore.getState();
      await s1.addStep(workflow.id, { kind: "prompt", target: "chat", title: "S1", enabled: true });
      const s2 = useWorkflowTemplateStore.getState();
      await s2.addStep(workflow.id, { kind: "prompt", target: "chat", title: "S2", enabled: true });
      
      const s3 = useWorkflowTemplateStore.getState();
      const steps = s3.getCurrentVersion(workflow.id)!.steps;
      
      vi.mocked(StorageService.saveItem).mockRejectedValueOnce("String reorder step fail");
      await expect(s3.reorderSteps(workflow.id, [steps[1].id, steps[0].id])).rejects.toThrow("String reorder step fail");
    });
  });

  describe("archive, delete, favorite, active", () => {
    it("archiveWorkflow", async () => {
      const store = useWorkflowTemplateStore.getState();
      const workflow = await store.createWorkflow({ title: "W" });
      
      const s1 = useWorkflowTemplateStore.getState();
      await s1.archiveWorkflow(workflow.id);
      
      const s2 = useWorkflowTemplateStore.getState();
      expect(s2.getWorkflow(workflow.id)?.archivedAt).toBeTruthy();
    });

    it("unarchiveWorkflow", async () => {
      const store = useWorkflowTemplateStore.getState();
      const workflow = await store.createWorkflow({ title: "W" });
      
      const s1 = useWorkflowTemplateStore.getState();
      await s1.archiveWorkflow(workflow.id);
      const s2 = useWorkflowTemplateStore.getState();
      await s2.unarchiveWorkflow(workflow.id);
      
      const s3 = useWorkflowTemplateStore.getState();
      expect(s3.getWorkflow(workflow.id)?.archivedAt).toBeNull();
    });

    it("deleteWorkflow", async () => {
      const store = useWorkflowTemplateStore.getState();
      const workflow = await store.createWorkflow({ title: "W" });
      
      const s1 = useWorkflowTemplateStore.getState();
      await s1.deleteWorkflow(workflow.id);
      
      const s2 = useWorkflowTemplateStore.getState();
      expect(s2.getWorkflow(workflow.id)).toBeNull();
      expect(s2.activeWorkflowId).toBeNull();
      expect(StorageService.deleteItem).toHaveBeenCalledWith("workflowTemplates", workflow.id);
    });

    it("deleteWorkflow: does nothing if not found", async () => {
      const store = useWorkflowTemplateStore.getState();
      await store.deleteWorkflow("non-existent");
      expect(StorageService.deleteItem).not.toHaveBeenCalled();
    });

    it("deleteWorkflow: preserves activeWorkflowId if deleting non-active workflow", async () => {
      const store = useWorkflowTemplateStore.getState();
      const w1 = await store.createWorkflow({ title: "W1" });
      const w2 = await store.createWorkflow({ title: "W2" });
      await useWorkflowTemplateStore.getState().deleteWorkflow(w1.id);
      expect(useWorkflowTemplateStore.getState().activeWorkflowId).toBe(w2.id);
    });

    it("deleteWorkflow: handles errors", async () => {
      const store = useWorkflowTemplateStore.getState();
      const workflow = await store.createWorkflow({ title: "W" });
      
      vi.mocked(StorageService.deleteItem).mockRejectedValueOnce(new Error("Delete fail"));
      const s1 = useWorkflowTemplateStore.getState();
      
      await expect(s1.deleteWorkflow(workflow.id)).rejects.toThrow("Delete fail");
      
      const s2 = useWorkflowTemplateStore.getState();
      expect(s2.getWorkflow(workflow.id)).toBeTruthy();
      expect(s2.loadError).toBe("Delete fail");
    });

    it("deleteWorkflow: handles string errors", async () => {
      const store = useWorkflowTemplateStore.getState();
      const workflow = await store.createWorkflow({ title: "W" });
      
      vi.mocked(StorageService.deleteItem).mockRejectedValueOnce("String delete fail");
      const s1 = useWorkflowTemplateStore.getState();
      
      await expect(s1.deleteWorkflow(workflow.id)).rejects.toThrow("String delete fail");
      
      const s2 = useWorkflowTemplateStore.getState();
      expect(s2.loadError).toBe("String delete fail");
    });

    it("toggleWorkflowFavorite", async () => {
      const store = useWorkflowTemplateStore.getState();
      const workflow = await store.createWorkflow({ title: "W" });
      
      const s1 = useWorkflowTemplateStore.getState();
      await s1.toggleWorkflowFavorite(workflow.id);
      
      const s2 = useWorkflowTemplateStore.getState();
      expect(s2.getWorkflow(workflow.id)?.favorite).toBe(true);
      
      await s2.toggleWorkflowFavorite(workflow.id);
      
      const s3 = useWorkflowTemplateStore.getState();
      expect(s3.getWorkflow(workflow.id)?.favorite).toBe(false);
    });
    
    it("toggleWorkflowFavorite does nothing if not found", async () => {
      const store = useWorkflowTemplateStore.getState();
      await store.toggleWorkflowFavorite("non-existent");
    });

    it("setActiveWorkflow", async () => {
      const store = useWorkflowTemplateStore.getState();
      const workflow = await store.createWorkflow({ title: "W" });
      
      const s1 = useWorkflowTemplateStore.getState();
      s1.setActiveWorkflow(null);
      expect(useWorkflowTemplateStore.getState().activeWorkflowId).toBeNull();
      
      useWorkflowTemplateStore.getState().setActiveWorkflow(workflow.id);
      expect(useWorkflowTemplateStore.getState().activeWorkflowId).toBe(workflow.id);
    });
  });

  describe("getCurrentVersion", () => {
    it("returns null for non-existent workflow", () => {
      const store = useWorkflowTemplateStore.getState();
      expect(store.getCurrentVersion("non-existent")).toBeNull();
    });
    
    // It's hard to test the 'version not found' case using the public API since currentVersionId 
    // is always set to a valid version ID. We would have to manually manipulate the state.
    it("returns null if current version id does not exist", () => {
      const store = useWorkflowTemplateStore.getState();
      useWorkflowTemplateStore.setState({
        workflows: [{
          id: "w1", currentVersionId: "non-existent-v", versions: [],
          title: "W", scope: "global", tags: [], favorite: false,
          createdAt: "2023", updatedAt: "2023"
        } as unknown as WorkflowTemplateItem]
      });
      expect(useWorkflowTemplateStore.getState().getCurrentVersion("w1")).toBeNull();
    });
  });

  describe("importWorkflows", () => {
    it("imports workflows successfully", async () => {
      const store = useWorkflowTemplateStore.getState();
      const payload: WorkflowTemplateExport = {
        version: WORKFLOW_TEMPLATE_VERSION,
        exportedAt: "2023",
        app: "Venice Forge",
        workflows: [
          {
            id: "imp1", title: "Imported 1", scope: "global", currentVersionId: "v1",
            versions: [{ id: "v1", workflowId: "imp1", version: 1, title: "V1", steps: [], createdAt: "2023" }],
            tags: [], favorite: false, createdAt: "2023", updatedAt: "2023"
          }
        ]
      };
      
      const result = await store.importWorkflows(payload);
      
      expect(result.imported).toHaveLength(1);
      expect(result.skipped).toHaveLength(0);
      
      const s1 = useWorkflowTemplateStore.getState();
      expect(s1.workflows).toHaveLength(1);
      expect(s1.workflows[0].title).toBe("Imported 1");
      expect(StorageService.saveItem).toHaveBeenCalled();
    });

    it("handles persistence errors during import", async () => {
      const store = useWorkflowTemplateStore.getState();
      const payload: WorkflowTemplateExport = {
        version: WORKFLOW_TEMPLATE_VERSION,
        exportedAt: "2023",
        app: "Venice Forge",
        workflows: [
          {
            id: "imp1", title: "Imported 1", scope: "global", currentVersionId: "v1",
            versions: [{ id: "v1", workflowId: "imp1", version: 1, title: "V1", steps: [], createdAt: "2023" }],
            tags: [], favorite: false, createdAt: "2023", updatedAt: "2023"
          }
        ]
      };
      
      vi.mocked(StorageService.saveItem).mockRejectedValueOnce(new Error("Persist fail"));
      const result = await store.importWorkflows(payload);
      
      expect(result.imported).toHaveLength(0);
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0].reason).toContain("Persist fail");
      
      const s1 = useWorkflowTemplateStore.getState();
      expect(s1.workflows).toHaveLength(0);
    });

    it("handles persistence string errors during import", async () => {
      const store = useWorkflowTemplateStore.getState();
      const payload: WorkflowTemplateExport = {
        version: WORKFLOW_TEMPLATE_VERSION,
        exportedAt: "2023",
        app: "Venice Forge",
        workflows: [
          {
            id: "imp1", title: "Imported 1", scope: "global", currentVersionId: "v1",
            versions: [{ id: "v1", workflowId: "imp1", version: 1, title: "V1", steps: [], createdAt: "2023" }],
            tags: [], favorite: false, createdAt: "2023", updatedAt: "2023"
          }
        ]
      };
      
      vi.mocked(StorageService.saveItem).mockRejectedValueOnce("String persist fail");
      const result = await store.importWorkflows(payload);
      
      expect(result.skipped[0].reason).toContain("String persist fail");
    });

    it("handles import of invalid payload (empty _items)", async () => {
      const store = useWorkflowTemplateStore.getState();
      const result = await store.importWorkflows({});
      expect(result.imported).toHaveLength(0);
      expect(result.skipped.length).toBeGreaterThan(0);
    });

    it("skips if workflow already exists in state", async () => {
      // Mock randomUUID to produce predictable IDs so we can simulate already existing workflow
      const mockUUID = "1234-5678";
      const originalUUID = crypto.randomUUID;
      vi.spyOn(crypto, 'randomUUID').mockReturnValue(mockUUID);
      
      try {
        useWorkflowTemplateStore.setState({
          workflows: [{ id: mockUUID, title: "Existing", versions: [], scope: "global", currentVersionId: "v-id", tags: [], favorite: false, createdAt: "2023", updatedAt: "2023" } as unknown as WorkflowTemplateItem]
        });
        const store = useWorkflowTemplateStore.getState();
        
        const payload: WorkflowTemplateExport = {
          version: WORKFLOW_TEMPLATE_VERSION,
          exportedAt: "2023",
          app: "Venice Forge",
          workflows: [{ id: "imp1", title: "I", scope: "global", currentVersionId: "v1", versions: [{ id: "v1", workflowId: "imp1", version: 1, title: "V1", steps: [], createdAt: "2023" }], tags: [], favorite: false, createdAt: "2023", updatedAt: "2023" }]
        };
        
        await store.importWorkflows(payload);
        
        const s1 = useWorkflowTemplateStore.getState();
        expect(s1.workflows).toHaveLength(1); // Didn't add a new one
      } finally {
        vi.restoreAllMocks(); // restore crypto.randomUUID
      }
    });
  });

  describe("exportWorkflows", () => {
    it("exports specified workflows", async () => {
      const store = useWorkflowTemplateStore.getState();
      const w1 = await store.createWorkflow({ title: "W1" });
      const w2 = await store.createWorkflow({ title: "W2" });
      
      const s1 = useWorkflowTemplateStore.getState();
      const exported = s1.exportWorkflows([w1.id]) as WorkflowTemplateExport;
      
      expect(exported.app).toBe("Venice Forge");
      expect(exported.workflows).toHaveLength(1);
      expect(exported.workflows[0].id).toBe(w1.id);
      expect(exported.workflows[0].title).toBe("W1");
    });
  });
});