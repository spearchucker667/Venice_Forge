import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import fssync from "node:fs";
import os from "node:os";
import path from "node:path";
import { atomicReplaceFile, atomicReplaceFileSync } from "./atomicFileReplace";

describe("atomicReplaceFile", () => {
  const dirs: string[] = [];

  afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(dirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
  });

  it("replaces an existing destination with unique temps", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vf-atomic-"));
    dirs.push(dir);
    const target = path.join(dir, "record.json");
    await atomicReplaceFile(target, JSON.stringify({ v: 1 }));
    await atomicReplaceFile(target, JSON.stringify({ v: 2 }));
    const parsed = JSON.parse(await fs.readFile(target, "utf8")) as { v: number };
    expect(parsed.v).toBe(2);
  });

  it("fsyncs the temp file when the sync option is set", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vf-atomic-"));
    dirs.push(dir);
    const target = path.join(dir, "durable.json");
    await atomicReplaceFile(target, JSON.stringify({ v: 1 }), 0o600, { sync: true });
    expect(JSON.parse(await fs.readFile(target, "utf8"))).toEqual({ v: 1 });
    // Reap check: no temp files left behind.
    const names = await fs.readdir(dir);
    expect(names).toEqual(["durable.json"]);
  });

  it("sync variant replaces an existing destination with unique temps", () => {
    const dir = fssync.mkdtempSync(path.join(os.tmpdir(), "vf-atomic-"));
    dirs.push(dir);
    const target = path.join(dir, "secure.json");
    atomicReplaceFileSync(target, JSON.stringify({ v: 1 }));
    atomicReplaceFileSync(target, JSON.stringify({ v: 2 }));
    expect(JSON.parse(fssync.readFileSync(target, "utf8"))).toEqual({ v: 2 });
    const names = fssync.readdirSync(dir);
    expect(names).toEqual(["secure.json"]);
  });

  it.each(["async", "sync"] as const)("%s writes inside a private sibling directory and cleans it", async (variant) => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vf-atomic-"));
    dirs.push(dir);
    const target = path.join(dir, "private.json");
    const tempDirs: string[] = [];
    const inspectTemp = (file: string) => {
      const tempDir = path.dirname(file);
      tempDirs.push(tempDir);
      expect(path.dirname(tempDir)).toBe(dir);
      expect(path.basename(tempDir)).toMatch(/^\.vf-replace-/);
      expect(file).not.toBe(target);
      if (process.platform !== "win32") {
        expect(fssync.statSync(tempDir).mode & 0o777).toBe(0o700);
      }
    };
    const originalWrite = fs.writeFile;
    const originalWriteSync = fssync.writeFileSync;
    vi.spyOn(fs, "writeFile").mockImplementation(async (...args) => {
      inspectTemp(String(args[0]));
      return originalWrite(...args);
    });
    vi.spyOn(fssync, "writeFileSync").mockImplementation((...args) => {
      inspectTemp(String(args[0]));
      return originalWriteSync(...args);
    });
    for (const value of ["first", "second"]) {
      if (variant === "async") await atomicReplaceFile(target, value);
      else atomicReplaceFileSync(target, value);
    }
    expect(tempDirs).toHaveLength(2);
    expect(new Set(tempDirs).size).toBe(2);
    expect(await fs.readFile(target, "utf8")).toBe("second");
    expect(await fs.readdir(dir)).toEqual(["private.json"]);
  });

  it.each(["async", "sync"] as const)("%s preserves the destination and cleans temps after rename failure", async (variant) => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vf-atomic-"));
    dirs.push(dir);
    const target = path.join(dir, "record.json");
    await fs.writeFile(target, "original");
    const error = Object.assign(new Error("injected IO failure"), { code: "EIO" });
    if (variant === "async") {
      vi.spyOn(fs, "rename").mockRejectedValueOnce(error);
      await expect(atomicReplaceFile(target, "replacement")).rejects.toBe(error);
    } else {
      vi.spyOn(fssync, "renameSync").mockImplementationOnce(() => { throw error; });
      expect(() => atomicReplaceFileSync(target, "replacement")).toThrow(error);
    }
    expect(await fs.readFile(target, "utf8")).toBe("original");
    expect(await fs.readdir(dir)).toEqual(["record.json"]);
  });

  it("sync variant writes with the requested mode", async () => {
    if (process.platform === "win32") return; // POSIX mode bits only.
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vf-atomic-"));
    dirs.push(dir);
    const target = path.join(dir, "mode.json");
    atomicReplaceFileSync(target, "x", 0o600);
    const stat = await fs.stat(target);
    expect(stat.mode & 0o777).toBe(0o600);
  });
});
