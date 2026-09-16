/** @fileoverview Bounded collector for Family Safe Mode generated-media
 *  responses (VF-20260916-P1-003).
 *
 *  The previous media path buffered the entire upstream response in the
 *  process heap (up to 256 MiB per request) before screening, rejected
 *  oversized responses only after substantial allocation, and had no
 *  client-disconnect cleanup. This collector:
 *
 *  1. Rejects early on a lying/oversized `Content-Length`.
 *  2. Counts bytes incrementally and destroys the upstream the moment the
 *     cap is crossed (chunked or misreported responses included).
 *  3. Keeps small responses in memory; above
 *     `FSM_MEDIA_HEAP_SPOOL_THRESHOLD_BYTES` it spools to an exclusively
 *     created temp file so heap use stays flat.
 *  4. Guarantees temp-file cleanup on every terminal path: screen block,
 *     upstream error, client abort/disconnect, overflow, and after the
 *     accepted artifact is handed to the writer.
 *
 *  The screening and response-writing policies stay with the caller (web
 *  proxy); this module owns only bounded capture + lifecycle.
 */

import { createWriteStream, type WriteStream } from "node:fs";
import { unlink } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  FSM_MEDIA_HEAP_SPOOL_THRESHOLD_BYTES,
  FSM_MEDIA_MAX_AUDIO_BYTES,
  FSM_MEDIA_MAX_DEFAULT_BYTES,
  FSM_MEDIA_MAX_IMAGE_BYTES,
  FSM_MEDIA_MAX_VIDEO_BYTES,
} from "../shared/limits";

/** Where a screened artifact is held. `file` artifacts are auto-deleted. */
export type FsmMediaArtifact =
  | { kind: "memory"; buffer: Buffer; sizeBytes: number }
  | { kind: "file"; filePath: string; sizeBytes: number };

export interface FsmMediaScreenResult {
  allowed: true;
}

export interface FsmMediaBlockResult {
  allowed: false;
  /** JSON-serializable body written with the block response. */
  blockBody: Record<string, unknown>;
}

export type FsmMediaScreenFn = (
  artifact: FsmMediaArtifact,
  contentType: string,
) => Promise<FsmMediaScreenResult | FsmMediaBlockResult>;

/** Minimal structural shape of the upstream response stream (proxyRes). */
export interface FsmMediaUpstream {
  headers: Record<string, unknown>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: string, listener: (...args: any[]) => void): unknown;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  destroy(...args: any[]): any;
}

export interface FsmMediaCollectorOptions {
  /** Upstream response stream (proxyRes). */
  upstream: FsmMediaUpstream;
  /** Downstream response — its `close` event signals a client disconnect
   *  (only when `writableEnded` is false; Node emits `close` on every
   *  completed message too, which must NOT be treated as an abort). */
  downstream: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    on(event: string, listener: (...args: any[]) => void): unknown;
    writableEnded: boolean;
  };
  /** Modality cap in bytes (see resolveFsmMediaCapBytes). */
  maxBytes: number;
  /** Heap threshold before spooling to a temp file. */
  spoolThresholdBytes?: number;
  /** Screening policy (structural/semantic, JSON envelopes, etc.). */
  screen: FsmMediaScreenFn;
  /** Write a 413 overflow response (called at most once, pre-headers). */
  writeTooLarge: () => void;
  /** Write a screen block response (called at most once, pre-headers). */
  writeBlocked: (blockBody: Record<string, unknown>) => void;
  /** Write a generic upstream-error response (at most once, pre-headers). */
  writeUpstreamError: () => void;
  /** Deliver the accepted artifact; the caller streams/writes it to the
   *  client. Resolved before temp-file cleanup runs. */
  writeAccepted: (artifact: FsmMediaArtifact) => Promise<void>;
  /** Optional hook for tests/diagnostics. */
  onTempFilePath?: (filePath: string) => void;
}

/** Resolves the modality-specific screening cap from a Content-Type header. */
export function resolveFsmMediaCapBytes(contentType: string): number {
  const ct = (contentType || "").toLowerCase();
  if (ct.startsWith("image/")) return FSM_MEDIA_MAX_IMAGE_BYTES;
  if (ct.startsWith("video/")) return FSM_MEDIA_MAX_VIDEO_BYTES;
  if (ct.startsWith("audio/")) return FSM_MEDIA_MAX_AUDIO_BYTES;
  return FSM_MEDIA_MAX_DEFAULT_BYTES;
}

interface StreamWithOn {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: string, listener: (...args: any[]) => void): unknown;
}

function onOnce(target: StreamWithOn, event: string, listener: () => void): void {
  let fired = false;
  const wrapped = (): void => {
    if (fired) return;
    fired = true;
    listener();
  };
  (target.on as (e: string, l: () => void) => void)(event, wrapped);
}

