/** @fileoverview Central IPC handler registration. Combines domain-specific
 *  handlers and preserves the idempotent registration guard. */

import { registerUpdateHandlers } from "../updates";
import { registerConfigIpcHandlers } from "../configHandlers";
import { registerRpIpcHandlers } from "../rpHandlers";
import { registerVeniceHandlers } from "./veniceHandlers";
import { registerApiKeyHandlers } from "./apiKeyHandlers";
import { registerJinaHandlers } from "./jinaHandlers";
import { registerFileHandlers } from "./fileHandlers";
import { registerSystemHandlers } from "./systemHandlers";
import { registerSyncHandlers } from "./syncHandlers";
import { registerBackgroundTaskHandlers } from "./backgroundTaskHandlers";
import { registerChatTtsHandlers } from "./chatTtsHandlers";
import { registerCharacterCardFileHandlers } from "../characterCardFileHandlers";

let ipcHandlersRegistered = false;

/** Returns whether the IPC handlers have already been registered. */
export function isIpcHandlersRegistered(): boolean {
  return ipcHandlersRegistered;
}

/** Registers all IPC handlers used by the renderer process. Idempotent. */
export function registerIpcHandlers(): void {
  if (ipcHandlersRegistered) return;
  ipcHandlersRegistered = true;

  registerUpdateHandlers();

  registerVeniceHandlers();
  registerApiKeyHandlers();
  registerJinaHandlers();
  registerFileHandlers();
  registerSystemHandlers();
  registerSyncHandlers();
  registerChatTtsHandlers();
  registerCharacterCardFileHandlers();

  // ── Background task manager (persistent main-process queue ownership) ──
  registerBackgroundTaskHandlers();

  // ── Config (local master YAML) ──
  // SECURITY: The renderer never receives raw API keys. The sanitized view
  // exposes only booleans indicating key presence. The `writeSanitized` path
  // refuses to persist plaintext keys — it only updates non-secret values.
  registerConfigIpcHandlers();

  // ── Character Roleplay Studio (local-first) ──
  // See `electron/ipc/rpHandlers.ts` for the channel set.
  // Synchronous import — handler registration must complete before this
  // function returns so the renderer never sees a "no handler" rejection
  // when the user clicks into the RP tab immediately on launch.
  registerRpIpcHandlers();
}
