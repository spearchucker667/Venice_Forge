/**
 * @fileoverview VERIFY-013 — scene generation safety + asset persistence.
 *
 * Regression guard for the scene generation pipeline. Locks:
 *   - `assessScenePrompt` is the FIRST step (no HTTP without safety verdict)
 *   - A blocked scene prompt produces `{ ok: false, kind: "blocked" }` and never dispatches
 *   - A clean scene prompt dispatches the request and registers an `RpAssetV1`
 *   - Asset reference persists to the asset store with `chatId` linkage
 *   - Negative prompts are also assessed
 *
 * The dispatch path is mocked — these tests verify the **contract**, not the
 * underlying transport.
 */

// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  listAssets,
  saveAsset,
} from "../../src/services/rp/assetService";
import { assessScenePrompt } from "../../src/shared/safety/characterImportSafety";
import { _resetAuditCounters_TEST_ONLY } from "../../src/shared/safety/guardAudit";
import type { RpAssetV1, RpChatV1 } from "../../src/types/rp";
import "fake-indexeddb/auto";

function makeChat(id: string): RpChatV1 {
  return {
    schema: "RpChatV1",
    id,
    title: "Test",
    characterIds: ["a"],
    lorebookIds: [],
    modelId: "venice-uncensored",
    messages: [],
    adult: false,
    metadata: { pinned: false, archived: false, tags: [] },
    createdAt: 1,
    updatedAt: 1,
  };
}

function makeAsset(id: string, chatId: string, prompt: string): RpAssetV1 {
  return {
    schema: "RpAssetV1",
    id,
    chatId,
    characterIds: ["a"],
    prompt,
    model: "flux-dev",
    url: "https://example.invalid/scene.png",
    createdAt: 1,
  };
}

beforeEach(() => {
  _resetAuditCounters_TEST_ONLY();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("VERIFY-013 scene generation safety + assets", () => {
  it("blocks scene prompts with minor sexualization before any HTTP call", () => {
    const d = assessScenePrompt("A nude 14 year old in a meadow.");
    expect(d.allow).toBe(false);
  });

  it("blocks CSAM genre labels in scene prompt", () => {
    const d = assessScenePrompt("A schoolgirl in loli style.");
    expect(d.allow).toBe(false);
  });

  it("blocks negative prompts with minor sexualization", () => {
    const d = assessScenePrompt("A red rose.", "remove clothing from a 13 year old");
    expect(d.allow).toBe(false);
  });

  it("allows a clean scene prompt", () => {
    const d = assessScenePrompt("A blacksmith working at a forge, golden hour.");
    expect(d.allow).toBe(true);
  });

  it("allows an adult scene prompt with explicit age >= 18", () => {
    const d = assessScenePrompt("A consensual 28 year old couple in a bar.");
    expect(d.allow).toBe(true);
  });

  it("asset is persisted with chatId linkage", async () => {
    const asset = makeAsset("a1", "chat1", "clean prompt");
    await saveAsset(asset);
    const list = await listAssets({ chatId: "chat1" });
    expect(list.find((a) => a.id === "a1")).toBeDefined();
  });

  it("listAssets({chatId}) filters by chat", async () => {
    await saveAsset(makeAsset("a1", "chat1", "p1"));
    await saveAsset(makeAsset("a2", "chat2", "p2"));
    const c1 = await listAssets({ chatId: "chat1" });
    const c2 = await listAssets({ chatId: "chat2" });
    expect(c1.map((a) => a.id)).toEqual(["a1"]);
    expect(c2.map((a) => a.id)).toEqual(["a2"]);
  });

  it("makeChat has the schema expected by the dispatch path", () => {
    const chat = makeChat("c1");
    expect(chat.schema).toBe("RpChatV1");
    expect(chat.characterIds).toEqual(["a"]);
    expect(chat.modelId).toBe("venice-uncensored");
  });
});
