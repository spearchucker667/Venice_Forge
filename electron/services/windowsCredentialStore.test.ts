// @vitest-environment node

/** @fileoverview Unit tests for the Windows Credential Manager bridge. */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";

vi.mock("node:child_process", () => ({
  spawnSync: vi.fn(),
  execFileSync: vi.fn(),
}));

const ORIGINAL_PLATFORM = process.platform;

async function loadModule(platform: string) {
  vi.resetModules();
  Object.defineProperty(process, "platform", { value: platform, configurable: true });
  const mod = await import("./windowsCredentialStore");
  return mod;
}

afterEach(() => {
  Object.defineProperty(process, "platform", { value: ORIGINAL_PLATFORM, configurable: true });
  vi.resetModules();
});

describe("windowsCredentialStore", () => {
  beforeEach(() => {
    vi.mocked(spawnSync).mockReset();
  });

  describe("platform availability", () => {
    it("reports unavailable on non-Windows platforms", async () => {
      const mod = await loadModule("darwin");
      expect(mod.isWindowsCredentialStoreAvailable()).toBe(false);
    });

    it("reports available on Windows", async () => {
      const mod = await loadModule("win32");
      expect(mod.isWindowsCredentialStoreAvailable()).toBe(true);
    });
  });

  describe("writeWindowsCredential", () => {
    it("throws on non-Windows platforms", async () => {
      const mod = await loadModule("linux");
      expect(() => mod.writeWindowsCredential("target", "secret")).toThrow(
        /only available on Windows/i,
      );
    });

    it("throws for invalid target names on Windows", async () => {
      const mod = await loadModule("win32");
      expect(() => mod.writeWindowsCredential("bad target!", "secret")).toThrow(
        /disallowed characters/i,
      );
    });

    it("rejects PowerShell metacharacters and newlines in the target before spawn", async () => {
      const mod = await loadModule("win32");
      const payloads = [
        "VeniceForge;calc",
        "VeniceForge|whoami",
        "VeniceForge&dir",
        "VeniceForge`whoami",
        "VeniceForge$(whoami)",
        "VeniceForge'",
        'VeniceForge"',
        "VeniceForge\nwhoami",
        "VeniceForge\rwhoami",
        "VeniceForge target",
        "",
        "x".repeat(257),
      ];
      for (const payload of payloads) {
        expect(() => mod.writeWindowsCredential(payload, "secret")).toThrow();
      }
      expect(spawnSync).not.toHaveBeenCalled();
    });

    it("accepts representative valid target names", async () => {
      const mod = await loadModule("win32");
      vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: "", stderr: "" } as ReturnType<typeof spawnSync>);
      expect(() =>
        mod.writeWindowsCredential("VeniceForge:credential:master_password", "secret"),
      ).not.toThrow();
      expect(() =>
        mod.writeWindowsCredential("a_b.c-d:e0123", "secret"),
      ).not.toThrow();
    });

    it("calls PowerShell with the script and pipes the secret via stdin", async () => {
      const mod = await loadModule("win32");
      vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: "", stderr: "" } as ReturnType<typeof spawnSync>);

      mod.writeWindowsCredential("VeniceForge:credential:master_password", "super-secret");

      expect(spawnSync).toHaveBeenCalledTimes(1);
      const call = vi.mocked(spawnSync).mock.calls[0];
      if (!call) throw new Error("Expected spawnSync call");
      const [executable, args, options] = call;
      expect(executable).toMatch(/powershell\.exe$/i);
      if (!args) throw new Error("Expected args");
      expect(args).toContain("-Command");
      const script = String(args[args.length - 1]);
      expect(script).toContain("CredWriteW");
      expect(script).toContain("$env:VENICE_FORGE_CRED_TARGET");
      expect(script).not.toContain("super-secret");
      expect(script).not.toContain("VeniceForge:credential:master_password");
      expect(JSON.stringify(args)).not.toContain("super-secret");
      expect(options?.input).toBe("super-secret");
      expect((options?.env as NodeJS.ProcessEnv | undefined)?.VENICE_FORGE_CRED_TARGET).toBe(
        "VeniceForge:credential:master_password",
      );
    });

    it("throws when PowerShell reports a failure", async () => {
      const mod = await loadModule("win32");
      vi.mocked(spawnSync).mockReturnValue({
        status: 1,
        stdout: "",
        stderr: "Access denied",
      } as ReturnType<typeof spawnSync>);

      expect(() =>
        mod.writeWindowsCredential("VeniceForge:credential:master_password", "secret"),
      ).toThrow(/Access denied/);
    });
  });

  describe("readWindowsCredential", () => {
    it("throws on non-Windows platforms", async () => {
      const mod = await loadModule("linux");
      expect(() => mod.readWindowsCredential("target")).toThrow(
        /only available on Windows/i,
      );
    });

    it("returns null when the credential is absent", async () => {
      const mod = await loadModule("win32");
      vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: "", stderr: "" } as ReturnType<typeof spawnSync>);

      const value = mod.readWindowsCredential("VeniceForge:credential:missing");
      expect(value).toBeNull();
    });

    it("returns the credential value on success", async () => {
      const mod = await loadModule("win32");
      vi.mocked(spawnSync).mockReturnValue({
        status: 0,
        stdout: "stored-value\n",
        stderr: "",
      } as ReturnType<typeof spawnSync>);

      const value = mod.readWindowsCredential("VeniceForge:credential:master_password");
      expect(value).toBe("stored-value");
    });

    it("throws when PowerShell reports a failure", async () => {
      const mod = await loadModule("win32");
      vi.mocked(spawnSync).mockReturnValue({
        status: 1,
        stdout: "",
        stderr: "CredReadW failed: 5",
      } as ReturnType<typeof spawnSync>);

      expect(() =>
        mod.readWindowsCredential("VeniceForge:credential:master_password"),
      ).toThrow(/CredReadW failed/);
    });
  });

  describe("deleteWindowsCredential", () => {
    it("throws on non-Windows platforms", async () => {
      const mod = await loadModule("linux");
      expect(() => mod.deleteWindowsCredential("target")).toThrow(
        /only available on Windows/i,
      );
    });

    it("calls PowerShell with CredDeleteW on Windows", async () => {
      const mod = await loadModule("win32");
      vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: "", stderr: "" } as ReturnType<typeof spawnSync>);

      mod.deleteWindowsCredential("VeniceForge:credential:master_password");

      expect(spawnSync).toHaveBeenCalledTimes(1);
      const call = vi.mocked(spawnSync).mock.calls[0];
      if (!call) throw new Error("Expected spawnSync call");
      const [executable, args] = call;
      expect(executable).toMatch(/powershell\.exe$/i);
      if (!args) throw new Error("Expected args");
      expect(args[args.length - 1]).toContain("CredDeleteW");
    });

    it("resolves the canonical System32 PowerShell path on Windows (IMP-004)", async () => {
      const mod = await loadModule("win32");
      expect(mod.getPowerShellExecutable()).toMatch(/System32[\\/]WindowsPowerShell[\\/]v1\.0[\\/]powershell\.exe$/i);
    });

    it("does not throw when the credential is already absent", async () => {
      const mod = await loadModule("win32");
      // The script treats Win32 error 1168 as "not found" and exits 0.
      vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: "", stderr: "" } as ReturnType<typeof spawnSync>);

      expect(() =>
        mod.deleteWindowsCredential("VeniceForge:credential:missing"),
      ).not.toThrow();
    });

    it("throws when PowerShell reports an unexpected failure", async () => {
      const mod = await loadModule("win32");
      vi.mocked(spawnSync).mockReturnValue({
        status: 1,
        stdout: "",
        stderr: "CredDeleteW failed: 5",
      } as ReturnType<typeof spawnSync>);

      expect(() =>
        mod.deleteWindowsCredential("VeniceForge:credential:master_password"),
      ).toThrow(/CredDeleteW failed/);
    });
  });
});
