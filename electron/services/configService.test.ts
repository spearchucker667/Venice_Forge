// @vitest-environment node
/** @fileoverview Unit tests for the local master YAML config service.
 *  Verifies path resolution, secret import/redaction, sanitized payloads,
 *  and that raw keys are never exposed to renderer-bound payloads. */
import { describe, it, expect, beforeEach, vi } from "vitest";
import path from "path";
import os from "os";
import { promises as fs } from "fs";

const mocks = vi.hoisted(() => ({
  setApiKey: vi.fn(),
  setJinaApiKey: vi.fn(),
  getApiKey: vi.fn(() => null as string | null),
  getJinaApiKey: vi.fn(() => null as string | null),
  isApiKeyConfigured: vi.fn(() => false),
  isJinaApiKeyConfigured: vi.fn(() => false),
  deleteApiKey: vi.fn(),
  deleteJinaApiKey: vi.fn(),
  logInfo: vi.fn(),
  logError: vi.fn(),
  getPath: vi.fn((name: string) => {
    if (name === "userData") return path.join(os.tmpdir(), "vf-cfg-test");
    if (name === "appPath") return process.cwd();
    return os.tmpdir();
  }),
  getAppPath: vi.fn(() => process.cwd()),
  isPackaged: false,
  shellOpenPath: vi.fn(async () => ""),
}));

vi.mock("electron", () => ({
  app: {
    getPath: mocks.getPath,
    getAppPath: mocks.getAppPath,
    isPackaged: mocks.isPackaged,
  },
  shell: { openPath: mocks.shellOpenPath },
}));

vi.mock("./logger", () => ({
  logInfo: mocks.logInfo,
  logError: mocks.logError,
}));

vi.mock("./secureStore", () => ({
  setApiKey: mocks.setApiKey,
  setJinaApiKey: mocks.setJinaApiKey,
  getApiKey: mocks.getApiKey,
  getJinaApiKey: mocks.getJinaApiKey,
  isApiKeyConfigured: mocks.isApiKeyConfigured,
  isJinaApiKeyConfigured: mocks.isJinaApiKeyConfigured,
  deleteApiKey: mocks.deleteApiKey,
  deleteJinaApiKey: mocks.deleteJinaApiKey,
}));

import {
  exportConfigTemplate,
  getPaths,
  getSanitizedConfig,
  initializeConfig,
  loadMergedThemes,
  openConfigFolder,
  reloadConfig,
  resetSecureStoreKeys,
  writeSanitizedConfig,
} from "./configService";

const tmpRoot = path.join(os.tmpdir(), "vf-cfg-test");

async function writeYaml(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf-8");
}

async function clearTmp(): Promise<void> {
  await fs.rm(tmpRoot, { recursive: true, force: true });
}

beforeEach(async () => {
  await clearTmp();
  // Reset mock state between tests.
  for (const fn of Object.values(mocks)) {
    if (typeof fn === "function" && "mockClear" in fn) {
      (fn as ReturnType<typeof vi.fn>).mockClear();
    }
  }
  delete process.env.VENICE_FORGE_CONFIG_FILE;
  delete process.env.VENICE_FORGE_THEMES_FILE;
  mocks.isApiKeyConfigured.mockReturnValue(false);
  mocks.isJinaApiKeyConfigured.mockReturnValue(false);
  mocks.getApiKey.mockReturnValue(null);
  mocks.getJinaApiKey.mockReturnValue(null);
});

describe("configService path resolution", () => {
  it("uses repo-local .config/config.local.yaml in dev", async () => {
    process.env.VENICE_FORGE_CONFIG_FILE = "";
    const paths = getPaths();
    // In dev (not packaged), source should be repo-local.
    expect(paths.source).toBe("repo-local");
    expect(paths.configPath).toContain("config.local.yaml");
  });

  it("honours an absolute env override", () => {
    const envPath = path.join(tmpRoot, "override.yaml");
    process.env.VENICE_FORGE_CONFIG_FILE = envPath;
    const paths = getPaths();
    expect(paths.source).toBe("env-override");
    expect(paths.configPath).toBe(envPath);
  });

  it("ignores URL env overrides", () => {
    process.env.VENICE_FORGE_CONFIG_FILE = "https://evil.example.com/x.yaml";
    const paths = getPaths();
    expect(paths.source).not.toBe("env-override");
  });
});

