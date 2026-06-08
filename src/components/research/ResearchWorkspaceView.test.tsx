import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ResearchWorkspaceView } from './ResearchWorkspaceView';
import { useResearchStore } from '../../stores/research-store';
import type { ResearchState } from '../../stores/research-store';
import React from 'react';
import { sanitizeResearchSession } from '../../types/research';

// Mock the store
vi.mock('../../stores/research-store', () => ({
  useResearchStore: vi.fn(),
}));

// Mock other stores
vi.mock('../../stores/project-store', () => ({
  useProjectStore: (selector: (state: { getActiveProjectId(): null }) => unknown) =>
    selector({ getActiveProjectId: () => null }),
}));
vi.mock('../../stores/prompt-library-store', () => ({
  usePromptLibraryStore: () => ({ createPrompt: vi.fn() }),
}));
vi.mock('../../stores/toast-store', () => ({
  toast: { success: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../../stores/workflow-template-store', () => ({
  useWorkflowTemplateStore: () => ({ createWorkflow: vi.fn() }),
}));

function researchState(overrides: Partial<ResearchState>): ResearchState {
  return {
    sessions: [],
    activeSessionId: null,
    hydrated: true,
    isInitialLoading: false,
    ensureResearchLoaded: vi.fn(),
    createSession: vi.fn(),
    updateSession: vi.fn(),
    addQuery: vi.fn(),
    addSource: vi.fn(),
    updateSource: vi.fn(),
    archiveSource: vi.fn(),
    removeSource: vi.fn(),
    addFinding: vi.fn(),
    updateFinding: vi.fn(),
    removeFinding: vi.fn(),
    archiveSession: vi.fn(),
    deleteSession: vi.fn(),
    toggleFavorite: vi.fn(),
    setActiveSession: vi.fn(),
    getSession: vi.fn(),
    importResearch: vi.fn(),
    exportResearch: vi.fn(),
    ...overrides,
  };
}

describe('ResearchWorkspaceView', () => {
  it('renders empty state when no session is active', () => {
    vi.mocked(useResearchStore).mockReturnValue(researchState({}));

    render(<ResearchWorkspaceView />);
    expect(screen.getByText(/Select a research session or create a new one/i)).toBeDefined();
  });

  it('renders active session details', () => {
    const mockSession = sanitizeResearchSession({
      id: 's1',
      title: 'Active Research',
      sources: [],
      findings: [],
      scope: 'global',
      tags: [],
    });

    vi.mocked(useResearchStore).mockReturnValue(researchState({
      sessions: [mockSession],
      activeSessionId: 's1',
    }));

    render(<ResearchWorkspaceView />);
    expect(screen.getAllByText('Active Research').length).toBeGreaterThan(0);
    expect(screen.getByPlaceholderText(/Search query/i)).toBeDefined();
    expect(screen.getByPlaceholderText(/Scrape URL/i)).toBeDefined();
  });
});
