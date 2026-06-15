// @vitest-environment node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const constantsPath = path.join(root, "src", "constants", "venice.ts");
const scriptPath = path.join(root, "scripts", "profile-media-studio.mjs");

function parseDbConstants(text: string) {
  const nameMatch = text.match(/export\s+const\s+DB_NAME\s*=\s*"([^"]+)"/);
  const versionMatch = text.match(/export\s+const\s+DB_VERSION\s*=\s*(\d+)/);
  if (!nameMatch || !versionMatch) {
    throw new Error(`Unable to parse DB_NAME/DB_VERSION from ${constantsPath}`);
  }
  return { dbName: nameMatch[1], dbVersion: Number.parseInt(versionMatch[1], 10) };
}

describe("profile-media-studio.mjs", () => {
  // T-254 regression guard: the Media Studio profiler must open IndexedDB at the
  // same name and version used by the app, not a hardcoded stale version.
  it("uses the live DB_NAME and DB_VERSION from src/constants/venice.ts", () => {
    const constants = fs.readFileSync(constantsPath, "utf-8");
    const script = fs.readFileSync(scriptPath, "utf-8");
    const { dbName, dbVersion } = parseDbConstants(constants);

    expect(script).not.toContain('indexedDB.open("venice_canvas_studio_v1", 6)');
    expect(script).toContain("const request = indexedDB.open(dbName, dbVersion)");
    expect(script).toContain("const mediaDb = await openDatabase(dbName, dbVersion)");
    expect(script).toContain(`const constantsPath = path.join(root, "src", "constants", "venice.ts")`);
    expect(dbVersion).toBeGreaterThanOrEqual(6);
    expect(dbName).toBe("venice_canvas_studio_v1");
  });

  it("normalizes invalid record counts and sanitizes captured diagnostics", () => {
    const script = fs.readFileSync(scriptPath, "utf-8");
    expect(script).toContain("function parseRecordCount(value)");
    expect(script).toContain("Number.isFinite(parsed) && parsed > 0 ? parsed : 1000");
    expect(script).toContain("function sanitizeDiagnostic(value)");
    expect(script).toContain("sanitizeDiagnostic(`${message.type()}: ${message.text()}`)");
    expect(script).toContain("sanitizeDiagnostic(`pageerror: ${error.message}`)");
  });
});
