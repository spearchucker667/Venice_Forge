import fs from "fs";
import path from "path";

function existsCaseInsensitive(p: string): boolean {
  if (fs.existsSync(p)) return true;

  const normalized = path.normalize(p);
  const segments = normalized.split(path.sep);

  let current = "";
  let startIndex = 0;

  if (path.isAbsolute(normalized)) {
    if (process.platform === "win32" || p.includes(":")) {
      current = segments[0] + path.sep;
      startIndex = 1;
    } else {
      current = "/";
      startIndex = 1;
    }
  } else {
    current = ".";
    startIndex = 0;
  }

  for (let i = startIndex; i < segments.length; i++) {
    const segment = segments[i];
    if (!segment) continue;

    try {
      const children = fs.readdirSync(current);
      const matched = children.find(child => child.toLowerCase() === segment.toLowerCase());
      if (!matched) return false;
      current = path.join(current, matched);
    } catch {
      return false;
    }
  }
  return true;
}

/**
 * Core containment check: resolves symlinks via realpath and verifies that
 * targetPath is either root/index.html or strictly inside root.
 */
export function checkPathContained(targetPath: string, rootPath: string): boolean {
  if (!existsCaseInsensitive(targetPath) || !existsCaseInsensitive(rootPath)) {
    return false;
  }

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
