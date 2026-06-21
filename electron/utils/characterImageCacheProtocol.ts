import path from "node:path";
import { fileURLToPath } from "node:url";

const DEV_RENDERER_ORIGIN = "http://localhost:5173";

interface CharacterImageCacheProtocolAccessInput {
  isDev: boolean;
  origin: string | null | undefined;
  referrer: string | null | undefined;
  rendererRoot: string;
}

function pathIsInsideOrEqual(childPath: string, parentPath: string): boolean {
  const parent = path.resolve(parentPath);
  const child = path.resolve(childPath);
  const isWin = process.platform === "win32";
  const normalizedParent = isWin ? parent.toLowerCase() : parent;
  const normalizedChild = isWin ? child.toLowerCase() : child;
  if (normalizedChild === normalizedParent) return true;
  const relative = path.relative(normalizedParent, normalizedChild);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function isAllowedRendererReferrer(
  referrer: string | null | undefined,
  isDev: boolean,
  rendererRoot: string,
): boolean {
  if (!referrer) return false;

  try {
    const parsed = new URL(referrer);
    if (isDev) {
      return parsed.origin === DEV_RENDERER_ORIGIN;
    }
    if (parsed.protocol !== "file:") return false;
    return pathIsInsideOrEqual(fileURLToPath(parsed), rendererRoot);
  } catch {
    return false;
  }
}

/** Returns true when a custom-protocol request was initiated by the app renderer.
 *
 * Electron image loads may omit both Origin and Referer. Those requests remain
 * allowed so the packaged renderer does not lose cached avatars. Requests with
 * explicit browser provenance are constrained to the Venice Forge renderer.
 */
export function isAllowedCharacterImageCacheProtocolAccess(
  input: CharacterImageCacheProtocolAccessInput,
): boolean {
  const origin = input.origin?.trim() ?? "";
  const referrer = input.referrer?.trim() ?? "";

  if (!origin) {
    return referrer.length === 0 || isAllowedRendererReferrer(referrer, input.isDev, input.rendererRoot);
  }

  if (input.isDev && origin === DEV_RENDERER_ORIGIN) {
    return referrer.length === 0 || isAllowedRendererReferrer(referrer, input.isDev, input.rendererRoot);
  }

  if (origin === "null") {
    return isAllowedRendererReferrer(referrer, input.isDev, input.rendererRoot);
  }

  return false;
}
