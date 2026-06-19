import type { IpcMainInvokeEvent } from "electron";

interface RateLimitOptions {
  limit: number;
  windowMs: number;
}

const DEFAULT_LIMIT: RateLimitOptions = { limit: 120, windowMs: 60_000 };
const STRICT_LIMIT: RateLimitOptions = { limit: 30, windowMs: 60_000 };

const buckets = new Map<string, { count: number; resetAt: number }>();

function optionsForChannel(channel: string): RateLimitOptions {
  if (
    /venice:request|venice:streamChat|jina:request|proxyScrape|chat:save|app:media:(import|export)|conversations:(save|migrateLegacyHistory)/.test(channel)
  ) {
    return STRICT_LIMIT;
  }
  return DEFAULT_LIMIT;
}

export function checkIpcRateLimit(channel: string, webContentsId: number | undefined, now = Date.now()): boolean {
  const options = optionsForChannel(channel);
  const key = `${channel}:${webContentsId ?? 0}`;
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + options.windowMs });
    return true;
  }
  if (bucket.count >= options.limit) return false;
  bucket.count += 1;
  return true;
}

export function rateLimitIpcHandler<T extends (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown>(channel: string, handler: T): T {
  return (async (event: IpcMainInvokeEvent, ...args: unknown[]) => {
    if (!checkIpcRateLimit(channel, event?.sender?.id)) {
      return { ok: false, status: 429, error: "Rate limit exceeded" };
    }
    return handler(event, ...args);
  }) as T;
}

export function resetIpcRateLimitForTests(): void {
  buckets.clear();
}
