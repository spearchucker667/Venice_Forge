/**
 * SAFETY CONTRACT:
 * - Electron Venice requests route through the desktop IPC layer
 *   (`electron/ipc/handlers.ts`).
 * - Electron IPC handlers use `electron/services/guardPipeline.ts` and the
 *   main-process runtime Family Safe Mode setting
 *   (`electron/services/runtimeSafetySettings.ts`) as the authoritative
 *   local filter state. This file MUST NOT run a duplicate renderer-side
 *   guard in Electron mode.
 * - The renderer-supplied `localFamilySafeModeEnabled` field is
 *   intentionally NOT consulted for Electron enforcement — the canonical
 *   toggle lives in the main process.
 * - Web mode (non-Electron) does run a renderer-side local guard via
 *   `maybeRunLocalFamilyGuard` in `src/services/veniceClient.ts`. The
 *   Express proxy in `server.ts` is the fail-closed backstop.
 * - All new functions in this file MUST route through `desktopVenice`
 *   (from `src/services/desktopBridge.ts`) so the IPC layer can enforce.
 *   Direct `fetch()` calls to Venice are forbidden.
 */
export {
  VeniceAPIError,
  venice,
  veniceBlob,
  veniceFormData,
} from "../services/veniceClient";

import {
  veniceStreamChat as canonicalVeniceStreamChat,
} from "../services/veniceClient";

/**
 * Thin compatibility wrapper around the canonical `veniceStreamChat` in
 * `src/services/veniceClient.ts`. The `path` argument is accepted for
 * back-compat but is normalized to `/chat/completions` by the canonical
 * implementation.
 */
export async function veniceStreamChat(
  path: string,
  body: unknown,
  onDelta: (chunk: { content: string; reasoning?: string }) => void,
  init: { signal?: AbortSignal } = {}
) {
  void path; // preserved for API compat; canonical endpoint is /chat/completions
  return canonicalVeniceStreamChat(body, {
    signal: init.signal,
    onDelta,
  });
}
