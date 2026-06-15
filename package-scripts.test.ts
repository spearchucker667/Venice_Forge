/** @fileoverview Invariant test for dev scripts (P1 regression guard).
 * Prevents "dev:web" from accidentally pointing back to "npm run dev" (which
 * would start only the Express server instead of Vite). Mirrors the contract
 * documented in AGENTS.md and README.md.
 *
 * Run as part of the normal `npm test` serial suite.
 */

// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgPath = resolve(__dirname, "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as { scripts: Record<string, string> };

describe("package.json dev scripts (dev:web regression guard)", () => {
  it("dev:web starts Vite directly (not a redirect to dev or server only)", () => {
    expect(pkg.scripts["dev:web"]).toBe("vite");
  });

  it("dev:server starts the Express proxy with tsx", () => {
    expect(pkg.scripts["dev:server"]).toBe("tsx server.ts");
  });

  it("dev is the concurrent server+web combo (never just tsx server.ts)", () => {
    const dev = pkg.scripts.dev || "";
    expect(dev).toContain("concurrently");
    expect(dev).toContain("dev:server");
    expect(dev).toContain("dev:web");
    // Explicitly forbid the old bug where dev:web pointed at "npm run dev"
    expect(dev).not.toMatch(/^\s*tsx\s+server\.ts\s*$/);
  });

  it("dev:electron still wires the expected vite + electron wait-on flow", () => {
    const de = pkg.scripts["dev:electron"] || "";
    expect(de).toContain("build:electron");
    expect(de).toContain("vite");
    expect(de).toContain("wait-on http://localhost:5173");
    expect(de).toContain("electron .");
  });
});

describe("package.json test scripts", () => {
  it("leaves serial execution to vitest.config.ts so callers can pass the CLI option", () => {
    expect(pkg.scripts.test).toBe("vitest run");
    expect(pkg.scripts["test:watch"]).toBe("vitest");
  });
});
