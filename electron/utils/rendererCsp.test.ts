// @vitest-environment node

import { describe, it, expect } from "vitest";
import { rendererCsp } from "./rendererCsp";

describe("rendererCsp", () => {
  // VERIFY-062: production CSP must not allow arbitrary https: images.
  it("production CSP does not allow arbitrary https: image sources", () => {
    const csp = rendererCsp(false);
    expect(csp).toContain("img-src 'self' data: blob: venice-character-cache:");
    expect(csp).not.toContain("img-src 'self' data: blob: https: venice-character-cache:");
    expect(csp).not.toMatch(/img-src[^;]*\shttps:/);
  });

  it("development CSP keeps local dev origins for HMR", () => {
    const csp = rendererCsp(true);
    expect(csp).toContain("connect-src 'self' http://localhost:5173 ws://localhost:5173");
    expect(csp).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:5173");
  });

  it("keeps object-src and frame-ancestors locked down", () => {
    const csp = rendererCsp(false);
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("form-action 'none'");
  });
});
