import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import fssync from "node:fs";
import os from "node:os";
import path from "node:path";
import { atomicReplaceFile, atomicReplaceFileSync } from "./atomicFileReplace";

describe("atomicReplaceFile", () => {
  const dirs: string[] = [];

  afterEach(async () => {
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
