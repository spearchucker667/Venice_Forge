import crypto from "node:crypto";
import fs from "node:fs/promises";
import fssync from "node:fs";
import path from "node:path";

const WINDOWS_REPLACE_CODES = new Set(["EPERM", "EEXIST", "EACCES"]);

/** Opens the completed temp file and flushes it to stable storage before the
 *  replace. Failures are logged by callers that care; the replace itself stays
 *  best-effort atomic either way (VF-AUD-20260912-C6-DR-001: domain steps such
 *  as fsync layer around the canonical replace, never reimplement it). */
async function syncTempFile(path: string): Promise<void> {
  let handle: fs.FileHandle | null = null;
  try {
    handle = await fs.open(path, "r+");
    await handle.sync();
  } finally {
    await handle?.close();
  }
}

function syncTempFileSync(path: string): void {
  const fd = fssync.openSync(path, "r+");
  try {
    fssync.fsyncSync(fd);
  } finally {
    fssync.closeSync(fd);
  }
}

/**
 * Write `data` to `target` via a unique temp file, then replace.
 * POSIX rename overwrites the destination; Windows cannot rename onto an
 * existing file, so EPERM/EEXIST/EACCES fall back to copy+unlink.
 *
 * @param options.sync When true, fsyncs the temp file before the replace so
 *   the completed content reaches stable storage first (durability-critical
 *   writers: vault keys, encrypted records, journals, backups).
 */
export async function atomicReplaceFile(
  target: string,
  data: string | Buffer,
  mode = 0o600,
  options: { sync?: boolean } = {},
): Promise<void> {
  const targetDir = path.dirname(target);
  const tmpDir = await fs.mkdtemp(path.join(targetDir, ".vf-replace-"));
  const tmp = path.join(tmpDir, `.${path.basename(target)}.${crypto.randomUUID()}`);
  try {
    await fs.writeFile(tmp, data, { mode });
    if (options.sync) await syncTempFile(tmp);
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
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/**
 * Synchronous variant of `atomicReplaceFile` for the sync secure-store writers.
 * Same unique-temp + replace semantics with the Windows copy+unlink fallback.
 */
export function atomicReplaceFileSync(
  target: string,
  data: string | Buffer,
  mode = 0o600,
): void {
  const targetDir = path.dirname(target);
  const tmpDir = fssync.mkdtempSync(path.join(targetDir, ".vf-replace-"));
  const tmp = path.join(tmpDir, `.${path.basename(target)}.${crypto.randomUUID()}`);
  try {
    fssync.writeFileSync(tmp, data, { mode });
    syncTempFileSync(tmp);
    try {
      fssync.renameSync(tmp, target);
    } catch (err) {
      const code = err && typeof err === "object" && "code" in err
        ? (err as NodeJS.ErrnoException).code
        : undefined;
      if (process.platform === "win32" && code && WINDOWS_REPLACE_CODES.has(code)) {
        fssync.copyFileSync(tmp, target);
        return;
      }
      throw err;
    }
  } finally {
    try { fssync.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best-effort cleanup */ }
  }
}
