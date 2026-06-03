import { describe, it, expect, vi, beforeEach } from "vitest";
import { createJinaProvider } from "./jinaResearchProvider";
import { desktopJina } from "../../services/desktopBridge";

vi.mock("../../services/desktopBridge", async () => {
  const mod = await vi.importActual("../../services/desktopBridge");
  return { ...(mod as object), desktopJina: { request: vi.fn() } };
});

describe("jinaResearchProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (desktopJina.request as ReturnType<typeof vi.fn>).mockReset();
  });

  it("constructs search URL with encoded query", async () => {
    (desktopJina.request as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, body: { data: [] }, contentType: "application/json" });
    await createJinaProvider().search!({ query: "hello world" });
    const calls = (desktopJina.request as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
    expect((calls[0]?.[0] as { url: string })?.url).toBe("https://s.jina.ai/hello%20world");
  });

  it("constructs reader URL with encoded target", async () => {
    (desktopJina.request as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, body: "md", contentType: "text/plain" });
    await createJinaProvider().scrape!({ url: "https://example.com?q=1" });
    const calls = (desktopJina.request as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
    expect((calls[0]?.[0] as { url: string })?.url).toBe("https://r.jina.ai/https%3A%2F%2Fexample.com%3Fq%3D1");
  });

  it("does not include Authorization header when no key configured", async () => {
    (desktopJina.request as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, body: "md", contentType: "text/plain" });
    await createJinaProvider().scrape!({ url: "https://a.com" });
    const calls = (desktopJina.request as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
    const headers = (calls[0]?.[0] as { headers?: Record<string, string> })?.headers;
    expect(headers?.["Authorization"]).toBeUndefined();
  });

  it("normalizes JSON reader response", async () => {
    (desktopJina.request as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, body: { data: "# Hello", title: "T", url: "https://final.com" }, contentType: "application/json" });
    const result = await createJinaProvider().scrape!({ url: "https://a.com" });
    expect(result.provider).toBe("jina");
    expect(result.markdown).toBe("# Hello");
    expect(result.title).toBe("T");
    expect(result.finalUrl).toBe("https://final.com");
  });

  it("normalizes plain-text reader response", async () => {
    (desktopJina.request as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, body: "plain text", contentType: "text/plain" });
    const result = await createJinaProvider().scrape!({ url: "https://a.com" });
    expect(result.text).toBe("plain text");
    expect(result.content).toBe("plain text");
  });

  it("normalizes JSON search response", async () => {
    (desktopJina.request as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, body: { data: [{ title: "A", url: "https://a.com", description: "desc a" }, { title: "B", url: "https://b.com", content: "content b" }] }, contentType: "application/json" });
    const results = await createJinaProvider().search!({ query: "q" });
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ provider: "jina", title: "A", url: "https://a.com", snippet: "desc a" });
    expect(results[1]).toMatchObject({ provider: "jina", title: "B", url: "https://b.com" });
  });

  it("falls back to markdown link parsing for plain-text search", async () => {
    (desktopJina.request as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, body: "[Example](https://example.com) something [Other](https://other.com)", contentType: "text/plain" });
    const results = await createJinaProvider().search!({ query: "q" });
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].url).toBe("https://example.com");
  });

  it("normalizes errors", async () => {
    (desktopJina.request as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false, status: 429, error: "rate limited" });
    await expect(createJinaProvider().scrape!({ url: "https://a.com" })).rejects.toThrow(/rate limited/);
  });

  it("maps confirmed options to headers", async () => {
    (desktopJina.request as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, body: "md", contentType: "text/plain" });
    await createJinaProvider().scrape!({ url: "https://a.com", options: { outputFormat: "text", doNotCache: true, removeImages: true, includeLinksSummary: true, includeImagesSummary: true, tokenBudget: 2000 } });
    const calls = (desktopJina.request as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
    const headers = (calls[0]?.[0] as { headers: Record<string, string> })?.headers;
    expect(headers?.["X-Return-Format"]).toBe("text");
    expect(headers?.["X-No-Cache"]).toBe("true");
    expect(headers?.["X-Retain-Images"]).toBe("none");
    expect(headers?.["X-With-Links-Summary"]).toBe("true");
    expect(headers?.["X-With-Images-Summary"]).toBe("true");
    expect(headers?.["X-Token-Budget"]).toBe("2000");
  });
});