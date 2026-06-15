/** @fileoverview Unit tests for src/research/agent/citationBuilder.ts. */

import { describe, it, expect } from "vitest";
import { buildCitations, formatCitationsMarkdown } from "./citationBuilder";
import type { ResearchEvidence } from "./researchRunner";

const TS = "2026-01-01T00:00:00Z";

function fixture(partial: Partial<ResearchEvidence>): ResearchEvidence {
  return {
    searchResults: [],
    scrapes: [],
    citations: [],
    ...partial,
  };
}

describe("buildCitations", () => {
  it("returns an empty array when no search or scrape results", () => {
    expect(buildCitations(fixture({}))).toEqual([]);
  });

  it("numbers search results first, then scrapes", () => {
    const citations = buildCitations(
      fixture({
        searchResults: [
          { provider: "venice", url: "https://a.example", title: "A" },
          { provider: "venice", url: "https://b.example", title: "B" },
        ],
        scrapes: [
          { provider: "venice", url: "https://c.example", finalUrl: "https://c.example", title: "C", fetchedAt: TS },
        ],
      })
    );
    expect(citations.map((c) => c.index)).toEqual([1, 2, 3]);
    expect(citations[2].url).toBe("https://c.example");
  });

  it("skips results with no URL", () => {
    const citations = buildCitations(
      fixture({
        searchResults: [
          { provider: "venice", url: "https://a.example", title: "A" },
          { provider: "venice", url: "", title: "No URL" },
        ],
      })
    );
    expect(citations).toHaveLength(1);
    expect(citations[0].index).toBe(1);
  });

  it("uses finalUrl over url for scrapes", () => {
    const citations = buildCitations(
      fixture({
        scrapes: [
          { provider: "venice", url: "https://original.example", finalUrl: "https://redirected.example", title: "R", fetchedAt: TS },
        ],
      })
    );
    expect(citations[0].url).toBe("https://redirected.example");
  });

  it("truncates scrape snippets to 280 chars", () => {
    const long = "x".repeat(1000);
    const citations = buildCitations(
      fixture({
        scrapes: [
          { provider: "venice", url: "https://a", finalUrl: "https://a", title: "A", content: long, fetchedAt: TS },
        ],
      })
    );
    expect(citations[0].snippet?.length).toBe(280);
  });
});

describe("formatCitationsMarkdown", () => {
  it("returns a friendly placeholder when empty", () => {
    expect(formatCitationsMarkdown([])).toMatch(/no citations/i);
  });

  it("escapes backslashes and closing brackets in title text", () => {
    const md = formatCitationsMarkdown([
      { index: 1, url: "https://a", title: "Title with [bracket] and \\ backslash" },
    ]);
    // The escape rule escapes \ and ] but leaves [ alone (since [ is a
    // legal character inside a markdown link label).
    expect(md).toMatch(/Title with \[bracket\\] and \\\\ backslash/);
  });

  it("escapes closing parens in URLs", () => {
    const md = formatCitationsMarkdown([
      { index: 1, url: "https://a.example/path)", title: "T" },
    ]);
    expect(md).toMatch(/path\\\)/);
  });

  it("filters out non-http(s) URL schemes (T-143 regression)", () => {
    const md = formatCitationsMarkdown([
      { index: 1, url: "javascript:alert(1)", title: "Unsafe JS" },
      { index: 2, url: "data:text/html,<script>alert(1)</script>", title: "Unsafe data" },
      { index: 3, url: "file:///etc/passwd", title: "Unsafe file" },
      { index: 4, url: "https://safe.example", title: "Safe" },
    ]);
    expect(md).not.toMatch(/javascript:/);
    expect(md).not.toMatch(/data:/);
    expect(md).not.toMatch(/file:/);
    expect(md).toMatch(/4\. \[Safe\]\(https:\/\/safe\.example\)/);
  });

  it("filters out citations with malformed URLs (T-143 regression)", () => {
    const md = formatCitationsMarkdown([
      { index: 1, url: "not a valid url", title: "Bad URL" },
      { index: 2, url: "https://valid.example", title: "Valid" },
    ]);
    expect(md).not.toMatch(/Bad URL/);
    expect(md).toMatch(/2\. \[Valid\]\(https:\/\/valid\.example\)/);
  });

  it("falls back to the placeholder when all citations use unsafe schemes (T-143 regression)", () => {
    const md = formatCitationsMarkdown([
      { index: 1, url: "javascript:alert(1)", title: "Unsafe" },
    ]);
    expect(md).toMatch(/no citations/i);
  });
});
