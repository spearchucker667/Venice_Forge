// @vitest-environment node
import { describe, expect, it } from "vitest";
import { checkIpcRateLimit, rateLimitIpcHandler, resetIpcRateLimitForTests } from "./rateLimit";
import type { IpcMainInvokeEvent } from "electron";

describe("rateLimitIpcHandler", () => {
  it("returns the channel-specific limited response for boolean handlers", async () => {
    resetIpcRateLimitForTests();
    const event = { sender: { id: 1 } } as IpcMainInvokeEvent;
    const handler = rateLimitIpcHandler(
      "apiKey:isConfigured",
      async (_event: IpcMainInvokeEvent) => true,
      () => false,
    );
    for (let i = 0; i < 120; i += 1) {
      expect(await handler(event)).toBe(true);
    }
    expect(await handler(event)).toBe(false);
    expect(checkIpcRateLimit("apiKey:isConfigured", 1)).toBe(false);
  });
});
