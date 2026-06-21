/** @fileoverview Back-compat barrel re-exporting IPC handler registration.
 *  New code should prefer `electron/ipc/handlers/index.ts`. */

export { registerIpcHandlers, isIpcHandlersRegistered } from "./handlers/index";
