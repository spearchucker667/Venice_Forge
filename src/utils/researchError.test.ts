import { describe, it, expect } from "vitest";
import { describeResearchError } from "./researchError";

describe("describeResearchError", () => {
  it("returns the fallback for null/undefined errors", () => {
    expect(describeResearchError(null, "Search failed.")).toBe("Search failed.");
    expect(describeResearchError(undefined, "Search failed.")).toBe("Search failed.");
  });

  it("returns 'Cancelled.' for AbortError", () => {
    expect(describeResearchError({ name: "AbortError", message: "aborted" }, "Search failed.")).toBe("Cancelled.");
  });

  it("returns the fallback for empty messages", () => {
    expect(describeResearchError({ name: "Error", message: "" }, "Search failed.")).toBe("Search failed.");
  });

  it("classifies 'Failed to fetch' as a Venice network error by default", () => {
    const msg = describeResearchError({ message: "Failed to fetch" }, "x");
    expect(msg).toMatch(/Network error/);
    expect(msg).toMatch(/Venice/);
    expect(msg).not.toMatch(/Jina/);
  });

  it("classifies 'Failed to fetch' from Jina as a Jina network error when provider=jina", () => {
    const msg = describeResearchError({ message: "Failed to fetch" }, "x", "jina");
    expect(msg).toMatch(/Network error/);
    expect(msg).toMatch(/Jina/);
    expect(msg).not.toMatch(/Venice/);
  });

  it("detects Jina in the error message when provider=auto", () => {
    const msg = describeResearchError({ message: "Jina request failed: 401" }, "x");
    expect(msg).toMatch(/Jina API key is invalid or expired/);
  });

  it("maps 401 to a key-expired message that names the correct service", () => {
    expect(describeResearchError({ message: "401 unauthorized" }, "x")).toMatch(/Venice API key is invalid/);
    expect(describeResearchError({ message: "401 unauthorized" }, "x", "jina")).toMatch(/Jina API key is invalid/);
  });

  it("maps 403 to a permission message", () => {
    expect(describeResearchError({ message: "403 forbidden" }, "x")).toMatch(/Verify your key permissions/);
    expect(describeResearchError({ message: "403 forbidden" }, "x", "jina")).toMatch(/Jina API denied/);
  });

  it("maps 429 to a rate-limit message", () => {
    expect(describeResearchError({ message: "429 too many requests" }, "x")).toMatch(/rate limit/);
  });

  it("maps timeouts to a timeout message", () => {
    expect(describeResearchError({ message: "Request timed out" }, "x")).toMatch(/timed out/);
  });

  it("passes safety/block messages through unchanged", () => {
    const safety = "Blocked by local safety guard: CSAM term detected";
    expect(describeResearchError({ message: safety }, "x")).toBe(safety);
  });

  it("returns the raw message when no rule matches", () => {
    const raw = "Some unexpected parser failure";
    expect(describeResearchError({ message: raw }, "x")).toBe(raw);
  });

  it("does not call a missing-key error when the user has Jina selected and the request returns 5xx", () => {
    const msg = describeResearchError({ message: "503 service unavailable" }, "x", "jina");
    expect(msg).toMatch(/Jina API is temporarily unavailable/);
    expect(msg).not.toMatch(/API key is not configured/);
  });

  it("does not classify an unrelated digit 5 as a server outage", () => {
    expect(describeResearchError({ message: "parser failed at position 5" }, "x"))
      .toBe("parser failed at position 5");
  });
});
