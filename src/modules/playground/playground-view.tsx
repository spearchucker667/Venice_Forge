import { useState } from 'react'
import { usePlaygroundStore } from '../../state/playground-store'
import { useWorkflowStore } from '../../state/workflow-store'
import { useSettingsStore } from '../../state/settings-store-mock'
import { validateWorkflow } from '../../services/workflows/workflow-validator'
import { executeWorkflow } from '../../services/workflows/workflow-engine'
import { PlaygroundChat } from './playground-chat'
import { WorkflowPreview } from './workflow-preview'
import { AgentModelPicker } from './agent-model-picker'
import { cn } from '../../utils/tailwind-utils'
import { toast } from '../../state/toast-store-mock'
import { DEFAULT_AGENT_MODEL } from '../../services/workflows/playground-agent'

export function PlaygroundView() {
  const draft = usePlaygroundStore((s) => s.draft)
  const isRunning = usePlaygroundStore((s) => s.isRunning)
  const linkedWorkflowId = usePlaygroundStore((s) => s.linkedWorkflowId)
  const loadWorkflow = usePlaygroundStore((s) => s.loadWorkflow)
  const unlinkWorkflow = usePlaygroundStore((s) => s.unlinkWorkflow)
  const clearConversation = usePlaygroundStore((s) => s.clearConversation)
  const resetDraft = usePlaygroundStore((s) => s.resetDraft)
  const workflows = useWorkflowStore((s) => s.workflows)
  const createWorkflow = useWorkflowStore((s) => s.createWorkflow)
  const updateWorkflow = useWorkflowStore((s) => s.updateWorkflow)
  const setActiveWorkflow = useWorkflowStore((s) => s.setActiveWorkflow)
  
  const playgroundAgentModel = useSettingsStore((s) => s.playgroundAgentModel)
  const setPlaygroundAgentModel = useSettingsStore((s) => s.setPlaygroundAgentModel)
  const currentAgentModel = playgroundAgentModel || DEFAULT_AGENT_MODEL
  const [saveToast, setSaveToast] = useState<string | null>(null)
  const linkedWorkflow = workflows.find((w) => w.id === linkedWorkflowId)

  const validation = validateWorkflow(draft)
  const canExport = draft.nodes.length > 0
  const canRun = canExport && validation.errors.length === 0 && !isRunning

  const handleRun = async () => {
    if (!canRun) return
    const store = usePlaygroundStore.getState()
    store.clearResults()
    store.setIsRunning(true)
    const initial: Record<string, { nodeId: string; status: 'pending'; output: undefined; error: undefined }> = {}
    for (const n of draft.nodes) initial[n.id] = { nodeId: n.id, status: 'pending', output: undefined, error: undefined }
    store.setRunResults(initial)
    try {
      await executeWorkflow(draft.nodes, draft.edges, {
        dispatch: (window as any)._dispatch, // eslint-disable-line @typescript-eslint/no-explicit-any
        onUpdate: (nodeId, result) => store.updateRunNode(nodeId, result),
      })
      toast.success('Workflow completed')
    } catch (err) {
      toast.fromError(err, 'Workflow failed')
    } finally {
      usePlaygroundStore.getState().setIsRunning(false)
    }
  }

  const promoteToWorkflow = (name?: string): string => {
    const wfName = name ?? `Playground — ${new Date().toLocaleString()}`
    const id = createWorkflow(wfName)
    updateWorkflow(id, { nodes: draft.nodes, edges: draft.edges })
    return id
  }

  const handleSave = () => {
    if (!canExport) return
    if (linkedWorkflow) {
      updateWorkflow(linkedWorkflow.id, { nodes: draft.nodes, edges: draft.edges })
      setSaveToast(`Updated "${linkedWorkflow.name}"`)
    } else {
      promoteToWorkflow()
      setSaveToast('Saved to Workflows')
    }
    setTimeout(() => setSaveToast(null), 2000)
  }

  const handleSaveAsNew = () => {
    if (!canExport) return
    const id = promoteToWorkflow()
    setSaveToast('Saved as new workflow')
    setTimeout(() => setSaveToast(null), 2000)
    // keep editing the new copy
    loadWorkflow(id, draft.nodes, draft.edges)
  }

  const handleOpenInWorkflows = () => {
    if (!canExport) return
    let id = linkedWorkflow?.id
    if (linkedWorkflow) {
      updateWorkflow(linkedWorkflow.id, { nodes: draft.nodes, edges: draft.edges })
    } else {
      id = promoteToWorkflow()
    }
    if (id) setActiveWorkflow(id)
    ;(window as any)._dispatch({ type: 'SET_TAB', tab: 'workflows' }) // eslint-disable-line @typescript-eslint/no-explicit-any
  }

  const handleLoadWorkflow = (id: string) => {
    const wf = workflows.find((w) => w.id === id)
    if (!wf) return
    loadWorkflow(wf.id, wf.nodes, wf.edges)
  }

  const handleUnlink = () => {
    unlinkWorkflow()
  }

  const handleReset = () => {
    if (!confirm('Clear the current conversation and canvas?')) return
    clearConversation()
  }

  return (
    <div className="flex h-full">
      <div className="w-[420px] shrink-0 border-r border-white/[0.06] flex flex-col">
        <div className="flex items-center justify-between gap-2 px-3 h-11 border-b border-white/[0.06] bg-[#0a0a0a] shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[14px] font-medium text-white/65 shrink-0">Playground</span>
            <span className="text-[11px] px-1.5 py-0.5 rounded bg-white/[0.06] text-white/45 uppercase tracking-wider shrink-0">Agent</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 min-w-0">
            <AgentModelPicker value={currentAgentModel} onChange={setPlaygroundAgentModel} />
            <button
              onClick={handleReset}
              className="text-[12px] text-white/45 hover:text-white/80 transition-colors px-1.5 py-1 rounded focus-visible:outline focus-visible:outline-1 focus-visible:outline-white/40"
              title="Clear conversation"
            >
              Clear
            </button>
          </div>
        </div>
        <div className="flex-1 min-h-0">
          <PlaygroundChat />
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center gap-2 px-3 h-11 border-b border-white/[0.06] bg-[#0a0a0a] shrink-0">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {linkedWorkflow ? (
              <div className="flex items-center gap-1 min-w-0 px-2 py-0.5 rounded bg-white/[0.04] border border-white/[0.06]">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-white/35 shrink-0"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4 12.5-12.5z" /></svg>
                <span className="text-[12.5px] text-white/65 truncate max-w-[180px]" title={linkedWorkflow.name}>{linkedWorkflow.name}</span>
                <button onClick={handleUnlink} className="text-white/25 hover:text-white/60 transition-colors p-0.5 -mr-1 shrink-0" title="Unlink">
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
              </div>
            ) : workflows.length > 0 ? (
              <select
                value=""
                onChange={(e) => e.target.value && handleLoadWorkflow(e.target.value)}
                className="bg-white/[0.03] border border-white/[0.06] rounded px-2 py-1 text-[12px] text-white/45 outline-none hover:border-white/[0.12] max-w-[200px]"
              >
                <option value="">Edit saved workflow…</option>
                {workflows.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            ) : null}
            <span className="text-[12px] text-white/30 font-mono shrink-0">{draft.nodes.length}n · {draft.edges.length}e</span>
            {validation.errors.length > 0 && (
              <span
                className="w-1.5 h-1.5 rounded-full bg-red-400/80 shrink-0"
                title={validation.errors.map((e) => e.message).join('\n')}
              />
            )}
            {validation.errors.length === 0 && validation.warnings.length > 0 && (
              <span
                className="w-1.5 h-1.5 rounded-full bg-yellow-400/70 shrink-0"
                title={validation.warnings.map((w) => w.message).join('\n')}
              />
            )}
            {saveToast && <span className="text-[12px] text-green-400/70 truncate">{saveToast}</span>}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={resetDraft}
              disabled={!canExport || isRunning}
              className="text-white/25 hover:text-white/55 transition-colors p-1.5 disabled:opacity-30 disabled:cursor-not-allowed"
              title="Reset canvas"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /></svg>
            </button>
            <button
              onClick={handleRun}
              disabled={!canRun}
              className={cn(
                'flex items-center gap-1.5 text-[13px] font-medium px-2.5 py-1 rounded-md transition-colors',
                canRun ? 'bg-green-500/20 text-green-300 border border-green-500/30 hover:bg-green-500/30' : 'bg-white/[0.05] text-white/25 border border-white/[0.06] cursor-not-allowed',
              )}
              title={validation.errors.length > 0 ? validation.errors.map((e) => e.message).join('\n') : 'Run the workflow inline'}
            >
              {isRunning ? (
                <>
                  <span className="w-2.5 h-2.5 border-2 border-green-300/60 border-t-transparent rounded-full animate-spin" />
                  <span className="hidden sm:inline">Running…</span>
                </>
              ) : (
                <>
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                  Run
                </>
              )}
            </button>
            <button
              onClick={handleSave}
              disabled={!canExport || isRunning}
              className={cn(
                'text-[13px] px-2.5 py-1 rounded-md border border-white/[0.08] transition-colors',
                canExport && !isRunning ? 'text-white/60 hover:border-white/[0.15] hover:text-white/85' : 'text-white/20 opacity-40 cursor-not-allowed',
              )}
              title={linkedWorkflow ? `Update "${linkedWorkflow.name}"` : 'Save as new workflow'}
            >
              {linkedWorkflow ? 'Update' : 'Save'}
            </button>
            {linkedWorkflow && (
              <button
                onClick={handleSaveAsNew}
                disabled={!canExport || isRunning}
                className="text-white/35 hover:text-white/65 transition-colors p-1.5 disabled:opacity-30 disabled:cursor-not-allowed"
                title="Save as a new workflow"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="14" height="14" rx="2" /><path d="M7 21h12a2 2 0 002-2V9" /></svg>
              </button>
            )}
            <button
              onClick={handleOpenInWorkflows}
              disabled={!canExport || isRunning}
              className={cn(
                'flex items-center gap-1.5 text-[13px] font-medium px-2.5 py-1 rounded-md transition-colors',
                canExport && !isRunning ? 'bg-white text-black hover:bg-white/90' : 'bg-white/[0.05] text-white/30 cursor-not-allowed',
              )}
              title="Open in Workflows tab"
            >
              <span className="hidden md:inline">Open in Workflows</span>
              <span className="md:hidden">Open</span>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M7 17L17 7M7 7h10v10" /></svg>
            </button>
          </div>
        </div>
        <div className="flex-1 min-h-0">
          <WorkflowPreview nodes={draft.nodes} edges={draft.edges} />
        </div>
      </div>
    </div>
  )
}
