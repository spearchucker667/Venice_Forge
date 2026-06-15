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

  it('adds a query to a session', async () => {
    const session = await useResearchStore.getState().createSession({ title: 'Test Research' });
    await useResearchStore.getState().addQuery(session.id, 'What is Phase 2I?');
    
    const updated = useResearchStore.getState().sessions[0];
    expect(updated.queryHistory).toContain('What is Phase 2I?');
  });

  it('adds a source to a session', async () => {
    const session = await useResearchStore.getState().createSession({ title: 'Test Research' });
    await useResearchStore.getState().addSource(session.id, {
      kind: 'search_result',
      provider: 'venice',
      title: 'Venice Research',
      retrievedAt: new Date().toISOString(),
      citations: [],
      tags: [],
    });

    const updated = useResearchStore.getState().sessions[0];
    expect(updated.sources).toHaveLength(1);
    expect(updated.sources[0].title).toBe('Venice Research');
  });

  it('adds a finding to a session', async () => {
    const session = await useResearchStore.getState().createSession({ title: 'Test Research' });
    await useResearchStore.getState().addFinding(session.id, {
      title: 'Finding 1',
      content: 'Important info',
      sourceIds: [],
      citationIds: [],
      tags: [],
    });

    const updated = useResearchStore.getState().sessions[0];
    expect(updated.findings).toHaveLength(1);
    expect(updated.findings[0].title).toBe('Finding 1');
  });

  it('deletes a session', async () => {
    const session = await useResearchStore.getState().createSession({ title: 'To Delete' });
    await useResearchStore.getState().deleteSession(session.id);
    
    expect(useResearchStore.getState().sessions).toHaveLength(0);
    expect(StorageService.deleteItem).toHaveBeenCalledWith('researchSessions', session.id);
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
