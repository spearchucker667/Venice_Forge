/** @fileoverview Unit tests for release verification platform selection. */
import { describe, it, expect } from "vitest";
// @ts-expect-error - CJS import in TS file
import { getTargets, FORBIDDEN_DIST_PATTERNS, SECRET_PATTERNS } from "./verify-dist.cjs";

describe("verify-dist platform selection", () => {
  it("selects Windows x64 when running on win32 with no args", () => {
    const targets = getTargets("win32", []);
    expect(targets.checkWin).toBe(true);
    expect(targets.checkMac).toBe(false);
    expect(targets.targetArches).toEqual(["x64"]);
  });

  it("selects macOS x64/arm64 when running on darwin with no args", () => {
    const targets = getTargets("darwin", []);
    expect(targets.checkWin).toBe(false);
    expect(targets.checkMac).toBe(true);
    expect(targets.targetArches).toEqual(["x64", "arm64"]);
  });

  it("selects both when --all is passed", () => {
    const targets = getTargets("linux", ["--all"]);
    expect(targets.checkWin).toBe(true);
    expect(targets.checkMac).toBe(true);
    expect(targets.targetArches).toEqual(["x64", "arm64"]);
  });

  it("respects explicit --win and --mac flags", () => {
    const targets = getTargets("linux", ["--win", "--mac"]);
    expect(targets.checkWin).toBe(true);
    expect(targets.checkMac).toBe(true);
  });

  it("respects explicit --arch flag", () => {
    const targets = getTargets("darwin", ["--arch", "arm64"]);
    expect(targets.targetArches).toEqual(["arm64"]);
  });

  it("prevents Linux from defaulting to Windows (regression test)", () => {
    const targets = getTargets("linux", []);
    expect(targets.checkWin).toBe(false);
    expect(targets.checkMac).toBe(false);
    expect(targets.checkLinux).toBe(false);
  });

  it("selects Linux when --linux is passed", () => {
    const targets = getTargets("linux", ["--linux"]);
    expect(targets.checkLinux).toBe(true);
    expect(targets.checkWin).toBe(false);
    expect(targets.checkMac).toBe(false);
  });

  it("selects all platforms when --all is passed on any OS", () => {
    const targets = getTargets("darwin", ["--all"]);
    expect(targets.checkLinux).toBe(true);
    expect(targets.checkMac).toBe(true);
    expect(targets.checkWin).toBe(true);
    expect(targets.targetArches).toEqual(["x64", "arm64"]);
  });
});

describe("verify-dist Phase 2J hygiene guards", () => {
  it("FORBIDDEN_DIST_PATTERNS rejects source maps, test files, env, db, local config", () => {
    const bad = [
      "assets/index.js.map",
      "src/foo.test.ts",
      "src/foo.spec.js",
      "scripts/run.test.cjs",
      ".env",
      ".env.local",
      ".config/config.local.yaml",
      ".config/themes.prod.yml",
      "cache.db",
      "data.sqlite3",
      ".design-captures/x.png",
      "chat-history/conv.json",
      ".integration-src/run.ts",
    ];
    for (const s of bad) {
      const hit = FORBIDDEN_DIST_PATTERNS.some((re: RegExp) => re.test(s) || re.test("/" + s));
      expect(hit).toBe(true);
    }
    // Allowed: real source / asset names
    const ok = [
      "assets/index-DaRjS5zB.js",
      "branding/venice-logo.svg",
      "branding/NOTICE.md",
      "index.html",
      "server.cjs",
    ];
    for (const s of ok) {
      const hit = FORBIDDEN_DIST_PATTERNS.some((re: RegExp) => re.test(s) || re.test("/" + s));
      expect(hit).toBe(false);
    }
  });

  it("SECRET_PATTERNS catch real Venice / sk- / Bearer tokens but not internal constants", () => {
    const real = [
      "const k = 'venice_" + "a".repeat(40) + "';",
      "Authorization: Bearer " + "a".repeat(40),
      "sk-" + "x".repeat(40),
      "vn-abc_DEF.1234567890",
      "OPENAI_API_KEY=sk-abc_DEF.1234567890",
    ];
    for (const s of real) {
      const hit = SECRET_PATTERNS.some((re: RegExp) => {
        re.lastIndex = 0;
        return re.test(s);
      });
      expect(hit).toBe(true);
    }
    // App-internal identifiers must not match
    const internal = [
      "venice_canvas_studio_v1",
      "venice_forge_traffic_logs_",
      "VENICE_API_KEY constant name",
    ];
    for (const s of internal) {
      const hit = SECRET_PATTERNS.some((re: RegExp) => {
        re.lastIndex = 0;
        return re.test(s);
      });
      expect(hit).toBe(false);
    }
  });
});
