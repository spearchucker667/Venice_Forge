// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./conversationVault", () => ({
  purgeProfileConversationVault: vi.fn(async () => ({ removed: true })),
}));
vi.mock("./chatStorage", () => ({
  purgeProfileChatHistory: vi.fn(async () => ({ ok: true, removed: true })),
}));
vi.mock("./chatTtsBridge", () => ({
  purgeProfileTtsCache: vi.fn(async () => ({ ok: true, removed: true })),
}));
vi.mock("./secureStore", () => ({
  deleteApiKey: vi.fn(),
  deleteJinaApiKey: vi.fn(),
  deleteProviderApiKey: vi.fn(),
  clearProfilePassword: vi.fn(),
}));

import { purgeProfileConversationVault } from "./conversationVault";
import { purgeProfileChatHistory } from "./chatStorage";
import { purgeProfileTtsCache } from "./chatTtsBridge";
import { clearProfilePassword, deleteApiKey, deleteJinaApiKey, deleteProviderApiKey } from "./secureStore";
import { purgeMainProfileData } from "./profilePurge";
import { PROVIDER_REGISTRY } from "../../src/types/provider";

describe("purgeMainProfileData", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects the default profile and traversal ids", async () => {
    await expect(purgeMainProfileData("default")).rejects.toThrow(/default/i);
    await expect(purgeMainProfileData("../other")).rejects.toThrow(/invalid/i);
    expect(purgeProfileConversationVault).not.toHaveBeenCalled();
  });

  it("purges only the requested profile and returns structured results", async () => {
    const result = await purgeMainProfileData("work");
    expect(result.ok).toBe(true);
    expect(result.profileId).toBe("work");
    expect(purgeProfileConversationVault).toHaveBeenCalledWith("work");
    expect(purgeProfileChatHistory).toHaveBeenCalledWith("work");
    expect(purgeProfileTtsCache).toHaveBeenCalledWith("work");
    expect(deleteApiKey).toHaveBeenCalledWith("work");
    expect(deleteJinaApiKey).toHaveBeenCalledWith("work");
    expect(clearProfilePassword).toHaveBeenCalledWith("work");
    for (const providerId of Object.keys(PROVIDER_REGISTRY)) {
      expect(deleteProviderApiKey).toHaveBeenCalledWith(providerId, "work");
    }
    expect(result.steps.providerApiKeys.removed).toBe(Object.keys(PROVIDER_REGISTRY).length);
  });

  it("redacts partial failures and remains actionable", async () => {
    vi.mocked(deleteJinaApiKey).mockImplementationOnce(() => { throw new Error("****** at /Users/private"); });
    const result = await purgeMainProfileData("work");
    expect(result.ok).toBe(false);
    expect(result.steps.jinaApiKey.ok).toBe(false);
    expect(result.steps.jinaApiKey.error).not.toMatch(/Users\/private/);
    expect(result.steps.conversationVault.ok).toBe(true);
  });

  it("surfaces chat history purge failure without aborting sibling steps", async () => {
    vi.mocked(purgeProfileChatHistory).mockRejectedValueOnce(new Error("disk locked"));
    const result = await purgeMainProfileData("work");
    expect(result.ok).toBe(false);
    expect(result.steps.chatHistory.ok).toBe(false);
    expect(result.steps.ttsCache.ok).toBe(true);
  });
});