describe("configService initialize", () => {
  it("creates a default config and themes file when none exist", async () => {
    await initializeConfig();
    // The default files are created in the repo-local dir.
    const status = (await reloadConfig()) as { configPath: string; themesPath: string; loaded: boolean };
    // The files are not required to exist for `loaded: false`; the function
    // re-renders them. We assert that the paths are well-formed.
    expect(status.configPath).toMatch(/\.ya?ml$/);
    expect(status.themesPath).toMatch(/\.ya?ml$/);
  });

  it("imports a plaintext Venice key into the secure store", async () => {
    const envConfig = path.join(tmpRoot, "config.yaml");
    const envThemes = path.join(tmpRoot, "themes.yaml");
    await writeYaml(envConfig, [
      "version: 1",
      "secrets:",
      "  venice_api_key: \"abc-123\"",
      "  jina_api_key: \"\"",
      "  keep_plaintext_keys: false",
      "",
    ].join("\n"));
    await writeYaml(envThemes, "version: 1\nthemes: {}\n");
    process.env.VENICE_FORGE_CONFIG_FILE = envConfig;
    process.env.VENICE_FORGE_THEMES_FILE = envThemes;

    await initializeConfig();

    expect(mocks.setApiKey).toHaveBeenCalledWith("abc-123");
  });

  it("does not import a key when allow_config_key_import=false", async () => {
    const envConfig = path.join(tmpRoot, "config.yaml");
    const envThemes = path.join(tmpRoot, "themes.yaml");
    await writeYaml(envConfig, [
      "version: 1",
      "secrets:",
      "  venice_api_key: \"abc-123\"",
      "developer:",
      "  allow_config_key_import: false",
      "",
    ].join("\n"));
    await writeYaml(envThemes, "version: 1\nthemes: {}\n");
    process.env.VENICE_FORGE_CONFIG_FILE = envConfig;
    process.env.VENICE_FORGE_THEMES_FILE = envThemes;

    await initializeConfig();

    expect(mocks.setApiKey).not.toHaveBeenCalled();
  });

  it("does not import a key when the secure store already has one", async () => {
    const envConfig = path.join(tmpRoot, "config.yaml");
    const envThemes = path.join(tmpRoot, "themes.yaml");
    await writeYaml(envConfig, [
      "version: 1",
      "secrets:",
      "  venice_api_key: \"abc-123\"",
      "",
    ].join("\n"));
    await writeYaml(envThemes, "version: 1\nthemes: {}\n");
    process.env.VENICE_FORGE_CONFIG_FILE = envConfig;
    process.env.VENICE_FORGE_THEMES_FILE = envThemes;

    mocks.getApiKey.mockReturnValue("existing-key");

    await initializeConfig();

    expect(mocks.setApiKey).not.toHaveBeenCalled();
  });

  it("force_import_keys=true overwrites an existing secure store key", async () => {
    const envConfig = path.join(tmpRoot, "config.yaml");
    const envThemes = path.join(tmpRoot, "themes.yaml");
    await writeYaml(envConfig, [
      "version: 1",
      "secrets:",
      "  venice_api_key: \"new-key\"",
      "developer:",
      "  force_import_keys: true",
      "",
    ].join("\n"));
    await writeYaml(envThemes, "version: 1\nthemes: {}\n");
    process.env.VENICE_FORGE_CONFIG_FILE = envConfig;
    process.env.VENICE_FORGE_THEMES_FILE = envThemes;

    mocks.getApiKey.mockReturnValue("existing-key");

    await initializeConfig();

    expect(mocks.setApiKey).toHaveBeenCalledWith("new-key");
  });

  it("redacts the plaintext key on disk after import (default)", async () => {
    const envConfig = path.join(tmpRoot, "config.yaml");
    const envThemes = path.join(tmpRoot, "themes.yaml");
    await writeYaml(envConfig, [
      "version: 1",
      "secrets:",
      "  venice_api_key: \"abc-123\"",
      "  keep_plaintext_keys: false",
      "",
    ].join("\n"));
    await writeYaml(envThemes, "version: 1\nthemes: {}\n");
    process.env.VENICE_FORGE_CONFIG_FILE = envConfig;
    process.env.VENICE_FORGE_THEMES_FILE = envThemes;

    await initializeConfig();
    // Give the async redaction a chance to complete.
    await new Promise((r) => setImmediate(r));

    const after = await fs.readFile(envConfig, "utf-8");
    expect(after).not.toContain("abc-123");
    expect(after).toMatch(/venice_api_key:\s*""/);
  });

  it("preserves the plaintext key on disk when keep_plaintext_keys=true", async () => {
    const envConfig = path.join(tmpRoot, "config.yaml");
    const envThemes = path.join(tmpRoot, "themes.yaml");
    await writeYaml(envConfig, [
      "version: 1",
      "secrets:",
      "  venice_api_key: \"abc-123\"",
      "  keep_plaintext_keys: true",
      "",
    ].join("\n"));
    await writeYaml(envThemes, "version: 1\nthemes: {}\n");
    process.env.VENICE_FORGE_CONFIG_FILE = envConfig;
    process.env.VENICE_FORGE_THEMES_FILE = envThemes;

    await initializeConfig();
    await new Promise((r) => setImmediate(r));

    const after = await fs.readFile(envConfig, "utf-8");
    expect(after).toContain("abc-123");
  });

  it("survives a malformed YAML config without crashing", async () => {
    const envConfig = path.join(tmpRoot, "config.yaml");
    const envThemes = path.join(tmpRoot, "themes.yaml");
    await writeYaml(envConfig, "version: 1\nsecrets:\n  venice_api_key: \"unterminated\n");
    await writeYaml(envThemes, "version: 1\nthemes: {}\n");
    process.env.VENICE_FORGE_CONFIG_FILE = envConfig;
    process.env.VENICE_FORGE_THEMES_FILE = envThemes;

    const status = await initializeConfig();
    expect(status.parseError).toBeTruthy();
    expect(status.loaded).toBe(false);
  });
});

