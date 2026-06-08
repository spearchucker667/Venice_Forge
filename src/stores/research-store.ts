/** @fileoverview Research Workspace Zustand store (Phase 2I).
 *
 * This store manages persistent research sessions, including CRUD operations,
 * project scoping, active session tracking, and safe import/export.
 */

import { create } from 'zustand';
import { 
  ResearchSession, 
  ResearchScope, 
  ResearchSource, 
  ResearchFinding,
  ResearchExport,
  ResearchImportResult,
  sanitizeResearchSession,
  sanitizeResearchSource,
  sanitizeResearchFinding,
  exportResearchSessions,
} from '../types/research';
import StorageService from '../services/storageService';
import { useProjectStore } from './project-store';

export interface ResearchState {
  sessions: ResearchSession[];
  activeSessionId: string | null;
  hydrated: boolean;
  isInitialLoading: boolean;

  ensureResearchLoaded(): Promise<void>;

  createSession(input: {
    title: string;
    description?: string;
    scope?: ResearchScope;
    projectId?: string | null;
    tags?: string[];
  }): Promise<ResearchSession>;

  updateSession(sessionId: string, patch: Partial<Omit<ResearchSession, 'id' | 'createdAt' | 'updatedAt' | 'sources' | 'findings'>>): Promise<void>;

  addQuery(sessionId: string, query: string): Promise<void>;

  addSource(sessionId: string, source: Omit<ResearchSource, 'id'>): Promise<ResearchSource>;
  updateSource(sessionId: string, sourceId: string, patch: Partial<ResearchSource>): Promise<void>;
  archiveSource(sessionId: string, sourceId: string): Promise<void>;
  removeSource(sessionId: string, sourceId: string): Promise<void>;

  addFinding(sessionId: string, finding: Omit<ResearchFinding, 'id' | 'createdAt' | 'updatedAt'>): Promise<ResearchFinding>;
  updateFinding(sessionId: string, findingId: string, patch: Partial<ResearchFinding>): Promise<void>;
  removeFinding(sessionId: string, findingId: string): Promise<void>;

  archiveSession(sessionId: string): Promise<void>;
  deleteSession(sessionId: string): Promise<void>;
  toggleFavorite(sessionId: string): Promise<void>;
  setActiveSession(sessionId: string | null): void;

  getSession(sessionId: string): ResearchSession | null;

  importResearch(payload: unknown): Promise<ResearchImportResult>;
  exportResearch(sessionIds: string[]): ResearchExport;
}

