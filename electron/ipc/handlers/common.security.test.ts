// @vitest-environment node
/** @fileoverview Adversarial end-to-end regression tests for privileged IPC
 *  sender validation.
 *
 *  These tests prove that `registerPrivilegedIpcChannel` rejects invocations
 *  from untrusted renderer frames before the handler body (or rate-limit
 *  bucket) is touched, and that trusted dev/production frames are accepted.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

let isPackaged = false;

vi.mock("electron", () => ({
  app: {
    get isPackaged() {
      return isPackaged;
    },
    getPath: vi.fn((name: string) => {
      if (name === "userData") return path.join(os.tmpdir(), "vf-test-data");
      return os.tmpdir();
    }),
    getVersion: vi.fn(() => "1.0.0-test"),
  },
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      capturedHandlers.set(channel, handler);
    }),
  },
  BrowserWindow: {
    getAllWindows: vi.fn(() => []),
  },
}));

import {
  registerPrivilegedIpcChannel,
  clearRegisteredChannelsForTesting,
} from "./common";
import {
  setTrustedIpcOriginsForTesting,
  setRendererRootForTesting,
} from "../../utils/validateIpcSender";
import { resetIpcRateLimitForTests } from "../../utils/rateLimit";

const capturedHandlers = new Map<string, (...args: unknown[]) => unknown>();

const TEST_CHANNEL = "test:privileged:secret";

function makeEvent(
  url: string | undefined,
  senderId = 1,
): Electron.IpcMainInvokeEvent {
  return {
    senderFrame: url ? { url } : undefined,
    sender: {
      id: senderId,
      getURL: () => url,
      isDestroyed: () => false,
    } as unknown as Electron.WebContents,
  } as unknown as Electron.IpcMainInvokeEvent;
}

function registerTestHandler(): { state: { ran: boolean }; reset: () => void } {
  const state = { ran: false };
  registerPrivilegedIpcChannel(TEST_CHANNEL, async () => {
    state.ran = true;
    return { ok: true, secret: "handler-ran" };
  });
  return {
    state,
    reset: () => {
      state.ran = false;
    },
  };
}

describe("registerPrivilegedIpcChannel sender validation", () => {
  let handlerState: { state: { ran: boolean }; reset: () => void };
  let tempRendererRoot: string;

  beforeEach(() => {
    isPackaged = false;
    capturedHandlers.clear();
    clearRegisteredChannelsForTesting();
    resetIpcRateLimitForTests();
    setTrustedIpcOriginsForTesting([]);
    setRendererRootForTesting(undefined);

    handlerState = registerTestHandler();
    handlerState.reset();

    tempRendererRoot = fs.mkdtempSync(path.join(os.tmpdir(), "vf-renderer-root-"));
    fs.mkdirSync(path.join(tempRendererRoot, "assets"), { recursive: true });
    fs.writeFileSync(path.join(tempRendererRoot, "index.html"), "<html></html>");
  });

  afterEach(() => {
    try {
      fs.rmSync(tempRendererRoot, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup.
    }
  });

  it("rejects an untrusted HTTP origin in development", async () => {
    const handler = capturedHandlers.get(TEST_CHANNEL)!;
    await expect(handler(makeEvent("http://evil.com/"))).rejects.toThrow(/untrusted/i);
    expect(handlerState.state.ran).toBe(false);
  });

  it("rejects https://localhost:5173/ in development", async () => {
    const handler = capturedHandlers.get(TEST_CHANNEL)!;
    await expect(handler(makeEvent("https://localhost:5173/"))).rejects.toThrow(/untrusted/i);
    expect(handlerState.state.ran).toBe(false);
  });

  it("rejects file:///etc/passwd in production", async () => {
    isPackaged = true;
    const handler = capturedHandlers.get(TEST_CHANNEL)!;
    await expect(handler(makeEvent("file:///etc/passwd"))).rejects.toThrow(/untrusted/i);
    expect(handlerState.state.ran).toBe(false);
  });

  it("rejects file://localhost/etc/passwd in production", async () => {
    isPackaged = true;
    const handler = capturedHandlers.get(TEST_CHANNEL)!;
    await expect(handler(makeEvent("file://localhost/etc/passwd"))).rejects.toThrow(/untrusted/i);
    expect(handlerState.state.ran).toBe(false);
  });

  it("rejects http://127.0.0.1:5173/ in production", async () => {
    isPackaged = true;
    const handler = capturedHandlers.get(TEST_CHANNEL)!;
    await expect(handler(makeEvent("http://127.0.0.1:5173/"))).rejects.toThrow(/untrusted/i);
    expect(handlerState.state.ran).toBe(false);
  });

  it("rejects data: URLs", async () => {
    const handler = capturedHandlers.get(TEST_CHANNEL)!;
    await expect(handler(makeEvent("data:text/html,hello"))).rejects.toThrow(/untrusted/i);
    expect(handlerState.state.ran).toBe(false);
  });

  it("rejects a missing senderFrame and missing sender URL", async () => {
    const handler = capturedHandlers.get(TEST_CHANNEL)!;
    await expect(handler(makeEvent(undefined))).rejects.toThrow(/untrusted/i);
    expect(handlerState.state.ran).toBe(false);
  });

  it("rejects a subframe-like URL outside the renderer root in production", async () => {
    isPackaged = true;
    setRendererRootForTesting(tempRendererRoot);
    const handler = capturedHandlers.get(TEST_CHANNEL)!;
    const evilPath = path.join(tempRendererRoot, "..", "evil.html");
    await expect(handler(makeEvent(`file://${evilPath}`))).rejects.toThrow(/untrusted/i);
    expect(handlerState.state.ran).toBe(false);
  });

  it("accepts the trusted dev origin and runs the handler", async () => {
    const handler = capturedHandlers.get(TEST_CHANNEL)!;
    const result = await handler(makeEvent("http://localhost:5173/"));
    expect(result).toEqual({ ok: true, secret: "handler-ran" });
    expect(handlerState.state.ran).toBe(true);
  });

  it("accepts a trusted production file inside the renderer root and runs the handler", async () => {
    isPackaged = true;
    setRendererRootForTesting(tempRendererRoot);
    const handler = capturedHandlers.get(TEST_CHANNEL)!;
    const trustedUrl = `file://${path.join(tempRendererRoot, "index.html")}`;
    const result = await handler(makeEvent(trustedUrl));
    expect(result).toEqual({ ok: true, secret: "handler-ran" });
    expect(handlerState.state.ran).toBe(true);
  });

  it("uses the senderFrame URL in preference to the sender fallback", async () => {
    const handler = capturedHandlers.get(TEST_CHANNEL)!;
    const event = {
      senderFrame: { url: "http://evil.com/" },
      sender: {
        id: 1,
        getURL: () => "http://localhost:5173/",
        isDestroyed: () => false,
      } as unknown as Electron.WebContents,
    } as unknown as Electron.IpcMainInvokeEvent;
    await expect(handler(event)).rejects.toThrow(/untrusted/i);
    expect(handlerState.state.ran).toBe(false);
  });

  it("rejects a trusted parent webContents URL when senderFrame is absent", async () => {
    const handler = capturedHandlers.get(TEST_CHANNEL)!;
    const trustedParentOnlyEvent = {
      senderFrame: undefined,
      sender: {
        id: 1,
        getURL: () => "http://localhost:5173/",
        isDestroyed: () => false,
      } as unknown as Electron.WebContents,
    } as unknown as Electron.IpcMainInvokeEvent;
    await expect(handler(trustedParentOnlyEvent)).rejects.toThrow(/untrusted/i);
    expect(handlerState.state.ran).toBe(false);
  });

  it("requires an affirmative main-frame match for main-frame-only channels", async () => {
    const channel = "test:privileged:main-frame-only";
    let calls = 0;
    registerPrivilegedIpcChannel(channel, async () => {
      calls += 1;
      return { ok: true };
    }, { requireMainFrame: true });
    const handler = capturedHandlers.get(channel)!;
    const frame = { url: "http://localhost:5173/" };
    const event = {
      senderFrame: frame,
      sender: { id: 1, mainFrame: null, getURL: () => frame.url, isDestroyed: () => false },
    } as unknown as Electron.IpcMainInvokeEvent;

    expect(await handler(event)).toEqual({ ok: false, error: "Sender frame was rejected." });
    expect(calls).toBe(0);

    (event.sender as unknown as { mainFrame: unknown }).mainFrame = { url: frame.url };
    expect(await handler(event)).toEqual({ ok: false, error: "Sender frame was rejected." });
    expect(calls).toBe(0);

    (event.sender as unknown as { mainFrame: unknown }).mainFrame = frame;
    expect(await handler(event)).toEqual({ ok: true });
    expect(calls).toBe(1);
  });
});
