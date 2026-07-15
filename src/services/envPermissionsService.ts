// src/services/envPermissionsService.ts
// AUDIT-026: local .env credential-file permission guard.
// Pure module — no side effects on import, no Electron / Express dependencies.
// Designed so a unit test can drive every code path with a stubbed env + cwd.
//
// Behaviour:
//   * Pure helpers — `analyseEnvFile(stats, envSnapshot, platform, ownerUid, authedUid)`
//     returns either { ok: true } or { ok: false, reason } describing the issue.
//   * Side-effect driver — `assessLocalEnvFilePermissions()` reads the live
//     environment, performs the analysis, optionally chmod's the file (only
//     when explicitly opted in via env flag), and emits warnings through the
//     shared logger. Never rotates or rewrites secret values — the API key
//     itself is sacred, only the file mode is touched.
//
// POSIX-only. On Windows we skip the check entirely rather than mis-report.

import * as fs from "node:fs";
import * as path from "node:path";
import { warn } from "../shared/logger";

export interface EnvPermissionsAnalysis {
  ok: boolean;
  reason?:
    | "missing-file"
    | "skipped-non-posix"
    | "skipped-empty-stats"
    | "skipped-stat-error"
    | "skipped-narrow-mode"
    | "permissive-with-secret"
    | "permissive-without-secret";
  modeBits?: number;
  path?: string;
  hasLoadedSecret?: boolean;
  /** True when chmod was applied during this assessment. */
  autoChmodApplied?: boolean;
}

export interface EnvPermissionsContext {
  platform: NodeJS.Platform;
  cwd: string;
  /** Patched through for testability — defaults to fs.existsSync. */
  fileExists?: (candidate: string) => boolean;
  /** Patched through for testability — defaults to fs.statSync. */
  stat?: (candidate: string) => Pick<fs.Stats, "mode" | "uid">;
  /** Patched through for testability — defaults to fs.chmodSync. */
  chmod?: (candidate: string, mode: number) => void;
  /** Stubbed getuid — defaults to process.getuid?.() if available. */
  uid?: number;
  /** Snapshot of secret-bearing env vars. */
  envSnapshot: Record<string, string | undefined>;
  /** Audit hook called once per assessment (for tests). */
  onWarn?: (message: string) => void;
  /** Opt-in auto-chmod (defaults to false). */
  autoChmodEnvFlag?: string;
  /** True when the env flag's auto-chmod is enabled for this run. */
  autoChmodEnabled?: boolean;
}

export function analyseEnvFile(
  candidatePath: string,
  ctx: EnvPermissionsContext,
): EnvPermissionsAnalysis {
  if (ctx.platform === "win32") {
    return { ok: true, reason: "skipped-non-posix", path: candidatePath };
  }
  const fileExists = ctx.fileExists ?? ((p: string) => fs.existsSync(p));
  if (!fileExists(candidatePath)) {
    return { ok: true, reason: "missing-file", path: candidatePath };
  }
  let stats: Pick<fs.Stats, "mode" | "uid">;
  try {
    stats = (ctx.stat ?? fs.statSync)(candidatePath);
  } catch {
    return { ok: true, reason: "skipped-stat-error", path: candidatePath };
  }
  const modeBits = stats.mode & 0o777;
  const groupBits = (modeBits >> 3) & 0o7;
  const otherBits = modeBits & 0o7;
  if (groupBits === 0 && otherBits === 0) {
    return { ok: true, reason: "skipped-narrow-mode", path: candidatePath, modeBits };
  }

  const envSnapshot = ctx.envSnapshot ?? {};
  const hasLoadedSecret =
    Boolean(envSnapshot.VENICE_API_KEY?.trim()) ||
    Boolean(envSnapshot.JINA_API_KEY?.trim());

  if (!hasLoadedSecret) {
    return {
      ok: true,
      reason: "permissive-without-secret",
      path: candidatePath,
      modeBits,
      hasLoadedSecret: false,
    };
  }

  return {
    ok: false,
    reason: "permissive-with-secret",
    path: candidatePath,
    modeBits,
    hasLoadedSecret: true,
  };
}

export function assessLocalEnvFilePermissions(
  ctx: Partial<EnvPermissionsContext> & { envSnapshot: Record<string, string | undefined> },
): EnvPermissionsAnalysis {
  const platform = ctx.platform ?? process.platform;
  const cwd = ctx.cwd ?? process.cwd();
  const candidates = [path.resolve(cwd, ".env"), path.resolve(".env")];
  // Pick the first existing file, mirroring the production behaviour.
  const fileExists = ctx.fileExists ?? ((p: string) => fs.existsSync(p));
  const target = candidates.find(fileExists);
  if (!target) {
    return { ok: true, reason: "missing-file" };
  }

  const result = analyseEnvFile(target, {
    platform,
    cwd,
    fileExists,
    stat: ctx.stat,
    uid: ctx.uid,
    envSnapshot: ctx.envSnapshot,
  });
  if (result.ok) return result;

  const autoChmodEnabled =
    ctx.autoChmodEnabled ?? process.env[ctx.autoChmodEnvFlag ?? "VENICE_FORGE_AUTOCHMOD_LOCAL_ENV"] === "true";
  const ownerUid = ctx.uid ?? process.getuid?.();
  if (autoChmodEnabled && ownerUid !== undefined) {
    try {
      if (ctx.chmod) {
        ctx.chmod(target, 0o600);
      } else {
        fs.chmodSync(target, 0o600);
      }
      const message = [
        `[AUDIT-026] Tightened ${target} permissions to 0600 because it contained a Venice/Jina key.`,
        "Rotate the key if it was exposed by a previous world-readable state.",
      ].join(" ");
      ctx.onWarn?.(message);
      try {
        warn(message);
      } catch {
        /* logger may not be available in some test harnesses */
      }
      return { ...result, ok: true, autoChmodApplied: true };
    } catch (err) {
      const warnMessage = `[AUDIT-026] Could not tighten ${target} to 0600: ${(err as Error).message}`;
      ctx.onWarn?.(warnMessage);
      try {
        warn(warnMessage);
      } catch {
        /* fall through */
      }
      // fall through to the explicit warn below
    }
  }

  const explicitWarn = [
    `[AUDIT-026] ${target} is world/group readable (mode ${(result.modeBits ?? 0)
      .toString(8)
      .padStart(3, "0")}) but contains a Venice or Jina key.`,
    `Run \`chmod 600 ${path.basename(target)}\` and rotate the key.`,
    "The key value is NOT auto-replaced; explicit rotation must happen at the upstream provider.",
  ].join(" ");
  ctx.onWarn?.(explicitWarn);
  try {
    warn(explicitWarn);
  } catch {
    /* logger fallback */
  }
  return result;
}

/** Top-level side-effect driver used by `server.ts`. */
export function checkLocalEnvFilePermissionsOnce(): EnvPermissionsAnalysis {
  return assessLocalEnvFilePermissions({
    envSnapshot: {
      VENICE_API_KEY: process.env["VENICE_API_KEY"],
      JINA_API_KEY: process.env["JINA_API_KEY"],
    },
  });
}
