// @vitest-environment node

import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const bridgeMocks = vi.hoisted(() => ({
  setApiKey: vi.fn(),
  setJinaApiKey: vi.fn(),
}));

vi.mock("../services/desktopBridge", () => ({
  desktopApiKey: {
    set: bridgeMocks.setApiKey,
    delete: vi.fn(),
    isConfigured: vi.fn(async () => false),
  },
  desktopJinaApiKey: {
    set: bridgeMocks.setJinaApiKey,
    delete: vi.fn(),
    isConfigured: vi.fn(async () => false),
  },
}));

import { selectHasVeniceKey, useAuthStore } from "./auth-store";

describe("configured Venice key gating", () => {
  beforeEach(() => {
    bridgeMocks.setApiKey.mockReset();
    bridgeMocks.setJinaApiKey.mockReset();
    useAuthStore.setState({
      apiKey: null,
      isConfigured: false,
      jinaApiKey: null,
      jinaIsConfigured: false,
    });
  });

  // VERIFY-037: persisted OS-secure configuration must unlock the UI without
  // copying the raw key back into renderer memory after restart.
  it("treats OS-secure configured state as usable without a renderer key", () => {
    expect(selectHasVeniceKey({ apiKey: null, isConfigured: true })).toBe(true);
    expect(selectHasVeniceKey({ apiKey: null, isConfigured: false })).toBe(false);
  });

  it("routes primary UI key gates through the configured-state selector", () => {
    const root = path.resolve(__dirname, "../..");
    const files = [
      "src/components/chat/chat-view.tsx",
      "src/components/image/image-view.tsx",
      "src/components/video/video-view.tsx",
      "src/components/audio/audio-view.tsx",
      "src/components/image/image-tools.tsx",
      "src/components/embeddings/embeddings-view.tsx",
      "src/components/music/music-view.tsx",
      "src/components/playground/playground-chat.tsx",
      "src/components/layout/header.tsx",
    ];

    for (const file of files) {
      const source = fs.readFileSync(path.join(root, file), "utf8");
      expect(source, file).toContain("selectHasVeniceKey");
      expect(source, file).not.toMatch(/useAuthStore\(\(s\) => s\.apiKey/);
    }
  });

  it("does not retain a Venice key after a successful secure-store write", async () => {
    bridgeMocks.setApiKey.mockResolvedValueOnce({ ok: true });
    await useAuthStore.getState().setApiKey("venice_secret_fixture");
    expect(useAuthStore.getState()).toMatchObject({ apiKey: null, isConfigured: true });
  });

  it("keeps Venice configured state unchanged when secure-store write fails", async () => {
    bridgeMocks.setApiKey.mockResolvedValueOnce({ ok: false, error: "/Users/private/key" });
    await expect(useAuthStore.getState().setApiKey("venice_secret_fixture")).rejects.toThrow("Failed to save API key.");
    expect(useAuthStore.getState()).toMatchObject({ apiKey: null, isConfigured: false });
  });

  it("does not retain a Jina key and rejects failed secure-store writes", async () => {
    bridgeMocks.setJinaApiKey.mockResolvedValueOnce({ ok: true });
    await useAuthStore.getState().setJinaApiKey("jina_secret_fixture");
    expect(useAuthStore.getState()).toMatchObject({ jinaApiKey: null, jinaIsConfigured: true });

    useAuthStore.setState({ jinaApiKey: null, jinaIsConfigured: false });
    bridgeMocks.setJinaApiKey.mockResolvedValueOnce({ ok: false, error: "Bearer secret" });
    await expect(useAuthStore.getState().setJinaApiKey("jina_secret_fixture")).rejects.toThrow("Failed to save Jina API key.");
    expect(useAuthStore.getState()).toMatchObject({ jinaApiKey: null, jinaIsConfigured: false });
  });
});
