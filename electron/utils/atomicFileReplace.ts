import crypto from "node:crypto";
import fs from "node:fs/promises";
import fssync from "node:fs";
import path from "node:path";

/** Windows keeps file handles open longer than POSIX after the rename path,
 *  so when two concurrent saves of the same record race on `copyFile`, the
 *  second copy can briefly see EBUSY/EACCES while the first copy is still
 *  flushing + releasing its handle. Retry the copy with exponential backoff
 *  before throwing. Applies to both async and sync variants. */
const WINDOWS_REPLACE_CODES = new Set(["EPERM", "EEXIST", "EACCES", "EBUSY"]);

const COPY_RETRY_ATTEMPTS = 6;
const COPY_RETRY_BASE_DELAY_MS = 10;

function isWindowsReplaceCode(code: unknown): code is string {
  return typeof code === "string" && WINDOWS_REPLACE_CODES.has(code);
}

function delaySync(ms: number): void {
  const end = Date.now() + ms;
  // Busy-wait is fine here: the sync path is called from main-process code
  // that is already on the event-loop boundary; a few-millisecond backoff
  // is well below any user-facing latency budget.
  while (Date.now() < end) {
    /* spin */
  }
}

async function copyFileWithRetry(src: string, dest: string): Promise<void> {
  for (let attempt = 0; attempt < COPY_RETRY_ATTEMPTS; attempt++) {
    try {
      await fs.copyFile(src, dest);
      return;
    } catch (err) {
      if (
        process.platform !== "win32" ||
        !isWindowsReplaceCode(
          err && typeof err === "object" && "code" in err
            ? (err as NodeJS.ErrnoException).code
            : undefined,
        ) ||
        attempt === COPY_RETRY_ATTEMPTS - 1
      ) {
        throw err;
      }
      // Exponential backoff: 10, 20, 40, 80, 160 ms (5 retries total).
      const waitMs = COPY_RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
}

function copyFileSyncWithRetry(src: string, dest: string): void {
  for (let attempt = 0; attempt < COPY_RETRY_ATTEMPTS; attempt++) {
    try {
      fssync.copyFileSync(src, dest);
      return;
    } catch (err) {
      if (
        process.platform !== "win32" ||
        !isWindowsReplaceCode(
          err && typeof err === "object" && "code" in err
            ? (err as NodeJS.ErrnoException).code
            : undefined,
        ) ||
        attempt === COPY_RETRY_ATTEMPTS - 1
      ) {
        throw err;
      }
      // Exponential backoff (sync path): 10, 20, 40, 80, 160 ms.
      const waitMs = COPY_RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
      delaySync(waitMs);
    }
  }
}

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
      if (process.platform === "win32" && isWindowsReplaceCode(code)) {
        await copyFileWithRetry(tmp, target);
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
      if (process.platform === "win32" && isWindowsReplaceCode(code)) {
        copyFileSyncWithRetry(tmp, target);
        return;
      }
      throw err;
    }
  } finally {
    try { fssync.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best-effort cleanup */ }
  }
}
