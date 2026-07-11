import { describe, expect, it } from "vitest";
import { createConflictIdentity } from "./syncConflictIdentity";

describe("createConflictIdentity", () => {
  it("is stable for identical provenance and changes with operation identity", async () => {
    const input = {
      storeName: "character_cards",
      recordId: "card-1",
      sourceDeviceId: "device-b",
      remoteRevisionId: "remote-revision",
      localRevisionId: "local-revision",
      operationId: "a".repeat(64),
    };
    const first = await createConflictIdentity(input);
    const second = await createConflictIdentity(input);
    const different = await createConflictIdentity({ ...input, operationId: "b".repeat(64) });

    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(second).toBe(first);
    expect(different).not.toBe(first);
  });
});
