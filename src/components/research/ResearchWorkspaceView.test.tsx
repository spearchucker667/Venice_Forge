import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ResearchWorkspaceView } from './ResearchWorkspaceView';
import { useResearchStore } from '../../stores/research-store';
import type { ResearchState } from '../../stores/research-store';
import React from 'react';
import { sanitizeResearchSession } from '../../types/research';
import fs from 'node:fs';
import path from 'node:path';

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

  // REGRESSION GUARD: every Tailwind class in ResearchWorkspaceView.tsx
  // must use the canonical theme tokens (bg-surface / bg-bg-base /
  // border-border / text-text-primary / bg-accent / bg-danger / etc.)
  // — never hardcoded `bg-slate-*`, `bg-blue-*`, `text-slate-*`,
  // `text-blue-*`, `bg-red-*`, `border-slate-*`, `border-blue-*`, or
  // `border-red-*`. This test pins the contract so a future change
  // that re-introduces a hardcoded color (which breaks the app-wide
  // theme and shows as "the only panel that ignores your theme") is
  // caught immediately.
  it('does not use hardcoded slate/blue/red Tailwind colors anywhere in the rendered output', () => {
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

    const { container } = render(<ResearchWorkspaceView />);
    const html = container.innerHTML;
    const forbidden = [
      /\bbg-slate-\d+/,
      /\bbg-blue-\d+/,
      /\btext-slate-\d+/,
      /\btext-blue-\d+/,
      /\bbg-red-\d+/,
      /\btext-red-\d+/,
      /\bborder-slate-\d+/,
      /\bborder-blue-\d+/,
      /\bborder-red-\d+/,
      /\bhover:bg-slate-\d+/,
      /\bhover:bg-blue-\d+/,
      /\bhover:bg-red-\d+/,
      /\bhover:text-red-\d+/,
    ];
    for (const re of forbidden) {
      expect(html, `Forbidden class matched ${re}`).not.toMatch(re);
    }
  });

  // REGRESSION GUARD (source-level pin): the same forbidden class
  // patterns must not be present in the source file itself, so a new
  // contributor cannot accidentally re-introduce them between
  // releases.
  it('source file contains no hardcoded slate/blue/red color classes', () => {
    const filePath = path.resolve(__dirname, 'ResearchWorkspaceView.tsx');
    const source = fs.readFileSync(filePath, 'utf8');
    const forbidden = [
      /\bbg-slate-\d+/,
      /\bbg-blue-\d+/,
      /\btext-slate-\d+/,
      /\btext-blue-\d+/,
      /\bbg-red-\d+/,
      /\btext-red-\d+/,
      /\bborder-slate-\d+/,
      /\bborder-blue-\d+/,
      /\bborder-red-\d+/,
      /\bhover:bg-slate-\d+/,
      /\bhover:bg-blue-\d+/,
      /\bhover:bg-red-\d+/,
      /\bhover:text-red-\d+/,
    ];
    for (const re of forbidden) {
      expect(source, `Source contains forbidden class ${re}`).not.toMatch(re);
    }
  });
});
