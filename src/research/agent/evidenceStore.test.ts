/** @fileoverview Unit tests for src/research/agent/evidenceStore.ts. */

import { describe, it, expect } from "vitest";
import { createEvidenceStore } from "./evidenceStore";

describe("createEvidenceStore", () => {
  it("starts empty", () => {
    const s = createEvidenceStore();
    expect(s.list()).toEqual([]);
    expect(s.uniqueUrls()).toEqual([]);
    expect(s.citations()).toEqual([]);
  });

  it("adds search results with sequential ids and dedupes URLs", () => {
    const s = createEvidenceStore();
    s.addSearch([
      { url: "https://a", title: "A" },
      { url: "https://a", title: "A duplicate" }, // dedupe
      { url: "https://b", title: "B" },
    ]);
    expect(s.list()).toHaveLength(2);
    expect(s.uniqueUrls()).toEqual(["https://a", "https://b"]);
    expect(s.list()[0].id).toBe("ev-0001");
    expect(s.list()[1].id).toBe("ev-0002");
  });

  it("uses finalUrl when present for scrapes", () => {
    const s = createEvidenceStore();
    s.addScrape({ url: "https://o", finalUrl: "https://r", title: "R" });
    expect(s.list()[0].url).toBe("https://r");
  });

  it("skips scrapes with no URL", () => {
    const s = createEvidenceStore();
    s.addScrape({ url: "", finalUrl: "", title: "Empty" });
    expect(s.list()).toHaveLength(0);
  });

  it("clear() resets the store including the id counter", () => {
    const s = createEvidenceStore();
    s.addSearch([{ url: "https://a", title: "A" }]);
    expect(s.list()[0].id).toBe("ev-0001");
    s.clear();
    s.addSearch([{ url: "https://b", title: "B" }]);
    expect(s.list()[0].id).toBe("ev-0001");
  });

  it("list() returns a shallow copy (mutations don't leak)", () => {
    const s = createEvidenceStore();
    s.addSearch([{ url: "https://a", title: "A" }]);
    const snap = s.list();
    // @ts-expect-error intentional mutation to verify isolation
    snap.pop();
    expect(s.list()).toHaveLength(1);
  });
});
