import { describe, expect, it } from "vitest";
import { compareSyncMessages, compareSyncRecords } from "./syncConvergence";

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
});
