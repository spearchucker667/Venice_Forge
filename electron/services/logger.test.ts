// @vitest-environment node

/** @fileoverview Unit tests for Electron main-process logger rotation. */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn(() => os.tmpdir()),
  },
  shell: {
    openPath: vi.fn(),
  },
}));

import { ensureLogFile, getLogPath, logInfo, logError, getLastApiError, setLastApiError } from "./logger";

const TEST_LOG = getLogPath();

function cleanLogs() {
  for (const p of [TEST_LOG, `${TEST_LOG}.1`, `${TEST_LOG}.2`, `${TEST_LOG}.3`]) {
    try { fs.unlinkSync(p); } catch { /* ignore */ }
  }
}

describe("logger rotation", () => {
  beforeEach(() => {
    cleanLogs();
    fs.mkdirSync(path.dirname(TEST_LOG), { recursive: true });
  });
  afterEach(() => cleanLogs());

  it("creates a .1 backup when log exceeds max size", () => {
    // Pre-seed log file to just over the 1 MiB limit
    const oversized = "x".repeat(1024 * 1024 + 1);
    fs.writeFileSync(TEST_LOG, oversized, "utf-8");
    ensureLogFile();
    expect(fs.existsSync(`${TEST_LOG}.1`)).toBe(true);
    expect(fs.existsSync(TEST_LOG)).toBe(false);
  });

  it("shifts backups through a 3-file ring", () => {
    // Seed .1 and current log so both are oversized
    fs.writeFileSync(`${TEST_LOG}.1`, "old1", "utf-8");
    const oversized = "x".repeat(1024 * 1024 + 1);
    fs.writeFileSync(TEST_LOG, oversized, "utf-8");
    ensureLogFile();
    expect(fs.readFileSync(`${TEST_LOG}.1`, "utf-8")).toBe(oversized);
    expect(fs.readFileSync(`${TEST_LOG}.2`, "utf-8")).toBe("old1");
  });

  it("replaces the oldest backup when the 3-file ring is full", () => {
    fs.writeFileSync(`${TEST_LOG}.1`, "old1", "utf-8");
    fs.writeFileSync(`${TEST_LOG}.2`, "old2", "utf-8");
    fs.writeFileSync(`${TEST_LOG}.3`, "old3", "utf-8");
    const oversized = "x".repeat(1024 * 1024 + 1);
    fs.writeFileSync(TEST_LOG, oversized, "utf-8");

    ensureLogFile();

    expect(fs.readFileSync(`${TEST_LOG}.1`, "utf-8")).toBe(oversized);
    expect(fs.readFileSync(`${TEST_LOG}.2`, "utf-8")).toBe("old1");
    expect(fs.readFileSync(`${TEST_LOG}.3`, "utf-8")).toBe("old2");
  });
});

// VERIFY-061: main-process logs must redact secrets and local paths.
describe("logger redaction", () => {
  beforeEach(() => {
    cleanLogs();
    fs.mkdirSync(path.dirname(TEST_LOG), { recursive: true });
  });
  afterEach(() => cleanLogs());

  it("redacts bearer tokens from log messages", () => {
    logInfo("upstream error", "Authorization: Bearer vn-secret-token");
    const log = fs.readFileSync(TEST_LOG, "utf-8");
    expect(log).toContain("Bearer [REDACTED]");
    expect(log).not.toContain("vn-secret-token");
  });

  it("redacts OpenAI-compatible sk- keys from log messages", () => {
    logInfo("provider error", "api_key=sk-live-1234567890abcdef");
    const log = fs.readFileSync(TEST_LOG, "utf-8");
    expect(log).toContain("[REDACTED]");
    expect(log).not.toContain("sk-live-1234567890abcdef");
  });

  it("redacts local file paths from log messages", () => {
    logError("failed to read", "/Users/somebody/Projects/Windows-Venice-API-connector/.env");
    const log = fs.readFileSync(TEST_LOG, "utf-8");
    expect(log).toContain("[REDACTED-PATH]");
    expect(log).not.toContain("/Users/somebody/Projects/Windows-Venice-API-connector/.env");
  });

  it("redacts secrets inside metadata objects", () => {
    logInfo("request", { headers: { Authorization: "Bearer vn-abc123" }, body: { apiKey: "sk-xyz" } });
    const log = fs.readFileSync(TEST_LOG, "utf-8");
    expect(log).not.toContain("vn-abc123");
    expect(log).not.toContain("sk-xyz");
  });

  it("redacts the last API error", () => {
    setLastApiError(new Error("Request failed: Bearer vn-leaked-token"));
    expect(getLastApiError()).toContain("Bearer [REDACTED]");
    expect(getLastApiError()).not.toContain("vn-leaked-token");
  });
});
