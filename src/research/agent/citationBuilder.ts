// Code Owner: fayeblade (@spearchucker667)
/** @fileoverview Formats research evidence into a citation list. */

import type { ResearchEvidence } from "./researchRunner";

export interface Citation {
  index: number;
  url: string;
  title?: string;
  snippet?: string;
}

export function buildCitations(evidence: ResearchEvidence): Citation[] {
  const citations: Citation[] = [];
  let idx = 1;
  for (const r of evidence.searchResults) {
    if (!r.url) continue;
    citations.push({
      index: idx++,
      url: r.url,
      title: r.title,
      snippet: r.snippet,
    });
  }
  for (const s of evidence.scrapes) {
    const url = s.finalUrl || s.url;
    if (!url) continue;
    citations.push({
      index: idx++,
      url,
      title: s.title,
      snippet: s.content?.slice(0, 280),
    });
  }
  return citations;
}

const ALLOWED_CITATION_SCHEMES = new Set(["http:", "https:"]);

function escapeMarkdownLinkText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\]/g, "\\]");
}

function escapeMarkdownLinkUrl(url: string): string {
  return url.replace(/\\/g, "\\\\").replace(/\)/g, "\\)");
}

function isSafeCitationUrl(url: string): boolean {
  try {
    return ALLOWED_CITATION_SCHEMES.has(new URL(url).protocol);
  } catch {
    return false;
  }
}

export function formatCitationsMarkdown(citations: Citation[]): string {
  const safe = citations.filter((c) => isSafeCitationUrl(c.url));
  if (!safe.length) return "No citations available.";
  return safe
    .map((c) => `${c.index}. [${escapeMarkdownLinkText(c.title || "Source")}](${escapeMarkdownLinkUrl(c.url)})`)
    .join("\n");
}
