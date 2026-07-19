// @vitest-environment node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
// @ts-expect-error - CJS import in TS file
import { audit } from "./verify-custom-protocol-privileges.cjs";

describe("verify-custom-protocol-privileges (VERIFY-155)", () => {
  let tmpRoot: string | null = null;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "vf-cors-audit-"));
  });

  afterEach(() => {
    if (tmpRoot) {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
      tmpRoot = null;
    }
  });

  function stageMain(filename: string, source: string) {
    const electronDir = path.join(tmpRoot!, "electron");
    fs.mkdirSync(electronDir, { recursive: true });
    fs.writeFileSync(path.join(electronDir, "main.ts"), source);
    fs.mkdirSync(path.join(electronDir, "services"), { recursive: true });
    fs.writeFileSync(
      path.join(electronDir, "services", "generatedMediaStore.ts"),
      "export const GENERATED_MEDIA_SCHEME = 'venice-media'\n",
    );
  }

  function runAudit() {
    // Always point at the temp staged source so the audit doesn't see the real repo's main.ts.
    return () => audit({ root: tmpRoot! });
  }

  function withCwd<T>(cwd: string, fn: () => T): T {
    const previous = process.cwd();
    process.chdir(cwd);
    try {
      return fn();
    } finally {
      process.chdir(previous);
    }
  }

  it("approves the canonical registration with corsEnabled + stream on each scheme", () => {
    stageMain(
      "main.ts",
      String.raw`protocol.registerSchemesAsPrivileged([
  {
    scheme: "venice-character-cache",
    privileges: { secure: true, standard: true, supportFetchAPI: true, corsEnabled: true },
  },
  {
    scheme: "venice-tts",
    privileges: { secure: true, standard: true, supportFetchAPI: true, stream: true, corsEnabled: true },
  },
  {
    scheme: "venice-media",
    privileges: { secure: true, standard: true, supportFetchAPI: true, stream: true, corsEnabled: true },
  },
]);`,
    );
    expect(() => withCwd(tmpRoot!, runAudit())).not.toThrow();
  });

  it("rejects registration that drops corsEnabled on any scheme", () => {
    stageMain(
      "main.ts",
      String.raw`protocol.registerSchemesAsPrivileged([
  { scheme: "venice-character-cache", privileges: { secure: true, standard: true, supportFetchAPI: true } },
  {
    scheme: "venice-tts",
    privileges: { secure: true, standard: true, supportFetchAPI: true, stream: true, corsEnabled: true },
  },
  {
    scheme: "venice-media",
    privileges: { secure: true, standard: true, supportFetchAPI: true, stream: true, corsEnabled: true },
  },
]);`,
    );
    let captured: Error | null = null;
    try {
      withCwd(tmpRoot!, runAudit());
    } catch (error) {
      captured = error instanceof Error ? error : new Error(String(error));
    }
    expect(captured).toBeTruthy();
    expect(String(captured!.message)).toMatch(/missing corsEnabled/i);
  });

  it("rejects registration that drops stream on audio/video schemes", () => {
    stageMain(
      "main.ts",
      String.raw`protocol.registerSchemesAsPrivileged([
  {
    scheme: "venice-character-cache",
    privileges: { secure: true, standard: true, supportFetchAPI: true, corsEnabled: true },
  },
  {
    scheme: "venice-tts",
    privileges: { secure: true, standard: true, supportFetchAPI: true, corsEnabled: true },
  },
  {
    scheme: "venice-media",
    privileges: { secure: true, standard: true, supportFetchAPI: true, stream: true, corsEnabled: true },
  },
]);`,
    );
    let captured: Error | null = null;
    try {
      withCwd(tmpRoot!, runAudit());
    } catch (error) {
      captured = error instanceof Error ? error : new Error(String(error));
    }
    expect(captured).toBeTruthy();
    expect(String(captured!.message)).toMatch(/venice-tts/);
    expect(String(captured!.message)).toMatch(/stream=true/);
  });

  it("rejects unknown scheme registrations that bypass audit", () => {
    stageMain(
      "main.ts",
      String.raw`protocol.registerSchemesAsPrivileged([
  {
    scheme: "venice-character-cache",
    privileges: { secure: true, standard: true, supportFetchAPI: true, corsEnabled: true },
  },
  {
    scheme: "venice-tts",
    privileges: { secure: true, standard: true, supportFetchAPI: true, stream: true, corsEnabled: true },
  },
  {
    scheme: "venice-media",
    privileges: { secure: true, standard: true, supportFetchAPI: true, stream: true, corsEnabled: true },
  },
  {
    scheme: "sneaky-scheme",
    privileges: { secure: true, standard: true, supportFetchAPI: true, corsEnabled: true },
  },
]);`,
    );
    let captured: Error | null = null;
    try {
      withCwd(tmpRoot!, runAudit());
    } catch (error) {
      captured = error instanceof Error ? error : new Error(String(error));
    }
    expect(captured).toBeTruthy();
    expect(String(captured!.message)).toMatch(/sneaky-scheme/);
  });

  it("rejects stream on the image-only character-cache scheme", () => {
    stageMain(
      "main.ts",
      String.raw`protocol.registerSchemesAsPrivileged([
  {
    scheme: "venice-character-cache",
    privileges: { secure: true, standard: true, supportFetchAPI: true, corsEnabled: true, stream: true },
  },
  {
    scheme: "venice-tts",
    privileges: { secure: true, standard: true, supportFetchAPI: true, stream: true, corsEnabled: true },
  },
  {
    scheme: "venice-media",
    privileges: { secure: true, standard: true, supportFetchAPI: true, stream: true, corsEnabled: true },
  },
]);`,
    );
    let captured: Error | null = null;
    try {
      withCwd(tmpRoot!, runAudit());
    } catch (error) {
      captured = error instanceof Error ? error : new Error(String(error));
    }
    expect(captured).toBeTruthy();
    expect(String(captured!.message)).toMatch(/image-only/);
  });
});
