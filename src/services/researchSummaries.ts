/** @fileoverview Citation-preserving research summary helpers (Phase 2I).
 *
 * This service helps build structured summaries from research sources and findings,
 * ensuring citations are preserved and origins are correctly attributed.
 */

import { ResearchSession, ResearchSource, ResearchFinding } from '../types/research';

export interface ResearchSummaryInput {
  session: ResearchSession;
  sourceIds?: string[];
  findingIds?: string[];
}

export interface ResearchSummaryResult {
  title: string;
  summary: string;
  citationIds: string[];
  sourceIds: string[];
  warnings: Array<{
    id: string;
    severity: "info" | "warning" | "error";
    message: string;
  }>;
}

/**
 * Build a citation-preserving summary from selected research artifacts.
 */
export function buildResearchSummary(
  input: ResearchSummaryInput,
): ResearchSummaryResult {
  const { session, sourceIds, findingIds } = input;
  const warnings: ResearchSummaryResult['warnings'] = [];
  
  const selectedSources: ResearchSource[] = [];
  const selectedFindings: ResearchFinding[] = [];

  // Resolve sources
  if (sourceIds && sourceIds.length > 0) {
    for (const id of sourceIds) {
      const src = session.sources.find(s => s.id === id);
      if (src) {
        selectedSources.push(src);
      } else {
        warnings.push({ id: `missing-source-${id}`, severity: 'warning', message: `Source ${id} not found in session` });
      }
    }
  } else {
    // Default to all non-archived sources if none specified
    selectedSources.push(...session.sources.filter(s => !s.archivedAt));
  }

  // Resolve findings
  if (findingIds && findingIds.length > 0) {
    for (const id of findingIds) {
      const finding = session.findings.find(f => f.id === id);
      if (finding) {
        selectedFindings.push(finding);
      } else {
        warnings.push({ id: `missing-finding-${id}`, severity: 'warning', message: `Finding ${id} not found in session` });
      }
    }
  } else {
    selectedFindings.push(...session.findings);
  }

  const citationIds = new Set<string>();
  const activeSourceIds = new Set<string>();
  const summaryBlocks: string[] = [];

  // Add findings to summary
  for (const f of selectedFindings) {
    summaryBlocks.push(`### ${f.title}\n${f.content}`);
    f.citationIds.forEach(id => citationIds.add(id));
    f.sourceIds.forEach(id => activeSourceIds.add(id));
  }

  // Add source excerpts/summaries to summary
  for (const s of selectedSources) {
    activeSourceIds.add(s.id);
    const content = s.summary || s.excerpt || '';
    if (content) {
      summaryBlocks.push(`#### Source: ${s.title}\n${content}`);
      s.citations.forEach(c => citationIds.add(c.id));
    }
  }

  return {
    title: `Research Summary: ${session.title}`,
    summary: summaryBlocks.join('\n\n'),
    citationIds: Array.from(citationIds),
    sourceIds: Array.from(activeSourceIds),
    warnings
  };
}
