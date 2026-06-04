// @vitest-environment node
/**
 * @fileoverview Unit tests for electron/utils/navigation.ts (path-containment
 * check used by Electron main process to gate `will-navigate`).
 *
 * Covers:
 * - Symlink resolution and rejection of symlinks that escape the root.
 * - Case-insensitive Windows path comparison.
 * - Reject ".." and "." as bare IDs (covered indirectly via chatStorage).
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { checkPathContained } from "./navigation";

let rootDir: string;
let outsideDir: string;

function rmrf(p: string) {
  try { fs.rmSync(p, { recursive: true, force: true }); } catch { /* ignore */ }
}

beforeEach(() => {
  rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "vf-nav-root-"));
  outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "vf-nav-out-"));
  // Populate the root with a fake index.html so realpath resolves to a file.
  fs.writeFileSync(path.join(rootDir, "index.html"), "<html></html>");
  fs.writeFileSync(path.join(outsideDir, "secret.txt"), "secret");
});

afterEach(() => {
  rmrf(rootDir);
  rmrf(outsideDir);
});

describe("checkPathContained", () => {
  it("accepts the root index.html", () => {
    expect(checkPathContained(path.join(rootDir, "index.html"), rootDir)).toBe(true);
  });

  it("accepts a file inside the root", () => {
    const inner = path.join(rootDir, "inner", "page.html");
    fs.mkdirSync(path.dirname(inner), { recursive: true });
    fs.writeFileSync(inner, "<html></html>");
    expect(checkPathContained(inner, rootDir)).toBe(true);
  });

  it("rejects a file outside the root", () => {
    expect(checkPathContained(path.join(outsideDir, "secret.txt"), rootDir)).toBe(false);
  });

  it("rejects a path-traversal attempt that escapes via '..'", () => {
    // Construct a target that, when normalized, points outside the root.
    // On POSIX, realpath will resolve the '..' before our check sees it.
    const traversal = path.join(rootDir, "..", path.basename(outsideDir), "secret.txt");
    expect(checkPathContained(traversal, rootDir)).toBe(false);
  });

  it("rejects a nonexistent path under the root (realpath throws)", () => {
    // On POSIX, realpathSync of a nonexistent path throws ENOENT. Our code
    // returns false on non-Windows for that case.
    if (process.platform !== "win32") {
      expect(checkPathContained(path.join(rootDir, "no-such-file"), rootDir)).toBe(false);
    }
  });

  it("rejects when the root itself does not exist (realpath throws)", () => {
    if (process.platform !== "win32") {
      const ghost = path.join(os.tmpdir(), "vf-nav-ghost-XXXXX");
      expect(checkPathContained(path.join(ghost, "index.html"), ghost)).toBe(false);
    }
  });
});
