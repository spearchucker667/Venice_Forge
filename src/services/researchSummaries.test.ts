import { describe, it, expect } from 'vitest';
import { buildResearchSummary } from './researchSummaries';
import { ResearchSession, sanitizeResearchSession } from '../types/research';

describe('Research Summaries Helper', () => {
  const mockSession: ResearchSession = sanitizeResearchSession({
    id: 'session-1',
    title: 'Test Session',
    sources: [
      { id: 'src-1', title: 'Source 1', excerpt: 'Excerpt 1', citations: [{ id: 'cit-1', sourceId: 'src-1' }] },
      { id: 'src-2', title: 'Source 2', summary: 'Summary 2', citations: [] },
    ],
    findings: [
      { id: 'f-1', title: 'Finding 1', content: 'Finding Content 1', sourceIds: ['src-1'], citationIds: ['cit-1'] }
    ]
  });

  it('builds a summary from all sources and findings', () => {
    const result = buildResearchSummary({ session: mockSession });
    
    expect(result.summary).toContain('Finding 1');
    expect(result.summary).toContain('Finding Content 1');
    expect(result.summary).toContain('Source 1');
    expect(result.summary).toContain('Excerpt 1');
    expect(result.summary).toContain('Source 2');
    expect(result.summary).toContain('Summary 2');
    
    expect(result.citationIds).toContain('cit-1');
    expect(result.sourceIds).toContain('src-1');
    expect(result.sourceIds).toContain('src-2');
  });

  it('filters by sourceIds', () => {
    const result = buildResearchSummary({ session: mockSession, sourceIds: ['src-1'] });
    
    expect(result.summary).toContain('Source 1');
    expect(result.summary).not.toContain('Source 2');
    expect(result.sourceIds).toContain('src-1');
    expect(result.sourceIds).not.toContain('src-2');
  });

  it('warns for missing sources', () => {
    const result = buildResearchSummary({ session: mockSession, sourceIds: ['invalid'] });
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].id).toBe('missing-source-invalid');
  });
});
