/** @fileoverview Tests for the bounded FSM media collector
 *  (VF-20260916-P1-003). */

// @vitest-environment node
import { describe, it, expect, afterEach, vi } from "vitest";
import { EventEmitter } from "node:events";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import {
  collectFsmMediaResponse,
  resolveFsmMediaCapBytes,
  type FsmMediaArtifact,
  type FsmMediaCollectorOptions,
  type FsmMediaScreenFn,
  type FsmMediaUpstream,
} from "./fsmMediaCollector";
import {
  FSM_MEDIA_MAX_AUDIO_BYTES,
  FSM_MEDIA_MAX_DEFAULT_BYTES,
  FSM_MEDIA_MAX_IMAGE_BYTES,
  FSM_MEDIA_MAX_VIDEO_BYTES,
} from "../shared/limits";

const MiB = 1024 * 1024;

interface CollectorHarness {
  upstream: EventEmitter & { headers: Record<string, string>; destroy: ReturnType<typeof vi.fn> };
  client: EventEmitter & { writableEnded: boolean };
  tooLarge: ReturnType<typeof vi.fn>;
  blocked: ReturnType<typeof vi.fn>;
  upstreamError: ReturnType<typeof vi.fn>;
  accepted: ReturnType<typeof vi.fn>;
  screen: ReturnType<typeof vi.fn>;
  tempDir: string;
  tempFiles: string[];
}

async function makeHarness(options: {
  maxBytes: number;
  contentType?: string;
  contentLength?: string;
  screen?: FsmMediaScreenFn;
}): Promise<CollectorHarness> {
  const tempDir = await mkdtemp(join(tmpdir(), "vf-fsm-test-"));
  const upstream = new EventEmitter() as CollectorHarness["upstream"];
  upstream.headers = {};
  if (options.contentType) upstream.headers["content-type"] = options.contentType;
  if (options.contentLength !== undefined) {
    upstream.headers["content-length"] = options.contentLength;
  }
  upstream.destroy = vi.fn();
  const client = new EventEmitter() as EventEmitter & { writableEnded: boolean };
  client.writableEnded = false;
  const harness: CollectorHarness = {
    upstream,
    client,
    tooLarge: vi.fn(),
    blocked: vi.fn(),
    upstreamError: vi.fn(),
    accepted: vi.fn().mockResolvedValue(undefined),
    screen: vi.fn(options.screen ?? (async () => ({ allowed: true }))),
    tempDir,
    tempFiles: [],
  };
  const collectorOptions: FsmMediaCollectorOptions = {
    upstream: upstream as unknown as FsmMediaUpstream,
    downstream: client,
    maxBytes: options.maxBytes,
    spoolThresholdBytes: 64 * 1024,
    screen: harness.screen as FsmMediaScreenFn,
    writeTooLarge: harness.tooLarge as () => void,
    writeBlocked: harness.blocked as (b: Record<string, unknown>) => void,
    writeUpstreamError: harness.upstreamError as () => void,
    writeAccepted: harness.accepted as (a: FsmMediaArtifact) => Promise<void>,
    onTempFilePath: (p) => harness.tempFiles.push(p),
  };
  collectFsmMediaResponse(collectorOptions);
  return harness;
}

async function tempDirIsEmpty(dir: string): Promise<boolean> {
  const entries = await readdir(dir);
  return entries.length === 0;
}

