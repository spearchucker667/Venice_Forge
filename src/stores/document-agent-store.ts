import { create } from 'zustand'
import type { AgentPermissionPreset } from '../agent/contracts/capabilities'

export interface WorkspaceGrantView {
  id: string
  workspaceId: string
  displayName: string
  allowedOperations: string[]
  allowedExtensions: string[]
}

export type DocumentEnvironment = 'managed' | 'workspace'

interface DocumentAgentState {
  agentSessionId: string
  preset: AgentPermissionPreset
  workspaceGrant: WorkspaceGrantView | null
  activeEnvironment: DocumentEnvironment
  selectedDocumentId: string | null
  setPreset: (preset: AgentPermissionPreset) => void
  setWorkspaceGrant: (grant: WorkspaceGrantView | null) => void
  setActiveEnvironment: (env: DocumentEnvironment) => void
  setSelectedDocumentId: (docId: string | null) => void
}

export const useDocumentAgentStore = create<DocumentAgentState>()((set) => ({
  agentSessionId: crypto.randomUUID(),
  preset: 'limited_documents',
  workspaceGrant: null,
  activeEnvironment: 'managed',
  selectedDocumentId: null,
  setPreset: (preset) => set({ preset }),
  setWorkspaceGrant: (workspaceGrant) => set({ workspaceGrant }),
  setActiveEnvironment: (activeEnvironment) => set({ activeEnvironment }),
  setSelectedDocumentId: (selectedDocumentId) => set({ selectedDocumentId }),
}))
