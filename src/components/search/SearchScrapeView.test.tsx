import '@testing-library/jest-dom/vitest';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SearchScrapeView } from './SearchScrapeView';
import { veniceFetch } from '../../services/veniceClient';

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

vi.mock('./ScrapeTab', () => ({
  ScrapeTab: () => <div data-testid="scrape-tab" />,
}));

vi.mock('./TextParserTab', () => ({
  TextParserTab: () => null,
}));

vi.mock('./AiResearchTab', () => ({
  AiResearchTab: () => null,
}));

vi.mock('./ProfileDiscoveryTab', () => ({
  ProfileDiscoveryTab: () => null,
}));

vi.mock('../research/ResearchBrowserView', () => ({
  ResearchBrowserView: () => null,
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
    <button
      type="button"
      onClick={() => onScrapeWithVenice?.('https://clicked.example/article')}
    >
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
});