export function collectFsmMediaResponse(options: FsmMediaCollectorOptions): void {
  const {
    upstream,
    downstream,
    screen,
    writeTooLarge,
    writeBlocked,
    writeUpstreamError,
    writeAccepted,
  } = options;
  const maxBytes = options.maxBytes;
  const spoolThreshold =
    options.spoolThresholdBytes ?? FSM_MEDIA_HEAP_SPOOL_THRESHOLD_BYTES;
  const headers = upstream.headers ?? {};
  const contentType = String(headers["content-type"] || "");

  // ---- Early Content-Length rejection (lying low values are caught by the
  // incremental counter below). ----
  const declared = Number(headers["content-length"]);
  if (
    headers["content-length"] !== undefined &&
    Number.isFinite(declared) &&
    declared > maxBytes
  ) {
    upstream.destroy();
    writeTooLarge();
    return;
  }

  let chunks: Buffer[] = [];
  let length = 0;
  let spooledPath: string | null = null;
  let spoolStream: WriteStream | null = null;
  let spoolOpen = false;
  let terminated = false;
  let upstreamEnded = false;

  const cleanupTempFile = (): void => {
    if (!spooledPath) return;
    const pathToDelete = spooledPath;
    spooledPath = null;
    if (spoolStream) {
      try {
        spoolStream.destroy();
      } catch {
        // Best-effort.
      }
      spoolStream = null;
    }
    void unlink(pathToDelete).catch(() => {
      // Best-effort cleanup; the file is in the OS temp dir.
    });
  };

  /** Ends collection exactly once; frees the spool file. */
  const terminate = (): void => {
    if (terminated) return;
    terminated = true;
    cleanupTempFile();
  };

  const failTooLarge = (): void => {
    if (terminated) return;
    terminate();
    upstream.destroy();
    writeTooLarge();
  };

  const openSpool = (): void => {
    if (spooledPath !== null || terminated) return;
    const filePath = join(
      tmpdir(),
      `vf-fsm-media-${randomBytes(12).toString("hex")}.bin`,
    );
    spooledPath = filePath;
    options.onTempFilePath?.(filePath);
    const ws = createWriteStream(filePath, { flags: "wx" });
    spoolStream = ws;
    ws.on("open", () => {
      spoolOpen = true;
      // Flush everything buffered so far, then stop retaining chunks.
      for (const chunk of chunks) {
        ws.write(chunk);
      }
      chunks = [];
    });
    ws.on("error", () => {
      // Spool failure: fail closed — do not silently fall back to heap.
      failTooLarge();
    });
  };

  const finish = async (): Promise<void> => {
    if (terminated) return;
    upstreamEnded = true;

    const finalizeSpool = async (): Promise<void> => {
      if (!spoolStream) return;
      const ws = spoolStream;
      if (!spoolOpen) {
        // 'end' arrived before the descriptor opened: Node queues writes
        // made before 'open', so flush the retained chunks through the
        // stream rather than dropping them.
        for (const chunk of chunks) {
          ws.write(chunk);
        }
        chunks = [];
      }
      await new Promise<void>((resolve) => {
        onOnce(ws as unknown as StreamWithOn, "close", resolve);
        ws.end();
      });
    };

    try {
      if (spooledPath) {
        await finalizeSpool();
        if (terminated) return;
        const artifact: FsmMediaArtifact = {
          kind: "file",
          filePath: spooledPath,
          sizeBytes: length,
        };
        const result = await screen(artifact, contentType);
        if (terminated) return;
        if (!result.allowed) {
          terminate();
          writeBlocked(result.blockBody);
          return;
        }
        try {
          await writeAccepted(artifact);
        } finally {
          terminate();
        }
        return;
      }

      const artifact: FsmMediaArtifact = {
        kind: "memory",
        buffer: Buffer.concat(chunks, length),
        sizeBytes: length,
      };
      chunks = [];
      const result = await screen(artifact, contentType);
      if (terminated) return;
      if (!result.allowed) {
        terminate();
        writeBlocked(result.blockBody);
        return;
      }
      await writeAccepted(artifact);
      terminate();
    } catch {
      terminate();
      writeUpstreamError();
    }
  };

  upstream.on("data", (chunk: Buffer | string) => {
    if (terminated || upstreamEnded) return;
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buf.length;
    if (length > maxBytes) {
      failTooLarge();
      return;
    }
    if (spooledPath !== null) {
      if (spoolOpen && spoolStream) {
        spoolStream.write(buf);
      } else {
        chunks.push(buf);
      }
      return;
    }
    chunks.push(buf);
    if (length > spoolThreshold) {
      openSpool();
    }
  });

  onOnce(upstream as unknown as StreamWithOn, "end", () => {
    void finish();
  });

  upstream.on("error", () => {
    if (terminated) return;
    terminate();
    writeUpstreamError();
  });

  // Client disconnect: stop buffering, destroy the upstream, free the temp
  // file. Node emits `close` on every completed message too — only a
  // premature close (response not yet finished) is an abort.
  onOnce(downstream as unknown as StreamWithOn, "close", () => {
    if (terminated || downstream.writableEnded) return;
    terminate();
    upstream.destroy();
  });
}
