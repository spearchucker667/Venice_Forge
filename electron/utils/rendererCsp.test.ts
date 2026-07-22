// @vitest-environment node

import { describe, it, expect } from "vitest";
import { rendererCsp } from "./rendererCsp";

describe("rendererCsp", () => {
  // VERIFY-062: production CSP must not allow arbitrary https: images.
  // VF-20260720-002: durable generated images render via venice-media:, so
  // img-src must permit that scheme without opening arbitrary remote/file
  // sources.
  it("production CSP permits internal image schemes but no arbitrary https: image sources", () => {
    const csp = rendererCsp(false);
    expect(csp).toContain("img-src 'self' data: blob: venice-character-cache: venice-media:");
    expect(csp).toContain("media-src 'self' blob: venice-media:");
    expect(csp).toContain("worker-src 'self' blob:");
    expect(csp).not.toMatch(/img-src[^;]*\shttps:/);
    expect(csp).not.toMatch(/img-src[^;]*\shttp:/);
    expect(csp).not.toMatch(/img-src[^;]*\sfile:/);
    expect(csp).not.toMatch(/img-src[^;]*\s\*(;|$)/);
  });

  it("development CSP keeps local dev origins for HMR", () => {
    const csp = rendererCsp(true);
    expect(csp).toContain("connect-src 'self' http://localhost:5173 ws://localhost:5173");
    expect(csp).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:5173");
    expect(csp).toContain("worker-src 'self' blob: http://localhost:5173");
  });

  it("keeps object-src and frame-ancestors locked down", () => {
    const csp = rendererCsp(false);
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("form-action 'none'");
  });
});
