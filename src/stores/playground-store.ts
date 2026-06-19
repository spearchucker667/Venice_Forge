import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { Node, Edge } from '@xyflow/react'
import type { VeniceNodeData, NodeResult } from './workflow-store'
import { applyPatches, type WorkflowPatch, type PatchResult } from '../lib/workflow-mutations'
import StorageService from '../services/storageService'
import type { StateStorage } from 'zustand/middleware'

const asyncStorageAdapter: StateStorage = {
  getItem: async (name) => {
    try {
      if (typeof window !== 'undefined' && window.localStorage /* localStorage-allowed: one-time playground migration into encrypted IndexedDB */) {
        const legacy = window.localStorage.getItem(name); /* localStorage-allowed: one-time playground migration into encrypted IndexedDB */
        if (legacy) {
          await StorageService.saveItem('playground', { id: name, value: legacy });
          window.localStorage.removeItem(name); /* localStorage-allowed: remove migrated legacy playground copy */
          return legacy;
        }
      }
    } catch (e) {
      console.warn('[playground-store] Migration from localStorage failed', e); /* localStorage-allowed: legacy migration diagnostic only */
    }
    try {
      const item = await StorageService.getItem<{ id: string; value: string }>('playground', name);
      return item?.value || null;
    } catch (e) {
      console.warn('[playground-store] getItem failed', e);
      return null;
    }
  },
  setItem: async (name, value) => {
    try {
      await StorageService.saveItem('playground', { id: name, value });
    } catch (e) {
      console.warn('[playground-store] setItem failed', e);
    }
  },
  removeItem: async (name) => {
    try {
      await StorageService.deleteItem('playground', name);
    } catch (e) {
      console.warn('[playground-store] removeItem failed', e);
    }
  }
}

export interface PlaygroundActivity {
  tool: string
  /** Short human-readable summary, e.g. "added chat node 'research'" */
  summary: string
  ok: boolean
}

export interface PlaygroundMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  patches?: WorkflowPatch[]
  activity?: PlaygroundActivity[]
  error?: string
  pending?: boolean
}

interface PlaygroundState {
  messages: PlaygroundMessage[]
  draft: { nodes: Node<VeniceNodeData>[]; edges: Edge[] }
  linkedWorkflowId: string | null
  isThinking: boolean
  runResults: Record<string, NodeResult>
  isRunning: boolean

  addMessage: (msg: PlaygroundMessage) => void
  updateMessage: (id: string, updates: Partial<PlaygroundMessage>) => void
  setThinking: (v: boolean) => void
  applyAgentPatches: (patches: readonly WorkflowPatch[]) => PatchResult
  resetDraft: () => void
  clearConversation: () => void
  setRunResults: (results: Record<string, NodeResult>) => void
  updateRunNode: (nodeId: string, result: Partial<NodeResult>) => void
  setIsRunning: (running: boolean) => void
  clearResults: () => void
  loadWorkflow: (workflowId: string, nodes: Node<VeniceNodeData>[], edges: Edge[]) => void
  unlinkWorkflow: () => void
}

export const usePlaygroundStore = create<PlaygroundState>()(
  persist(
    (set, get) => ({
      messages: [],
      draft: { nodes: [], edges: [] },
      linkedWorkflowId: null,
      isThinking: false,
      runResults: {},
      isRunning: false,

      addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
      updateMessage: (id, updates) =>
        set((s) => ({
          messages: s.messages.map((m) => (m.id === id ? { ...m, ...updates } : m)),
        })),
      setThinking: (v) => set({ isThinking: v }),
      applyAgentPatches: (patches) => {
        const { nodes, edges } = get().draft
        const result = applyPatches({ nodes, edges }, patches)
        set({ draft: { nodes: result.nodes, edges: result.edges }, runResults: {} })
        return result
      },
      resetDraft: () => set({ draft: { nodes: [], edges: [] }, runResults: {}, linkedWorkflowId: null }),
      clearConversation: () => set({ messages: [], draft: { nodes: [], edges: [] }, runResults: {}, linkedWorkflowId: null }),
      setRunResults: (results) => set({ runResults: results }),
      updateRunNode: (nodeId, result) =>
        set((s) => ({
          runResults: { ...s.runResults, [nodeId]: { ...s.runResults[nodeId], ...result } as NodeResult },
        })),
      setIsRunning: (running) => set({ isRunning: running }),
      clearResults: () => set({ runResults: {} }),
      loadWorkflow: (workflowId, nodes, edges) => set({
        draft: { nodes, edges },
        linkedWorkflowId: workflowId,
        runResults: {},
        messages: [],
      }),
      unlinkWorkflow: () => set({ linkedWorkflowId: null }),
    }),
    {
      name: 'venice-playground',
      version: 1,
      storage: createJSONStorage(() => asyncStorageAdapter),
      partialize: (s) => ({ messages: s.messages.slice(-40), draft: s.draft, linkedWorkflowId: s.linkedWorkflowId }),
    },
  ),
)
