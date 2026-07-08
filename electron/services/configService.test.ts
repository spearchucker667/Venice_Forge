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
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development"; // Override to allow repo-local resolution
    try {
      const paths = getPaths();
      // In dev (not packaged), source should be repo-local.
      expect(paths.source).toBe("repo-local");
      expect(paths.configPath).toContain("config.local.yaml");
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
    }
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

  it("default YAML includes the internal_prompt_enhancer block", async () => {
    // Point the service at a fresh, empty directory so the default YAML
    // is rendered from scratch.
    const envConfig = path.join(tmpRoot, "no-config-yet.yaml");
    const envThemes = path.join(tmpRoot, "no-themes-yet.yaml");
    process.env.VENICE_FORGE_CONFIG_FILE = envConfig;
    process.env.VENICE_FORGE_THEMES_FILE = envThemes;
    await fs.rm(envConfig, { force: true });
    await fs.rm(envThemes, { force: true });
    await initializeConfig();
    const onDisk = await fs.readFile(envConfig, "utf-8");
    expect(onDisk).toMatch(/internal_prompt_enhancer:/);
    expect(onDisk).toMatch(/venice-uncensored-1-2/);
    expect(onDisk).toMatch(/maxTokens: 350/);
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

    const status = await initializeConfig();

    const after = await fs.readFile(envConfig, "utf-8");
    expect(after).not.toContain("abc-123");
    expect(after).toMatch(/venice_api_key:\s*""/);
    expect(status.keysRedacted.venice).toBe(true);
  });

  it("VERIFY-024 does not report successful redaction before the atomic rename completes", async () => {
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
    const renameSpy = vi.spyOn(fs, "rename").mockRejectedValueOnce(new Error("rename failed"));

    const status = await initializeConfig();

    expect(mocks.setApiKey).toHaveBeenCalledWith("abc-123");
    expect(status.parseError).toContain("rename failed");
    expect(status.keysRedacted.venice).toBe(false);
    expect(await fs.readFile(envConfig, "utf-8")).toContain("abc-123");
    expect((await fs.readdir(tmpRoot)).some((name) => name.includes(".redact-") && name.endsWith(".tmp"))).toBe(false);
    renameSpy.mockRestore();
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

  it("applies a partial internal_prompt_enhancer patch (model, maxTokens, temperature, systemPrompt)", async () => {
    const envConfig = path.join(tmpRoot, "config.yaml");
    const envThemes = path.join(tmpRoot, "themes.yaml");
    await writeYaml(envConfig, "version: 1\nsecrets:\n  venice_api_key: \"\"\n");
    await writeYaml(envThemes, "version: 1\nthemes: {}\n");
    process.env.VENICE_FORGE_CONFIG_FILE = envConfig;
    process.env.VENICE_FORGE_THEMES_FILE = envThemes;

    await initializeConfig();
    const result = await writeSanitizedConfig({
      internal_prompt_enhancer: {
        model: "custom-enhancer",
        maxTokens: 222,
        temperature: 0.25,
        systemPrompt: "Custom enhance prompt.",
      },
    });
    expect(result.ok).toBe(true);
    const payload = getSanitizedConfig();
    expect(payload.config.internal_prompt_enhancer.model).toBe("custom-enhancer");
    expect(payload.config.internal_prompt_enhancer.maxTokens).toBe(222);
    expect(payload.config.internal_prompt_enhancer.temperature).toBe(0.25);
    expect(payload.config.internal_prompt_enhancer.systemPrompt).toBe("Custom enhance prompt.");
  });

  it("toggling internal_prompt_enhancer.enabled via patch is honored", async () => {
    const envConfig = path.join(tmpRoot, "config.yaml");
    const envThemes = path.join(tmpRoot, "themes.yaml");
    await writeYaml(envConfig, "version: 1\n");
    await writeYaml(envThemes, "version: 1\nthemes: {}\n");
    process.env.VENICE_FORGE_CONFIG_FILE = envConfig;
    process.env.VENICE_FORGE_THEMES_FILE = envThemes;
    await initializeConfig();
    const result = await writeSanitizedConfig({
      internal_prompt_enhancer: { enabled: false },
    });
    expect(result.ok).toBe(true);
    const payload = getSanitizedConfig();
    expect(payload.config.internal_prompt_enhancer.enabled).toBe(false);
  });
});

