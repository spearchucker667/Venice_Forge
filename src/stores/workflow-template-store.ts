import { create } from "zustand";
import StorageService from "../services/storageService";
import {
  type WorkflowTemplateItem,
  type WorkflowVersion,
  type WorkflowStep,
  type WorkflowScope,
  createWorkflowTemplateItem,
  createWorkflowVersion,
  sanitizeWorkflowTemplateItem,
  sanitizeWorkflowStep,
  parseWorkflowTemplateImport,
  exportWorkflowTemplateItems,
} from "../types/workflow";
import { useProjectStore } from "./project-store";
import { useSettingsStore } from "./settings-store";

export interface WorkflowTemplateState {
  workflows: WorkflowTemplateItem[];
  activeWorkflowId: string | null;
  hydrated: boolean;
  loadError: string | null;

  ensureWorkflowTemplatesLoaded(): Promise<void>;

  createWorkflow(input: {
    title: string;
    description?: string;
    scope?: WorkflowScope;
    projectId?: string | null;
    tags?: string[];
    steps?: WorkflowStep[];
    source?: WorkflowVersion["source"];
  }): Promise<WorkflowTemplateItem>;

  updateWorkflow(workflowId: string, patch: {
    title?: string;
    description?: string;
    tags?: string[];
    favorite?: boolean;
    archivedAt?: string | null;
  }): Promise<void>;

  addWorkflowVersion(workflowId: string, input: {
    title?: string;
    steps: WorkflowStep[];
    notes?: string;
    source?: WorkflowVersion["source"];
  }): Promise<WorkflowVersion>;

  setCurrentWorkflowVersion(workflowId: string, versionId: string): Promise<void>;

  addStep(workflowId: string, step: Omit<WorkflowStep, "id" | "order"> & { order?: number }): Promise<void>;
  updateStep(workflowId: string, stepId: string, patch: Partial<WorkflowStep>): Promise<void>;
  removeStep(workflowId: string, stepId: string): Promise<void>;
  reorderSteps(workflowId: string, orderedStepIds: string[]): Promise<void>;

  archiveWorkflow(workflowId: string): Promise<void>;
  unarchiveWorkflow(workflowId: string): Promise<void>;
  deleteWorkflow(workflowId: string): Promise<void>;
  toggleWorkflowFavorite(workflowId: string): Promise<void>;
  setActiveWorkflow(workflowId: string | null): void;

  getWorkflow(workflowId: string): WorkflowTemplateItem | null;
  getCurrentVersion(workflowId: string): WorkflowVersion | null;

  importWorkflows(payload: unknown): Promise<{ imported: string[]; skipped: Array<{ reason: string; title?: string }> }>;
  exportWorkflows(workflowIds: string[]): unknown;
}

async function persistOne(workflow: WorkflowTemplateItem): Promise<void> {
  await StorageService.saveItem("workflowTemplates", workflow as unknown as Record<string, unknown>);
}

async function deleteOne(workflowId: string): Promise<void> {
  await StorageService.deleteItem("workflowTemplates", workflowId);
}

