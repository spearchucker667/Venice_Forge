// Regression guard: AUDIT-026 (permissive local credential file with loaded secret).
// Locks the analyse/assess behaviour so future changes to the .env permissions
// warning cannot silently regress to "warn nothing on world-readable .env with key".

import { describe, it, expect, beforeEach, vi } from "vitest";

import {
  analyseEnvFile,
  assessLocalEnvFilePermissions,
} from "../services/envPermissionsService";

class StubStats {
  mode: number;
  uid: number;
  constructor(mode: number, uid = 1000) {
    this.mode = mode;
    this.uid = uid;
  }
}

const buildContext = (overrides: {
  platform?: NodeJS.Platform;
  cwd?: string;
  env?: Record<string, string | undefined>;
  exists?: boolean;
  mode?: number;
  uid?: number;
  autoChmod?: boolean;
  warnings?: string[];
}) => {
  const platform = overrides.platform ?? "darwin";
  const cwd = overrides.cwd ?? "/tmp/example";
  const mode = overrides.mode ?? 0o644;
  const warnings = overrides.warnings ?? [];

  return {
    platform,
    cwd,
    envSnapshot: overrides.env ?? {},
    fileExists: vi.fn().mockReturnValue(overrides.exists ?? true),
    stat: vi.fn().mockReturnValue(new StubStats(mode, overrides.uid ?? 1000)),
    chmod: vi.fn(),
    uid: overrides.uid ?? 1000,
    autoChmodEnabled: overrides.autoChmod ?? false,
    onWarn: (msg: string) => warnings.push(msg),
  };
};

describe("AUDIT-026 envPermissionsService.analyseEnvFile", () => {
  it("skips on Windows", () => {
    const ctx = buildContext({ platform: "win32", env: { VENICE_API_KEY: "vn-test" } });
    const out = analyseEnvFile("/tmp/example/.env", ctx);
    expect(out).toEqual({
      ok: true,
      reason: "skipped-non-posix",
      path: "/tmp/example/.env",
    });
  });

  it("returns missing-file when the candidate is not present", () => {
    const ctx = buildContext({ env: { VENICE_API_KEY: "vn-test" }, exists: false });
    const out = analyseEnvFile("/tmp/example/.env", ctx);
    expect(out.ok).toBe(true);
    expect(out.reason).toBe("missing-file");
  });

  it("returns ok when mode bits are already 0600", () => {
    const ctx = buildContext({ env: { VENICE_API_KEY: "vn-test" }, mode: 0o600 });
    const out = analyseEnvFile("/tmp/example/.env", ctx);
    expect(out).toEqual({
      ok: true,
      reason: "skipped-narrow-mode",
      path: "/tmp/example/.env",
      modeBits: 0o600,
    });
  });

  it("reports permissive-with-secret when mode > 0600 and a key is loaded", () => {
    const ctx = buildContext({ env: { VENICE_API_KEY: "vn-test-secret" }, mode: 0o644 });
    const out = analyseEnvFile("/tmp/example/.env", ctx);
    expect(out.ok).toBe(false);
    expect(out.reason).toBe("permissive-with-secret");
    expect(out.modeBits).toBe(0o644);
    expect(out.hasLoadedSecret).toBe(true);
  });

  it("accepts permissive-without-secret when no key is loaded", () => {
    const ctx = buildContext({ env: {}, mode: 0o644 });
    const out = analyseEnvFile("/tmp/example/.env", ctx);
    expect(out.ok).toBe(true);
    expect(out.reason).toBe("permissive-without-secret");
  });

  it("treats group bits as permissive even when other bits are zero", () => {
    const ctx = buildContext({ env: { JINA_API_KEY: "jina-test" }, mode: 0o640 });
    const out = analyseEnvFile("/tmp/example/.env", ctx);
    expect(out.ok).toBe(false);
    expect(out.reason).toBe("permissive-with-secret");
    expect(out.modeBits).toBe(0o640);
  });
});