describe("configService export and folder", () => {
  // Pin Downloads/Documents to deterministic sandbox paths so the tests do
  // not depend on the host machine's actual ~/Downloads or ~/Documents
  // existing. tmpRoot is `${os.tmpdir()}/vf-cfg-test`; "downloads" and
  // "documents" each get a stable subdirectory inside it that is wiped
  // in beforeEach. The base `mocks.getPath` already returns `os.tmpdir()`
  // for unknown names, so we override the two allowed names here.
  const downloadsRoot = path.join(tmpRoot, "downloads");
  const documentsRoot = path.join(tmpRoot, "documents");
  const outsideRoot = path.join(tmpRoot, "outside");

  beforeEach(async () => {
    // Override only for the duration of this describe block. mockImplementation
    // does not auto-reset between tests, so beforeEach re-installs both.
    mocks.getPath.mockImplementation((name: string) => {
      if (name === "userData") return path.join(os.tmpdir(), "vf-cfg-test");
      if (name === "appPath") return process.cwd();
      if (name === "downloads") return downloadsRoot;
      if (name === "documents") return documentsRoot;
      return os.tmpdir();
    });
    await fs.mkdir(downloadsRoot, { recursive: true });
    await fs.mkdir(documentsRoot, { recursive: true });
    await fs.mkdir(outsideRoot, { recursive: true });
  });

  it("exports a sanitized template without raw keys", async () => {
    const envConfig = path.join(tmpRoot, "config.yaml");
    const envThemes = path.join(tmpRoot, "themes.yaml");
    await writeYaml(envConfig, "version: 1\nsecrets:\n  venice_api_key: \"secret\"\n  keep_plaintext_keys: true\n");
    await writeYaml(envThemes, "version: 1\nthemes: {}\n");
    process.env.VENICE_FORGE_CONFIG_FILE = envConfig;
    process.env.VENICE_FORGE_THEMES_FILE = envThemes;

    await initializeConfig();

    const target = path.join(downloadsRoot, "template.yaml");
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

  it("rejects path traversal export targets (POSIX /etc/passwd)", async () => {
    // Regression guard for the 2026-06-09 Windows CI failure: regardless of
    // whether the path's parent exists on this platform, /etc/passwd must be
    // classified as outside the allowlist, not as an "Invalid export path."
    const result = await exportConfigTemplate("/etc/passwd");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Downloads or Documents/i);
  });

  it("rejects path traversal export targets (Windows-style drive root)", async () => {
    // On POSIX, path.resolve("C:\\Windows\\System32\\evil.yaml") returns
    // "/C:\\Windows\\System32\\evil.yaml" (treated as a single relative-ish
    // path); on Windows, it returns "C:\\Windows\\System32\\evil.yaml". The
    // lexical check must classify both as outside the allowlist.
    const winStyle = path.join("C:\\Windows\\System32", "evil.yaml");
    const result = await exportConfigTemplate(winStyle);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Downloads or Documents/i);
  });

  it("rejects a target that is lexically outside even when the parent does not exist", async () => {
    const result = await exportConfigTemplate(path.join(outsideRoot, "nested", "deeply", "absent.yaml"));
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Downloads or Documents/i);
  });

  it("rejects a symlink inside Downloads that points outside the allowlist", async () => {
    // Real symlink attack vector: the symlink lexically lives inside
    // downloads/ but its realpath resolves to outsideRoot. The implementation
    // must follow the realpath and re-check the allowlist.
    if (process.platform === "win32") {
      // Symlink creation requires admin/dev-mode on Windows; the test is
      // still meaningful on POSIX and the lexical check above already
      // exercises the parallel code path.
      return;
    }
    // The symlink target must exist on disk — a dangling symlink's realpath
    // resolves to the symlink's own path (not the missing target), so the
    // re-check would incorrectly pass.
    await writeYaml(path.join(outsideRoot, "target.yaml"), "attacker controlled\n");
    const symlinkPath = path.join(downloadsRoot, "evil-link.yaml");
    await fs.symlink(path.join(outsideRoot, "target.yaml"), symlinkPath);
    const result = await exportConfigTemplate(symlinkPath);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Downloads or Documents/i);
  });

  it("accepts a non-existing file inside Downloads (parent exists)", async () => {
    // The implementation may realpath(parent) when the target does not exist
    // yet; this must succeed and write a sanitized template.
    const envConfig = path.join(tmpRoot, "config.yaml");
    const envThemes = path.join(tmpRoot, "themes.yaml");
    await writeYaml(envConfig, "version: 1\n");
    await writeYaml(envThemes, "version: 1\nthemes: {}\n");
    process.env.VENICE_FORGE_CONFIG_FILE = envConfig;
    process.env.VENICE_FORGE_THEMES_FILE = envThemes;
    await initializeConfig();

    const target = path.join(documentsRoot, "fresh-template.yaml");
    const result = await exportConfigTemplate(target);
    expect(result.ok).toBe(true);
    expect(await fs.stat(target)).toBeTruthy();
  });

  it("rejects empty and null-byte export targets", async () => {
    expect((await exportConfigTemplate("")).ok).toBe(false);
    expect((await exportConfigTemplate("foo\0bar")).ok).toBe(false);
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

  it("loads the 15 unique themes from the repository canonical themes.example.yaml", async () => {
    const exampleThemesContent = await fs.readFile(
      path.join(process.cwd(), ".config", "themes.example.yaml"),
      "utf-8"
    );
    const envConfig = path.join(tmpRoot, "config.yaml");
    const envThemes = path.join(tmpRoot, "themes.yaml");
    await writeYaml(envConfig, "version: 1\n");
    await writeYaml(envThemes, exampleThemesContent);
    process.env.VENICE_FORGE_CONFIG_FILE = envConfig;
    process.env.VENICE_FORGE_THEMES_FILE = envThemes;

    const result = await loadMergedThemes();
    expect(result.warnings.filter(w => w.severity === "error")).toEqual([]); // Should be zero errors
    expect(Object.keys(result.themes).length).toBeGreaterThanOrEqual(15);
    
    // Check that some of the specific 15 themes are injected
    const loadedThemeIds = Object.keys(result.themes);
    expect(loadedThemeIds).toContain("aurora-boreal");
    expect(loadedThemeIds).toContain("sakura-terminal");
    expect(loadedThemeIds).toContain("synthwave-harbor");
    expect(loadedThemeIds).toContain("ultraviolet-rain");

    const aurora = result.themes["aurora-boreal"];
    expect(aurora?.display_name).toBe("Aurora Boreal");
    expect(aurora?.tokens.accent).toBe("#4dffb4");
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
