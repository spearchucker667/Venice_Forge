import { useState, useMemo, useEffect } from "react";
import { useWorkflowTemplateStore } from "../../stores/workflow-template-store";
import { useSettingsStore } from "../../stores/settings-store";
import { compileWorkflowTemplate } from "../../services/workflowCompiler";
import { createWorkflowRunPlan, type WorkflowRunAction } from "../../services/workflowRunner";
import type { TabId } from "../../config/tabs";
import { ConfirmModal } from "../ConfirmModal";
import { toast } from "../../stores/toast-store";
import { useImageWorkspaceStore } from "../../stores/image-workspace-store";
import type { WorkflowStepKind, WorkflowStepTarget } from "../../types/workflow";

const WORKFLOW_STEP_KINDS: WorkflowStepKind[] = ["prompt", "image_recipe", "scene", "media", "research", "rp_character", "rp_scenario", "handoff", "note"];
const WORKFLOW_STEP_TARGETS: WorkflowStepTarget[] = ["chat", "image_studio", "media_studio", "research", "scene_composer", "rp_studio", "none"];

export function WorkflowTemplatesView() {
  const store = useWorkflowTemplateStore();
  const { workflows, activeWorkflowId, setActiveWorkflow, createWorkflow, updateWorkflow, deleteWorkflow, archiveWorkflow, addStep, updateStep, removeStep, ensureWorkflowTemplatesLoaded, addWorkflowVersion, setCurrentWorkflowVersion, importWorkflows, exportWorkflows, toggleWorkflowFavorite } = store;
  
  const activeProjectId = useSettingsStore((s) => s.activeProjectId);
  const setActiveTab = useSettingsStore((s) => s.setActiveTab);

  useEffect(() => {
    ensureWorkflowTemplatesLoaded();
  }, [ensureWorkflowTemplatesLoaded]);

  const [search, setSearch] = useState("");
  const [workflowToDelete, setWorkflowToDelete] = useState<string | null>(null);

  const filteredWorkflows = useMemo(() => {
    return workflows.filter((w) => {
      // Basic search filtering
      if (search && !w.title.toLowerCase().includes(search.toLowerCase())) return false;
      // Project scoping
      if (activeProjectId && w.scope === "project" && w.projectId !== activeProjectId) return false;
      // Hide archived by default
      if (w.archivedAt) return false;
      return true;
    });
  }, [workflows, activeProjectId, search]);

  const activeWorkflow = useMemo(() => {
    return workflows.find((w) => w.id === activeWorkflowId) || null;
  }, [workflows, activeWorkflowId]);

  const activeVersion = useMemo(() => {
    if (!activeWorkflow) return null;
    return activeWorkflow.versions.find((v) => v.id === activeWorkflow.currentVersionId) || null;
  }, [activeWorkflow]);

  const [localTitle, setLocalTitle] = useState("");
  const titleDirty = activeWorkflow ? localTitle !== activeWorkflow.title : false;

  useEffect(() => {
    if (activeWorkflow) {
      setLocalTitle(activeWorkflow.title);
    }
  }, [activeWorkflow]);

  useEffect(() => {
    if (activeWorkflow && titleDirty) {
      const timer = setTimeout(() => {
        updateWorkflow(activeWorkflow.id, { title: localTitle });
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [localTitle, activeWorkflow, updateWorkflow, titleDirty]);

  const [localTags, setLocalTags] = useState("");
  const tagsDirty = activeWorkflow ? localTags !== (activeWorkflow.tags?.join(", ") || "") : false;

  useEffect(() => {
    if (activeWorkflow) {
      setLocalTags(activeWorkflow.tags?.join(", ") || "");
    }
  }, [activeWorkflow]);
  
  useEffect(() => {
    if (activeWorkflow && tagsDirty) {
      const timer = setTimeout(() => {
        const parsedTags = localTags.split(",").map(t => t.trim()).filter(Boolean);
        updateWorkflow(activeWorkflow.id, { tags: parsedTags });
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [localTags, activeWorkflow, updateWorkflow, tagsDirty]);

  const handleSelectWorkflow = (id: string) => {
    if (activeWorkflow && (titleDirty || tagsDirty)) {
      // Flush before switch
      if (titleDirty) updateWorkflow(activeWorkflow.id, { title: localTitle });
      if (tagsDirty) updateWorkflow(activeWorkflow.id, { tags: localTags.split(",").map(t => t.trim()).filter(Boolean) });
    }
    setActiveWorkflow(id);
  };

  // Derive compiled state and run plan
  const compiled = useMemo(() => {
    if (!activeWorkflow || !activeVersion) return null;
    return compileWorkflowTemplate(activeWorkflow, activeVersion);
  }, [activeWorkflow, activeVersion]);

  const runPlan = useMemo(() => {
    if (!compiled) return null;
    return createWorkflowRunPlan(compiled);
  }, [compiled]);

  const handleCreateWorkflow = async () => {
    const w = await createWorkflow({ title: "New Workflow" });
    setActiveWorkflow(w.id);
  };

  const handleRunStep = (action: WorkflowRunAction) => {
    const prompt = typeof action.payload?.prompt === "string"
      ? action.payload.prompt
      : typeof action.payload?.text === "string"
        ? action.payload.text
        : "";
    if (action.tabId === "image" && prompt.trim()) {
      useImageWorkspaceStore.getState().enqueueGenerate({
        draft: {
          prompt: prompt.trim(),
          negativePrompt: typeof action.payload?.negativePrompt === "string" ? action.payload.negativePrompt : undefined,
          model: typeof action.payload?.model === "string" ? action.payload.model : undefined,
          width: typeof action.payload?.width === "number" ? action.payload.width : undefined,
          height: typeof action.payload?.height === "number" ? action.payload.height : undefined,
          aspectRatio: typeof action.payload?.aspectRatio === "string" ? action.payload.aspectRatio : undefined,
        },
        autoGenerate: false,
        parentId: null,
        operation: "generate",
      });
      toast.success("Workflow image prompt loaded", "Review the model and settings, then generate.");
    }
    if (action.tabId) setActiveTab(action.tabId as TabId);
  };
  
  const handleExport = () => {
    if (!activeWorkflow) return;
    const payload = exportWorkflows([activeWorkflow.id]);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `workflow-${activeWorkflow.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  
  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const payload = JSON.parse(event.target?.result as string);
        await importWorkflows(payload);
        toast.success("Workflows imported");
      } catch (err) {
        console.error("Failed to import workflows", err);
        toast.error("Failed to import workflows");
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <>
    <div className="flex flex-col md:flex-row h-full min-h-0 w-full" data-testid="workflow-templates-view">
      {/* Sidebar List */}
      <div className="w-full md:w-1/3 lg:w-[clamp(280px,30%,400px)] shrink-0 soft-separator-b md:soft-separator-b-0 md:soft-separator-r p-4 overflow-y-auto flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <h2 className="text-sm font-semibold text-text-secondary">Workflows</h2>
          <div className="flex gap-2">
            <label className="text-xs bg-surface-hover hover:bg-surface-hover text-text-primary px-2 py-1 rounded cursor-pointer">
              Import
              <input type="file" accept=".json" className="hidden" onChange={handleImport} />
            </label>
            <button
              onClick={handleCreateWorkflow}
              className="text-xs bg-surface-hover hover:bg-surface-hover text-text-primary px-2 py-1 rounded"
              data-testid="create-workflow-btn"
            >
              New
            </button>
          </div>
        </div>
        <input
          type="text"
          placeholder="Search workflows..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-surface border border-border rounded px-2 py-1 text-xs text-text-primary"
          data-testid="workflow-search-input"
          aria-label="Search workflows"
        />
        <div className="space-y-2 overflow-y-auto flex-1 min-h-0" role="listbox" aria-label="Workflow templates">
          {filteredWorkflows.length === 0 ? (
            <div className="text-xs text-text-secondary p-2">No workflows found.</div>
          ) : (
            filteredWorkflows.map((w) => (
              <button
                key={w.id}
                role="option"
                aria-selected={w.id === activeWorkflow?.id}
                onClick={() => handleSelectWorkflow(w.id)}
                className={`w-full text-left cursor-pointer p-2 rounded border flex justify-between items-center outline-none focus-visible:ring-2 focus-visible:ring-accent ${w.id === activeWorkflow?.id ? "bg-surface-hover border-border" : "hover:bg-surface-hover border-border/0"}`}
              >
                <div className="overflow-hidden">
                  <div className="text-sm text-text-primary truncate flex items-center gap-2">
                    {w.favorite && <span className="text-yellow-400" aria-label="Favorite">★</span>}
                    {w.title}
                  </div>
                  <div className="text-xs text-text-secondary">{w.scope === "global" ? "Global" : "Project"}</div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Detail View */}
      {!activeWorkflow || !activeVersion ? (
        <div className="flex-1 flex items-center justify-center text-sm text-text-secondary" data-testid="empty-state">
          Select or create a workflow to begin.
        </div>
      ) : (
      <div className="flex-1 flex flex-col h-full bg-surface overflow-y-auto p-4 md:p-6 min-w-0" data-testid="workflow-detail">
        <div className="flex flex-col xl:flex-row justify-between items-start mb-6 gap-4">
          <div className="flex flex-col w-full xl:w-1/2 gap-3">
            <label className="sr-only" htmlFor="workflow-title">Workflow Title</label>
            <input
              id="workflow-title"
              type="text"
              value={localTitle}
              onChange={(e) => setLocalTitle(e.target.value)}
              className="bg-transparent text-xl font-semibold text-text-primary outline-none border-b border-border/0 focus:border-border w-full py-1"
              data-testid="workflow-title-input"
            />
            <label className="sr-only" htmlFor="workflow-tags">Workflow Tags</label>
            <input
              id="workflow-tags"
              type="text"
              value={localTags}
              placeholder="Tags (comma separated)..."
              onChange={(e) => setLocalTags(e.target.value)}
              className="bg-transparent text-xs text-text-secondary outline-none border-b border-border/0 focus:border-border w-full py-1"
              data-testid="workflow-tags-input"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => toggleWorkflowFavorite(activeWorkflow.id)}
              className={`text-xs px-3 py-1.5 rounded ${activeWorkflow.favorite ? 'bg-yellow-500/20 text-yellow-300 hover:bg-yellow-500/30' : 'bg-surface-hover hover:bg-surface-hover text-text-secondary'}`}
              data-testid="favorite-workflow-btn"
            >
              {activeWorkflow.favorite ? 'Unfavorite' : 'Favorite'}
            </button>
            <button
              onClick={handleExport}
              className="text-xs bg-surface-hover hover:bg-surface-hover text-text-secondary px-3 py-1.5 rounded"
              data-testid="export-workflow-btn"
            >
              Export
            </button>
            <button
              onClick={() => archiveWorkflow(activeWorkflow.id)}
              className="text-xs bg-surface-hover hover:bg-surface-hover text-text-secondary px-3 py-1.5 rounded"
              data-testid="archive-workflow-btn"
            >
              Archive
            </button>
            <button
              onClick={() => {
                setWorkflowToDelete(activeWorkflow.id);
              }}
              className="text-xs bg-red-500/10 hover:bg-red-500/20 text-red-400 px-3 py-1.5 rounded"
              data-testid="delete-workflow-btn"
            >
              Delete
            </button>
          </div>
        </div>
        
        {/* Versions Control */}
        <div className="mb-6 flex flex-wrap gap-4 items-center">
          <label htmlFor="workflow-version" className="text-sm font-medium text-text-secondary">Version:</label>
          <select
            id="workflow-version"
            value={activeWorkflow.currentVersionId}
            onChange={(e) => setCurrentWorkflowVersion(activeWorkflow.id, e.target.value)}
            className="bg-surface border border-border text-text-primary text-xs rounded px-2 py-1"
            data-testid="workflow-version-select"
          >
            {activeWorkflow.versions.map((v) => (
              <option key={v.id} value={v.id}>{v.title || "Untitled Version"} ({new Date(v.createdAt).toLocaleDateString()})</option>
            ))}
          </select>
          <button
            onClick={() => addWorkflowVersion(activeWorkflow.id, { steps: activeVersion.steps })}
            className="text-xs bg-surface-hover hover:bg-surface-hover text-text-secondary px-2 py-1 rounded"
            data-testid="add-version-btn"
          >
            Add New Version
          </button>
        </div>

        {/* Steps List */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-medium text-text-secondary">Steps</h3>
            <button
              onClick={() => addStep(activeWorkflow.id, { kind: "prompt", target: "chat", title: "New Prompt Step", enabled: true })}
              className="text-xs bg-surface-hover hover:bg-surface-hover text-text-primary px-2 py-1 rounded"
              data-testid="add-step-btn"
            >
              Add Step
            </button>
          </div>
          <div className="space-y-2">
            {activeVersion.steps.map((step) => (
              <div key={step.id} className="p-3 bg-surface-hover rounded border border-border flex flex-col gap-3" data-testid="workflow-step-item">
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_11rem_11rem_auto] gap-2 items-center">
                  <span className="sr-only">{step.title}</span>
                  <input aria-label="Workflow step title" value={step.title} onChange={(event) => void updateStep(activeWorkflow.id, step.id, { title: event.target.value })} className="rounded border border-border bg-surface px-2 py-1.5 text-xs text-text-primary" />
                  <select aria-label="Workflow step kind" value={step.kind} onChange={(event) => void updateStep(activeWorkflow.id, step.id, { kind: event.target.value as WorkflowStepKind })} className="rounded border border-border bg-surface px-2 py-1.5 text-xs text-text-primary">
                    {WORKFLOW_STEP_KINDS.map((kind) => <option key={kind} value={kind}>{kind.replaceAll('_', ' ')}</option>)}
                  </select>
                  <select aria-label="Workflow step target" value={step.target} onChange={(event) => void updateStep(activeWorkflow.id, step.id, { target: event.target.value as WorkflowStepTarget })} className="rounded border border-border bg-surface px-2 py-1.5 text-xs text-text-primary">
                    {WORKFLOW_STEP_TARGETS.map((target) => <option key={target} value={target}>{target.replaceAll('_', ' ')}</option>)}
                  </select>
                <button
                  onClick={() => removeStep(activeWorkflow.id, step.id)}
                  className="text-xs text-text-secondary hover:text-red-400 px-2 py-1"
                  data-testid="remove-step-btn"
                >
                  Remove
                </button>
                </div>
                {(step.kind === "prompt" || step.kind === "image_recipe" || step.kind === "research" || step.kind === "note") && (
                  <textarea
                    aria-label="Workflow step prompt"
                    value={typeof step.input?.prompt === "string" ? step.input.prompt : typeof step.input?.text === "string" ? step.input.text : ""}
                    onChange={(event) => void updateStep(activeWorkflow.id, step.id, { input: { ...step.input, prompt: event.target.value } })}
                    placeholder={step.target === "image_studio" ? "Describe the image to generate…" : "Enter the prompt or instructions for this step…"}
                    rows={3}
                    className="w-full resize-y rounded border border-border bg-surface px-2 py-1.5 text-xs text-text-primary"
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Compile Preview & Run Plan */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-auto">
          <div className="p-4 bg-surface rounded border border-border flex flex-col" data-testid="compile-preview">
            <h4 className="text-xs uppercase tracking-wider font-medium text-text-secondary mb-2">Compile Preview</h4>
            {compiled?.canRun ? (
              <div className="text-xs text-green-400/80">Workflow is valid.</div>
            ) : (
              <div className="text-xs text-red-400/80">Workflow has errors.</div>
            )}
            <div className="mt-2 space-y-1">
              {compiled?.warnings.map((w) => (
                <div key={w.id} className={`text-xs ${w.severity === 'error' ? 'text-red-400' : 'text-yellow-400'}`}>
                  {w.message}
                </div>
              ))}
            </div>
          </div>

          <div className="p-4 bg-surface rounded border border-border flex flex-col" data-testid="run-plan-preview">
            <h4 className="text-xs uppercase tracking-wider font-medium text-text-secondary mb-2">Run Plan</h4>
            {runPlan?.actions.length === 0 ? (
              <div className="text-xs text-text-secondary">No runnable actions.</div>
            ) : (
              <div className="space-y-2">
                {runPlan?.actions.map((action) => (
                  <div key={action.id} className="flex justify-between items-center gap-2">
                    <span className="text-xs text-text-secondary truncate">{action.label}</span>
                    <button
                      onClick={() => handleRunStep(action)}
                      className="text-xs bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 px-2 py-1 rounded whitespace-nowrap"
                      data-testid="run-step-btn"
                    >
                      {action.tabId ? `Open ${action.tabId}` : "Execute"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      )}
    </div>
    <ConfirmModal
        open={workflowToDelete !== null}
        message="Are you sure you want to delete this workflow permanently?"
        detail="This action cannot be undone."
        onConfirm={() => {
          if (workflowToDelete) {
            deleteWorkflow(workflowToDelete);
          }
          setWorkflowToDelete(null);
        }}
        onCancel={() => setWorkflowToDelete(null)}
        confirmLabel="Delete"
        confirmTone="danger"
      />
    </>
  );
}
