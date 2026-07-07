import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createGenericHttpProvider,
  isSafeUrl,
} from "./genericHttpScrapeProvider";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

describe("isSafeUrl SSRF blocklist", () => {
  it("allows public https URLs", () => {
    expect(isSafeUrl("https://example.com")).toBe(true);
    expect(isSafeUrl("https://api.github.com/users/octocat")).toBe(true);
  });

  it("allows public http URLs", () => {
    expect(isSafeUrl("http://example.com")).toBe(true);
  });

  it("blocks non-http schemes", () => {
    expect(isSafeUrl("ftp://example.com")).toBe(false);
    expect(isSafeUrl("file:///etc/passwd")).toBe(false);
    expect(isSafeUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeUrl("data:text/html,foo")).toBe(false);
  });

  it("blocks localhost", () => {
    expect(isSafeUrl("http://localhost")).toBe(false);
    expect(isSafeUrl("http://localhost:3000")).toBe(false);
    expect(isSafeUrl("https://localhost")).toBe(false);
  });

  it("blocks .local hostnames", () => {
    expect(isSafeUrl("http://myhost.local")).toBe(false);
    expect(isSafeUrl("http://myhost.local:8080")).toBe(false);
  });

  it("blocks .internal hostnames", () => {
    expect(isSafeUrl("http://myhost.internal")).toBe(false);
  });

  it("blocks 127.0.0.0/8", () => {
    expect(isSafeUrl("http://127.0.0.1")).toBe(false);
    expect(isSafeUrl("http://127.0.0.53")).toBe(false);
    expect(isSafeUrl("http://127.255.255.255")).toBe(false);
  });

  it("blocks 10.0.0.0/8", () => {
    expect(isSafeUrl("http://10.0.0.1")).toBe(false);
    expect(isSafeUrl("http://10.255.255.255")).toBe(false);
  });

  it("blocks 172.16.0.0/12", () => {
    expect(isSafeUrl("http://172.16.0.1")).toBe(false);
    expect(isSafeUrl("http://172.31.255.255")).toBe(false);
    expect(isSafeUrl("http://172.15.0.1")).toBe(true); // outside
  });

  it("blocks 192.168.0.0/16", () => {
    expect(isSafeUrl("http://192.168.0.1")).toBe(false);
    expect(isSafeUrl("http://192.168.255.255")).toBe(false);
  });

  it("blocks 169.254.0.0/16 (link-local IPv4)", () => {
    expect(isSafeUrl("http://169.254.1.1")).toBe(false);
    expect(isSafeUrl("http://169.254.0.0")).toBe(false);
  });

  it("blocks 0.0.0.0", () => {
    expect(isSafeUrl("http://0.0.0.0")).toBe(false);
  });

  it("blocks 100.64.0.0/10 (CGNAT)", () => {
    expect(isSafeUrl("http://100.64.0.1")).toBe(false);
    expect(isSafeUrl("http://100.127.255.255")).toBe(false);
    expect(isSafeUrl("http://100.63.255.255")).toBe(true); // outside
  });

  it("blocks ::1", () => {
    expect(isSafeUrl("http://[::1]")).toBe(false);
  });

  it("blocks fc00::/7 (ULA)", () => {
    expect(isSafeUrl("http://[fc00::1]")).toBe(false);
    expect(isSafeUrl("http://[fd00::1]")).toBe(false);
    expect(isSafeUrl("http://[fb00::1]")).toBe(true); // outside
  });

  it("blocks fe80::/10 (link-local IPv6)", () => {
    expect(isSafeUrl("http://[fe80::1]")).toBe(false);
    expect(isSafeUrl("http://[fe80::ffff]")).toBe(false);
    expect(isSafeUrl("http://[fe7f::1]")).toBe(true); // outside
  });

  it("blocks ::ffff:<private-v4>", () => {
    expect(isSafeUrl("http://[::ffff:127.0.0.1]")).toBe(false);
    expect(isSafeUrl("http://[::ffff:10.0.0.1]")).toBe(false);
    expect(isSafeUrl("http://[::ffff:192.168.1.1]")).toBe(false);
    expect(isSafeUrl("http://[::ffff:8.8.8.8]")).toBe(true); // public
  });

  // Bug 3.1 regression guard: without IPv4-compatible IPv6 shortform
  // coverage, ::192.168.1.1 / ::c0a8:101 / ::7f00:1 bypassed the
  // IPv4 CIDR blocklist above. The shared isPrivateHostname() helper
  // already handled this via recursive fallback; this provider must
  // also defend since it is the entry point for /api/proxy-scrape.
  it("blocks ::<private-v4> (IPv4-compatible IPv6 shortform)", () => {
    expect(isSafeUrl("http://[::127.0.0.1]")).toBe(false);
    expect(isSafeUrl("http://[::10.0.0.1]")).toBe(false);
    expect(isSafeUrl("http://[::192.168.1.1]")).toBe(false);
    // Compressed hex form: ::c0a8:101 -> 192.168.1.1
    expect(isSafeUrl("http://[::c0a8:101]")).toBe(false);
    // Compressed hex form: ::7f00:1 -> 127.0.0.1
    expect(isSafeUrl("http://[::7f00:1]")).toBe(false);
    // Compressed hex form: ::a00:1 -> 10.0.0.1
    expect(isSafeUrl("http://[::a00:1]")).toBe(false);
    // Public compressed hex form: ::0808:0808 -> 8.8.8.8
    expect(isSafeUrl("http://[::0808:0808]")).toBe(true);
  });

  it("blocks trailing-dot hostnames (SEC-002)", () => {
    expect(isSafeUrl("http://localhost./")).toBe(false);
    expect(isSafeUrl("http://127.0.0.1./")).toBe(false);
  });

  it("blocks all-zero hostnames (SEC-002)", () => {
    expect(isSafeUrl("http://0")).toBe(false);
    expect(isSafeUrl("http://0.0.0.0")).toBe(false);
    expect(isSafeUrl("http://0000")).toBe(false);
  });
});

