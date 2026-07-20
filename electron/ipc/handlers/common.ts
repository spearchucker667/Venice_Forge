/** @fileoverview Shared IPC handler utilities used by the domain-specific
 *  handler modules. */

import { ipcMain, type WebContents } from "electron";
import { rateLimitIpcHandler } from "../../utils/rateLimit";

const registeredChannels = new Set<string>();

/** Registers an IPC channel with the rate-limit wrapper applied. */
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

export function clearRegisteredChannelsForTesting(): void {
  registeredChannels.clear();
}
/** Safely sends a payload to a renderer process, returning false if the
 *  WebContents has already been destroyed.
 */
export function safeSendToRenderer(sender: WebContents, channel: string, payload: unknown): boolean {
  if (sender.isDestroyed()) return false;
  try {
    sender.send(channel, payload);
    return true;
  } catch {
    return false;
  }
}
