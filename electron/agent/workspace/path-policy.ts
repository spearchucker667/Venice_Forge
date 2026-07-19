import fs from "node:fs";
import path from "node:path";

export class PathPolicyError extends Error {
  constructor(readonly code: "INVALID_PATH" | "PATH_OUTSIDE_WORKSPACE" | "SYMLINK_ESCAPE" | "UNSUPPORTED_FILE_TYPE", message: string) {
    super(message);
    this.name = "PathPolicyError";
  }
}

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;

export function assertRelativeWorkspacePath(input: string, allowRoot = false): string {
  if (typeof input !== "string" || input.length > 500 || (!allowRoot && input.length === 0)) {
    throw new PathPolicyError("INVALID_PATH", "Workspace paths must be bounded relative paths.");
  }
  if (input.includes("\0") || input.startsWith("~") || /%2e|%2f|%5c/i.test(input)) {
    throw new PathPolicyError("INVALID_PATH", "Encoded, home-relative, or null-containing paths are forbidden.");
  }
  if (path.posix.isAbsolute(input) || path.win32.isAbsolute(input) || /^[a-zA-Z]:/.test(input)
    || input.startsWith("\\\\") || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(input)) {
    throw new PathPolicyError("INVALID_PATH", "Absolute, device, UNC, and URI paths are forbidden.");
  }
  if (input === "" && allowRoot) return "";
  const segments = input.replaceAll("\\", "/").split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === ".." || WINDOWS_RESERVED.test(segment)
    || segment.includes(":") || /[. ]$/.test(segment))) {
    throw new PathPolicyError("INVALID_PATH", "The workspace path contains a forbidden segment.");
  }
  return segments.join(path.sep);
}

export function isPathInside(rootRealPath: string, candidateRealPath: string, allowRoot = false): boolean {
  const relative = path.relative(rootRealPath, candidateRealPath);
  if (relative === "") return allowRoot;
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

async function assertNoSymlinkComponents(rootReal: string, relativePath: string): Promise<void> {
  let current = rootReal;
  for (const segment of relativePath.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    try {
      const stat = await fs.promises.lstat(current);
      if (stat.isSymbolicLink()) throw new PathPolicyError("SYMLINK_ESCAPE", "Workspace symlinks are not followed.");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
  }
}

export async function resolveExistingWorkspacePath(rootPath: string, relativeInput: string, allowRoot = false): Promise<string> {
  const relativePath = assertRelativeWorkspacePath(relativeInput, allowRoot);
  const rootReal = await fs.promises.realpath(rootPath);
  await assertNoSymlinkComponents(rootReal, relativePath);
  const candidateReal = await fs.promises.realpath(path.join(rootReal, relativePath));
  if (!isPathInside(rootReal, candidateReal, allowRoot)) {
    throw new PathPolicyError("PATH_OUTSIDE_WORKSPACE", "The path is outside the granted workspace.");
  }
  const stat = await fs.promises.stat(candidateReal);
  if (!stat.isFile() && !stat.isDirectory()) {
    throw new PathPolicyError("UNSUPPORTED_FILE_TYPE", "Only regular files and directories are supported.");
  }
  return candidateReal;
}

export async function resolveNewWorkspacePath(rootPath: string, relativeInput: string): Promise<string> {
  const relativePath = assertRelativeWorkspacePath(relativeInput);
  const rootReal = await fs.promises.realpath(rootPath);
  await assertNoSymlinkComponents(rootReal, relativePath);
  let parent = path.dirname(path.join(rootReal, relativePath));
  while (true) {
    try {
      const parentReal = await fs.promises.realpath(parent);
      if (!isPathInside(rootReal, parentReal, true)) {
        throw new PathPolicyError("PATH_OUTSIDE_WORKSPACE", "The target parent is outside the granted workspace.");
      }
      return path.join(rootReal, relativePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const next = path.dirname(parent);
      if (next === parent) throw new PathPolicyError("PATH_OUTSIDE_WORKSPACE", "No authorized target parent exists.");
      parent = next;
    }
  }
}