const openFiles = new Set<string>();
afterEach(async () => {
  for (const dir of openFiles) {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
  openFiles.clear();
});

describe("resolveFsmMediaCapBytes", () => {
  it("maps content types to modality-specific caps", () => {
    expect(resolveFsmMediaCapBytes("image/png")).toBe(FSM_MEDIA_MAX_IMAGE_BYTES);
    expect(resolveFsmMediaCapBytes("video/mp4")).toBe(FSM_MEDIA_MAX_VIDEO_BYTES);
    expect(resolveFsmMediaCapBytes("audio/mpeg")).toBe(FSM_MEDIA_MAX_AUDIO_BYTES);
    expect(resolveFsmMediaCapBytes("application/json")).toBe(FSM_MEDIA_MAX_DEFAULT_BYTES);
    expect(resolveFsmMediaCapBytes("")).toBe(FSM_MEDIA_MAX_DEFAULT_BYTES);
  });
});

describe("collectFsmMediaResponse", () => {
  it("collects a small response in memory and delivers it", async () => {
    const h = await makeHarness({ maxBytes: MiB, contentType: "image/png" });
    openFiles.add(h.tempDir);
    h.upstream.emit("data", Buffer.from("PNGDATA"));
    h.upstream.emit("end");

    await vi.waitFor(() => expect(h.accepted).toHaveBeenCalledOnce());
    const artifact = h.accepted.mock.calls[0][0] as FsmMediaArtifact;
    expect(artifact.kind).toBe("memory");
    if (artifact.kind !== "memory") throw new Error("expected memory artifact");
    expect(artifact.buffer.toString()).toBe("PNGDATA");
    expect(h.tooLarge).not.toHaveBeenCalled();
    expect(await tempDirIsEmpty(h.tempDir)).toBe(true);
  });

  it("rejects early on an oversized Content-Length without buffering", async () => {
    const h = await makeHarness({
      maxBytes: MiB,
      contentType: "image/png",
      contentLength: String(2 * MiB),
    });
    openFiles.add(h.tempDir);
    expect(h.upstream.destroy).toHaveBeenCalledOnce();
    expect(h.tooLarge).toHaveBeenCalledOnce();
    h.upstream.emit("data", Buffer.from("x"));
    h.upstream.emit("end");
    expect(h.accepted).not.toHaveBeenCalled();
  });

  it("destroys the upstream mid-stream when a lying Content-Length crosses the cap", async () => {
    const h = await makeHarness({
      maxBytes: 256 * 1024,
      contentType: "image/png",
      contentLength: "1024",
    });
    openFiles.add(h.tempDir);
    h.upstream.emit("data", Buffer.alloc(200 * 1024));
    h.upstream.emit("data", Buffer.alloc(100 * 1024));
    expect(h.upstream.destroy).toHaveBeenCalled();
    expect(h.tooLarge).toHaveBeenCalledOnce();
    expect(h.accepted).not.toHaveBeenCalled();
  });

  it("spools large responses to a temp file and cleans it up after delivery", async () => {
    const h = await makeHarness({ maxBytes: 8 * MiB, contentType: "video/mp4" });
    openFiles.add(h.tempDir);
    const payload = Buffer.alloc(256 * 1024, 7);
    h.upstream.emit("data", payload);
    h.upstream.emit("end");

    await vi.waitFor(() => expect(h.accepted).toHaveBeenCalledOnce());
    expect(h.tempFiles).toHaveLength(1);
    const artifact = h.accepted.mock.calls[0][0] as FsmMediaArtifact;
    expect(artifact.kind).toBe("file");
    if (artifact.kind === "file") {
      expect(artifact.sizeBytes).toBe(payload.length);
    }
    // Cleanup ran after delivery (writeAccepted resolved before terminate).
    await vi.waitFor(async () => {
      expect(await tempDirIsEmpty(h.tempDir)).toBe(true);
    });
  });

  it("cleans up the temp file on a screen block", async () => {
    const h = await makeHarness({
      maxBytes: 8 * MiB,
      contentType: "video/mp4",
      screen: async () => ({
        allowed: false,
        blockBody: { error: "blocked", reasonCode: "R", category: "C", severity: "HIGH" },
      }),
    });
    openFiles.add(h.tempDir);
    h.upstream.emit("data", Buffer.alloc(256 * 1024, 1));
    h.upstream.emit("end");

    await vi.waitFor(() => expect(h.blocked).toHaveBeenCalledOnce());
    await vi.waitFor(async () => {
      expect(await tempDirIsEmpty(h.tempDir)).toBe(true);
    });
    expect(h.accepted).not.toHaveBeenCalled();
  });

  it("cleans up the temp file on upstream error mid-spool", async () => {
    const h = await makeHarness({ maxBytes: 8 * MiB, contentType: "video/mp4" });
    openFiles.add(h.tempDir);
    h.upstream.emit("data", Buffer.alloc(256 * 1024, 1));
    await vi.waitFor(() => expect(h.tempFiles).toHaveLength(1));
    h.upstream.emit("error", new Error("boom"));

    await vi.waitFor(() => expect(h.upstreamError).toHaveBeenCalledOnce());
    await vi.waitFor(async () => {
      expect(await tempDirIsEmpty(h.tempDir)).toBe(true);
    });
  });

  it("destroys the upstream and cleans up when the client disconnects mid-response", async () => {
    const h = await makeHarness({ maxBytes: 8 * MiB, contentType: "video/mp4" });
    openFiles.add(h.tempDir);
    h.upstream.emit("data", Buffer.alloc(256 * 1024, 1));
    await vi.waitFor(() => expect(h.tempFiles).toHaveLength(1));
    // Premature close (response not finished) = client abort.
    h.client.writableEnded = false;
    h.client.emit("close");

    await vi.waitFor(() => expect(h.upstream.destroy).toHaveBeenCalled());
    await vi.waitFor(async () => {
      expect(await tempDirIsEmpty(h.tempDir)).toBe(true);
    });
    expect(h.accepted).not.toHaveBeenCalled();
  });

  it("ignores close events after the response finished (Node emits close on every completed message)", async () => {
    const h = await makeHarness({ maxBytes: MiB, contentType: "image/png" });
    openFiles.add(h.tempDir);
    h.upstream.emit("data", Buffer.from("PNGDATA"));
    h.upstream.emit("end");
    await vi.waitFor(() => expect(h.accepted).toHaveBeenCalledOnce());
    // A completed response later emits close — must not destroy the upstream.
    h.client.writableEnded = true;
    h.client.emit("close");
    expect(h.upstream.destroy).not.toHaveBeenCalled();
  });

  it("handles exact-boundary and boundary+1 byte responses", async () => {
    const max = 128 * 1024;
    const exact = await makeHarness({ maxBytes: max, contentType: "image/png" });
    openFiles.add(exact.tempDir);
    exact.upstream.emit("data", Buffer.alloc(max, 3));
    exact.upstream.emit("end");
    await vi.waitFor(() => expect(exact.accepted).toHaveBeenCalledOnce());
    expect(exact.tooLarge).not.toHaveBeenCalled();

    const over = await makeHarness({ maxBytes: max, contentType: "image/png" });
    openFiles.add(over.tempDir);
    over.upstream.emit("data", Buffer.alloc(max + 1, 3));
    expect(over.tooLarge).toHaveBeenCalledOnce();
    expect(over.accepted).not.toHaveBeenCalled();
  });

  it("supports concurrent collectors without cross-talk", async () => {
    const a = await makeHarness({ maxBytes: MiB, contentType: "image/png" });
    const b = await makeHarness({ maxBytes: MiB, contentType: "image/png" });
    openFiles.add(a.tempDir);
    openFiles.add(b.tempDir);
    a.upstream.emit("data", Buffer.from("first"));
    b.upstream.emit("data", Buffer.from("second"));
    a.upstream.emit("end");
    b.upstream.emit("end");

    await vi.waitFor(() => expect(a.accepted).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(b.accepted).toHaveBeenCalledOnce());
    expect((a.accepted.mock.calls[0][0] as FsmMediaArtifact).kind).toBe("memory");
    const bArtifact = b.accepted.mock.calls[0][0] as FsmMediaArtifact;
    expect(bArtifact.kind === "memory" && bArtifact.buffer.toString()).toBe("second");
  });

  it("screen receives the declared content type", async () => {
    const h = await makeHarness({ maxBytes: MiB, contentType: "audio/mpeg" });
    openFiles.add(h.tempDir);
    h.upstream.emit("data", Buffer.from("ID3"));
    h.upstream.emit("end");
    await vi.waitFor(() => expect(h.screen).toHaveBeenCalledOnce());
    expect(h.screen.mock.calls[0][1]).toBe("audio/mpeg");
  });
});

describe("collectFsmMediaResponse (stream-shape sanity)", () => {
  it("works with a real flowing stream", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "vf-fsm-test-"));
    openFiles.add(tempDir);
    const upstream = new PassThrough();
    const wrapped: CollectorHarness["upstream"] = upstream as unknown as CollectorHarness["upstream"];
    wrapped.headers = { "content-type": "video/mp4" };
    wrapped.destroy = vi.fn();
    const client = new EventEmitter() as EventEmitter & { writableEnded: boolean };
    client.writableEnded = false;
    const accepted = vi.fn().mockResolvedValue(undefined);
    const tempFiles: string[] = [];
    const collectorOptions: FsmMediaCollectorOptions = {
      upstream: wrapped as unknown as FsmMediaUpstream,
      downstream: client,
      maxBytes: 8 * MiB,
      spoolThresholdBytes: 64 * 1024,
      screen: async () => ({ allowed: true }),
      writeTooLarge: vi.fn(),
      writeBlocked: vi.fn(),
      writeUpstreamError: vi.fn(),
      writeAccepted: accepted as (a: FsmMediaArtifact) => Promise<void>,
      onTempFilePath: (p) => tempFiles.push(p),
    };
    collectFsmMediaResponse(collectorOptions);
    upstream.write(Buffer.alloc(128 * 1024, 9));
    upstream.end();
    await vi.waitFor(() => expect(accepted).toHaveBeenCalledOnce());
    expect(tempFiles).toHaveLength(1);
    await vi.waitFor(async () => {
      expect(await tempDirIsEmpty(tempDir)).toBe(true);
    });
  });
});
