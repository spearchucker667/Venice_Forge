/** @fileoverview Basic coverage for the archive-clean hygiene guard (P1). */

import { describe, expect, it } from "vitest";
// Dynamic import for .cjs to satisfy no-require-imports while still exercising
// the guard's exported BAD_PATTERNS (no types for the .cjs).
// @ts-expect-error — .cjs has no declaration; any is acceptable inside this guard test.
const { BAD_PATTERNS } = await import("./verify-archive-clean.cjs");
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";

describe("verify-archive-clean (P1 hygiene guard)", () => {
  it("exports BAD_PATTERNS that match the documented contaminants", () => {
    expect(BAD_PATTERNS.length).toBeGreaterThan(5);
    const sample = [
      "__MACOSX/foo/",
      "bar/.DS_Store",
      "x/._private",
      "y/.AppleDouble/z",
      "node_modules/pkg",
      "dist/bundle.js",
      "release/app.dmg",
      ".env",
      ".env.local",
      "chat-history/conv.json",
      ".config/my-secret.yaml",
      "foo.db",
      "dir/data.sqlite3",
    ];
    for (const s of sample) {
      const hit = BAD_PATTERNS.some((re: RegExp) => re.test(s) || re.test("/" + s) || re.test(s + "/"));
      expect(hit).toBe(true);
    }
    // Allowed examples must not match the non-example yaml rule
    expect(BAD_PATTERNS.some((re: RegExp) => re.test(".config/config.example.yaml"))).toBe(false);
    expect(BAD_PATTERNS.some((re: RegExp) => re.test(".env.example"))).toBe(false);
  });

  it("CLI exits 0 on a clean temp tree and non-zero when contaminants are present", () => {
    const root = mkdtempSync(join(tmpdir(), "venice-archive-clean-"));
    try {
      // Clean tree should pass
      const cleanOut = execSync(`node ${join(__dirname, "verify-archive-clean.cjs")} --root ${root}`, { encoding: "utf8" });
      expect(cleanOut).toMatch(/OK/);

      // Plant a forbidden item
      writeFileSync(join(root, ".DS_Store"), "");
      const badRoot = mkdtempSync(join(tmpdir(), "venice-archive-clean-bad-"));
      try {
        writeFileSync(join(badRoot, "._evil"), "x");
        let failed = false;
        try {
          execSync(`node ${join(__dirname, "verify-archive-clean.cjs")} --root ${badRoot}`, { stdio: "pipe" });
        } catch (e: any) {
          failed = e.status !== 0;
        }
        expect(failed).toBe(true);
      } finally {
        rmSync(badRoot, { recursive: true, force: true });
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
