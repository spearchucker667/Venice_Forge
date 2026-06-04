/** @fileoverview Unit tests for src/research/agent/citationBuilder.ts. */

import { describe, it, expect } from "vitest";
import { buildCitations, formatCitationsMarkdown } from "./citationBuilder";

describe("buildCitations", () => {
  it("returns an empty array when no search or scrape results", () => {
    expect(buildCitations({ searchResults: [], scrapes: [] })).toEqual([]);
  });

  it("numbers search results first, then scrapes", () => {
    const citations = buildCitations({
      searchResults: [
        { url: "https://a.example", title: "A" },
        { url: "https://b.example", title: "B" },
      ],
      scrapes: [
        { url: "https://c.example", finalUrl: "https://c.example", title: "C" },
      ],
    });
    expect(citations.map((c) => c.index)).toEqual([1, 2, 3]);
    expect(citations[2].url).toBe("https://c.example");
  });

  it("skips results with no URL", () => {
    const citations = buildCitations({
      searchResults: [
        { url: "https://a.example", title: "A" },
        { url: "", title: "No URL" },
      ],
      scrapes: [],
    });
    expect(citations).toHaveLength(1);
    expect(citations[0].index).toBe(1);
  });

  it("uses finalUrl over url for scrapes", () => {
    const citations = buildCitations({
      searchResults: [],
      scrapes: [
        { url: "https://original.example", finalUrl: "https://redirected.example", title: "R" },
      ],
    });
    expect(citations[0].url).toBe("https://redirected.example");
  });

  it("truncates scrape snippets to 280 chars", () => {
    const long = "x".repeat(1000);
    const citations = buildCitations({
      searchResults: [],
      scrapes: [{ url: "https://a", finalUrl: "https://a", title: "A", content: long }],
    });
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
});
