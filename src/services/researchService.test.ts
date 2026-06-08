import { beforeEach, describe, it, expect, vi } from 'vitest';
import { runResearchSearch, runResearchScrape } from './researchService';
import { runResearchJob } from '../research/agent/researchRunner';
import type { ResearchJobResult } from '../research/agent/researchRunner';
import type { ResearchProvider as ProviderAdapter } from '../research/providerTypes';

const { jinaScrape, genericScrape } = vi.hoisted(() => ({
  jinaScrape: vi.fn(),
  genericScrape: vi.fn(),
}));

vi.mock('../research/agent/researchRunner', () => ({
  runResearchJob: vi.fn(),
}));

vi.mock('../research/providers/veniceResearchProvider', () => ({
  veniceResearchProvider: { id: 'venice', label: 'Venice', supports: { search: true, scrape: true } },
}));

vi.mock('../research/providers/jinaResearchProvider', () => ({
  createJinaProvider: (): ProviderAdapter => ({
    id: 'jina',
    label: 'Jina',
    supports: { search: true, scrape: true, socialDiscovery: false, documentParsing: false },
    search: vi.fn().mockResolvedValue([]),
    scrape: jinaScrape,
  }),
}));

vi.mock('../research/providers/genericHttpScrapeProvider', () => ({
  createGenericHttpProvider: (): ProviderAdapter => ({
    id: 'generic-http',
    label: 'Generic HTTP',
    supports: { search: false, scrape: true, socialDiscovery: false, documentParsing: false },
    scrape: genericScrape,
  }),
}));

describe('Research Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  describe('runResearchSearch', () => {
    it('returns empty result for empty query', async () => {
      const result = await runResearchSearch({ query: '' });
      expect(result.sources).toHaveLength(0);
      expect(result.warnings[0].id).toBe('empty-query');
    });

    it('calls researchRunner and normalizes results', async () => {
      vi.mocked(runResearchJob).mockResolvedValue({
        ok: true,
        evidence: {
          searchResults: [{ title: 'Result 1', url: 'https://v.com/1', provider: 'venice', snippet: 'Info' }],
          scrapes: [],
          citations: []
        },
        store: { addSearch: vi.fn(), addScrape: vi.fn(), citations: vi.fn() },
        queriesUsed: ['venice'],
        pagesScraped: 0
      } as unknown as ResearchJobResult);

      const result = await runResearchSearch({ query: 'venice' });
      expect(result.sources).toHaveLength(1);
      expect(result.sources[0].title).toBe('Result 1');
      expect(result.sources[0].provider).toBe('venice');
    });

    it('routes Jina searches through the selected provider', async () => {
      vi.mocked(runResearchJob).mockResolvedValue({
        ok: true,
        evidence: { searchResults: [], scrapes: [], citations: [] },
        store: { addSearch: vi.fn(), addScrape: vi.fn(), citations: vi.fn() },
        queriesUsed: ['query'],
        pagesScraped: 0,
      } as unknown as ResearchJobResult);

      await runResearchSearch({ query: 'query', provider: 'jina' });

      expect(vi.mocked(runResearchJob).mock.calls[0][0].provider.id).toBe('jina');
    });
  });

  describe('runResearchScrape', () => {
    it('rejects unsafe URLs', async () => {
      const result = await runResearchScrape({ url: 'file:///etc/passwd' });
      expect(result.sources).toHaveLength(0);
      expect(result.warnings[0].id).toBe('invalid-url');
    });

    it('scrapes the requested URL directly with the selected provider', async () => {
      genericScrape.mockResolvedValue({
        title: 'Page',
        url: 'https://v.com/',
        provider: 'generic-http',
        content: 'Text',
        fetchedAt: '',
      });

      const result = await runResearchScrape({ url: 'https://v.com', provider: 'generic-http' });
      expect(result.sources).toHaveLength(1);
      expect(result.sources[0].title).toBe('Page');
      expect(genericScrape).toHaveBeenCalledWith({ url: 'https://v.com/', timeoutMs: 20_000 });
      expect(runResearchJob).not.toHaveBeenCalled();
    });
  });
});
