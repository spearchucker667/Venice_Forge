import '@testing-library/jest-dom/vitest'
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ResearchWorkspaceView } from './ResearchWorkspaceView';
import { useResearchStore } from '../../stores/research-store';
import type { ResearchState } from '../../stores/research-store';
import React from 'react';
import { sanitizeResearchSession } from '../../types/research';
import type { ResearchSession, ResearchSource } from '../../types/research';
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

function mockSessionWithSources(
  sources: Array<{ title: string; url?: string }>,
): ResearchSession {
  const now = new Date().toISOString();
  return {
    id: 's1',
    title: 'Active Research',
    scope: 'global',
    projectId: null,
    description: undefined,
    tags: [],
    queryHistory: [],
    sources: sources.map(
      (s, i): ResearchSource => ({
        id: `source-${i}`,
        kind: 'search_result',
        provider: 'venice',
        title: s.title,
        url: s.url,
        excerpt: undefined,
        summary: undefined,
        query: undefined,
        retrievedAt: now,
        citations: [],
        tags: [],
        archivedAt: null,
        metadata: {},
      }),
    ),
    findings: [],
    favorite: false,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
    metadata: {},
  };
}

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

  it('exposes accessible names for search and scrape controls', () => {
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

    expect(screen.getByRole('textbox', { name: 'Search query' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Scrape URL' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run research search' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Scrape URL' })).toBeInTheDocument();
  });

  it('uses type="submit" on search and scrape buttons', () => {
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

    const buttons = screen.getAllByRole('button') as HTMLButtonElement[];
    const submitButtons = buttons.filter((b) => b.type === 'submit');
    expect(submitButtons.map((b) => b.getAttribute('aria-label'))).toEqual(
      expect.arrayContaining(['Run research search', 'Scrape URL']),
    );
  });

  // REGRESSION GUARD: every Tailwind class in ResearchWorkspaceView.tsx
  // must use the canonical theme tokens (bg-surface / bg-bg /
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

  // REGRESSION GUARD (T-055): research source links must only render URLs
  // that pass the protocol allowlist (http/https). Dangerous schemes such as
  // javascript:, file:, or data: must not produce clickable anchors, even if
  // a stored source record somehow contains them.
  it('renders only allowlisted http/https source URLs as links', () => {
    const session = mockSessionWithSources([
      { title: 'Safe HTTPS', url: 'https://example.com' },
      { title: 'Safe HTTP', url: 'http://example.com' },
      { title: 'Unsafe JS', url: 'javascript:alert(1)' },
      { title: 'Unsafe File', url: 'file:///etc/passwd' },
      { title: 'Unsafe Data', url: 'data:text/html,<script>alert(1)</script>' },
    ]);

    vi.mocked(useResearchStore).mockReturnValue(
      researchState({
        sessions: [session],
        activeSessionId: 's1',
      }),
    );

    render(<ResearchWorkspaceView />);

    const safeHttps = screen.getByRole('link', { name: 'Safe HTTPS' });
    expect(safeHttps).toHaveAttribute('href', 'https://example.com/');
    expect(safeHttps).toHaveAttribute('target', '_blank');
    expect(safeHttps).toHaveAttribute('rel', 'noreferrer');

    const safeHttp = screen.getByRole('link', { name: 'Safe HTTP' });
    expect(safeHttp).toHaveAttribute('href', 'http://example.com/');

    expect(
      screen.queryByRole('link', { name: 'Unsafe JS' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Unsafe File' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Unsafe Data' }),
    ).not.toBeInTheDocument();

    expect(screen.getByText('Unsafe JS')).toBeInTheDocument();
    expect(screen.getByText('Unsafe File')).toBeInTheDocument();
    expect(screen.getByText('Unsafe Data')).toBeInTheDocument();
  });
});
