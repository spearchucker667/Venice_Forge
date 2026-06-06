/** Error raised when a Fetch response exceeds its allowed body size. */
export class FetchBodyTooLargeError extends Error {
  readonly status = 413;

  constructor(readonly maxBytes: number) {
    super(`Upstream response exceeds the ${maxBytes}-byte limit.`);
    this.name = "FetchBodyTooLargeError";
  }
}

/** Reads a Fetch response incrementally and cancels as soon as the cap is exceeded. */
export async function readBoundedFetchBody(response: Response, maxBytes: number): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    await response.body?.cancel().catch(() => {});
    throw new FetchBodyTooLargeError(maxBytes);
  }
  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new FetchBodyTooLargeError(maxBytes);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

/** Parses JSON without allowing malformed upstream payloads to escape. */
export function parseJsonOrNull(rawBody: string): unknown {
  try {
    return JSON.parse(rawBody);
  } catch {
    return null;
  }
}
