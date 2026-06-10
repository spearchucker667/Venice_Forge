/**
 * @fileoverview Safe bounded file reading utility to prevent OOM / browser freezes.
 */

export async function readBoundedJsonFile<T>(
  file: File,
  options: {
    maxBytes: number;
    maxItems?: number;
    itemKey?: string;
  }
): Promise<T> {
  if (file.size > options.maxBytes) {
    throw new Error(
      `File size (${(file.size / (1024 * 1024)).toFixed(1)} MiB) exceeds the limit of ${(options.maxBytes / (1024 * 1024)).toFixed(1)} MiB.`
    );
  }

  // Accept JSON MIME or files ending in .json
  const isJsonMime = file.type === "application/json";
  const isJsonExt = /\.json$/i.test(file.name);
  if (!isJsonMime && !isJsonExt) {
    throw new Error("Invalid file format. Only JSON files are accepted.");
  }

  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(`Invalid JSON format: ${err instanceof Error ? err.message : "parse error"}`);
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Invalid JSON structure: expected an object or array.");
  }

  // Enforce maximum item count if specified
  if (options.maxItems) {
    let count = 0;
    if (Array.isArray(parsed)) {
      count = parsed.length;
    } else if (parsed && typeof parsed === "object") {
      const key = options.itemKey;
      if (key && Array.isArray((parsed as Record<string, unknown>)[key])) {
        count = ((parsed as Record<string, unknown>)[key] as unknown[]).length;
      } else {
        // Fallback: count number of keys at top level
        count = Object.keys(parsed).length;
      }
    }

    if (count > options.maxItems) {
      throw new Error(
        `Import contains too many items (${count}). Maximum allowed is ${options.maxItems}.`
      );
    }
  }

  return parsed as T;
}
