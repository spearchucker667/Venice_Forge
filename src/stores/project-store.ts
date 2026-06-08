/** @fileoverview Project Workspace store (Phase 1 minimal slice).
 * Per the approved plan:
 * - First-class Project metadata lives in the new encrypted "projects" IDB store.
 * - Scoping of other entities happens via (reused) projectRefs tagging on the assets themselves.
 * - This store is intentionally thin: list, create, get active, setActive (the UI reads activeProjectId
 *   from settings-store for the global "current project" context; this store owns the list + CRUD).
 * - Starts IDB-only (StorageService) for perfect Electron/web parity. Desktop fs mirror for projects
 *   can be added later without changing the renderer contract.
 */

import { create } from 'zustand'
import StorageService from '../services/storageService'
import type { Project } from '../types/project'
// ProjectPatch is referenced in the ProjectState interface (type-only). The alias below keeps the import "used" for the linter while the value is only in the type position of the store interface.
type _ProjectPatch = import('../types/project').ProjectPatch
import { useSettingsStore } from './settings-store'
import { useChatStore } from './chat-store'
import { useMediaStore } from './media-store'
import type { Conversation } from '../types/conversation'
import type { MediaItem } from '../types/media'

export type ProjectId = string
export type ActiveProjectId = ProjectId | null

interface ProjectState {
  projects: Project[]
  loading: boolean
  loaded: boolean
  lastError: string | null

  /** Load (or refresh) the project list from IDB. */
  refresh: () => Promise<void>
  /** Create a new project. Returns the created project. Name is trimmed and validated (non-empty). */
  createProject: (name: string, description?: string) => Promise<Project>
  /** Rename a project. */
  renameProject: (projectId: string, name: string) => Promise<Project | null>
  /** Archive a project (soft delete for UI filtering). */
  archiveProject: (projectId: string) => Promise<Project | null>
  /** Delete only an unreferenced project. Referenced projects must be archived. */
  deleteProject: (projectId: string) => Promise<boolean>
  /** Set the global active (in settings); also available here for convenience. */
  setActiveProject: (projectId: ActiveProjectId) => boolean
  /** Get the current active project (by id from settings). */
  getActiveProject: () => Project | null
  getActiveProjectId: () => ActiveProjectId
  /** Ensure a default "My Projects" / unscoped fallback exists and is active if none.
   *  Safe for fresh installs, corrupt storage, or after deleting last project.
   */
  ensureDefaultProject: () => Promise<Project>

  byId: (id: string) => Project | undefined
  /** Non-archived projects (for switcher). */
  activeProjects: () => Project[]
}