export const useWorkflowTemplateStore = create<WorkflowTemplateState>((set, get) => ({
  workflows: [],
  activeWorkflowId: null,
  hydrated: false,
  loadError: null,

  ensureWorkflowTemplatesLoaded: async () => {
    if (get().hydrated) return;
    try {
      const raw = await StorageService.getItems<WorkflowTemplateItem[]>("workflowTemplates");
      if (raw && Array.isArray(raw)) {
        set({ workflows: raw.map(sanitizeWorkflowTemplateItem), hydrated: true });
      } else {
        set({ workflows: [], hydrated: true });
      }
    } catch (err) {
      console.warn("[workflow-template-store] Failed to load workflows", err);
      set({ workflows: [], hydrated: true, loadError: err instanceof Error ? err.message : String(err) });
    }
  },

  createWorkflow: async (input) => {
    const { activeProjectId } = useSettingsStore.getState();
    const projectId = input.scope === "global" ? null : (input.projectId ?? activeProjectId ?? null);
    const scope = input.scope || (projectId ? "project" : "global");

    const newVersion = createWorkflowVersion({
      workflowId: "temp",
      version: 1,
      title: "Initial Version",
      steps: input.steps?.map(sanitizeWorkflowStep) || [],
      source: input.source,
    });

    const newItem = createWorkflowTemplateItem({
      title: input.title,
      description: input.description,
      scope,
      projectId,
      tags: input.tags,
      versions: [newVersion],
      currentVersionId: newVersion.id,
    });

    newVersion.workflowId = newItem.id;

    set((s) => ({ workflows: [newItem, ...s.workflows], activeWorkflowId: newItem.id }));
    try {
      await persistOne(newItem);
    } catch (err) {
      set((s) => ({
        workflows: s.workflows.filter((w) => w.id !== newItem.id),
        activeWorkflowId: s.activeWorkflowId === newItem.id ? null : s.activeWorkflowId,
        loadError: err instanceof Error ? err.message : String(err),
      }));
      throw err;
    }

    return newItem;
  },

  updateWorkflow: async (workflowId, patch) => {
    const current = get().workflows.find((w) => w.id === workflowId);
    if (!current) return;

    const next = sanitizeWorkflowTemplateItem({ ...current, ...patch, updatedAt: new Date().toISOString() });
    set((s) => ({ workflows: s.workflows.map((w) => (w.id === workflowId ? next : w)) }));

    try {
      await persistOne(next);
    } catch (err) {
      set((s) => ({
        workflows: s.workflows.map((w) => (w.id === workflowId ? current : w)),
        loadError: err instanceof Error ? err.message : String(err),
      }));
      throw err;
    }
  },

  addWorkflowVersion: async (workflowId, input) => {
    const current = get().workflows.find((w) => w.id === workflowId);
    if (!current) throw new Error("Workflow not found");

    const nextVersionNumber = Math.max(0, ...current.versions.map((v) => v.version)) + 1;

    const newVersion = createWorkflowVersion({
      workflowId,
      version: nextVersionNumber,
      title: input.title || `Version ${nextVersionNumber}`,
      steps: input.steps.map(sanitizeWorkflowStep),
      notes: input.notes,
      source: input.source,
    });

    const next = sanitizeWorkflowTemplateItem({
      ...current,
      versions: [...current.versions, newVersion],
      currentVersionId: newVersion.id,
      updatedAt: new Date().toISOString(),
    });

    set((s) => ({ workflows: s.workflows.map((w) => (w.id === workflowId ? next : w)) }));

    try {
      await persistOne(next);
    } catch (err) {
      set((s) => ({
        workflows: s.workflows.map((w) => (w.id === workflowId ? current : w)),
        loadError: err instanceof Error ? err.message : String(err),
      }));
      throw err;
    }

    return newVersion;
  },

  setCurrentWorkflowVersion: async (workflowId, versionId) => {
    const current = get().workflows.find((w) => w.id === workflowId);
    if (!current) return;
    if (!current.versions.some((v) => v.id === versionId)) return;
    if (current.currentVersionId === versionId) return;

    const next = sanitizeWorkflowTemplateItem({
      ...current,
      currentVersionId: versionId,
      updatedAt: new Date().toISOString(),
    });

    set((s) => ({ workflows: s.workflows.map((w) => (w.id === workflowId ? next : w)) }));

    try {
      await persistOne(next);
    } catch (err) {
      set((s) => ({
        workflows: s.workflows.map((w) => (w.id === workflowId ? current : w)),
        loadError: err instanceof Error ? err.message : String(err),
      }));
      throw err;
    }
  },

  addStep: async (workflowId, stepInput) => {
    const current = get().workflows.find((w) => w.id === workflowId);
    if (!current) return;

    const currentVersion = current.versions.find((v) => v.id === current.currentVersionId);
    if (!currentVersion) return;

    const steps = [...currentVersion.steps];
    const maxOrder = steps.length > 0 ? Math.max(...steps.map((s) => s.order)) : -1;
    const order = stepInput.order !== undefined ? stepInput.order : maxOrder + 1;

    const newStep = sanitizeWorkflowStep({ ...stepInput, id: crypto.randomUUID(), order });
    steps.push(newStep);
    steps.sort((a, b) => a.order - b.order);

    const nextVersions = current.versions.map((v) => 
      v.id === current.currentVersionId ? { ...v, steps } : v
    );

    const next = sanitizeWorkflowTemplateItem({
      ...current,
      versions: nextVersions,
      updatedAt: new Date().toISOString(),
    });

    set((s) => ({ workflows: s.workflows.map((w) => (w.id === workflowId ? next : w)) }));

    try {
      await persistOne(next);
    } catch (err) {
      set((s) => ({
        workflows: s.workflows.map((w) => (w.id === workflowId ? current : w)),
        loadError: err instanceof Error ? err.message : String(err),
      }));
      throw err;
    }
  },

  updateStep: async (workflowId, stepId, patch) => {
    const current = get().workflows.find((w) => w.id === workflowId);
    if (!current) return;

    const currentVersion = current.versions.find((v) => v.id === current.currentVersionId);
    if (!currentVersion) return;

    const stepIndex = currentVersion.steps.findIndex((s) => s.id === stepId);
    if (stepIndex === -1) return;

    const steps = [...currentVersion.steps];
    steps[stepIndex] = sanitizeWorkflowStep({ ...steps[stepIndex], ...patch });
    steps.sort((a, b) => a.order - b.order);

    const nextVersions = current.versions.map((v) => 
      v.id === current.currentVersionId ? { ...v, steps } : v
    );

    const next = sanitizeWorkflowTemplateItem({
      ...current,
      versions: nextVersions,
      updatedAt: new Date().toISOString(),
    });

    set((s) => ({ workflows: s.workflows.map((w) => (w.id === workflowId ? next : w)) }));

    try {
      await persistOne(next);
    } catch (err) {
      set((s) => ({
        workflows: s.workflows.map((w) => (w.id === workflowId ? current : w)),
        loadError: err instanceof Error ? err.message : String(err),
      }));
      throw err;
    }
  },

  removeStep: async (workflowId, stepId) => {
    const current = get().workflows.find((w) => w.id === workflowId);
    if (!current) return;

    const currentVersion = current.versions.find((v) => v.id === current.currentVersionId);
    if (!currentVersion) return;

    const steps = currentVersion.steps.filter((s) => s.id !== stepId);

    const nextVersions = current.versions.map((v) => 
      v.id === current.currentVersionId ? { ...v, steps } : v
    );

    const next = sanitizeWorkflowTemplateItem({
      ...current,
      versions: nextVersions,
      updatedAt: new Date().toISOString(),
    });

    set((s) => ({ workflows: s.workflows.map((w) => (w.id === workflowId ? next : w)) }));

    try {
      await persistOne(next);
    } catch (err) {
      set((s) => ({
        workflows: s.workflows.map((w) => (w.id === workflowId ? current : w)),
        loadError: err instanceof Error ? err.message : String(err),
      }));
      throw err;
    }
  },

  reorderSteps: async (workflowId, orderedStepIds) => {
    const current = get().workflows.find((w) => w.id === workflowId);
    if (!current) return;

    const currentVersion = current.versions.find((v) => v.id === current.currentVersionId);
    if (!currentVersion) return;

    const steps = [...currentVersion.steps];
    steps.forEach((step) => {
      const newOrder = orderedStepIds.indexOf(step.id);
      if (newOrder !== -1) {
        step.order = newOrder;
      }
    });
    steps.sort((a, b) => a.order - b.order);

    const nextVersions = current.versions.map((v) => 
      v.id === current.currentVersionId ? { ...v, steps } : v
    );

    const next = sanitizeWorkflowTemplateItem({
      ...current,
      versions: nextVersions,
      updatedAt: new Date().toISOString(),
    });

    set((s) => ({ workflows: s.workflows.map((w) => (w.id === workflowId ? next : w)) }));

    try {
      await persistOne(next);
    } catch (err) {
      set((s) => ({
        workflows: s.workflows.map((w) => (w.id === workflowId ? current : w)),
        loadError: err instanceof Error ? err.message : String(err),
      }));
      throw err;
    }
  },

  archiveWorkflow: async (workflowId) => {
    const store = get();
    await store.updateWorkflow(workflowId, { archivedAt: new Date().toISOString() });
  },

  unarchiveWorkflow: async (workflowId) => {
    const store = get();
    await store.updateWorkflow(workflowId, { archivedAt: null });
  },

  deleteWorkflow: async (workflowId) => {
    const current = get().workflows.find((w) => w.id === workflowId);
    if (!current) return;

    const next = get().workflows.filter((w) => w.id !== workflowId);
    const nextActive = get().activeWorkflowId === workflowId ? null : get().activeWorkflowId;
    set({ workflows: next, activeWorkflowId: nextActive });

    try {
      await deleteOne(workflowId);
    } catch (err) {
      set((s) => ({
        workflows: [...s.workflows, current],
        activeWorkflowId: current.id,
        loadError: err instanceof Error ? err.message : String(err),
      }));
      throw err;
    }
  },

  toggleWorkflowFavorite: async (workflowId) => {
    const workflow = get().getWorkflow(workflowId);
    if (workflow) {
      await get().updateWorkflow(workflowId, { favorite: !workflow.favorite });
    }
  },

  setActiveWorkflow: (workflowId) => set({ activeWorkflowId: workflowId }),

  getWorkflow: (workflowId) => get().workflows.find((w) => w.id === workflowId) || null,

  getCurrentVersion: (workflowId) => {
    const workflow = get().getWorkflow(workflowId);
    if (!workflow) return null;
    return workflow.versions.find((v) => v.id === workflow.currentVersionId) || null;
  },

  importWorkflows: async (payload) => {
    const result = parseWorkflowTemplateImport(payload);
    const importedItems = (result as any)._items || [];

    for (const fresh of importedItems) {
      try {
        await persistOne(fresh);
      } catch (err) {
        result.skipped.push({
          reason: `Persistence failed: ${err instanceof Error ? err.message : String(err)}`,
          title: fresh.title,
        });
        // Remove from imported list since it failed to persist
        result.imported = result.imported.filter(id => id !== fresh.id);
        continue;
      }
      set((s) => {
        if (s.workflows.some((w) => w.id === fresh.id)) return s;
        return { workflows: [fresh, ...s.workflows] };
      });
    }

    return { imported: result.imported, skipped: result.skipped };
  },

  exportWorkflows: (workflowIds) => {
    const workflows = get().workflows.filter((w) => workflowIds.includes(w.id));
    return exportWorkflowTemplateItems(workflows);
  },
}));