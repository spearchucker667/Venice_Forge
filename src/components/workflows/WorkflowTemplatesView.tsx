import { useState, useMemo, useEffect } from "react";
import { useWorkflowTemplateStore } from "../../stores/workflow-template-store";
import { useSettingsStore, type Tab } from "../../stores/settings-store";
import { compileWorkflowTemplate } from "../../services/workflowCompiler";
import { createWorkflowRunPlan } from "../../services/workflowRunner";
import { ConfirmModal } from "../ConfirmModal";

export function WorkflowTemplatesView() {
  const store = useWorkflowTemplateStore();
  const { workflows, activeWorkflowId, setActiveWorkflow, createWorkflow, updateWorkflow, deleteWorkflow, archiveWorkflow, addStep, removeStep, ensureWorkflowTemplatesLoaded, addWorkflowVersion, setCurrentWorkflowVersion, importWorkflows, exportWorkflows, toggleWorkflowFavorite } = store;
  
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

  // Debounced title edit
  const [localTitle, setLocalTitle] = useState("");
  useEffect(() => {
    if (activeWorkflow) {
      setLocalTitle(activeWorkflow.title);
    }
  }, [activeWorkflow?.id]); // only update local title when active workflow changes

  useEffect(() => {
    if (activeWorkflow && localTitle !== activeWorkflow.title) {
      const timer = setTimeout(() => {
        updateWorkflow(activeWorkflow.id, { title: localTitle });
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [localTitle, activeWorkflow, updateWorkflow]);

  const [localTags, setLocalTags] = useState("");
  useEffect(() => {
    if (activeWorkflow) {
      setLocalTags(activeWorkflow.tags?.join(", ") || "");
    }
  }, [activeWorkflow?.id]);
  
  useEffect(() => {
    if (activeWorkflow && localTags !== (activeWorkflow.tags?.join(", ") || "")) {
      const timer = setTimeout(() => {
        const parsedTags = localTags.split(",").map(t => t.trim()).filter(Boolean);
        updateWorkflow(activeWorkflow.id, { tags: parsedTags });
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [localTags, activeWorkflow, updateWorkflow]);

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

  const handleRunStep = (tabId?: string) => {
    if (tabId) {
      setActiveTab(tabId as Tab);
    }
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
      } catch (err) {
        console.error("Failed to import workflows", err);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  if (!activeWorkflow || !activeVersion) {
    return (
      <div className="flex h-full" data-testid="workflow-templates-view">
        <div className="w-1/3 border-r border-border p-4 overflow-y-auto">
          <div className="flex justify-between items-center mb-4">
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
            className="w-full bg-surface border border-border rounded px-2 py-1 text-xs text-text-primary mb-4"
            data-testid="workflow-search-input"
          />
          <div className="space-y-2">
            {filteredWorkflows.length === 0 ? (
              <div className="text-xs text-text-secondary">No workflows found.</div>
            ) : (
              filteredWorkflows.map((w) => (
                <div
                  key={w.id}
                  onClick={() => setActiveWorkflow(w.id)}
                  className="cursor-pointer p-2 rounded hover:bg-surface-hover border border-border/0 flex justify-between items-center"
                  data-testid="workflow-list-item"
                >
                  <div className="overflow-hidden">
                    <div className="text-sm text-text-primary truncate flex items-center gap-2">
                      {w.favorite && <span className="text-yellow-400">★</span>}
                      {w.title}
                    </div>
                    <div className="text-[10px] text-text-secondary">{w.scope === "global" ? "Global" : "Project"}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center text-sm text-text-secondary" data-testid="empty-state">
          Select or create a workflow to begin.
        </div>
      </div>
    );
  }

  return (
    <>
    <div className="flex h-full" data-testid="workflow-templates-view">
      {/* Sidebar List */}
      <div className="w-1/3 border-r border-border p-4 overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
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
        <div className="space-y-2">
          {filteredWorkflows.map((w) => (
            <div
              key={w.id}
              onClick={() => setActiveWorkflow(w.id)}
              className={`cursor-pointer p-2 rounded border flex justify-between items-center ${w.id === activeWorkflow.id ? "bg-surface-hover border-border" : "hover:bg-surface-hover border-border/0"}`}
            >
              <div className="overflow-hidden">
                <div className="text-sm text-text-primary truncate flex items-center gap-2">
                  {w.favorite && <span className="text-yellow-400">★</span>}
                  {w.title}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Detail View */}
      <div className="flex-1 flex flex-col h-full bg-surface overflow-y-auto p-6" data-testid="workflow-detail">
        <div className="flex justify-between items-start mb-6">
          <div className="flex flex-col w-1/2 gap-2">
            <input
              type="text"
              value={localTitle}
              onChange={(e) => setLocalTitle(e.target.value)}
              className="bg-transparent text-xl font-semibold text-text-primary outline-none border-b border-border/0 focus:border-border w-full"
              data-testid="workflow-title-input"
            />
            <input
              type="text"
              value={localTags}
              placeholder="Tags (comma separated)..."
              onChange={(e) => setLocalTags(e.target.value)}
              className="bg-transparent text-xs text-text-secondary outline-none border-b border-border/0 focus:border-border w-full"
              data-testid="workflow-tags-input"
            />
          </div>
          <div className="flex gap-2">
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
        <div className="mb-6 flex gap-4 items-center">
          <h3 className="text-sm font-medium text-text-secondary">Version:</h3>
          <select
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
              className="text-[11px] bg-surface-hover hover:bg-surface-hover text-text-primary px-2 py-1 rounded"
              data-testid="add-step-btn"
            >
              Add Step
            </button>
          </div>
          <div className="space-y-2">
            {activeVersion.steps.map((step) => (
              <div key={step.id} className="p-3 bg-surface-hover rounded border border-border flex justify-between items-center" data-testid="workflow-step-item">
                <div className="flex flex-col">
                  <span className="text-xs font-medium text-text-secondary">{step.title}</span>
                  <span className="text-[10px] text-text-secondary uppercase">{step.kind} → {step.target}</span>
                </div>
                <button
                  onClick={() => removeStep(activeWorkflow.id, step.id)}
                  className="text-[10px] text-text-secondary hover:text-red-400"
                  data-testid="remove-step-btn"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Compile Preview & Run Plan */}
        <div className="grid grid-cols-2 gap-4 mt-auto">
          <div className="p-4 bg-surface rounded border border-border" data-testid="compile-preview">
            <h4 className="text-[11px] uppercase tracking-wider font-medium text-text-secondary mb-2">Compile Preview</h4>
            {compiled?.canRun ? (
              <div className="text-xs text-green-400/80">Workflow is valid.</div>
            ) : (
              <div className="text-xs text-red-400/80">Workflow has errors.</div>
            )}
            {compiled?.warnings.map((w) => (
              <div key={w.id} className={`text-[10px] mt-1 ${w.severity === 'error' ? 'text-red-400' : 'text-yellow-400'}`}>
                {w.message}
              </div>
            ))}
          </div>

          <div className="p-4 bg-surface rounded border border-border" data-testid="run-plan-preview">
            <h4 className="text-[11px] uppercase tracking-wider font-medium text-text-secondary mb-2">Run Plan</h4>
            {runPlan?.actions.length === 0 ? (
              <div className="text-xs text-text-secondary">No runnable actions.</div>
            ) : (
              <div className="space-y-2">
                {runPlan?.actions.map((action) => (
                  <div key={action.id} className="flex justify-between items-center">
                    <span className="text-xs text-text-secondary">{action.label}</span>
                    <button
                      onClick={() => handleRunStep(action.tabId)}
                      className="text-[10px] bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 px-2 py-1 rounded"
                      data-testid="run-step-btn"
                    >
                      Execute
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
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
