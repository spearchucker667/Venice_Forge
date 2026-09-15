// @vitest-environment node
/** @fileoverview Unit tests for central IPC sender validation. */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

let isPackaged = false;

vi.mock("electron", () => ({
  app: {
    get isPackaged() {
      return isPackaged;
    },
  },
}));

import {
  isTrustedIpcSender,
  validateIpcSender,
  setTrustedIpcOriginsForTesting,
  setRendererRootForTesting,
} from "./validateIpcSender";

function makeEvent(url: string | undefined): Electron.IpcMainInvokeEvent {
  return {
    senderFrame: url ? { url } : undefined,
    sender: { getURL: () => url } as unknown as Electron.WebContents,
  } as unknown as Electron.IpcMainInvokeEvent;
}

function makeEventWithSenderUrl(url: string | undefined): Electron.IpcMainInvokeEvent {
  return {
    senderFrame: undefined,
    sender: { getURL: () => url } as unknown as Electron.WebContents,
  } as unknown as Electron.IpcMainInvokeEvent;
}

const tempRendererRoot = fs.mkdtempSync(path.join(os.tmpdir(), "vf-validate-sender-root-"));
fs.writeFileSync(path.join(tempRendererRoot, "index.html"), "<html></html>");

describe("validateIpcSender", () => {
  beforeEach(() => {
    isPackaged = false;
    setTrustedIpcOriginsForTesting([]);
    setRendererRootForTesting(undefined);
  });

  afterEach(() => {
    setRendererRootForTesting(undefined);
  });

  afterAll(() => {
    try {
      fs.rmSync(tempRendererRoot, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup.
    }
  });

  describe("development (app.isPackaged === false)", () => {
    it("trusts the Vite dev server origin", () => {
      expect(isTrustedIpcSender(makeEvent("http://localhost:5173/"))).toBe(true);
      expect(isTrustedIpcSender(makeEvent("http://localhost:5173/src/main.tsx"))).toBe(true);
    });

    it("rejects a trusted top-level URL when senderFrame identity is absent", () => {
      expect(isTrustedIpcSender(makeEventWithSenderUrl("http://localhost:5173/"))).toBe(false);
    });

    it("rejects untrusted HTTP origins", () => {
      expect(isTrustedIpcSender(makeEvent("http://evil.com/"))).toBe(false);
      expect(isTrustedIpcSender(makeEvent("http://localhost:5174/"))).toBe(false);
    });

    it("rejects untrusted HTTPS origins", () => {
      expect(isTrustedIpcSender(makeEvent("https://evil.com/"))).toBe(false);
      expect(isTrustedIpcSender(makeEvent("https://localhost:5173/"))).toBe(false);
    });

    it("rejects file:// and data: URLs", () => {
      expect(isTrustedIpcSender(makeEvent("file:///etc/passwd"))).toBe(false);
      expect(isTrustedIpcSender(makeEvent("data:text/html,hello"))).toBe(false);
    });

    it("rejects missing senderFrame and sender URL", () => {
      expect(isTrustedIpcSender(makeEvent(undefined))).toBe(false);
    });

    it("throws from validateIpcSender for untrusted senders", () => {
      expect(() => validateIpcSender(makeEvent("http://evil.com/"))).toThrow(/untrusted/i);
    });

    it("allows test-origins via setTrustedIpcOriginsForTesting", () => {
      setTrustedIpcOriginsForTesting(["http://test.example/"]);
      expect(isTrustedIpcSender(makeEvent("http://test.example/"))).toBe(true);
      expect(isTrustedIpcSender(makeEvent("http://evil.com/"))).toBe(false);
    });
  });

  describe("production (app.isPackaged === true)", () => {
    beforeEach(() => {
      isPackaged = true;
    });

    it("rejects loopback origins", () => {
      expect(isTrustedIpcSender(makeEvent("http://127.0.0.1:5173/"))).toBe(false);
      expect(isTrustedIpcSender(makeEvent("http://localhost:5173/"))).toBe(false);
      expect(isTrustedIpcSender(makeEvent("http://[::1]:5173/"))).toBe(false);
    });

    it("rejects non-file origins", () => {
      expect(isTrustedIpcSender(makeEvent("http://evil.com/"))).toBe(false);
      expect(isTrustedIpcSender(makeEvent("https://evil.com/"))).toBe(false);
      expect(isTrustedIpcSender(makeEvent("data:text/html,hello"))).toBe(false);
    });

    it("rejects file:// URLs outside the renderer root", () => {
      expect(isTrustedIpcSender(makeEvent("file:///etc/passwd"))).toBe(false);
      expect(isTrustedIpcSender(makeEvent("file:///var/tmp/outside-renderer/index.html"))).toBe(false);
    });

    it("rejects file://localhost URLs", () => {
      expect(isTrustedIpcSender(makeEvent("file://localhost/etc/passwd"))).toBe(false);
    });

    it("allows test-origins via setTrustedIpcOriginsForTesting", () => {
      setTrustedIpcOriginsForTesting(["file:///trusted/index.html"]);
      expect(isTrustedIpcSender(makeEvent("file:///trusted/index.html"))).toBe(true);
      expect(isTrustedIpcSender(makeEvent("file:///etc/passwd"))).toBe(false);
    });

    it("accepts file:// URLs inside the renderer root", () => {
      setRendererRootForTesting(tempRendererRoot);
      expect(isTrustedIpcSender(makeEvent(`file://${path.join(tempRendererRoot, "index.html")}`))).toBe(true);
      expect(isTrustedIpcSender(makeEvent(`file://${path.join(tempRendererRoot, "..", "evil.html")}`))).toBe(false);
    });
  });
});
