// @vitest-environment node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const {
  BANNED_RETURNING_FILENAMES,
  BANNED_RETURNING_IDS,
  INTENTIONAL_V2_OVERRIDES,
  collectBuiltinFamilyIds,
  extractThemeIds,
  scanThemesDir,
  // eslint-disable-next-line @typescript-eslint/no-require-imports
} = require("./verify-theme-collisions.cjs") as {
  BANNED_RETURNING_FILENAMES: Set<string>;
  BANNED_RETURNING_IDS: Set<string>;
  INTENTIONAL_V2_OVERRIDES: Set<string>;
  collectBuiltinFamilyIds: (indexPath?: string, builtinsDir?: string) => Set<string>;
  extractThemeIds: (
    filePath: string,
    content: string,
  ) => { ids: Array<{ id: string; line: number }>; skipped: boolean; v2?: boolean; reason?: string };
  scanThemesDir: (
    themesDir: string,
    builtinIds: Set<string>,
  ) => {
    scanned: number;
    skippedFlat: number;
    intentional: Array<{ id: string; file: string; line: number }>;
    failures: Array<{ file: string; line: number; id: string; reason: string }>;
  };
};

const tempDirs: string[] = [];

function fixture(files: Record<string, string>) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "venice-theme-collisions-"));
  tempDirs.push(root);
  for (const [name, contents] of Object.entries(files)) {
    const target = path.join(root, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents);
  }
  return root;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

const V1_DOC = (id: string) =>
  `themes:\n  ${id}:\n    display_name: ${id}\n    mode: dark\n    tokens:\n      background: "#000000"\n`;

const V2_DOC = (id: string) =>
  `schemaVersion: 2\nid: ${id}\nname: ${id}\nvariants:\n  light:\n    tokens:\n      background: "#ffffff"\n  dark:\n    tokens:\n      background: "#000000"\n`;

const FLAT_DOC = `name: Flat\nmode: dark\nbackground: "#000000"\nforeground: "#ffffff"\naccent: "#ff0000"\n`;

describe("scanThemesDir (THEME-P2-009 policy)", () => {
  it("accepts a registered intentional dual-variant V2 override", () => {
    const root = fixture({ "amber-archive.yaml": V2_DOC("amber-archive") });
    const result = scanThemesDir(root, new Set(["amber-archive"]));
    expect(result.failures).toEqual([]);
    expect(result.intentional.map((i) => i.id)).toEqual(["amber-archive"]);
    expect(result.scanned).toBe(1);
  });

  it("rejects a legacy V1 single-mode shadow of a built-in id even when registered", () => {
    // INTENTIONAL_V2_OVERRIDES lists the converted dual-variant documents only;
    // reintroducing the same id as a V1 `themes:` block must still fail.
    const root = fixture({ "amber-archive.yaml": V1_DOC("amber-archive") });
    const result = scanThemesDir(root, new Set(["amber-archive"]));
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].reason).toBe("v1-single-mode-shadow");
    expect(result.failures[0].id).toBe("amber-archive");
  });

  it("rejects an unregistered V2 collision with a built-in id", () => {
    const root = fixture({ "venice.yaml": V2_DOC("venice") });
    const result = scanThemesDir(root, new Set(["venice"]));
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].reason).toBe("unregistered-builtin-id-collision");
    expect(result.failures[0].id).toBe("venice");
  });

  it("rejects any V1 themes-block id colliding with a built-in id", () => {
    const root = fixture({ "mystery.yaml": V1_DOC("mystery") });
    const result = scanThemesDir(root, new Set(["mystery"]));
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].reason).toBe("v1-single-mode-shadow");
  });

  it("rejects a reintroduced copper.yaml in V1 form", () => {
    const root = fixture({ "copper.yaml": V1_DOC("copper") });
    const result = scanThemesDir(root, new Set(["copper"]));
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].reason).toBe("banned-theme-reintroduced");
  });

  it("rejects a reintroduced copper document in V2 form", () => {
    const root = fixture({ "copper.yaml": V2_DOC("copper") });
    const result = scanThemesDir(root, new Set(["copper"]));
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].reason).toBe("banned-theme-reintroduced");
  });

  it("rejects a resurrected copper file even when it is flat and id-less", () => {
    const root = fixture({ "copper.yaml": FLAT_DOC });
    const result = scanThemesDir(root, new Set(["copper"]));
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].reason).toBe("banned-theme-reintroduced");
  });

  it("skips flat terminal-color files and passes non-colliding documents", () => {
    const root = fixture({
      "flat.yaml": FLAT_DOC,
      "my-theme.yaml": V1_DOC("my-theme"),
      "other.yaml": V2_DOC("other"),
    });
    const result = scanThemesDir(root, new Set(["venice"]));
    expect(result.failures).toEqual([]);
    expect(result.scanned).toBe(2);
    expect(result.skippedFlat).toBe(1);
  });
});

describe("extractThemeIds", () => {
  it("classifies V2, V1, and flat documents", () => {
    expect(extractThemeIds("a", V2_DOC("x")).v2).toBe(true);
    expect(extractThemeIds("a", V2_DOC("x")).ids[0].id).toBe("x");
    expect(extractThemeIds("a", V1_DOC("y")).v2).toBe(false);
    expect(extractThemeIds("a", V1_DOC("y")).ids[0].id).toBe("y");
    expect(extractThemeIds("a", FLAT_DOC).skipped).toBe(true);
  });
});

describe("shipped repository state (THEME-P2-009)", () => {
  const REPO_ROOT = path.resolve(__dirname, "..");

  it("collects built-in family ids from the checked-in builtins index", () => {
    const ids = collectBuiltinFamilyIds(
      path.join(REPO_ROOT, "src", "theme", "builtins", "index.ts"),
      path.join(REPO_ROOT, "src", "theme", "builtins"),
    );
    expect(ids.size).toBeGreaterThan(0);
    expect(ids.has("copper")).toBe(true);
    expect(ids.has("venice")).toBe(true);
  });

  it("config/themes ships zero violations and exercises every intentional override", () => {
    const builtinIds = collectBuiltinFamilyIds(
      path.join(REPO_ROOT, "src", "theme", "builtins", "index.ts"),
      path.join(REPO_ROOT, "src", "theme", "builtins"),
    );
    const result = scanThemesDir(path.join(REPO_ROOT, "config", "themes"), builtinIds);
    expect(result.failures).toEqual([]);

    const overridden = new Set(result.intentional.map((i) => i.id));
    // Every registered override must correspond to a shipped document, and
    // every shipped override must be registered — no dead or missing entries.
    for (const id of INTENTIONAL_V2_OVERRIDES) {
      expect(overridden.has(id), `INTENTIONAL_V2_OVERRIDES entry "${id}" has no shipped document`).toBe(true);
    }
    expect(overridden.size).toBe(INTENTIONAL_V2_OVERRIDES.size);
  });

  it("documents the banned copper return guards", () => {
    expect(BANNED_RETURNING_IDS.has("copper")).toBe(true);
    expect(BANNED_RETURNING_FILENAMES.has("copper.yaml")).toBe(true);
    expect(INTENTIONAL_V2_OVERRIDES.has("copper")).toBe(false);
  });
});