export const useProjectStore = create<ProjectState>()((set, get) => ({
  projects: [],
  loading: false,
  loaded: false,
  lastError: null,

  async refresh() {
    set({ loading: true, lastError: null })
    try {
      const items = await StorageService.getItems<Project>('projects')
      items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      set({ projects: items, loaded: true })
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err
        ? String((err as { message?: unknown }).message)
        : 'Failed to load projects'
      set({ lastError: msg })
    } finally {
      set({ loading: false })
    }
  },

  async createProject(name: string, description?: string) {
    const trimmed = (name || '').trim()
    if (!trimmed) {
      throw new Error('Project name cannot be empty')
    }
    const now = Date.now()
    const project: Project = {
      id: crypto.randomUUID(),
      name: trimmed,
      description: description?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
      version: 1,
    }
    await StorageService.saveItem('projects', project as unknown as Record<string, unknown>)
    set((s) => ({ projects: [project, ...s.projects] }))
    return project
  },

  async renameProject(projectId: string, name: string) {
    const trimmed = (name || '').trim()
    if (!trimmed) throw new Error('Project name cannot be empty')
    const existing = get().projects.find((p) => p.id === projectId)
    if (!existing) return null
    const updated: Project = { ...existing, name: trimmed, updatedAt: Date.now() }
    await StorageService.saveItem('projects', updated as unknown as Record<string, unknown>)
    set((s) => ({ projects: s.projects.map((p) => p.id === projectId ? updated : p) }))
    return updated
  },

  async archiveProject(projectId: string) {
    const existing = get().projects.find((p) => p.id === projectId)
    if (!existing) return null
    const updated: Project = { ...existing, archivedAt: Date.now(), updatedAt: Date.now() }
    await StorageService.saveItem('projects', updated as unknown as Record<string, unknown>)
    set((s) => ({ projects: s.projects.map((p) => p.id === projectId ? updated : p) }))
    if (useSettingsStore.getState().activeProjectId === projectId) {
      const fallback = get().projects.find((project) => !project.archivedAt && project.id !== projectId)
      useSettingsStore.getState().setActiveProjectId(fallback?.id ?? null)
    }
    return updated
  },

  async deleteProject(projectId: string) {
    const existing = get().projects.find((project) => project.id === projectId)
    if (!existing) return false
    if (!useChatStore.getState()._hasLoadedHistory) {
      set({ lastError: 'Conversation history must finish loading before a project can be deleted' })
      return false
    }
    const activeId = useSettingsStore.getState().activeProjectId
    let persistedMedia: MediaItem[]
    let persistedConversations: Conversation[]
    try {
      [persistedMedia, persistedConversations] = await Promise.all([
        StorageService.getItems<MediaItem>('images'),
        StorageService.getItems<Conversation>('conversations'),
      ])
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to verify project references'
      set({ lastError: message })
      return false
    }
    const media = [...persistedMedia, ...useMediaStore.getState().items]
    const conversations = [...persistedConversations, ...useChatStore.getState().conversations]
    const hasMediaReference = media.some((item) => item.projectId === projectId)
    const hasConversationReference = conversations.some((conversation) =>
      conversation.memory?.projectRefs?.includes(projectId),
    )
    if (hasMediaReference || hasConversationReference) return false

    const ok = await StorageService.deleteItem('projects', projectId)
    if (ok) {
      set((s) => ({ projects: s.projects.filter((p) => p.id !== projectId) }))
      // If we deleted the active, switch to first available or default (caller can call ensure).
      if (activeId === projectId) {
        const remaining = get().projects.filter((p) => !p.archivedAt && p.id !== projectId)
        const next = remaining[0]?.id || null
        useSettingsStore.getState().setActiveProjectId(next)
      }
    }
    return ok
  },

  setActiveProject(projectId: ActiveProjectId) {
    if (projectId === null) {
      useSettingsStore.getState().setActiveProjectId(null)
      return true
    }
    if (!projectId) return false
    const project = get().projects.find((candidate) => candidate.id === projectId)
    if (!project || project.archivedAt) return false
    useSettingsStore.getState().setActiveProjectId(projectId)
    return true
  },

  getActiveProject() {
    const id = useSettingsStore.getState().activeProjectId
    return id ? get().projects.find((p) => p.id === id) || null : null
  },

  getActiveProjectId() {
    return useSettingsStore.getState().activeProjectId
  },

  async ensureDefaultProject() {
    await get().refresh()
    const activeProjectId = useSettingsStore.getState().activeProjectId
    const active = get().getActiveProject()
    if (active && !active.archivedAt) return active

    const nonArchived = get().projects.filter((p) => !p.archivedAt)
    if (nonArchived.length > 0) {
      const first = nonArchived[0]
      // A null id is the persisted All Projects mode. Only repair a stale,
      // non-null id that points at a missing or archived project.
      if (activeProjectId !== null) useSettingsStore.getState().setActiveProjectId(first.id)
      return first
    }

    // Create safe default
    const def = await get().createProject('Default Project', 'Auto-created fallback for unscoped items.')
    useSettingsStore.getState().setActiveProjectId(def.id)
    return def
  },

  byId: (id: string) => get().projects.find((p) => p.id === id),

  activeProjects: () => get().projects.filter((p) => !p.archivedAt),
}))

// Convenience: ensure the list is loaded + a safe default project exists and is active.
// Called from layout/sidebar on mount and can be called from App on startup.
let hydrationPromise: Promise<void> | null = null
export function ensureProjectsLoaded(): Promise<void> {
  const state = useProjectStore.getState()
  const activeProjectId = useSettingsStore.getState().activeProjectId
  const hasNonArchivedProject = state.projects.some((project) => !project.archivedAt)
  const activeSelectionIsValid = activeProjectId === null
    || state.projects.some((project) => project.id === activeProjectId && !project.archivedAt)
  if (state.loaded && hasNonArchivedProject && activeSelectionIsValid) return Promise.resolve()
  if (hydrationPromise) return hydrationPromise
  hydrationPromise = (async () => {
    const store = useProjectStore.getState()
    await store.ensureDefaultProject()
  })().finally(() => {
    hydrationPromise = null
  })
  return hydrationPromise
}
