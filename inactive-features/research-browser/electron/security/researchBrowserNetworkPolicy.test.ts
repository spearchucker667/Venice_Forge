// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  validateResearchBrowserNetworkUrl,
  type ResearchBrowserDnsLookup,
} from "./researchBrowserNetworkPolicy";

function lookup(addresses: string[]): ResearchBrowserDnsLookup {
  return vi.fn(async () => addresses.map((address) => ({ address, family: address.includes(":") ? 6 : 4 })));
}

describe("research browser network policy", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    "file:///etc/passwd",
    "data:text/html,hello",
    "javascript:alert(1)",
    "blob:https://example.com/id",
    "chrome://settings",
    "devtools://devtools/bundled/inspector.html",
    "https://user:pass@example.com",
    "http://localhost",
    "http://127.0.0.1",
    "http://0.0.0.0",
    "http://10.0.0.1",
    "http://172.16.0.1",
    "http://192.168.0.1",
    "http://169.254.169.254",
    "http://100.64.0.1",
    "http://[::1]",
    "http://[fc00::1]",
    "http://[fe80::1]",
  ])("blocks disallowed URL before DNS lookup: %s", async (url) => {
    const fakeLookup = lookup(["93.184.216.34"]);
    const decision = await validateResearchBrowserNetworkUrl(url, fakeLookup);

    expect(decision.allowed).toBe(false);
    expect(fakeLookup).not.toHaveBeenCalled();
  });

  it("blocks public-looking hostnames that resolve to loopback", async () => {
    const decision = await validateResearchBrowserNetworkUrl("https://public.example/", lookup(["127.0.0.1"]));

    expect(decision).toMatchObject({
      allowed: false,
      resolvedAddresses: ["127.0.0.1"],
    });
    expect(decision.reason).toMatch(/private|reserved/i);
  });

  it("blocks public-looking hostnames when any resolved address is private", async () => {
    const decision = await validateResearchBrowserNetworkUrl(
      "https://mixed.example/",
      lookup(["93.184.216.34", "10.0.0.5"]),
    );

    expect(decision.allowed).toBe(false);
    expect(decision.resolvedAddresses).toEqual(["93.184.216.34", "10.0.0.5"]);
  });

  it("blocks hostnames when DNS lookup fails", async () => {
    const fakeLookup: ResearchBrowserDnsLookup = vi.fn(async () => {
      throw new Error("ENOTFOUND");
    });

    const decision = await validateResearchBrowserNetworkUrl("https://missing.example/", fakeLookup);

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toMatch(/DNS lookup failed/);
  });

  it.each([
    "https://google.com/",
    "https://search.brave.com/",
    "https://duckduckgo.com/",
    "https://venice.ai/",
    "https://jina.ai/",
  ])("allows trusted public research destination: %s", async (url) => {
    const decision = await validateResearchBrowserNetworkUrl(url, lookup(["93.184.216.34"]));

    expect(decision).toEqual({
      allowed: true,
      url,
      resolvedAddresses: ["93.184.216.34"],
    });
  });

  it("VERIFY-111: revalidates every request and blocks a rebound hostname", async () => {
    const fakeLookup: ResearchBrowserDnsLookup = vi.fn()
      .mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }])
      .mockResolvedValueOnce([{ address: "127.0.0.1", family: 4 }]);

    await expect(validateResearchBrowserNetworkUrl("https://example.com/one", fakeLookup)).resolves.toMatchObject({
      allowed: true,
    });
    await expect(validateResearchBrowserNetworkUrl("https://example.com/two", fakeLookup)).resolves.toMatchObject({
      allowed: false,
      resolvedAddresses: ["127.0.0.1"],
    });

    expect(fakeLookup).toHaveBeenCalledTimes(2);
  });
});
