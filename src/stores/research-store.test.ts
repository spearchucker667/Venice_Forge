import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useResearchStore } from './research-store';
import StorageService from '../services/storageService';
import * as logger from '../shared/logger';
import { redactErrorMessage } from '../shared/redaction';

vi.mock('../services/storageService', () => ({
  default: {
    getItems: vi.fn(),
    saveItem: vi.fn(),
    deleteItem: vi.fn(),
  },
}));

vi.mock('./project-store', () => ({
  useProjectStore: {
    getState: () => ({
      getActiveProjectId: vi.fn(() => null),
      byId: vi.fn(() => null),
    }),
  },
}));

describe('Research Workspace Store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useResearchStore.setState({ sessions: [], activeSessionId: null, hydrated: false });
  });

  it('creates a session and persists it', async () => {
    const session = await useResearchStore.getState().createSession({ title: 'Test Research' });
    expect(session.title).toBe('Test Research');
    expect(StorageService.saveItem).toHaveBeenCalledWith('researchSessions', expect.any(Object));
    expect(useResearchStore.getState().sessions).toHaveLength(1);
    expect(useResearchStore.getState().activeSessionId).toBe(session.id);
  });

  it('updates a session', async () => {
    const session = await useResearchStore.getState().createSession({ title: 'Test Research' });
    await useResearchStore.getState().updateSession(session.id, { description: 'Updated desc' });
    
    const updated = useResearchStore.getState().sessions[0];
    expect(updated.description).toBe('Updated desc');
    expect(StorageService.saveItem).toHaveBeenCalled();
  });

  it('adds a query to a session', async () => {
    const session = await useResearchStore.getState().createSession({ title: 'Test Research' });
    await useResearchStore.getState().addQuery(session.id, 'What is Phase 2I?');
    
    const updated = useResearchStore.getState().sessions[0];
    expect(updated.queryHistory).toContain('What is Phase 2I?');
  });

  it('adds, updates, archives, and removes a source', async () => {
    const session = await useResearchStore.getState().createSession({ title: 'Test Research' });
    
    const source = await useResearchStore.getState().addSource(session.id, {
      kind: 'search_result',
      provider: 'venice',
      title: 'Venice Research',
      retrievedAt: new Date().toISOString(),
      citations: [],
      tags: [],
    });
    expect(useResearchStore.getState().sessions[0].sources).toHaveLength(1);

    await useResearchStore.getState().updateSource(session.id, source.id, { title: 'Updated Source' });
    expect(useResearchStore.getState().sessions[0].sources[0].title).toBe('Updated Source');

    await useResearchStore.getState().archiveSource(session.id, source.id);
    expect(useResearchStore.getState().sessions[0].sources[0].archivedAt).toBeDefined();

    await useResearchStore.getState().removeSource(session.id, source.id);
    expect(useResearchStore.getState().sessions[0].sources).toHaveLength(0);
  });

  it('adds, updates, and removes a finding', async () => {
    const session = await useResearchStore.getState().createSession({ title: 'Test Research' });
    
    const finding = await useResearchStore.getState().addFinding(session.id, {
      title: 'Finding 1',
      content: 'Important info',
      sourceIds: [],
      citationIds: [],
      tags: [],
    });
    expect(useResearchStore.getState().sessions[0].findings).toHaveLength(1);

    await useResearchStore.getState().updateFinding(session.id, finding.id, { title: 'Updated Finding' });
    expect(useResearchStore.getState().sessions[0].findings[0].title).toBe('Updated Finding');

    await useResearchStore.getState().removeFinding(session.id, finding.id);
    expect(useResearchStore.getState().sessions[0].findings).toHaveLength(0);
  });

  it('archives a session', async () => {
    const session = await useResearchStore.getState().createSession({ title: 'To Archive' });
    await useResearchStore.getState().archiveSession(session.id);
    expect(useResearchStore.getState().sessions[0].archivedAt).toBeDefined();
  });

  it('deletes a session', async () => {
    const session = await useResearchStore.getState().createSession({ title: 'To Delete' });
    await useResearchStore.getState().deleteSession(session.id);
    
    expect(useResearchStore.getState().sessions).toHaveLength(0);
    expect(StorageService.deleteItem).toHaveBeenCalledWith('researchSessions', session.id);
  });

  it('toggles favorite', async () => {
    const session = await useResearchStore.getState().createSession({ title: 'Fav' });
    await useResearchStore.getState().toggleFavorite(session.id);
    expect(useResearchStore.getState().sessions[0].favorite).toBe(true);

    await useResearchStore.getState().toggleFavorite(session.id);
    expect(useResearchStore.getState().sessions[0].favorite).toBe(false);
  });

  it('sets active session', async () => {
    const session = await useResearchStore.getState().createSession({ title: 'Test' });
    useResearchStore.getState().setActiveSession(null);
    expect(useResearchStore.getState().activeSessionId).toBeNull();
    
    useResearchStore.getState().setActiveSession(session.id);
    expect(useResearchStore.getState().activeSessionId).toBe(session.id);
  });

  it('gets session', async () => {
    const session = await useResearchStore.getState().createSession({ title: 'Test' });
    expect(useResearchStore.getState().getSession(session.id)?.id).toBe(session.id);
    expect(useResearchStore.getState().getSession('missing')).toBeNull();
  });

  it('exports research', async () => {
    const session = await useResearchStore.getState().createSession({ title: 'Test' });
    const exported = useResearchStore.getState().exportResearch([session.id]);
    expect(exported.version).toBe(1);
    expect(exported.sessions).toHaveLength(1);
    expect(exported.sessions[0].id).toBe(session.id);
  });

  it('imports research', async () => {
    const payload = {
      version: 1,
      app: 'Venice Forge',
      sessions: [{ id: 'mock', title: 'Imported' }]
    };
    const cryptoSpy = vi.spyOn(crypto, 'randomUUID').mockReturnValue('new-uuid');
    const result = await useResearchStore.getState().importResearch(payload);
    expect(result.imported).toHaveLength(1);
    expect(result.skipped).toHaveLength(0);
    expect(useResearchStore.getState().sessions[0].title).toBe('Imported');
    expect(useResearchStore.getState().sessions[0].id).toBe('new-uuid');
    cryptoSpy.mockRestore();
  });

  it('importResearch handles invalid payloads', async () => {
    let result = await useResearchStore.getState().importResearch(null);
    expect(result.skipped[0].reason).toBe('Invalid payload');

    result = await useResearchStore.getState().importResearch({ version: 2 });
    expect(result.skipped[0].reason).toBe('Incompatible or corrupt export');
  });

  // T-196 regression guard: raw load exceptions must be redacted before logging.
  it('redacts raw load exceptions before logging', async () => {
    useResearchStore.setState({ hydrated: false, isInitialLoading: false });
    const rawError = new Error('IDB read failed at /Users/super_user/.config with sk-1234567890abcdef');
    vi.mocked(StorageService.getItems).mockRejectedValueOnce(rawError);
    const loggerError = vi.spyOn(logger, 'error').mockImplementation(() => {});

    await useResearchStore.getState().ensureResearchLoaded();

    expect(useResearchStore.getState().hydrated).toBe(false);
    expect(loggerError).toHaveBeenCalledTimes(1);
    const loggedArg = loggerError.mock.calls[0][1];
    expect(String(loggedArg)).not.toContain('sk-1234567890abcdef');
    expect(String(loggedArg)).toBe(redactErrorMessage(rawError));
    expect(String(loggedArg)).toContain('[REDACTED]');

    loggerError.mockRestore();
  });
});
