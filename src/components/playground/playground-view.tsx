import { useState, useRef, useEffect } from 'react'
import { usePlaygroundStore } from '../../stores/playground-store'
import { useWorkflowStore } from '../../stores/workflow-store'
import { useSettingsStore } from '../../stores/settings-store'
import { validateWorkflow } from '../../lib/workflow-validator'
import { executeWorkflow } from '../../lib/workflow-engine'
import { PlaygroundChat } from './playground-chat'
import { WorkflowPreview } from './workflow-preview'
import { AgentModelPicker } from './agent-model-picker'
import { cn } from '../../lib/utils'
import { toast } from '../../stores/toast-store'
import { DEFAULT_AGENT_MODEL } from '../../lib/playground-agent'
import { askDecision } from '../ui/modal-requests'

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
  const setActiveTab = useSettingsStore((s) => s.setActiveTab)
  const playgroundAgentModel = useSettingsStore((s) => s.playgroundAgentModel)
  const setPlaygroundAgentModel = useSettingsStore((s) => s.setPlaygroundAgentModel)
  const currentAgentModel = playgroundAgentModel || DEFAULT_AGENT_MODEL
  const [saveToast, setSaveToast] = useState<string | null>(null)
  const saveToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const linkedWorkflow = workflows.find((w) => w.id === linkedWorkflowId)

  useEffect(() => {
    return () => {
      if (saveToastTimerRef.current) {
        clearTimeout(saveToastTimerRef.current)
      }
    }
  }, [])

  function showSaveToast(message: string) {
    setSaveToast(message)
    if (saveToastTimerRef.current) {
      clearTimeout(saveToastTimerRef.current)
    }
    saveToastTimerRef.current = setTimeout(() => {
      setSaveToast(null)
      saveToastTimerRef.current = null
    }, 2000)
  }

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
        isRunning: false,
        onUpdate: (nodeId, result) => store.updateRunNode(nodeId, result),
      })
      toast.success('Workflow completed')
    } catch (err) {
      const message = err instanceof Error ? err.message : ''
      if (message !== 'Workflow is already running.') {
        toast.fromError(err, 'Workflow failed')
      }
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
      showSaveToast(`Updated "${linkedWorkflow.name}"`)
    } else {
      promoteToWorkflow()
      showSaveToast('Saved to Workflows')
    }
  }

  const handleSaveAsNew = () => {
    if (!canExport) return
    const id = promoteToWorkflow()
    showSaveToast('Saved as new workflow')
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
    setActiveTab('workflows')
  }

  const handleLoadWorkflow = (id: string) => {
    const wf = workflows.find((w) => w.id === id)
    if (!wf) return
    loadWorkflow(wf.id, wf.nodes, wf.edges)
  }

  const handleUnlink = () => {
    unlinkWorkflow()
  }

  const handleReset = async () => {
    const shouldClear = await askDecision({
      title: 'Clear playground?',
      detail: 'This clears the current conversation and canvas.',
      actionLabel: 'Clear',
      danger: true,
    })
    if (!shouldClear) return
    clearConversation()
  }

  return (
    <div className="flex h-full">
      <div className="w-[420px] shrink-0 border-r border-border/50 flex flex-col">
        <div className="flex items-center justify-between gap-2 px-3 h-11 border-b border-border/50 bg-surface shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[14px] font-medium text-text-secondary shrink-0">Playground</span>
            <span className="text-[11px] px-1.5 py-0.5 rounded bg-surface-elevated text-text-muted uppercase tracking-wider shrink-0">Agent</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 min-w-0">
            <AgentModelPicker value={currentAgentModel} onChange={setPlaygroundAgentModel} />
            <button
              onClick={handleReset}
              className="text-[12px] text-text-muted hover:text-text-secondary transition-colors px-1.5 py-1 rounded focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent"
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
        <div className="flex items-center gap-2 px-3 h-11 border-b border-border/50 bg-surface shrink-0">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {linkedWorkflow ? (
              <div className="flex items-center gap-1 min-w-0 px-2 py-0.5 rounded bg-surface-elevated border border-border">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-text-muted shrink-0"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4 12.5-12.5z" /></svg>
                <span className="text-[12.5px] text-text-secondary truncate max-w-[180px]" title={linkedWorkflow.name}>{linkedWorkflow.name}</span>
                <button onClick={handleUnlink} className="text-text-muted hover:text-text-secondary transition-colors p-0.5 -mr-1 shrink-0" title="Unlink">
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
              </div>
            ) : workflows.length > 0 ? (
              <select
                value=""
                onChange={(e) => e.target.value && handleLoadWorkflow(e.target.value)}
                className="bg-surface-elevated border border-border rounded px-2 py-1 text-[12px] text-text-muted outline-none hover:border-accent max-w-[200px]"
              >
                <option value="">Edit saved workflow…</option>
                {workflows.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            ) : null}
            <span className="text-[12px] text-text-muted font-mono shrink-0">{draft.nodes.length}n · {draft.edges.length}e</span>
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
              className="text-text-muted hover:text-text-secondary transition-colors p-1.5 disabled:opacity-30 disabled:cursor-not-allowed"
              title="Reset canvas"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /></svg>
            </button>
            <button
              onClick={handleRun}
              disabled={!canRun}
              className={cn(
                'flex items-center gap-1.5 text-[13px] font-medium px-2.5 py-1 rounded-md transition-colors',
                canRun ? 'bg-green-500/20 text-green-300 border border-green-500/30 hover:bg-green-500/30' : 'bg-surface-elevated text-text-muted border border-border cursor-not-allowed',
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
                'text-[13px] px-2.5 py-1 rounded-md border border-border transition-colors',
                canExport && !isRunning ? 'text-text-secondary hover:border-accent hover:text-text-secondary' : 'text-text-muted opacity-40 cursor-not-allowed',
              )}
              title={linkedWorkflow ? `Update "${linkedWorkflow.name}"` : 'Save as new workflow'}
            >
              {linkedWorkflow ? 'Update' : 'Save'}
            </button>
            {linkedWorkflow && (
              <button
                onClick={handleSaveAsNew}
                disabled={!canExport || isRunning}
                className="text-text-muted hover:text-text-secondary transition-colors p-1.5 disabled:opacity-30 disabled:cursor-not-allowed"
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
                canExport && !isRunning ? 'bg-accent text-accent-fg hover:bg-accent-hover' : 'bg-surface-elevated text-text-muted cursor-not-allowed',
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
