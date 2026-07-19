// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assertRelativeWorkspacePath, resolveExistingWorkspacePath, resolveNewWorkspacePath } from "./path-policy";

let temporaryRoot = "";

beforeEach(async () => {
  temporaryRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), "vf-path-policy-"));
  await fs.promises.mkdir(path.join(temporaryRoot, "docs"));
  await fs.promises.writeFile(path.join(temporaryRoot, "docs", "readme.md"), "safe");
});

afterEach(async () => {
  await fs.promises.rm(temporaryRoot, { recursive: true, force: true });
});

describe("workspace path policy", () => {
  it.each(["/etc/passwd", "C:\\Windows\\win.ini", "\\\\server\\share", "../secret", "docs/../secret", "file:secret", "~/.ssh", "docs/%2e%2e/secret", "docs/NUL.txt"])(
    "VERIFY-147 rejects hostile relative path %s",
    (candidate) => expect(() => assertRelativeWorkspacePath(candidate)).toThrow(),
  );

  it("resolves regular files and new targets beneath the root", async () => {
    const canonicalRoot = await fs.promises.realpath(temporaryRoot);
    await expect(resolveExistingWorkspacePath(temporaryRoot, "docs/readme.md")).resolves.toBe(path.join(canonicalRoot, "docs", "readme.md"));
    await expect(resolveNewWorkspacePath(temporaryRoot, "docs/new.md")).resolves.toBe(path.join(canonicalRoot, "docs", "new.md"));
  });

  it("rejects symlinks even when their target is inside or outside", async () => {
    const outside = await fs.promises.mkdtemp(path.join(os.tmpdir(), "vf-path-outside-"));
    try {
      await fs.promises.symlink(outside, path.join(temporaryRoot, "linked"));
      await expect(resolveExistingWorkspacePath(temporaryRoot, "linked")).rejects.toThrow("symlinks are not followed");
      await expect(resolveNewWorkspacePath(temporaryRoot, "linked/new.md")).rejects.toThrow("symlinks are not followed");
    } finally {
      await fs.promises.rm(outside, { recursive: true, force: true });
    }
  });
});
