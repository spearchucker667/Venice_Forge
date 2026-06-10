/** @fileoverview Regression test for the `verify:storage-privacy-dashboard`
 *  → `verify:storage-privacy` alias contract (2026-06-08 P3 cleanup).
 *
 *  Background: the canonical Phase 2H storage/privacy audit script is
 *  invoked by `npm run verify:storage-privacy`. A historical alias
 *  `verify:storage-privacy-dashboard` exists for back-compat. The
 *  contract we want to lock:
 *
 *    1. `package.json` MUST contain a `verify:storage-privacy` script.
 *    2. `package.json` MUST contain a `verify:storage-privacy-dashboard`
 *       script that delegates to the canonical script (either directly
 *       by chaining `node scripts/verify-storage-privacy.cjs` or by
 *       delegating to `npm run verify:storage-privacy`).
 *    3. The `ci` script MUST call the canonical `verify:storage-privacy`
 *       name, NOT the legacy alias. The alias is back-compat only.
 *
 *  Without this test, a future refactor could silently:
 *    - rename the canonical script and break the alias chain, or
 *    - swap the `ci` script to call the alias and lose future
 *      visibility into whether the alias stays in sync, or
 *    - delete the alias entirely (acceptable, but only with an
 *      intentional doc + downstream consumer audit).
 *
 *  Note: we intentionally do NOT assert that the underlying
 *  `scripts/verify-storage-privacy.cjs` exits 0. That CLI shells out to
 *  `vitest run` on a curated test set, and the suite has known pre-
 *  existing flakes on the `c2afcfac` baseline (e.g.
 *  `src/services/storageMaintenance.test.ts` `applies clear-model-cache`)
 *  that are unrelated to the alias contract. Fixing those flakes is
 *  out of scope for the 2026-06-08 P3 cleanup; the alias contract is
 *  the only thing this test is intended to lock.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const pkg = JSON.parse(
  readFileSync(join(repoRoot, "package.json"), "utf8"),
) as {
  scripts: Record<string, string>;
};

const CANONICAL = "verify:storage-privacy";
const ALIAS = "verify:storage-privacy-dashboard";
const CANONICAL_RUNNER = "node scripts/verify-storage-privacy.cjs";

describe("verify:storage-privacy alias contract (2026-06-08 P3)", () => {
  it("declares the canonical script", () => {
    expect(pkg.scripts[CANONICAL]).toBeTruthy();
    expect(pkg.scripts[CANONICAL]).toBe(CANONICAL_RUNNER);
  });

  it("declares the back-compat alias that delegates to the canonical script", () => {
    expect(pkg.scripts[ALIAS]).toBeTruthy();
    // The alias must chain through the canonical script (or call it
    // directly). It must NOT point to a different verifier file — that
    // would silently fork the audit.
    expect(pkg.scripts[ALIAS]).toMatch(
      /verify:storage-privacy|verify-storage-privacy\.cjs/,
    );
    expect(pkg.scripts[ALIAS]).not.toMatch(
      /verify-storage-privacy-dashboard\.cjs/,
    );
  });

  it("the ci script references the canonical name (not the alias)", () => {
    const getExpandedScript = (scriptName: string, visited = new Set<string>()): string => {
      if (visited.has(scriptName)) return "";
      visited.add(scriptName);
      const content = pkg.scripts[scriptName] || "";
      let expanded = content;
      const regex = /npm run ([a-zA-Z0-9:-]+)/g;
      let match;
      while ((match = regex.exec(content)) !== null) {
        expanded += " " + getExpandedScript(match[1], visited);
      }
      return expanded;
    };

    const ci = getExpandedScript("ci");
    expect(ci).toBeTruthy();
    expect(ci).toContain(CANONICAL);
    // Back-compat alias must not appear in the ci chain — a future
    // contributor should not be lulled into thinking the alias is the
    // canonical entry point.
    expect(ci).not.toContain(ALIAS);
  });
});

