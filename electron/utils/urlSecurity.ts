/** @fileoverview Thin re-export of the shared URL security utilities.
 *
 *  The canonical implementation lives in `src/shared/urlSecurity.ts` so that
 *  the Express proxy (`server.ts`) does not depend on an `electron/` path.
 *  Electron modules should prefer importing from here for locality, but the
 *  shared module is the source of truth.
 */

export { isPrivateHostname, isTrustedExternalUrl } from "../../src/shared/urlSecurity";
