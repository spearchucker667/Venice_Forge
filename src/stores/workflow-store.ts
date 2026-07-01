import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { Node, Edge } from '@xyflow/react'
import { generateId } from '../lib/utils'
import { applyPatches, type WorkflowPatch, type PatchResult } from '../lib/workflow-mutations'
import StorageService from '../services/storageService'
import type { StateStorage } from 'zustand/middleware'

const asyncStorageAdapter: StateStorage = {
  getItem: async (name) => {
    try {
      if (typeof window !== 'undefined' && window.localStorage /* localStorage-allowed: one-time visual workflow migration into encrypted IndexedDB */) {
        const legacy = window.localStorage.getItem(name); /* localStorage-allowed: one-time visual workflow migration into encrypted IndexedDB */
        if (legacy) {
          await StorageService.saveItem('visualWorkflows', { id: name, value: legacy });
          window.localStorage.removeItem(name); /* localStorage-allowed: remove migrated legacy visual workflow copy */
          return legacy;
        }
      }
    } catch (e) {
      console.warn('[workflow-store] Migration from localStorage failed', e); /* localStorage-allowed: legacy migration diagnostic only */
    }
    try {
      const item = await StorageService.getItem<{ id: string; value: string }>('visualWorkflows', name);
      return item?.value || null;
    } catch (e) {
      console.warn('[workflow-store] getItem failed', e);
      return null;
    }
  },
  setItem: async (name, value) => {
    try {
      await StorageService.saveItem('visualWorkflows', { id: name, value });
    } catch (e) {
      console.warn('[workflow-store] setItem failed', e);
    }
  },
  removeItem: async (name) => {
    try {
      await StorageService.deleteItem('visualWorkflows', name);
    } catch (e) {
      console.warn('[workflow-store] removeItem failed', e);
    }
  }
}

export type VeniceNodeType = 'chat' | 'imageGen' | 'tts' | 'music' | 'video' | 'textInput' | 'output'

export interface VeniceNodeData extends Record<string, unknown> {
  label: string
  nodeType: VeniceNodeType
  model: string
  prompt: string
  // Chat-specific
  temperature?: number
  maxTokens?: number
  webSearch?: 'off' | 'on' | 'auto'
  // Image-specific
  negativePrompt?: string
  steps?: number
  style?: string
  aspectRatio?: string
  hideWatermark?: boolean
  width?: number
  height?: number
  // TTS-specific
  voice?: string
  speed?: number
  responseFormat?: string
  // Music-specific
  duration?: number
  instrumental?: boolean
  lyrics?: string
  // Video-specific
  videoDuration?: string
  videoResolution?: string
  videoAspectRatio?: string
  // Text input
  inputText?: string
}

export interface Workflow {
  id: string
  name: string
  nodes: Node<VeniceNodeData>[]
  edges: Edge[]
  createdAt: number
}

export type NodeResult = {
  nodeId: string
  status: 'pending' | 'running' | 'done' | 'error'
  output?: string
  outputKind?: 'text' | 'image' | 'audio' | 'video'
  error?: string
}

export interface RunRecord {
  runId: string
  workflowId: string
  startedAt: number
  finishedAt?: number
  nodeResults: Record<string, NodeResult>
}

interface WorkflowState {
  workflows: Workflow[]
  activeWorkflowId: string | null
  runResults: Record<string, NodeResult>
  isRunning: boolean
  currentRunId: string | null
  currentRunStartedAt: number | null
  runHistory: RunRecord[]

  createWorkflow: (name: string) => string
  updateWorkflow: (id: string, updates: Partial<Pick<Workflow, 'name' | 'nodes' | 'edges'>>) => void
  deleteWorkflow: (id: string) => void
  setActiveWorkflow: (id: string | null) => void
  setRunResults: (results: Record<string, NodeResult>) => void
  updateNodeResult: (nodeId: string, result: Partial<NodeResult>) => void
  setIsRunning: (running: boolean) => void
  startRun: (workflowId: string) => string
  endRun: () => void
  clearResults: () => void
  applyPatches: (workflowId: string, patches: readonly WorkflowPatch[]) => PatchResult
}

export const useWorkflowStore = create<WorkflowState>()(
  persist(
    (set, get) => ({
      workflows: [],
      activeWorkflowId: null,
      runResults: {},
      isRunning: false,
      currentRunId: null,
      currentRunStartedAt: null,
      runHistory: [],

      createWorkflow: (name) => {
        const id = generateId()
        const workflow: Workflow = {
          id,
          name,
          nodes: [],
          edges: [],
          createdAt: Date.now(),
        }
        set((s) => ({
          workflows: [workflow, ...s.workflows],
          activeWorkflowId: id,
        }))
        return id
      },

      updateWorkflow: (id, updates) =>
        set((s) => ({
          workflows: s.workflows.map((w) => (w.id === id ? { ...w, ...updates } : w)),
        })),

      deleteWorkflow: (id) =>
        set((s) => ({
          workflows: s.workflows.filter((w) => w.id !== id),
          activeWorkflowId: s.activeWorkflowId === id ? null : s.activeWorkflowId,
        })),

      setActiveWorkflow: (id) => set({ activeWorkflowId: id }),

      setRunResults: (results) => set({ runResults: results }),

      updateNodeResult: (nodeId, result) =>
        set((s) => ({
          runResults: { ...s.runResults, [nodeId]: { ...s.runResults[nodeId], ...result } as NodeResult },
        })),

      setIsRunning: (running) => set({ isRunning: running }),

      startRun: (_workflowId) => {
        const runId = crypto.randomUUID()
        set({
          isRunning: true,
          currentRunId: runId,
          currentRunStartedAt: Date.now(),
          runResults: {},
        })
        return runId
      },

      endRun: () => {
        const state = get()
        if (state.currentRunId && state.activeWorkflowId) {
          const record: RunRecord = {
            runId: state.currentRunId,
            workflowId: state.activeWorkflowId,
            startedAt: state.currentRunStartedAt ?? Date.now(),
            finishedAt: Date.now(),
            nodeResults: { ...state.runResults },
          }
          set({
            isRunning: false,
            currentRunId: null,
            currentRunStartedAt: null,
            runHistory: [...state.runHistory.slice(-49), record],
          })
        } else {
          set({ isRunning: false, currentRunId: null, currentRunStartedAt: null })
        }
      },

      clearResults: () => set({ runResults: {} }),

      applyPatches: (workflowId, patches) => {
        const wf = get().workflows.find((w) => w.id === workflowId)
        if (!wf) throw new Error(`Workflow not found: ${workflowId}`)
        const result = applyPatches({ nodes: wf.nodes, edges: wf.edges }, patches)
        set((s) => ({
          workflows: s.workflows.map((w) =>
            w.id === workflowId ? { ...w, nodes: result.nodes, edges: result.edges } : w,
          ),
        }))
        return result
      },
    }),
    {
      name: 'venice-workflows',
      version: 1,
      storage: createJSONStorage(() => asyncStorageAdapter),
      partialize: (state) => ({
        workflows: state.workflows.slice(0, 20),
        activeWorkflowId: state.activeWorkflowId,
      }),
    },
  ),
)
