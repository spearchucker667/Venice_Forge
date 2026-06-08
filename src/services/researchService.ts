/** @fileoverview Research Service (Phase 2I).
 * 
 * This service provides a high-level API for running research searches and scrapes,
 * wrapping the existing provider architecture with additional safety and normalization.
 */

import { 
  ResearchProvider, 
  ResearchSource, 
  sanitizeResearchSource, 
  sanitizeResearchUrl 
} from '../types/research';
import { 
  runResearchJob, 
  ResearchJobInput,
  ResearchJobResult
} from '../research/agent/researchRunner';
import { veniceResearchProvider } from '../research/providers/veniceResearchProvider';
import { createJinaProvider } from '../research/providers/jinaResearchProvider';
import { createGenericHttpProvider } from '../research/providers/genericHttpScrapeProvider';
import type { ResearchProvider as ProviderAdapter } from '../research/providerTypes';

export interface ResearchSearchRequest {
  query: string;
  provider?: ResearchProvider;
  maxResults?: number;
  projectId?: string | null;
}

export interface ResearchScrapeRequest {
  url: string;
  provider?: ResearchProvider;
  projectId?: string | null;
}

export interface ResearchServiceResult {
  sources: ResearchSource[];
  warnings: Array<{
    id: string;
    severity: "info" | "warning" | "error";
    message: string;
  }>;
}

function resolveProvider(provider: ResearchProvider | undefined): ProviderAdapter {
  switch (provider) {
    case 'jina':
      return createJinaProvider();
    case 'generic-http':
      return createGenericHttpProvider({ enabled: true });
    case 'venice':
    case undefined:
      return veniceResearchProvider;
    default:
      throw new Error(`Research provider ${provider} is not available for network requests`);
  }
}

/**
 * Run a research search query through the configured providers.
 */
export async function runResearchSearch(
  request: ResearchSearchRequest,
): Promise<ResearchServiceResult> {
  if (!request.query || request.query.trim().length === 0) {
    return {
      sources: [],
      warnings: [{ id: 'empty-query', severity: 'warning', message: 'Search query is empty' }]
    };
  }

  const input: ResearchJobInput = {
    question: request.query,
    provider: resolveProvider(request.provider),
    budget: {
      maxQueries: 1,
      maxResultsPerQuery: Math.min(25, Math.max(1, request.maxResults ?? 5)),
      maxPages: 0, // Search only
      maxCharsPerPage: 10000,
      perRequestTimeoutMs: 15000,
      totalJobTimeoutMs: 30000,
    }
  };

  try {
    const jobResult: ResearchJobResult = await runResearchJob(input);
    
    const sources: ResearchSource[] = jobResult.evidence.searchResults.map(ev => sanitizeResearchSource({
      kind: 'search_result',
      provider: ev.provider || 'unknown',
      title: ev.title || 'Untitled Result',
      url: ev.url,
      query: request.query,
      excerpt: ev.snippet || ev.content,
      retrievedAt: new Date().toISOString(),
      citations: [],
      metadata: ev.raw as Record<string, unknown>,
    }));

    const warnings: ResearchServiceResult['warnings'] = [];
    if (jobResult.error) {
      warnings.push({
        id: 'provider-error',
        severity: 'error',
        message: jobResult.error
      });
    }

    return {
      sources,
      warnings
    };
  } catch (err) {
    return {
      sources: [],
      warnings: [{ 
        id: 'search-failed', 
        severity: 'error', 
        message: err instanceof Error ? err.message : 'Search failed' 
      }]
    };
  }
}

/**
 * Scrape a specific URL through the research subsystem.
 */
export async function runResearchScrape(
  request: ResearchScrapeRequest,
): Promise<ResearchServiceResult> {
  const sanitizedUrl = sanitizeResearchUrl(request.url);
  if (!sanitizedUrl) {
    return {
      sources: [],
      warnings: [{ id: 'invalid-url', severity: 'error', message: 'Invalid or unsafe URL' }]
    };
  }

  try {
    const provider = resolveProvider(request.provider);
    if (!provider.supports.scrape || !provider.scrape) {
      return {
        sources: [],
        warnings: [{ id: 'unsupported-provider', severity: 'error', message: `${provider.label} does not support scraping` }],
      };
    }
    const scraped = await provider.scrape({
      url: sanitizedUrl,
      timeoutMs: 20_000,
    });
    const source = sanitizeResearchSource({
      kind: 'scraped_page',
      provider: scraped.provider || request.provider || 'unknown',
      title: scraped.title || sanitizedUrl,
      url: scraped.finalUrl || scraped.url || sanitizedUrl,
      excerpt: scraped.content || scraped.text || scraped.markdown,
      retrievedAt: new Date().toISOString(),
      citations: [],
      metadata: scraped.raw,
    });

    return {
      sources: [source],
      warnings: [],
    };
  } catch (err) {
    return {
      sources: [],
      warnings: [{ 
        id: 'scrape-failed', 
        severity: 'error', 
        message: err instanceof Error ? err.message : 'Scrape failed' 
      }]
    };
  }
}
