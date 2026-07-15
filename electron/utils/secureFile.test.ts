// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { readRegularFileNoFollow } from "./secureFile";

// VERIFY-126: protocol-served local files are read from a validated no-follow descriptor.
describe("readRegularFileNoFollow", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "vf-secure-file-"));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("reads a regular file", async () => {
    const file = path.join(root, "audio.mp3");
    fs.writeFileSync(file, "audio-bytes");
    await expect(readRegularFileNoFollow(file)).resolves.toEqual(Buffer.from("audio-bytes"));
  });

  it.runIf(process.platform !== "win32")("rejects a symbolic link", async () => {
    const target = path.join(root, "target.mp3");
    const link = path.join(root, "link.mp3");
    fs.writeFileSync(target, "secret");
    fs.symlinkSync(target, link);
    await expect(readRegularFileNoFollow(link)).rejects.toThrow();
  });

  it("rejects a directory", async () => {
    await expect(readRegularFileNoFollow(root)).rejects.toThrow("Not a regular file");
  });
});
