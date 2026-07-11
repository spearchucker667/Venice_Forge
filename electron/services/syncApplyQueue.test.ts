// @vitest-environment node
import { describe, it, expect } from "vitest";
import { enqueueRemoteApply, getPendingQueueSize } from "./syncApplyQueue";

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe("syncApplyQueue", () => {
  it("serializes two operations for the same record", async () => {
    const order: string[] = [];
    const op1 = async () => {
      order.push("a");
      await delay(10);
      order.push("b");
    };
    const op2 = async () => {
      order.push("c");
    };

    await Promise.all([
      enqueueRemoteApply("conversations:conv-1", op1),
      enqueueRemoteApply("conversations:conv-1", op2),
    ]);

    expect(order).toEqual(["a", "b", "c"]);
  });

  it("runs operations for different keys concurrently", async () => {
    const order: string[] = [];
    const op1 = async () => {
      order.push("a");
      await delay(20);
      order.push("b");
    };
    const op2 = async () => {
      order.push("c");
      await delay(10);
      order.push("d");
    };

    await Promise.all([
      enqueueRemoteApply("conversations:conv-1", op1),
      enqueueRemoteApply("conversations:conv-2", op2),
    ]);

    // Both operations start before either finishes because keys differ.
    expect(order.slice(0, 2)).toContain("a");
    expect(order.slice(0, 2)).toContain("c");
    expect(order).toEqual(["a", "c", "d", "b"]);
  });

  it("does not block a key when a prior operation fails", async () => {
    const order: string[] = [];
    const op1 = async () => {
      order.push("a");
      throw new Error("boom");
    };
    const op2 = async () => {
      order.push("b");
    };

    const results = await Promise.allSettled([
      enqueueRemoteApply("conversations:conv-1", op1),
      enqueueRemoteApply("conversations:conv-1", op2),
    ]);

    expect(order).toEqual(["a", "b"]);
    expect(results[0].status).toBe("rejected");
    expect(results[1].status).toBe("fulfilled");
  });

  it("applies tombstone after record for same id deterministically", async () => {
    interface State {
      record: { id: string; title: string; deleted: boolean } | null;
    }
    const state: State = { record: null };

    const recordOp = async () => {
      state.record = { id: "conv-1", title: "Hello", deleted: false };
      await delay(5);
    };
    const tombstoneOp = async () => {
      if (state.record?.id === "conv-1") {
        state.record.deleted = true;
      }
    };

    await Promise.all([
      enqueueRemoteApply("conversations:conv-1", recordOp),
      enqueueRemoteApply("conversations:conv-1", tombstoneOp),
    ]);

    expect(state.record).not.toBeNull();
    expect(state.record?.deleted).toBe(true);
  });

  it("clears the pending map entry after the queue drains", async () => {
    expect(getPendingQueueSize()).toBe(0);

    await enqueueRemoteApply("conversations:conv-1", async () => {
      await delay(5);
    });

    expect(getPendingQueueSize()).toBe(0);
  });
});
