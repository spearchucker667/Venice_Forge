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

// Mock ResearchBrowserView to capture the initialUrl prop so we can assert
// the pending-URL pattern is being used correctly.
const mockResearchBrowserView = vi.fn();
vi.mock('../research/ResearchBrowserView', () => ({
  ResearchBrowserView: (props: Record<string, unknown>) => {
    mockResearchBrowserView(props);
    return <div data-testid="mock-research-browser-view" />;
  },
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

// Mock the bridge — the critical assertion is that SearchScrapeView does NOT
// call navigate directly when "Open in Browser" is clicked.
const mockBridge = vi.hoisted(() => ({
  navigate: vi.fn(),
  requestOpenInSystemBrowser: vi.fn(),
}));
vi.mock('../../services/researchBrowserBridge', () => ({
  researchBrowserBridge: mockBridge,
}));

vi.mock('../../services/desktopBridge', () => ({
  isElectron: vi.fn(() => false),
}));

vi.mock('../../shared/urlSecurity', () => ({
  isTrustedExternalUrl: vi.fn(() => false),
}));

vi.mock('./SearchTab', () => ({
  SearchTab: ({ onScrapeWithVenice, onOpenInBrowser }: {
    onScrapeWithVenice?: (url: string) => void;
    onOpenInBrowser?: (url: string) => void;
  }) => (
    <>
      <button
        type="button"
        onClick={() => onScrapeWithVenice?.('https://clicked.example/article')}
      >
        Scrape clicked result
      </button>
      <button
        type="button"
        onClick={() => onOpenInBrowser?.('https://open-in-browser.example/page')}
      >
        Open in Browser
      </button>
    </>
  ),
}));

const mockVeniceFetch = vi.mocked(veniceFetch);

describe('SearchScrapeView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResearchBrowserView.mockReturnValue(null);
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

  // VERIFY-RB-006 regression guard — navigate-before-create (Bug 2, renderer side):
  // When "Open in Browser" is clicked in the Search tab, SearchScrapeView must
  // NOT call researchBrowserBridge.navigate() directly. Instead it must switch
  // to the Browser subtab and pass the pending URL via the initialUrl prop to
  // ResearchBrowserView, which calls navigate after create() succeeds.
  it('does not call bridge.navigate directly when "Open in Browser" is clicked — uses pending URL pattern instead', async () => {
    render(<SearchScrapeView />);

    // Switch to the Search/Scrape subtab to expose the SearchTab
    fireEvent.click(screen.getByRole('button', { name: 'Search / Scrape' }));
    // Click "Open in Browser" on a search result
    fireEvent.click(screen.getByRole('button', { name: 'Open in Browser' }));

    // The bridge.navigate must NOT have been called by SearchScrapeView itself.
    expect(mockBridge.navigate).not.toHaveBeenCalled();

    // The Browser subtab should now be active and ResearchBrowserView should
    // receive the pending URL as the initialUrl prop.
    await waitFor(() =>
      expect(mockResearchBrowserView).toHaveBeenCalledWith(
        expect.objectContaining({ initialUrl: 'https://open-in-browser.example/page' }),
      ),
    );
  });

  // VERIFY-RB-007 regression guard — pendingBrowserUrl is cleared after consumed.
  it('clears the pending URL when onInitialUrlConsumed is called', async () => {
    render(<SearchScrapeView />);

    fireEvent.click(screen.getByRole('button', { name: 'Search / Scrape' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open in Browser' }));

    // Wait for the Browser subtab to render with the pending URL
    await waitFor(() =>
      expect(mockResearchBrowserView).toHaveBeenCalledWith(
        expect.objectContaining({ initialUrl: 'https://open-in-browser.example/page' }),
      ),
    );

    // Simulate ResearchBrowserView calling onInitialUrlConsumed
    const allCalls = mockResearchBrowserView.mock.calls as Array<[Record<string, unknown>]>;
    const lastCallArgs = allCalls.at(-1)?.[0] ?? {};
    const onConsumed = lastCallArgs?.onInitialUrlConsumed as (() => void) | undefined;
    expect(onConsumed).toBeDefined();
    onConsumed?.();

    // After consumption, the initialUrl prop should be null/cleared on next render
    await waitFor(() => {
      const latestArgs = (mockResearchBrowserView.mock.calls as Array<[Record<string, unknown>]>).at(-1)?.[0] ?? {};
      expect(latestArgs?.initialUrl).toBeNull();
    });
  });

  it('uses an elastic min-h-0 browser wrapper instead of fixed viewport math', async () => {
    render(<SearchScrapeView />);

    fireEvent.click(screen.getByRole('button', { name: 'Browser' }));

    const browser = await screen.findByTestId('mock-research-browser-view');
    const wrapper = browser.parentElement;
    expect(wrapper?.className).toContain('flex');
    expect(wrapper?.className).toContain('min-h-0');
    expect(wrapper?.className).toContain('flex-1');
    expect(wrapper?.className).not.toContain('h-[calc(100vh-220px)]');
  });
});
