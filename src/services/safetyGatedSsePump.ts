import type { SafetyGatedSse } from "./safetyGatedSse";

export interface SafetyGatedSseUpstream {
  on(event: "data", listener: (chunk: Buffer | string) => void): this;
  on(event: "end", listener: () => void): this;
  on(event: "error", listener: (error: unknown) => void): this;
  pause(): void;
  resume(): void;
  destroy(): void;
}

export interface SafetyGatedSsePumpOptions {
  upstream: SafetyGatedSseUpstream;
  gate: SafetyGatedSse;
  onSafetyFailure: (error: unknown) => void;
  onUpstreamError: (error: unknown) => void;
  onComplete: () => void;
}

export interface SafetyGatedSsePump {
  cancel: () => void;
}

/**
 * Coordinates one bounded in-flight safety classification with an upstream
 * SSE response. It owns ordering, backpressure, completion, and cancellation;
 * the HTTP route only supplies transport-specific callbacks.
 */
export function startSafetyGatedSsePump(options: SafetyGatedSsePumpOptions): SafetyGatedSsePump {
  const { upstream, gate, onSafetyFailure, onUpstreamError, onComplete } = options;
  let active = false;
  let queued: Buffer | null = null;
  let upstreamEnded = false;
  let finalizing = false;
  let stopped = false;

  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    gate.cancel();
    upstream.destroy();
  };

  const failSafety = (error: unknown): void => {
    if (stopped) return;
    stopped = true;
    gate.cancel();
    upstream.destroy();
    onSafetyFailure(error);
  };

  const failUpstream = (error: unknown): void => {
    if (stopped) return;
    stopped = true;
    gate.cancel();
    upstream.destroy();
    onUpstreamError(error);
  };

  const finishIfReady = (): void => {
    if (!upstreamEnded || active || queued || finalizing || stopped) return;
    finalizing = true;
    void gate.end().then(() => {
      if (stopped) return;
      stopped = true;
      onComplete();
    }).catch(failSafety);
  };

  const drain = async (firstChunk: Buffer): Promise<void> => {
    let current: Buffer | null = firstChunk;
    try {
      while (current && !stopped) {
        await gate.push(current);
        current = queued;
        queued = null;
      }
    } catch (error) {
      failSafety(error);
    } finally {
      active = false;
      if (!stopped && !upstreamEnded) upstream.resume();
      finishIfReady();
    }
  };

  upstream.on("data", (chunk: Buffer | string) => {
    if (stopped) return;
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    if (active) {
      if (queued) {
        failSafety(new Error("SSE safety queue exceeded its bounded window."));
      } else {
        queued = buffer;
      }
      return;
    }
    active = true;
    upstream.pause();
    void drain(buffer);
  });

  upstream.on("end", () => {
    if (stopped) return;
    upstreamEnded = true;
    finishIfReady();
  });

  upstream.on("error", failUpstream);

  return { cancel: stop };
}
