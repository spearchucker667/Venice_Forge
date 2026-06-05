/**
 * @fileoverview Generic single-file-per-record JSON store for small RP collections
 * (personas, lorebooks, rp_assets). All ids MUST pass `VALID_ID_RE`.
 */

import { app } from "electron";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { logError, logInfo } from "./logger";

const TMP_SUFFIX = ".tmp";
const VALID_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/;
const MAX_SCAN_FILES = 4000;
const MAX_LOAD_FILES = 2000;

export function isValidId(id: unknown): id is string {
  return typeof id === "string" && VALID_ID_RE.test(id);
}

export interface RpAssetRecord {
  id: string;
  payload: unknown;
}

/** Build a single-file-per-record storage. */
export function createSingleFileStore<T>(
  dirName: string,
  validate: (obj: unknown) => obj is T
) {
  const dir = () => path.join(app.getPath("userData"), dirName);
  const fileFor = (id: string) => path.join(dir(), `${id}.json`);

  async function list(): Promise<{ items: T[]; truncated: boolean; totalScanned: number }> {
    const base = dir();
    const names: string[] = [];
    let handle: Awaited<ReturnType<typeof fs.opendir>>;
    try {
      handle = await fs.opendir(base);
    } catch (err) {
      if (err && typeof err === "object" && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
        return { items: [], truncated: false, totalScanned: 0 };
      }
      throw err;
    }
    try {
      for await (const entry of handle) {
        if (entry.isFile() && entry.name.endsWith(".json")) {
          const id = entry.name.slice(0, -".json".length);
          if (isValidId(id)) {
            names.push(id);
            if (names.length >= MAX_SCAN_FILES) {
              logInfo(`${dirName} directory scan reached ${MAX_SCAN_FILES}; further files skipped`);
              break;
            }
          }
        }
      }
    } finally {
      // for-await handles cleanup
    }
    const items: T[] = [];
    for (const id of names.slice(0, MAX_LOAD_FILES)) {
      const item = await read(id);
      if (item) items.push(item);
    }
    return { items, truncated: names.length > MAX_LOAD_FILES, totalScanned: names.length };
  }

  async function read(id: string): Promise<T | null> {
    if (!isValidId(id)) return null;
    const file = fileFor(id);
    try {
      const raw = await fs.readFile(file, "utf-8");
      const parsed = JSON.parse(raw) as unknown;
      if (!validate(parsed)) throw new Error("schema validation failed");
      return parsed;
    } catch (err) {
      if (err && typeof err === "object" && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") return null;
      logError(`${dirName} file corrupt or unreadable`, { path: file, error: String(err) });
      try {
        const backupPath = `${file}.backup.${Date.now()}.${crypto.randomUUID()}`;
        await fs.rename(file, backupPath);
        logInfo(`Corrupt ${dirName} file backed up`, backupPath);
      } catch {
        // best effort
      }
      return null;
    }
  }

  async function save(input: unknown): Promise<{ ok: boolean; error?: string }> {
    if (!validate(input)) return { ok: false, error: "schema validation failed" };
    const id = (input as { id?: unknown }).id;
    if (!isValidId(id)) return { ok: false, error: "invalid id" };
    await fs.mkdir(dir(), { recursive: true });
    const target = fileFor(id);
    const tmp = `${target}${TMP_SUFFIX}`;
    await fs.writeFile(tmp, JSON.stringify(input, null, 2), { mode: 0o600 });
    await fs.rename(tmp, target);
    return { ok: true };
  }

  async function remove(id: string): Promise<{ ok: boolean; error?: string }> {
    if (!isValidId(id)) return { ok: false, error: "invalid id" };
    try {
      await fs.unlink(fileFor(id));
      return { ok: true };
    } catch (err) {
      if (err && typeof err === "object" && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
        return { ok: true };
      }
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  return { list, read, save, remove, getDir: dir };
}
