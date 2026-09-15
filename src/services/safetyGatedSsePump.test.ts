import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { SafetyGatedSse } from "./safetyGatedSse";
import { startSafetyGatedSsePump } from "./safetyGatedSsePump";
import type { SafetyGatedSseUpstream } from "./safetyGatedSsePump";

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((fulfill) => { resolve = fulfill; });
  return { promise, resolve };
}

type FakeUpstream = EventEmitter & SafetyGatedSseUpstream & {
  pause: ReturnType<typeof vi.fn>;
  resume: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
};

function makeUpstream(): FakeUpstream {
  return Object.assign(new EventEmitter(), {
    pause: vi.fn<() => void>(),
    resume: vi.fn<() => void>(),
    destroy: vi.fn<() => void>(),
  }) as unknown as FakeUpstream;
}

describe("startSafetyGatedSsePump", () => {
  it("preserves order and completes after active classification and upstream end", async () => {
    const upstream = makeUpstream();
    const gateRelease = deferred();
    const released: string[] = [];
    const gate = new SafetyGatedSse({
      maxEventBytes: 1024,
      classify: async ({ data }) => {
        if (data === "first") await gateRelease.promise;
        return { allowed: true };
      },
      release: ({ data }) => { released.push(data); },
    });
    const complete = vi.fn();

    startSafetyGatedSsePump({
      upstream,
      gate,
      onSafetyFailure: vi.fn(),
      onUpstreamError: vi.fn(),
      onComplete: complete,
    });

    upstream.emit("data", Buffer.from("data: first\n\n"));
    upstream.emit("data", Buffer.from("data: second\n\n"));
    upstream.emit("end");
    await Promise.resolve();
    expect(released).toEqual([]);

    gateRelease.resolve();
    await vi.waitFor(() => expect(complete).toHaveBeenCalledOnce());
    expect(released).toEqual(["first", "second"]);
    expect(upstream.pause).toHaveBeenCalledOnce();
    expect(upstream.destroy).not.toHaveBeenCalled();
  });

  it("fails closed when a second queued chunk arrives", async () => {
    const upstream = makeUpstream();
    const gateRelease = deferred();
    const safetyFailure = vi.fn();
    const gate = new SafetyGatedSse({
      maxEventBytes: 1024,
      classify: async () => {
        await gateRelease.promise;
        return { allowed: true };
      },
      release: vi.fn(),
    });

    startSafetyGatedSsePump({
      upstream,
      gate,
      onSafetyFailure: safetyFailure,
      onUpstreamError: vi.fn(),
      onComplete: vi.fn(),
    });

    upstream.emit("data", Buffer.from("data: first\n\n"));
    upstream.emit("data", Buffer.from("data: second\n\n"));
    upstream.emit("data", Buffer.from("data: third\n\n"));

    expect(upstream.destroy).toHaveBeenCalledOnce();
    expect(safetyFailure).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringMatching(/bounded/i) }));
    gateRelease.resolve();
  });

  it("cancels the gate and upstream without completing", async () => {
    const upstream = makeUpstream();
    const complete = vi.fn();
    const pump = startSafetyGatedSsePump({
      upstream,
      gate: new SafetyGatedSse({
        maxEventBytes: 1024,
        classify: () => ({ allowed: true }),
        release: vi.fn(),
      }),
      onSafetyFailure: vi.fn(),
      onUpstreamError: vi.fn(),
      onComplete: complete,
    });

    pump.cancel();
    upstream.emit("data", Buffer.from("data: ignored\n\n"));
    upstream.emit("end");
    await Promise.resolve();

    expect(upstream.destroy).toHaveBeenCalledOnce();
    expect(complete).not.toHaveBeenCalled();
  });
});
