import crypto from "node:crypto";
import fs from "node:fs/promises";

const WINDOWS_REPLACE_CODES = new Set(["EPERM", "EEXIST", "EACCES"]);

/**
 * Write `data` to `target` via a unique temp file, then replace.
 * POSIX rename overwrites the destination; Windows cannot rename onto an
 * existing file, so EPERM/EEXIST/EACCES fall back to copy+unlink.
 */
export async function atomicReplaceFile(
  target: string,
  data: string | Buffer,
  mode = 0o600,
): Promise<void> {
  const tmp = `${target}.tmp-${crypto.randomUUID()}`;
  try {
    await fs.writeFile(tmp, data, { mode });
    try {
      await fs.rename(tmp, target);
    } catch (err) {
      const code = err && typeof err === "object" && "code" in err
        ? (err as NodeJS.ErrnoException).code
        : undefined;
      if (process.platform === "win32" && code && WINDOWS_REPLACE_CODES.has(code)) {
        await fs.copyFile(tmp, target);
        return;
      }
      throw err;
    }
  } finally {
    await fs.unlink(tmp).catch(() => undefined);
  }
}
