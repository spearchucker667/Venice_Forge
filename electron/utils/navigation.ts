import fs from "fs";
import path from "path";

/**
 * Core containment check: resolves symlinks via realpath and verifies that
 * targetPath is either root/index.html or strictly inside root.
 */
export function checkPathContained(targetPath: string, rootPath: string): boolean {
  let resolvedTarget: string;
  try {
    resolvedTarget = fs.realpathSync(path.normalize(targetPath));
  } catch {
    if (process.platform !== "win32") return false;
    resolvedTarget = path.resolve(path.normalize(targetPath));
  }
  let resolvedRoot: string;
  try {
    resolvedRoot = fs.realpathSync(path.normalize(rootPath));
  } catch {
    if (process.platform !== "win32") return false;
    resolvedRoot = path.resolve(path.normalize(rootPath));
  }
  const indexHtml = path.join(resolvedRoot, "index.html");
  if (process.platform === "win32") {
    return resolvedTarget.toLowerCase() === indexHtml.toLowerCase() ||
      resolvedTarget.toLowerCase().startsWith(`${resolvedRoot.toLowerCase()}${path.sep}`);
  }
  return resolvedTarget === indexHtml || resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`);
}