export const useResearchStore = create<ResearchState>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  hydrated: false,
  isInitialLoading: false,

  ensureResearchLoaded: async () => {
    if (get().hydrated || get().isInitialLoading) return;
    
    set({ isInitialLoading: true });
    try {
      const items = await StorageService.getItems<ResearchSession>('researchSessions');
      set({ 
        sessions: items.map(sanitizeResearchSession), 
        hydrated: true 
      });
    } catch (err) {
      console.error('[ResearchStore] Failed to load research sessions:', err);
    } finally {
      set({ isInitialLoading: false });
    }
  },

  createSession: async (input) => {
    const activeProjectId = useProjectStore.getState().getActiveProjectId();
    const requestedProjectId = input.projectId !== undefined ? input.projectId : activeProjectId;
    const scope = input.scope ?? (requestedProjectId ? 'project' : 'global');
    const projectId = scope === 'project' ? requestedProjectId : null;
    if (scope === 'project') {
      const project = projectId ? useProjectStore.getState().byId(projectId) : undefined;
      if (!project || project.archivedAt) throw new Error('A valid active project is required for project-scoped research');
    }
    const session = sanitizeResearchSession({
      ...input,
      scope,
      projectId,
    });

    await StorageService.saveItem('researchSessions', session as unknown as Record<string, unknown>);
    set(state => ({ sessions: [session, ...state.sessions], activeSessionId: session.id }));
    return session;
  },

  updateSession: async (sessionId, patch) => {
    const session = get().sessions.find(s => s.id === sessionId);
    if (!session) return;

    const updated = sanitizeResearchSession({
      ...session,
      ...patch,
      updatedAt: new Date().toISOString(),
    });

    await StorageService.saveItem('researchSessions', updated as unknown as Record<string, unknown>);
    set(state => ({
      sessions: state.sessions.map(s => s.id === sessionId ? updated : s)
    }));
  },

  addQuery: async (sessionId, query) => {
    const session = get().sessions.find(s => s.id === sessionId);
    if (!session) return;

    const updated = sanitizeResearchSession({
      ...session,
      queryHistory: [...session.queryHistory, query],
      updatedAt: new Date().toISOString(),
    });

    await StorageService.saveItem('researchSessions', updated as unknown as Record<string, unknown>);
    set(state => ({
      sessions: state.sessions.map(s => s.id === sessionId ? updated : s)
    }));
  },

  addSource: async (sessionId, sourceInput) => {
    const session = get().sessions.find(s => s.id === sessionId);
    if (!session) throw new Error('Session not found');

    const source = sanitizeResearchSource(sourceInput);
    const updated = sanitizeResearchSession({
      ...session,
      sources: [...session.sources, source],
      updatedAt: new Date().toISOString(),
    });

    await StorageService.saveItem('researchSessions', updated as unknown as Record<string, unknown>);
    set(state => ({
      sessions: state.sessions.map(s => s.id === sessionId ? updated : s)
    }));
    return source;
  },

  updateSource: async (sessionId, sourceId, patch) => {
    const session = get().sessions.find(s => s.id === sessionId);
    if (!session) return;

    const updated = sanitizeResearchSession({
      ...session,
      sources: session.sources.map(src => src.id === sourceId ? { ...src, ...patch } : src),
      updatedAt: new Date().toISOString(),
    });

    await StorageService.saveItem('researchSessions', updated as unknown as Record<string, unknown>);
    set(state => ({
      sessions: state.sessions.map(s => s.id === sessionId ? updated : s)
    }));
  },

  archiveSource: async (sessionId, sourceId) => {
    await get().updateSource(sessionId, sourceId, { archivedAt: new Date().toISOString() });
  },

  removeSource: async (sessionId, sourceId) => {
    const session = get().sessions.find(s => s.id === sessionId);
    if (!session) return;

    const updated = sanitizeResearchSession({
      ...session,
      sources: session.sources.filter(src => src.id !== sourceId),
      updatedAt: new Date().toISOString(),
    });

    await StorageService.saveItem('researchSessions', updated as unknown as Record<string, unknown>);
    set(state => ({
      sessions: state.sessions.map(s => s.id === sessionId ? updated : s)
    }));
  },

  addFinding: async (sessionId, findingInput) => {
    const session = get().sessions.find(s => s.id === sessionId);
    if (!session) throw new Error('Session not found');

    const finding = sanitizeResearchFinding(findingInput);
    const updated = sanitizeResearchSession({
      ...session,
      findings: [...session.findings, finding],
      updatedAt: new Date().toISOString(),
    });

    await StorageService.saveItem('researchSessions', updated as unknown as Record<string, unknown>);
    set(state => ({
      sessions: state.sessions.map(s => s.id === sessionId ? updated : s)
    }));
    return finding;
  },

  updateFinding: async (sessionId, findingId, patch) => {
    const session = get().sessions.find(s => s.id === sessionId);
    if (!session) return;

    const updated = sanitizeResearchSession({
      ...session,
      findings: session.findings.map(f => f.id === findingId ? { ...f, ...patch, updatedAt: new Date().toISOString() } : f),
      updatedAt: new Date().toISOString(),
    });

    await StorageService.saveItem('researchSessions', updated as unknown as Record<string, unknown>);
    set(state => ({
      sessions: state.sessions.map(s => s.id === sessionId ? updated : s)
    }));
  },

  removeFinding: async (sessionId, findingId) => {
    const session = get().sessions.find(s => s.id === sessionId);
    if (!session) return;

    const updated = sanitizeResearchSession({
      ...session,
      findings: session.findings.filter(f => f.id !== findingId),
      updatedAt: new Date().toISOString(),
    });

    await StorageService.saveItem('researchSessions', updated as unknown as Record<string, unknown>);
    set(state => ({
      sessions: state.sessions.map(s => s.id === sessionId ? updated : s)
    }));
  },

  archiveSession: async (sessionId) => {
    await get().updateSession(sessionId, { archivedAt: new Date().toISOString() });
  },

  deleteSession: async (sessionId) => {
    await StorageService.deleteItem('researchSessions', sessionId);
    set(state => ({
      sessions: state.sessions.filter(s => s.id !== sessionId),
      activeSessionId: state.activeSessionId === sessionId ? null : state.activeSessionId
    }));
  },

  toggleFavorite: async (sessionId) => {
    const session = get().sessions.find(s => s.id === sessionId);
    if (!session) return;
    await get().updateSession(sessionId, { favorite: !session.favorite });
  },

  setActiveSession: (sessionId) => {
    set({ activeSessionId: sessionId && get().sessions.some((session) => session.id === sessionId) ? sessionId : null });
  },

  getSession: (sessionId) => {
    return get().sessions.find(s => s.id === sessionId) || null;
  },

  importResearch: async (payload) => {
    const imported: string[] = [];
    const skipped: Array<{ reason: string; title?: string }> = [];

    if (!payload || typeof payload !== 'object') {
      return { imported, skipped: [{ reason: 'Invalid payload' }] };
    }

    const data = payload as { version?: number; app?: string; sessions?: unknown[] };
    if (data.version !== 1 || data.app !== 'Venice Forge' || !Array.isArray(data.sessions)) {
      return { imported, skipped: [{ reason: 'Incompatible or corrupt export' }] };
    }

    for (const sessionData of data.sessions) {
      try {
        const session = sanitizeResearchSession({
          ...(sessionData as object),
          id: crypto.randomUUID(), // Always regenerate IDs on import for safety
        });
        if (session.scope === 'project') {
          const project = session.projectId ? useProjectStore.getState().byId(session.projectId) : undefined;
          if (!project || project.archivedAt) {
            session.scope = 'global';
            session.projectId = null;
          }
        }
        
        await StorageService.saveItem('researchSessions', session as unknown as Record<string, unknown>);
        imported.push(session.id);
        set((state) => ({
          sessions: state.sessions.some((existing) => existing.id === session.id)
            ? state.sessions
            : [session, ...state.sessions],
        }));
      } catch {
        const title = (sessionData && typeof sessionData === 'object') 
          ? (sessionData as Record<string, unknown>).title 
          : undefined;
        skipped.push({ 
          reason: 'Failed to sanitize or save session', 
          title: typeof title === 'string' ? title : undefined 
        });
      }
    }

    return { imported, skipped };
  },

  exportResearch: (sessionIds) => {
    const selected = get().sessions.filter(s => sessionIds.includes(s.id));
    return exportResearchSessions(selected);
  },
}));