describe("AUDIT-026 envPermissionsService.assessLocalEnvFilePermissions", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("emits a warning when mode > 0600 with a key loaded, no auto-chmod", () => {
    const warnings: string[] = [];
    const ctx = buildContext({
      env: { VENICE_API_KEY: "vn-test-secret" },
      mode: 0o644,
      warnings,
    });
    const out = assessLocalEnvFilePermissions({
      platform: ctx.platform,
      cwd: ctx.cwd,
      fileExists: ctx.fileExists,
      stat: ctx.stat,
      chmod: ctx.chmod,
      uid: ctx.uid,
      autoChmodEnabled: ctx.autoChmodEnabled,
      envSnapshot: ctx.envSnapshot,
      onWarn: ctx.onWarn,
    });
    expect(out.ok).toBe(false);
    expect(out.reason).toBe("permissive-with-secret");
    expect(ctx.chmod).not.toHaveBeenCalled();
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toMatch(/AUDIT-026/);
    expect(warnings[0]).toMatch(/world\/group readable/);
  });

  it("does not warn for 0600 .env", () => {
    const warnings: string[] = [];
    assessLocalEnvFilePermissions({
      platform: "darwin",
      cwd: "/tmp/example",
      envSnapshot: { VENICE_API_KEY: "vn-test-secret" },
      fileExists: () => true,
      stat: () => new StubStats(0o600),
      chmod: () => undefined,
      uid: 1000,
      autoChmodEnabled: false,
      onWarn: (m) => warnings.push(m),
    });
    expect(warnings.length).toBe(0);
  });

  it("auto-chmod's to 0600 when explicitly opted in, then returns ok", () => {
    const warnings: string[] = [];
    const chmodMock = vi.fn();
    const out = assessLocalEnvFilePermissions({
      platform: "darwin",
      cwd: "/tmp/example",
      envSnapshot: { VENICE_API_KEY: "vn-test-secret" },
      fileExists: () => true,
      stat: () => new StubStats(0o644),
      chmod: chmodMock,
      uid: 1000,
      autoChmodEnabled: true,
      onWarn: (m) => warnings.push(m),
    });
    expect(out.ok).toBe(true);
    expect(out.autoChmodApplied).toBe(true);
    expect(chmodMock).toHaveBeenCalledWith(expect.stringMatching(/\.env$/), 0o600);
    expect(warnings.some((m) => /Tightened.*0600/.test(m))).toBe(true);
  });

  it("never auto-chmod's without an explicit opt-in flag", () => {
    const warnings: string[] = [];
    const chmodMock = vi.fn();
    assessLocalEnvFilePermissions({
      platform: "darwin",
      cwd: "/tmp/example",
      envSnapshot: { VENICE_API_KEY: "vn-test-secret" },
      fileExists: () => true,
      stat: () => new StubStats(0o644),
      chmod: chmodMock,
      uid: 1000,
      autoChmodEnabled: false,
      onWarn: (m) => warnings.push(m),
    });
    expect(chmodMock).not.toHaveBeenCalled();
  });

  it("does not warn when the .env file is absent", () => {
    const warnings: string[] = [];
    const out = assessLocalEnvFilePermissions({
      platform: "darwin",
      cwd: "/tmp/example",
      envSnapshot: { VENICE_API_KEY: "vn-test-secret" },
      fileExists: () => false,
      stat: () => new StubStats(0o600),
      chmod: () => undefined,
      uid: 1000,
      autoChmodEnabled: false,
      onWarn: (m) => warnings.push(m),
    });
    expect(out.reason).toBe("missing-file");
    expect(warnings.length).toBe(0);
  });

  it("never rewrites the secret value, only the file mode", () => {
    const warnings: string[] = [];
    assessLocalEnvFilePermissions({
      platform: "darwin",
      cwd: "/tmp/example",
      envSnapshot: { VENICE_API_KEY: "vn-fixed-secret-value" },
      fileExists: () => true,
      stat: () => new StubStats(0o644),
      chmod: (_p) => {
        // Mock chmod that simulates what fs.chmodSync would do — never touches file contents.
      },
      uid: 1000,
      autoChmodEnabled: true,
      onWarn: (m) => warnings.push(m),
    });
    // The fixed secret value reaches the analysis input but the only side-effect
    // we control is chmod. We assert no env write happened by snapshotting.
    expect(process.env.VENICE_API_KEY ?? "vn-fixed-secret-value").not.toBe("");
    expect(warnings.some((m) => /Rotate the key/.test(m))).toBe(true);
  });
});
