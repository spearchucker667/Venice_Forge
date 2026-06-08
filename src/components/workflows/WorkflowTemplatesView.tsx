import { useState, useMemo } from "react";
import { useWorkflowTemplateStore } from "../../stores/workflow-template-store";
import { useSettingsStore, type Tab } from "../../stores/settings-store";
import { compileWorkflowTemplate } from "../../services/workflowCompiler";
import { createWorkflowRunPlan } from "../../services/workflowRunner";

export function WorkflowTemplatesView() {
  const { workflows, activeWorkflowId, setActiveWorkflow, createWorkflow, updateWorkflow, deleteWorkflow, archiveWorkflow, addStep, removeStep } = useWorkflowTemplateStore();
  const activeProjectId = useSettingsStore((s) => s.activeProjectId);
  const setActiveTab = useSettingsStore((s) => s.setActiveTab);

  const [search, setSearch] = useState("");

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

  if (!activeWorkflow || !activeVersion) {
    return (
      <div className="flex h-full" data-testid="workflow-templates-view">
        <div className="w-1/3 border-r border-white/10 p-4 overflow-y-auto">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-sm font-semibold text-white/80">Workflows</h2>
            <button
              onClick={handleCreateWorkflow}
              className="text-xs bg-white/10 hover:bg-white/20 text-white px-2 py-1 rounded"
              data-testid="create-workflow-btn"
            >
              New
            </button>
          </div>
          <input
            type="text"
            placeholder="Search workflows..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-black/20 border border-white/10 rounded px-2 py-1 text-xs text-white mb-4"
            data-testid="workflow-search-input"
          />
          <div className="space-y-2">
            {filteredWorkflows.length === 0 ? (
              <div className="text-xs text-white/40">No workflows found.</div>
            ) : (
              filteredWorkflows.map((w) => (
                <div
                  key={w.id}
                  onClick={() => setActiveWorkflow(w.id)}
                  className="cursor-pointer p-2 rounded hover:bg-white/5 border border-transparent"
                  data-testid="workflow-list-item"
                >
                  <div className="text-sm text-white/90 truncate">{w.title}</div>
                  <div className="text-[10px] text-white/40">{w.scope === "global" ? "Global" : "Project"}</div>
                </div>
              ))
            )}
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center text-sm text-white/30" data-testid="empty-state">
          Select or create a workflow to begin.
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full" data-testid="workflow-templates-view">
      {/* Sidebar List */}
      <div className="w-1/3 border-r border-white/10 p-4 overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-sm font-semibold text-white/80">Workflows</h2>
          <button
            onClick={handleCreateWorkflow}
            className="text-xs bg-white/10 hover:bg-white/20 text-white px-2 py-1 rounded"
            data-testid="create-workflow-btn"
          >
            New
          </button>
        </div>
        <div className="space-y-2">
          {filteredWorkflows.map((w) => (
            <div
              key={w.id}
              onClick={() => setActiveWorkflow(w.id)}
              className={`cursor-pointer p-2 rounded border ${w.id === activeWorkflow.id ? "bg-white/10 border-white/20" : "hover:bg-white/5 border-transparent"}`}
            >
              <div className="text-sm text-white/90 truncate">{w.title}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Detail View */}
      <div className="flex-1 flex flex-col h-full bg-black/10 overflow-y-auto p-6" data-testid="workflow-detail">
        <div className="flex justify-between items-start mb-6">
          <input
            type="text"
            value={activeWorkflow.title}
            onChange={(e) => updateWorkflow(activeWorkflow.id, { title: e.target.value })}
            className="bg-transparent text-xl font-semibold text-white outline-none border-b border-transparent focus:border-white/20 w-1/2"
            data-testid="workflow-title-input"
          />
          <div className="flex gap-2">
            <button
              onClick={() => archiveWorkflow(activeWorkflow.id)}
              className="text-xs bg-white/5 hover:bg-white/10 text-white/60 px-3 py-1.5 rounded"
              data-testid="archive-workflow-btn"
            >
              Archive
            </button>
            <button
              onClick={() => {
                if (confirm("Delete this workflow permanently?")) {
                  deleteWorkflow(activeWorkflow.id);
                }
              }}
              className="text-xs bg-red-500/10 hover:bg-red-500/20 text-red-400 px-3 py-1.5 rounded"
              data-testid="delete-workflow-btn"
            >
              Delete
            </button>
          </div>
        </div>

        {/* Steps List */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-medium text-white/80">Steps</h3>
            <button
              onClick={() => addStep(activeWorkflow.id, { kind: "prompt", target: "chat", title: "New Prompt Step", enabled: true })}
              className="text-[11px] bg-white/10 hover:bg-white/20 text-white px-2 py-1 rounded"
              data-testid="add-step-btn"
            >
              Add Step
            </button>
          </div>
          <div className="space-y-2">
            {activeVersion.steps.map((step) => (
              <div key={step.id} className="p-3 bg-white/5 rounded border border-white/5 flex justify-between items-center" data-testid="workflow-step-item">
                <div className="flex flex-col">
                  <span className="text-xs font-medium text-white/80">{step.title}</span>
                  <span className="text-[10px] text-white/40 uppercase">{step.kind} → {step.target}</span>
                </div>
                <button
                  onClick={() => removeStep(activeWorkflow.id, step.id)}
                  className="text-[10px] text-white/40 hover:text-red-400"
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
          <div className="p-4 bg-black/30 rounded border border-white/5" data-testid="compile-preview">
            <h4 className="text-[11px] uppercase tracking-wider font-medium text-white/50 mb-2">Compile Preview</h4>
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

          <div className="p-4 bg-black/30 rounded border border-white/5" data-testid="run-plan-preview">
            <h4 className="text-[11px] uppercase tracking-wider font-medium text-white/50 mb-2">Run Plan</h4>
            {runPlan?.actions.length === 0 ? (
              <div className="text-xs text-white/40">No runnable actions.</div>
            ) : (
              <div className="space-y-2">
                {runPlan?.actions.map((action, i) => (
                  <div key={action.id} className="flex justify-between items-center">
                    <span className="text-xs text-white/70">{action.label}</span>
                    {i === 0 && (
                      <button
                        onClick={() => handleRunStep(action.tabId)}
                        className="text-[10px] bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 px-2 py-1 rounded"
                        data-testid="run-step-btn"
                      >
                        Run Step
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}