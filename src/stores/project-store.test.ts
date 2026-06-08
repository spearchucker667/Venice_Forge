/** @fileoverview VERIFY-042 project lifecycle and reference-policy contracts. */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import StorageService from '../services/storageService'
import type { Conversation } from '../types/conversation'
import type { MediaItem } from '../types/media'
import { useChatStore } from './chat-store'
import { useMediaStore } from './media-store'
import { ensureProjectsLoaded, useProjectStore } from './project-store'
import { useSettingsStore } from './settings-store'

vi.mock('../services/storageService', () => ({
  default: {
    getItems: vi.fn(async () => []),
    saveItem: vi.fn(async (_store, item) => item),
    deleteItem: vi.fn(async () => true),
  },
}))

const mockStorage = StorageService as unknown as {
  getItems: ReturnType<typeof vi.fn>
  saveItem: ReturnType<typeof vi.fn>
  deleteItem: ReturnType<typeof vi.fn>
}

function mediaReference(projectId: string): MediaItem {
  return {
    id: 'media-ref', image: 'data:image/png;base64,AA', prompt: 'reference', model: 'test',
    timestamp: 1, mediaType: 'image', operation: 'generate', parentId: null,
    childrenIds: [], tags: [], note: '', favorite: false, projectId,
  }
}

function conversationReference(projectId: string): Conversation {
  return {
    id: 'conversation-ref', title: 'Reference', model: 'test', messages: [], createdAt: 1, updatedAt: 1,
    metadata: { tags: [], pinned: false, archived: false, source: 'chat', messageCount: 0 },
    memory: { summary: '', topics: [], entities: [], userFacts: [], projectRefs: [projectId] },
  }
}