describe("genericHttpScrapeProvider", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("rejects when disabled", async () => {
    const provider = createGenericHttpProvider({ enabled: false });
    await expect(
      provider.scrape!({ url: "https://example.com" })
    ).rejects.toThrow(/disabled by default/i);
  });

  it("fetches public URL when enabled", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        url: "https://example.com",
        finalUrl: "https://example.com",
        contentType: "text/html",
        body: "<html><body>Hello</body></html>",
      }),
    } as any);

    const provider = createGenericHttpProvider({ enabled: true });
    const result = await provider.scrape!({ url: "https://example.com" });

    expect(result.provider).toBe("generic-http");
    expect(result.text).toBe("Hello");
    expect(result.url).toBe("https://example.com");
  });

  it("rejects blocked URLs even when enabled", async () => {
    const provider = createGenericHttpProvider({ enabled: true });
    await expect(
      provider.scrape!({ url: "http://localhost/secret" })
    ).rejects.toThrow(/blocked by SSRF/i);
  });

  it("rejects disallowed content types", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 415,
      json: async () => ({ error: "Content-Type not allowed" }),
    } as any);

    const provider = createGenericHttpProvider({ enabled: true });
    await expect(
      provider.scrape!({ url: "https://example.com/file.pdf" })
    ).rejects.toThrow(/Content-Type not allowed/i);
  });

  it("enforces timeout", async () => {
    fetchMock.mockImplementationOnce(
      (_url: string, init: RequestInit) =>
        new Promise((_, reject) => {
          const timer = setTimeout(() => reject(new Error("network")), 10_000);
          init.signal?.addEventListener("abort", () => {
            clearTimeout(timer);
            reject(new DOMException("Aborted", "AbortError"));
          });
        })
    );

    const provider = createGenericHttpProvider({ enabled: true });
    await expect(
      provider.scrape!({ url: "https://example.com", timeoutMs: 100 })
    ).rejects.toThrow();
  });

  it("strips script and style tags", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        url: "https://example.com",
        finalUrl: "https://example.com",
        contentType: "text/html",
        body: `<html><script>alert(1)</script><style>.x{}</style><body>Safe</body></html>`,
      }),
    } as any);

    const provider = createGenericHttpProvider({ enabled: true });
    const result = await provider.scrape!({ url: "https://example.com" });
    expect(result.text).toBe("Safe");
  });

  it("strips script tags with malformed end-tag attributes", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        url: "https://example.com",
        finalUrl: "https://example.com",
        contentType: "text/html",
        body: `<html><body>Before<script>alert(1)</script foo="bar">After</body></html>`,
      }),
    } as any);

    const provider = createGenericHttpProvider({ enabled: true });
    const result = await provider.scrape!({ url: "https://example.com" });
    expect(result.text).toBe("Before After");
  });

  it("rejects redirects to prevent SSRF bypass (SEC-001)", async () => {
    // In proxy mode, redirect handling is done on the backend proxy.
    // The test just ensures the frontend handles the proxy returning an error correctly.
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: "Scrape failed: redirect error" }),
    } as any);
    const provider = createGenericHttpProvider({ enabled: true });
    await expect(
      provider.scrape!({ url: "https://example.com/redirect" })
    ).rejects.toThrow();
  });
});
