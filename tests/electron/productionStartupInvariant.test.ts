// @vitest-environment node

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");

describe("production renderer startup invariant (VERIFY-036)", () => {
  it("loads dist/index.html in place with a compatible production CSP", () => {
    const mainSource = fs.readFileSync(path.join(root, "electron/main.ts"), "utf8");
    const viteSource = fs.readFileSync(path.join(root, "vite.config.ts"), "utf8");

    expect(mainSource).toContain('win.loadFile(prodHtmlPath)');
    expect(mainSource).not.toContain('app.getPath("temp")');
    expect(mainSource).not.toContain("strict-dynamic");
    expect(mainSource).not.toContain("generateNonce");
    expect(viteSource).not.toContain("__VITE_CSP_NONCE__");
  });
});
