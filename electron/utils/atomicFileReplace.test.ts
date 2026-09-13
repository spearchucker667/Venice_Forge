import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { atomicReplaceFile } from "./atomicFileReplace";

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
});
