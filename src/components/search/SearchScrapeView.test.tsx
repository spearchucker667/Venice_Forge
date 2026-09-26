import '@testing-library/jest-dom/vitest';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SearchScrapeView } from './SearchScrapeView';
import { veniceFetch } from '../../services/veniceClient';
import { runResearchJob } from '../../research/agent/researchRunner';
import { synthesizeResearch } from '../../research/agent/researchSynthesis';
import { createEvidenceStore } from '../../research/agent/evidenceStore';

vi.mock('../../services/veniceClient', () => ({
  MAX_RAW_UPLOAD_BYTES: 10 * 1024 * 1024,
  veniceFetch: vi.fn(),
}));

vi.mock('../../stores/settings-store', () => ({
  useSettingsStore: (selector: (state: {
    selectedModels: { chat: string };
    localFamilySafeModeEnabled: boolean;
  }) => unknown) => selector({
    selectedModels: { chat: 'llama-3.3-70b' },
    localFamilySafeModeEnabled: false,
  }),
}));

vi.mock('../../stores/auth-store', () => ({
  useAuthStore: (selector: (state: { isConfigured: boolean }) => unknown) =>
    selector({ isConfigured: true }),
}));

vi.mock('../../components/DiagnosticsPreview', () => ({
  DiagPreview: () => null,
}));

vi.mock('./ResearchProviderStatus', () => ({
  ResearchProviderStatus: () => <div data-testid="provider-status" />,
}));

vi.mock('./ResearchWorkspacePanel', () => ({
  ResearchWorkspacePanel: () => <div data-testid="workspace-panel" />,
}));

vi.mock('../../research/agent/researchRunner', () => ({ runResearchJob: vi.fn() }));
vi.mock('../../research/agent/researchSynthesis', () => ({ synthesizeResearch: vi.fn() }));

vi.mock('./TextParserTab', () => ({
  TextParserTab: () => null,
}));

vi.mock('./ProfileDiscoveryTab', () => ({
  ProfileDiscoveryTab: () => null,
}));

vi.mock('../../stores/research-store', () => ({
  useResearchStore: {
    getState: () => ({ activeSessionId: null }),
  },
}));

vi.mock('../../stores/toast-store', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock('../../services/researchService', () => ({
  runResearchScrape: vi.fn(),
}));

vi.mock('./SearchTab', () => ({
  SearchTab: ({ onScrapeWithVenice }: {
    onScrapeWithVenice?: (url: string) => void;
  }) => (
    <button type="button" onClick={() => onScrapeWithVenice?.('https://clicked.example/article')}>
      Scrape clicked result
    </button>
  ),
}));

const mockVeniceFetch = vi.mocked(veniceFetch);

describe('SearchScrapeView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVeniceFetch.mockResolvedValue({
      data: { text: 'clicked result text' },
      response: {} as Response,
      headers: {},
      diagnostics: {},
    });
  });

  it('scrapes the clicked search result URL instead of stale scrape input state', async () => {
    render(<SearchScrapeView />);

    fireEvent.click(screen.getByRole('button', { name: 'Search / Scrape' }));
    fireEvent.click(screen.getByRole('button', { name: 'Scrape clicked result' }));

    await waitFor(() =>
      expect(mockVeniceFetch).toHaveBeenCalledWith(
        '/augment/scrape',
        expect.objectContaining({
          body: { url: 'https://clicked.example/article' },
        }),
      ),
    );
  });

  it('scrapes the entered URL when the Scrape button is clicked', async () => {
    render(<SearchScrapeView />);
    fireEvent.click(screen.getByRole('button', { name: 'Search / Scrape' }));
    fireEvent.change(screen.getByPlaceholderText('https://example.com'), {
      target: { value: '  https://example.com/gardens  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Scrape' }));

    await waitFor(() => expect(mockVeniceFetch).toHaveBeenCalledWith(
      '/augment/scrape',
      expect.objectContaining({ body: { url: 'https://example.com/gardens' } }),
    ));
    expect(await screen.findByDisplayValue('clicked result text')).toBeInTheDocument();
  });

  it('renders streamed answer content without coercing chunks or exposing reasoning', async () => {
    vi.mocked(runResearchJob).mockResolvedValue({
      ok: true,
      evidence: { searchResults: [], scrapes: [], citations: ['https://example.com/gardens'] },
      store: createEvidenceStore(),
      queriesUsed: ['urban gardens'],
      pagesScraped: 0,
    });
    vi.mocked(synthesizeResearch).mockImplementation(async ({ onDelta }) => {
      onDelta?.({ content: '', reasoning: 'Internal analysis' });
      onDelta?.({ content: 'Urban gardens ', reasoning: '' });
      onDelta?.({ content: 'support biodiversity.', reasoning: '' });
      return 'Urban gardens support biodiversity.';
    });
    render(<SearchScrapeView />);
    fireEvent.click(screen.getByRole('button', { name: 'AI Research' }));
    fireEvent.change(screen.getByPlaceholderText(/What are the latest changes/i), {
      target: { value: 'urban gardens' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Start Research' }));

    expect(await screen.findByDisplayValue('Urban gardens support biodiversity.')).toBeInTheDocument();
    expect(screen.getByText('https://example.com/gardens')).toBeInTheDocument();
    expect(screen.queryByDisplayValue(/\[object Object\]|Internal analysis/)).not.toBeInTheDocument();
  });

  // VERIFY-143: every long-running Research operation exposes the shared
  // animated, cancellable progress surface at section level.
  it('shows section-wide progress while a web operation is still running', async () => {
    mockVeniceFetch.mockReturnValue(new Promise(() => {}));
    render(<SearchScrapeView />);

    fireEvent.click(screen.getByRole('button', { name: 'Search / Scrape' }));
    fireEvent.click(screen.getByRole('button', { name: 'Scrape clicked result' }));

    expect(await screen.findByTestId('research-loading-indicator')).toBeInTheDocument();
    expect(screen.getByText('Reading web page…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });

  // VERIFY-144: the embedded browser has no active Research subtab.
  it('does not render the archived Browser subtab', () => {
    render(<SearchScrapeView />);
    expect(screen.queryByRole('button', { name: 'Browser' })).not.toBeInTheDocument();
  });
});