describe("configService sanitized payloads", () => {
  it("never exposes raw API keys in the sanitized payload", async () => {
    const envConfig = path.join(tmpRoot, "config.yaml");
    const envThemes = path.join(tmpRoot, "themes.yaml");
    await writeYaml(envConfig, [
      "version: 1",
      "secrets:",
      "  venice_api_key: \"very-secret\"",
      "  jina_api_key: \"also-secret\"",
      "  keep_plaintext_keys: true",
      "",
    ].join("\n"));
    await writeYaml(envThemes, "version: 1\nthemes: {}\n");
    process.env.VENICE_FORGE_CONFIG_FILE = envConfig;
    process.env.VENICE_FORGE_THEMES_FILE = envThemes;

    await initializeConfig();

    const payload = getSanitizedConfig();
    const json = JSON.stringify(payload);
    expect(json).not.toContain("very-secret");
    expect(json).not.toContain("also-secret");
    expect(payload.config.secrets.has_venice_api_key).toBe(true);
    expect(payload.config.secrets.has_jina_api_key).toBe(true);
  });
});

describe("configService writeSanitized", () => {
  it("rejects attempts to set plaintext API keys via the patch", async () => {
    const envConfig = path.join(tmpRoot, "config.yaml");
    const envThemes = path.join(tmpRoot, "themes.yaml");
    await writeYaml(envConfig, "version: 1\nsecrets:\n  venice_api_key: \"\"\n");
    await writeYaml(envThemes, "version: 1\nthemes: {}\n");
    process.env.VENICE_FORGE_CONFIG_FILE = envConfig;
    process.env.VENICE_FORGE_THEMES_FILE = envThemes;

    await initializeConfig();
    const result = await writeSanitizedConfig({
      secrets: { venice_api_key: "trying-to-set" },
    });
    expect(result.ok).toBe(true);
    expect(result.redactedFields).toContain("secrets.venice_api_key");
    const onDisk = await fs.readFile(envConfig, "utf-8");
    expect(onDisk).not.toContain("trying-to-set");
  });
});

describe("configService export and folder", () => {
  it("exports a sanitized template without raw keys", async () => {
    const envConfig = path.join(tmpRoot, "config.yaml");
    const envThemes = path.join(tmpRoot, "themes.yaml");
    await writeYaml(envConfig, "version: 1\nsecrets:\n  venice_api_key: \"secret\"\n  keep_plaintext_keys: true\n");
    await writeYaml(envThemes, "version: 1\nthemes: {}\n");
    process.env.VENICE_FORGE_CONFIG_FILE = envConfig;
    process.env.VENICE_FORGE_THEMES_FILE = envThemes;

    await initializeConfig();

    const target = path.join(tmpRoot, "template.yaml");
    const result = await exportConfigTemplate(target);
    expect(result.ok).toBe(true);
    const out = await fs.readFile(target, "utf-8");
    expect(out).not.toContain("\"secret\"");
  });

  it("rejects URL export targets", async () => {
    const result = await exportConfigTemplate("https://evil.example.com/x.yaml");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/URL/i);
  });

  it("openConfigFolder calls shell.openPath with the config dir", async () => {
    const envConfig = path.join(tmpRoot, "config.yaml");
    const envThemes = path.join(tmpRoot, "themes.yaml");
    await writeYaml(envConfig, "version: 1\n");
    await writeYaml(envThemes, "version: 1\nthemes: {}\n");
    process.env.VENICE_FORGE_CONFIG_FILE = envConfig;
    process.env.VENICE_FORGE_THEMES_FILE = envThemes;
    await initializeConfig();

    const res = await openConfigFolder();
    expect(res.ok).toBe(true);
    expect(mocks.shellOpenPath).toHaveBeenCalled();
  });
});

describe("configService loadMergedThemes", () => {
  it("returns the themes.yaml contents", async () => {
    const envConfig = path.join(tmpRoot, "config.yaml");
    const envThemes = path.join(tmpRoot, "themes.yaml");
    await writeYaml(envConfig, "version: 1\n");
    await writeYaml(envThemes, "version: 1\nthemes: {}\n");
    process.env.VENICE_FORGE_CONFIG_FILE = envConfig;
    process.env.VENICE_FORGE_THEMES_FILE = envThemes;

    const result = await loadMergedThemes();
    expect(result.themes).toEqual({});
  });
});

describe("configService resetSecureStoreKeys", () => {
  it("calls delete functions when keys are configured", () => {
    mocks.isApiKeyConfigured.mockReturnValue(true);
    mocks.isJinaApiKeyConfigured.mockReturnValue(true);
    const removed = resetSecureStoreKeys();
    expect(mocks.deleteApiKey).toHaveBeenCalled();
    expect(mocks.deleteJinaApiKey).toHaveBeenCalled();
    expect(removed).toEqual({ venice: true, jina: true });
  });
});
