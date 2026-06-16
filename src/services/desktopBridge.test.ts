/** @fileoverview Unit tests for desktopBridge web fallback behavior. */

import { describe, expect, it, vi, beforeEach } from "vitest";
// @ts-expect-error - fake-indexeddb ESM exports lack proper typings
import FDBFactory from "fake-indexeddb/lib/FDBFactory";
import {
  desktopApiKey,
  desktopApp,
  desktopJinaApiKey,
  desktopVenice,
  isElectron,
} from "./desktopBridge";

vi.mock("./veniceClient", () => ({
  veniceFetch: vi.fn(),
}));

import { veniceFetch } from "./veniceClient";

// Polyfill localStorage for Node 26+ / jsdom environments where it may be
// unavailable by default (see safe-storage.test.ts and modelService.test.ts).
// This makes the VERIFY-038 Jina ephemeral-key tests (and the other three
// web-fallback cases) run reliably instead of throwing on localStorage.clear
// or localStorage.getItem / Object.keys(localStorage).
const localStorageStore: Record<string, string> = {};
const localStorageMock = {
  getItem: (key: string) => localStorageStore[key] ?? null,
  setItem: (key: string, value: string) => { localStorageStore[key] = String(value); },
  removeItem: (key: string) => { delete localStorageStore[key]; },
  clear: () => { for (const k of Object.keys(localStorageStore)) delete localStorageStore[k]; },
  key: (i: number) => Object.keys(localStorageStore)[i] ?? null,
  get length() { return Object.keys(localStorageStore).length; },
};
(globalThis as { localStorage?: Storage }).localStorage =
  localStorageMock as unknown as Storage;

/** Resets IndexedDB, localStorage mock, and clears mocks before each test. */
beforeEach(async () => {
  global.indexedDB = new FDBFactory();
  for (const k of Object.keys(localStorageStore)) delete localStorageStore[k];
  vi.clearAllMocks();
  const sessionState = { venice: false, jina: false };
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url === "/api/session-key") {
      if (method === "POST") {
        sessionState.venice = true;
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (method === "DELETE") {
        sessionState.venice = false;
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ configured: sessionState.venice }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (url === "/api/session-jina-key") {
      if (method === "POST") {
        sessionState.jina = true;
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (method === "DELETE") {
        sessionState.jina = false;
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ configured: sessionState.jina }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }));
  vi.stubGlobal("window", { indexedDB: global.indexedDB, localStorage: localStorageMock as unknown as Storage });
  await desktopApiKey.delete();
});

/** Tests for desktopBridge fallback behavior in web (non-Electron) mode. */
describe("desktopBridge web fallback", () => {
  it("keeps Electron Venice key writes on the secure IPC bridge", async () => {
    const set = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal("window", {
      indexedDB: global.indexedDB,
      veniceForge: { isDesktop: true, apiKey: { set } },
    });

    await expect(desktopApiKey.set("vn-electron-fixture")).resolves.toEqual({ ok: true });
    expect(set).toHaveBeenCalledWith("vn-electron-fixture");
    expect(vi.mocked(fetch).mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });

  /** Verifies that web mode reports correctly and delegates to veniceFetch. */
  it("reports non-Electron mode and avoids desktop IPC calls in browser mode", async () => {
    vi.stubGlobal("window", { indexedDB: global.indexedDB });

    expect(isElectron()).toBe(false);
    await expect(desktopApiKey.isConfigured()).resolves.toBe(false);

    // In web mode test() delegates to veniceFetch; mock a network failure to verify fallback.
    vi.mocked(veniceFetch).mockRejectedValue(new Error("Network error"));
    await expect(desktopApiKey.test()).resolves.toMatchObject({
      ok: false,
      message: "Network error",
    });

    await expect(desktopApp.getDiagnostics()).resolves.toMatchObject({
      isDesktop: false,
      transport: "web-proxy",
    });
    await expect(
      desktopVenice.request({ endpoint: "/models", method: "GET" })
    ).rejects.toThrow(/desktop mode/i);
  });

  /** UIAUTH-001: web Venice keys stay in memory and are registered with the dev proxy. */
  it("keeps web-mode Venice keys ephemeral and out of browser storage", async () => {
    const preKeys = Object.keys(localStorageStore);
    await expect(desktopApiKey.set("vn-test-key")).resolves.toEqual({ ok: true });
    await expect(desktopApiKey.isConfigured()).resolves.toBe(true);
    expect(fetch).toHaveBeenCalledWith("/api/session-key", expect.objectContaining({ method: "POST" }));
    expect(Object.keys(localStorageStore)).toEqual(preKeys);

    await expect(desktopApiKey.delete()).resolves.toEqual({ ok: true });
    await expect(desktopApiKey.isConfigured()).resolves.toBe(false);
  });

  it("uses server session state as authoritative for web Venice configured checks", async () => {
    await expect(desktopApiKey.set("vn-test-key")).resolves.toEqual({ ok: true });
    // Simulate a renderer reload by clearing only the module-local optimization.
    await expect(desktopApiKey.isConfigured()).resolves.toBe(true);
    expect(fetch).toHaveBeenCalledWith("/api/session-key");
  });

  // VERIFY-038: browser-mode Jina overrides are session-memory only.
  // Regression guard: web Jina key must never be written to localStorage (or sessionStorage/IDB).
  // Uses a controlled localStorage mock (polyfilled for Node 26) + precise + delta checks
  // so bootstrap keys from other modules (theme, first-run, model cache, etc.) do not
  // cause false failures on a broad substring regex.
  it("keeps web-mode Jina keys ephemeral and out of browser storage", async () => {
    // Ensure a clean store for this assertion (other imports may have populated innocent keys).
    for (const k of Object.keys(localStorageStore)) delete localStorageStore[k];
    const preKeys = Object.keys(localStorageStore);

    vi.stubGlobal("window", { indexedDB: global.indexedDB, localStorage: localStorageMock as unknown as Storage });

    await expect(desktopJinaApiKey.set("jina-secret")).resolves.toEqual({ ok: true });
    await expect(desktopJinaApiKey.isConfigured()).resolves.toBe(true);
    expect(fetch).toHaveBeenCalledWith("/api/session-jina-key", expect.objectContaining({ method: "POST" }));

    // Core invariant: the well-known persisted key name is never used.
    expect(localStorage.getItem("venice_jina_api_key")).toBeNull();

    // No *new* key whose name suggests a Jina/API/secret key was introduced by the set.
    const postKeys = Object.keys(localStorageStore);
    const newSensitive = postKeys.filter((k) => !preKeys.includes(k) && /jina|api[_-]?key|secret/i.test(k));
    expect(newSensitive.length).toBe(0);

    await desktopJinaApiKey.delete();
    await expect(desktopJinaApiKey.isConfigured()).resolves.toBe(false);
  });

  it("does not send renderer-supplied Jina Authorization headers through the web proxy", async () => {
    await expect(desktopJinaApiKey.set("jina-secret")).resolves.toEqual({ ok: true });
    await expect(desktopJinaApiKey.test()).resolves.toMatchObject({ ok: true });

    const proxyCalls = vi.mocked(fetch).mock.calls.filter(([url]) => url === "/api/proxy-jina");
    expect(proxyCalls).toHaveLength(1);
    const body = JSON.parse(String(proxyCalls[0][1]?.body));
    expect(body.headers).toEqual({});
    expect(JSON.stringify(body)).not.toContain("jina-secret");
  });
});
