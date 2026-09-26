import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseThemeYaml } from "../../src/theme/yaml/parse";

/**
 * THEME-P2-017/P2-018: the canonical import/export spec ships an authoritative
 * V2 example that must be accepted by the real importer. The example
 * previously drifted from the schema (unknown top-level `version:` key and a
 * missing legacy text_* token trio); the schema-verifier workstream owns the
 * document, and this test pins the corrected contract end to end.
 */
describe("THEME_IMPORT_EXPORT.md canonical example", () => {
  it("parses the first fenced yaml block cleanly", () => {
    const doc = readFileSync(resolve("docs/ui-modernization/THEME_IMPORT_EXPORT.md"), "utf8");
    const block = /```yaml\n([\s\S]*?)```/.exec(doc);
    if (!block) throw new Error("spec must contain a fenced yaml example");

    const family = parseThemeYaml(block[1]);
    expect(family.id).toBe("cyber-matrix");
    expect(family.name).toBe("Cyber Matrix");
    expect(family.variants.light.tokens.background).toBe("#f4faf5");
    expect(family.variants.dark.tokens.background).toBe("#0a0d0a");
  });
});
