/** @fileoverview Shared IPC handler utilities used by the domain-specific
 *  handler modules. */

import { ipcMain, type IpcMainInvokeEvent, type WebContents, type WebFrameMain } from "electron";
import { rateLimitIpcHandler } from "../../utils/rateLimit";
import { validateIpcSender } from "../../utils/validateIpcSender";

const registeredChannels = new Set<string>();

/** Registers an IPC channel with the rate-limit wrapper applied.
 *
 *  Use this for non-privileged channels that do not require sender-frame
 *  validation. All channels that touch secrets, config, files, provider
 *  dispatch, paid generation, sync, documents, passwords, background tasks,
 *  or media must use {@link registerPrivilegedIpcChannel} instead. */
export function registerIpcChannel(
  channel: string,
  handler: Parameters<typeof ipcMain.handle>[1],
): void {
  if (registeredChannels.has(channel)) {
    throw new Error(`IPC channel "${channel}" is already registered. Duplicate registration is not allowed.`);
  }
  registeredChannels.add(channel);
  ipcMain.handle(channel, rateLimitIpcHandler(channel, handler));
}

/** Registers a privileged IPC channel with sender validation followed by the
 *  rate-limit wrapper. Untrusted renderer frames receive an immediate error
 *  before the handler or rate-limit bucket is touched. */
export interface PrivilegedIpcOptions {
  requireMainFrame?: boolean;
  rateLimitedResponse?: () => unknown;
}

export function registerPrivilegedIpcChannel(
  channel: string,
  handler: Parameters<typeof ipcMain.handle>[1],
  options: PrivilegedIpcOptions = {},
): void {
  if (registeredChannels.has(channel)) {
    throw new Error(`IPC channel "${channel}" is already registered. Duplicate registration is not allowed.`);
  }
  registeredChannels.add(channel);

  const rateLimitedHandler = rateLimitIpcHandler(channel, handler, options.rateLimitedResponse);
  const wrappedHandler = async (event: IpcMainInvokeEvent, ...args: unknown[]) => {
    validateIpcSender(event);
    if (options.requireMainFrame) {
      const frame = event.senderFrame;
      const mainFrame = event.sender.mainFrame;
      if (!frame || !mainFrame || frame !== mainFrame) {
        return { ok: false, error: "Sender frame was rejected." };
      }
    }
    return rateLimitedHandler(event, ...args);
  };

  ipcMain.handle(channel, wrappedHandler as Parameters<typeof ipcMain.handle>[1]);
}

export function clearRegisteredChannelsForTesting(): void {
  registeredChannels.clear();
}

/** Safely sends a payload to a renderer process or specific frame, returning false if the
 *  target has already been destroyed (VF-AUD-20260912-DR-001).
 */
export function safeSendToRenderer(
  sender: WebContents,
  channel: string,
  payload: unknown,
  frame?: WebFrameMain | null,
): boolean {
  if (frame && typeof frame.send === "function") {
    try {
      if (typeof frame.isDestroyed === "function" && frame.isDestroyed()) {
        return false;
      }
      frame.send(channel, payload);
      return true;
    } catch {
      return false;
    }
  }
  if (sender.isDestroyed()) return false;
  try {
    sender.send(channel, payload);
    return true;
  } catch {
    return false;
  }
}
