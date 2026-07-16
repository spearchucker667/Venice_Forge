import { describe, expect, it } from "vitest";
import {
  compareSyncMessages,
  compareSyncRecords,
  findMessageContentDivergences,
} from "./syncConvergence";

function converge(replicas: Array<Record<string, unknown>>): Record<string, unknown> {
  return replicas.reduce((winner, candidate) => compareSyncRecords(candidate, winner) > 0 ? candidate : winner);
}

describe("sync convergence", () => {
  it("selects the same two-device winner regardless of delivery order", () => {
    const a = { id: "record-1", updatedAt: 1000, revisionId: "rev-a", deviceId: "device-a", title: "A" };
    const b = { id: "record-1", updatedAt: 1000, revisionId: "rev-b", deviceId: "device-b", title: "B" };
    expect(converge([a, b])).toEqual(converge([b, a]));
  });

  it("selects the same three-device winner for every tested delivery order", () => {
    const records = [
      { id: "record-1", updatedAt: 2000, revisionId: "rev-a", deviceId: "device-a" },
      { id: "record-1", updatedAt: 2000, revisionId: "rev-c", deviceId: "device-c" },
      { id: "record-1", updatedAt: 2000, revisionId: "rev-b", deviceId: "device-b" },
    ];
    const expected = converge(records);
    expect(converge([records[2], records[0], records[1]])).toEqual(expected);
    expect(converge([records[1], records[2], records[0]])).toEqual(expected);
  });

  it("orders equal-time merged messages by stable id", () => {
    const messages = [{ id: "m-z", createdAt: 1000 }, { id: "m-a", createdAt: 1000 }];
    expect(messages.sort(compareSyncMessages).map((message) => message.id)).toEqual(["m-a", "m-z"]);
  });

  // VERIFY-129 regression guard: same-id / diverged-content messages
  // (e.g. local edits vs. remote edits) must be detected when the
  // message-level merge would otherwise silently drop the imported copy.
  describe("findMessageContentDivergences", () => {
    it("returns divergent same-id messages", () => {
      const local = [
        { id: "m-1", createdAt: 1000, content: "original" },
        { id: "m-2", createdAt: 1000, content: "untouched" },
      ];
      const imported = [
        { id: "m-1", createdAt: 1000, content: "edited on other device" },
        { id: "m-2", createdAt: 1000, content: "untouched" },
      ];
      const divergences = findMessageContentDivergences(local, imported);
      expect(divergences).toHaveLength(1);
      expect(divergences[0].id).toBe("m-1");
      expect(divergences[0].local.content).toBe("original");
      expect(divergences[0].imported.content).toBe("edited on other device");
    });

    it("returns empty array when same-id pairs are equal", () => {
      const local = [{ id: "m-1", createdAt: 1000, content: "same" }];
      const imported = [{ id: "m-1", createdAt: 1000, content: "same" }];
      expect(findMessageContentDivergences(local, imported)).toEqual([]);
    });

    it("ignores transport-only metadata differences", () => {
      const local = [{ id: "m-1", createdAt: 1000, revisionId: "rev-a", content: "same" }];
      const imported = [{ id: "m-1", createdAt: 2000, revisionId: "rev-b", content: "same" }];
      expect(findMessageContentDivergences(local, imported)).toEqual([]);
    });

    it("matches messages even when local/imported arrays arrive in different orders", () => {
      const local = [
        { id: "m-1", content: "local-1" },
        { id: "m-2", content: "local-2" },
      ];
      const imported = [
        { id: "m-3", content: "imported-3" },
        { id: "m-2", content: "imported-2 edited" },
        { id: "m-1", content: "local-1" },
      ];
      const divergences = findMessageContentDivergences(local, imported);
      expect(divergences).toHaveLength(1);
      expect(divergences[0].id).toBe("m-2");
    });

    it("ignores pairs where ids differ (append-merge territory)", () => {
      const local = [{ id: "m-1", createdAt: 1000, content: "local" }];
      const imported = [{ id: "m-2", createdAt: 1000, content: "newer" }];
      expect(findMessageContentDivergences(local, imported)).toEqual([]);
    });
  });
});
