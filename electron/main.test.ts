import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { checkPathContained } from "./utils/navigation";
import { isTrustedExternalUrl } from "./utils/urlSecurity";

describe("checkPathContained", () => {
  let tmpDir = "";
  let rootDir = "";
  let outsideFile = "";

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vf-nav-test-"));
    rootDir = path.join(tmpDir, "dist");
    fs.mkdirSync(rootDir, { recursive: true });
    fs.writeFileSync(path.join(rootDir, "index.html"), "<html></html>");
    fs.mkdirSync(path.join(rootDir, "assets"), { recursive: true });
    fs.writeFileSync(path.join(rootDir, "assets", "app.js"), "// app");
    outsideFile = path.join(tmpDir, "outside-secret.txt");
    fs.writeFileSync(outsideFile, "secret");
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("allows index.html inside the root", () => {
    expect(checkPathContained(path.join(rootDir, "index.html"), rootDir)).toBe(true);
  });

  it("allows a regular file inside the root", () => {
    expect(checkPathContained(path.join(rootDir, "assets", "app.js"), rootDir)).toBe(true);
  });

  it("blocks a file outside the root", () => {
    expect(checkPathContained(outsideFile, rootDir)).toBe(false);
  });

  it("blocks a symlink that points outside the root", () => {
    const symlinkPath = path.join(rootDir, "escape-link");
    fs.symlinkSync(outsideFile, symlinkPath);
    try {
      expect(checkPathContained(symlinkPath, rootDir)).toBe(false);
    } finally {
      fs.unlinkSync(symlinkPath);
    }
  });

  it("allows a symlink that points inside the root", () => {
    const symlinkPath = path.join(rootDir, "internal-link");
    fs.symlinkSync(path.join(rootDir, "assets", "app.js"), symlinkPath);
    try {
      expect(checkPathContained(symlinkPath, rootDir)).toBe(true);
    } finally {
      fs.unlinkSync(symlinkPath);
    }
  });

  it("blocks path traversal via '..' sequences", () => {
    const traversal = path.join(rootDir, "..", "outside-secret.txt");
    expect(checkPathContained(traversal, rootDir)).toBe(false);
  });

  it("returns false for a non-existent path", () => {
    expect(checkPathContained(path.join(rootDir, "does-not-exist.html"), rootDir)).toBe(false);
  });

  it("uses case-insensitive comparison on Windows (M-007)", () => {
    const spy = vi.spyOn(process, "platform", "get").mockReturnValue("win32");
    try {
      expect(checkPathContained(path.join(rootDir, "INDEX.HTML"), rootDir)).toBe(true);
      expect(checkPathContained(path.join(rootDir, "Assets", "APP.JS"), rootDir)).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });
});

// BUG-008 regression guard: isTrustedExternalUrl must block private-network addresses
describe("isTrustedExternalUrl", () => {
  it("allows a public https URL", () => {
    expect(isTrustedExternalUrl("https://venice.ai/docs")).toBe(true);
  });
  it("blocks http (non-https)", () => {
    expect(isTrustedExternalUrl("http://venice.ai/")).toBe(false);
  });
  it("blocks localhost", () => {
    expect(isTrustedExternalUrl("https://localhost/admin")).toBe(false);
  });
  it("blocks 127.x loopback", () => {
    expect(isTrustedExternalUrl("https://127.0.0.1/")).toBe(false);
  });
  it("blocks 10.x private range", () => {
    expect(isTrustedExternalUrl("https://10.0.0.1/")).toBe(false);
  });
  it("blocks 192.168.x private range", () => {
    expect(isTrustedExternalUrl("https://192.168.1.1/admin")).toBe(false);
  });
  it("blocks 172.16–31 private range", () => {
    expect(isTrustedExternalUrl("https://172.16.0.1/")).toBe(false);
    expect(isTrustedExternalUrl("https://172.31.255.255/")).toBe(false);
  });
  it("allows 172.32.x (outside private range)", () => {
    expect(isTrustedExternalUrl("https://172.32.0.1/")).toBe(true);
  });
  it("blocks 0.0.0.0", () => {
    expect(isTrustedExternalUrl("https://0.0.0.0/")).toBe(false);
  });
  it("blocks ::1 IPv6 loopback", () => {
    expect(isTrustedExternalUrl("https://[::1]/")).toBe(false);
  });
  it("blocks IPv4-mapped IPv6 loopback (H-004)", () => {
    expect(isTrustedExternalUrl("https://[::ffff:127.0.0.1]/")).toBe(false);
    expect(isTrustedExternalUrl("https://[::ffff:192.168.1.1]/")).toBe(false);
  });
  it("blocks IPv6 link-local addresses (H-004)", () => {
    expect(isTrustedExternalUrl("https://[fe80::1]/")).toBe(false);
    expect(isTrustedExternalUrl("https://[fe80::1%25eth0]/")).toBe(false);
  });
  it("blocks short-form IPv4 loopback and private ranges (H-004)", () => {
    expect(isTrustedExternalUrl("https://127.1/")).toBe(false);
    expect(isTrustedExternalUrl("https://10.1/")).toBe(false);
  });
  it("rejects malformed URLs", () => {
    expect(isTrustedExternalUrl("not-a-url")).toBe(false);
  });
  it("blocks '0' hostname", () => {
    expect(isTrustedExternalUrl("https://0/")).toBe(false);
  });
  it("blocks '::' unspecified address", () => {
    expect(isTrustedExternalUrl("https://[::]/")).toBe(false);
  });
  it("blocks full IPv6 loopback 0:0:0:0:0:0:0:1", () => {
    expect(isTrustedExternalUrl("https://[0:0:0:0:0:0:0:1]/")).toBe(false);
  });
});