describe('project-store Phase 1 contracts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockStorage.getItems.mockResolvedValue([])
    mockStorage.saveItem.mockImplementation(async (_store: string, item: unknown) => item)
    mockStorage.deleteItem.mockResolvedValue(true)
    useProjectStore.setState({ projects: [], loading: false, loaded: false, lastError: null })
    useSettingsStore.setState({ activeProjectId: null } as never)
    useMediaStore.setState({ items: [] })
    useChatStore.setState({ conversations: [], activeConversationId: null, _hasLoadedHistory: true })
  })

  it('creates and activates one default project on a truly empty install', async () => {
    const project = await useProjectStore.getState().ensureDefaultProject()
    expect(project.name).toMatch(/default/i)
    expect(useProjectStore.getState().projects).toHaveLength(1)
    expect(useProjectStore.getState().getActiveProjectId()).toBe(project.id)
  })

  it('preserves persisted All Projects mode when projects already exist', async () => {
    const existing = { id: 'project-a', name: 'A', createdAt: 1, updatedAt: 1, archivedAt: null }
    mockStorage.getItems.mockResolvedValue([existing])
    await useProjectStore.getState().ensureDefaultProject()
    expect(useProjectStore.getState().getActiveProjectId()).toBeNull()
  })

  it('allows project hydration to retry after an unsuccessful attempt', async () => {
    mockStorage.saveItem.mockRejectedValueOnce(new Error('temporary write failure'))
    await expect(ensureProjectsLoaded()).rejects.toThrow('temporary write failure')
    expect(useProjectStore.getState().loaded).toBe(true)

    await expect(ensureProjectsLoaded()).resolves.toBeUndefined()
    expect(useProjectStore.getState().projects).toHaveLength(1)
  })

  it('shares concurrent hydration and does not duplicate the default project', async () => {
    await Promise.all([ensureProjectsLoaded(), ensureProjectsLoaded(), ensureProjectsLoaded()])
    expect(useProjectStore.getState().projects).toHaveLength(1)
    expect(mockStorage.saveItem).toHaveBeenCalledTimes(1)
  })

  it('trims project names and rejects empty names', async () => {
    const project = await useProjectStore.getState().createProject('  My Project  ')
    expect(project.name).toBe('My Project')
    await expect(useProjectStore.getState().createProject('   ')).rejects.toThrow(/empty/i)
    expect((await useProjectStore.getState().renameProject(project.id, '  Renamed  '))?.name).toBe('Renamed')
  })

  it('accepts null and a real project id, but rejects unknown and archived ids', async () => {
    const active = await useProjectStore.getState().createProject('Active')
    const archived = await useProjectStore.getState().createProject('Archived')
    await useProjectStore.getState().archiveProject(archived.id)

    expect(useProjectStore.getState().setActiveProject(active.id)).toBe(true)
    expect(useProjectStore.getState().getActiveProjectId()).toBe(active.id)
    expect(useProjectStore.getState().setActiveProject('missing')).toBe(false)
    expect(useProjectStore.getState().setActiveProject(archived.id)).toBe(false)
    expect(useProjectStore.getState().getActiveProjectId()).toBe(active.id)
    expect(useProjectStore.getState().setActiveProject(null)).toBe(true)
    expect(useProjectStore.getState().getActiveProjectId()).toBeNull()
  })

  it('moves active selection to a non-archived fallback when archiving the active project', async () => {
    const projectA = await useProjectStore.getState().createProject('A')
    const projectB = await useProjectStore.getState().createProject('B')
    useProjectStore.getState().setActiveProject(projectA.id)
    await useProjectStore.getState().archiveProject(projectA.id)
    expect(useProjectStore.getState().getActiveProjectId()).toBe(projectB.id)
    expect(useProjectStore.getState().getActiveProject()?.archivedAt).toBeFalsy()
  })

  it('uses All Projects when archiving the last non-archived project', async () => {
    const project = await useProjectStore.getState().createProject('Only')
    useProjectStore.getState().setActiveProject(project.id)
    await useProjectStore.getState().archiveProject(project.id)
    expect(useProjectStore.getState().getActiveProjectId()).toBeNull()
  })

  it('deletes an unreferenced project and safely clears the last active id', async () => {
    const project = await useProjectStore.getState().createProject('Disposable')
    useProjectStore.getState().setActiveProject(project.id)
    expect(await useProjectStore.getState().deleteProject(project.id)).toBe(true)
    expect(useProjectStore.getState().byId(project.id)).toBeUndefined()
    expect(useProjectStore.getState().getActiveProjectId()).toBeNull()
  })

  it('blocks hard delete when media references the project and archive preserves the reference', async () => {
    const project = await useProjectStore.getState().createProject('Referenced')
    const media = mediaReference(project.id)
    useMediaStore.setState({ items: [media] })
    expect(await useProjectStore.getState().deleteProject(project.id)).toBe(false)
    await useProjectStore.getState().archiveProject(project.id)
    expect(useProjectStore.getState().byId(project.id)?.archivedAt).toBeTypeOf('number')
    expect(useMediaStore.getState().items[0].projectId).toBe(project.id)
  })

  it('blocks hard delete when a persisted conversation references the project', async () => {
    const project = await useProjectStore.getState().createProject('Conversation Project')
    mockStorage.getItems.mockImplementation(async (store: string) =>
      store === 'conversations' ? [conversationReference(project.id)] : [],
    )
    expect(await useProjectStore.getState().deleteProject(project.id)).toBe(false)
    expect(useProjectStore.getState().byId(project.id)).toBeTruthy()
  })

  it('fails closed when persisted references cannot be verified', async () => {
    const project = await useProjectStore.getState().createProject('Unverified')
    mockStorage.getItems.mockRejectedValue(new Error('IndexedDB unavailable'))
    expect(await useProjectStore.getState().deleteProject(project.id)).toBe(false)
    expect(useProjectStore.getState().byId(project.id)).toBeTruthy()
    expect(useProjectStore.getState().lastError).toBe('IndexedDB unavailable')
  })

  it('fails closed until conversation history hydration succeeds', async () => {
    const project = await useProjectStore.getState().createProject('Before Hydration')
    useChatStore.setState({ _hasLoadedHistory: false })
    expect(await useProjectStore.getState().deleteProject(project.id)).toBe(false)
    expect(useProjectStore.getState().byId(project.id)).toBeTruthy()
    expect(useProjectStore.getState().lastError).toMatch(/finish loading/i)
  })
})
