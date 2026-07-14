// VERIFY-114 regression guard
// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

const handlers = vi.hoisted(() => new Map<string, (...args: unknown[]) => unknown>());
const synthesize = vi.hoisted(() => vi.fn(async () => ({ ok: true })));
const clearCache = vi.hoisted(() => vi.fn(async () => ({ ok: true })));
const getProfileSessionId = vi.hoisted(() => vi.fn(() => "work"));

vi.mock("electron", () => ({
  ipcMain: { handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => handlers.set(channel, handler)) },
}));
vi.mock("../../services/chatTtsBridge", () => ({ synthesizeSpeech: synthesize, clearTtsCache: clearCache }));
vi.mock("../../services/profileSession", () => ({ getProfileSessionId }));

import { registerChatTtsHandlers } from "./chatTtsHandlers";

describe("chatTtsHandlers", () => {
  it("ignores renderer profile authority and supplies the sender session", async () => {
    registerChatTtsHandlers();
    const sender = {} as Electron.WebContents;
    await handlers.get("tts:synthesize")!({ sender }, { text: "hello", profileId: "forged" }, false);

    expect(getProfileSessionId).toHaveBeenCalledWith(sender);
    expect(synthesize).toHaveBeenCalledWith({ text: "hello", profileId: "forged" }, false, "work");
  });
});
