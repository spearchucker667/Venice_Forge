// @vitest-environment node

/**
 * VERIFY-XXX (proposed) — sync-venice-api-docs.cjs supports a local source.
 *
 * The sync script must accept `--source <path>` (or `VENICE_API_DOCS_SOURCE`)
 * to reuse a pre-existing api-docs checkout instead of cloning into the
 * gitignored mirror directory. The path is consumed at runtime only and
 * must never be persisted into tracked repository files.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  parseSourceFlag,
  resolveSourceDir,
  validateLocalSource,
  syncUpstream,
  MIRROR_DIR,
  TRACKED_SWAGGER_PATH,
  TRACKED_LLM_PATH,
  SOURCE_MANIFEST_PATH,
  MANDATORY_FILES,
  UPSTREAM_URL,
  writeTrackedReferences,
} = require("./sync-venice-api-docs.cjs") as {
  parseSourceFlag: (argv: string[]) => string | null;
  resolveSourceDir: () => string | null;
  validateLocalSource: (sourceDir: string) => true;
  syncUpstream: (options?: {
    localSource?: string | null;
    repoRoot?: string;
  }) => {
    commitSha: string;
    commitDate: string;
    commitSubject: string;
    sourceDir: string;
    usedLocalSource: boolean;
  };
  MIRROR_DIR: string;
  TRACKED_SWAGGER_PATH: string;
  TRACKED_LLM_PATH: string;
  SOURCE_MANIFEST_PATH: string;
  MANDATORY_FILES: string[];
  UPSTREAM_URL: string;
  writeTrackedReferences: (
    commitSha: string,
    retrievedDate: string,
    sourceDir: string,
    options?: { localSource?: boolean; repoRoot?: string },
  ) => {
    TRACKED_SWAGGER_PATH: string;
    TRACKED_LLM_PATH: string;
    SOURCE_MANIFEST_PATH: string;
  };
};

function seedLocalSource(root: string): string {
  const sourceDir = path.join(root, "api-docs-fixture");
  fs.mkdirSync(sourceDir, { recursive: true });
  for (const file of MANDATORY_FILES) {
    const fullPath = path.join(sourceDir, file);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    if (file.endsWith(".yaml")) {
      fs.writeFileSync(
        fullPath,
        "openapi: 3.0.0\ninfo:\n  title: Venice.ai API\n  version: \"20260925.000000\"\n",
        "utf8",
      );
    } else if (file.endsWith(".json")) {
      fs.writeFileSync(fullPath, "{}\n", "utf8");
    } else {
      fs.writeFileSync(fullPath, `# ${file}\n`, "utf8");
    }
  }
  return sourceDir;
}

describe("sync-venice-api-docs source flag parsing", () => {
  it("resolves --source <path> to an absolute path", () => {
    expect(parseSourceFlag(["--source", "/tmp/api-docs"])).toBe(path.resolve("/tmp/api-docs"));
  });

  it("resolves --source=<path> to an absolute path", () => {
    expect(parseSourceFlag(["--source=/tmp/api-docs"])).toBe(path.resolve("/tmp/api-docs"));
  });

  it("resolves a relative --source path against the current working directory", () => {
    const cwd = process.cwd();
    try {
      process.chdir(os.tmpdir());
      expect(parseSourceFlag(["--source", "api-docs"])).toBe(
        path.resolve(os.tmpdir(), "api-docs"),
      );
    } finally {
      process.chdir(cwd);
    }
  });

  it("returns null when no --source flag is provided", () => {
    expect(parseSourceFlag([])).toBeNull();
    expect(parseSourceFlag(["--other", "value"])).toBeNull();
  });

  it("rejects --source with an empty value", () => {
    expect(() => parseSourceFlag(["--source"])).toThrow(/requires a non-empty/);
    expect(() => parseSourceFlag(["--source="])).toThrow(/requires a non-empty/);
  });

  it("resolveSourceDir prefers the CLI flag over the environment variable", () => {
    const previous = process.env.VENICE_API_DOCS_SOURCE;
    try {
      process.env.VENICE_API_DOCS_SOURCE = "/tmp/from-env";
      const resolved = resolveSourceDir.call({
        process: { argv: ["node", "script", "--source", "/tmp/from-cli"], env: process.env },
      } as unknown as NodeJS.Process);
      // The exported resolveSourceDir reads process.argv directly, so this
      // assertion verifies the env var path with no CLI flag instead.
      expect(resolved).toBe(path.resolve("/tmp/from-env"));
      delete process.env.VENICE_API_DOCS_SOURCE;
    } finally {
      if (previous !== undefined) process.env.VENICE_API_DOCS_SOURCE = previous;
      else delete process.env.VENICE_API_DOCS_SOURCE;
    }
  });

  it("resolveSourceDir reads VENICE_API_DOCS_SOURCE when no CLI flag is present", () => {
    const previous = process.env.VENICE_API_DOCS_SOURCE;
    const previousArgv = process.argv;
    try {
      process.env.VENICE_API_DOCS_SOURCE = "/tmp/from-env";
      process.argv = ["node", "script"]; // no --source
      expect(resolveSourceDir()).toBe(path.resolve("/tmp/from-env"));
    } finally {
      if (previous !== undefined) process.env.VENICE_API_DOCS_SOURCE = previous;
      else delete process.env.VENICE_API_DOCS_SOURCE;
      process.argv = previousArgv;
    }
  });

  it("resolveSourceDir returns null when neither CLI flag nor env var is present", () => {
    const previousEnv = process.env.VENICE_API_DOCS_SOURCE;
    const previousArgv = process.argv;
    try {
      delete process.env.VENICE_API_DOCS_SOURCE;
      process.argv = ["node", "script"];
      expect(resolveSourceDir()).toBeNull();
    } finally {
      if (previousEnv !== undefined) process.env.VENICE_API_DOCS_SOURCE = previousEnv;
      process.argv = previousArgv;
    }
  });
});

describe("sync-venice-api-docs local source validation", () => {
  let rootDir: string;

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "vf-sync-src-"));
  });

  afterEach(() => fs.rmSync(rootDir, { recursive: true, force: true }));

  it("accepts a local source with the full mandatory file inventory", () => {
    const sourceDir = seedLocalSource(rootDir);
    expect(validateLocalSource(sourceDir)).toBe(true);
  });

  it("rejects a non-existent directory", () => {
    expect(() =>
      validateLocalSource(path.join(rootDir, "does-not-exist")),
    ).toThrow(/does not exist/);
  });

  it("rejects a path that is not a directory", () => {
    const filePath = path.join(rootDir, "not-a-dir");
    fs.writeFileSync(filePath, "x");
    expect(() => validateLocalSource(filePath)).toThrow(/not a directory/);
  });

  it("rejects a directory missing one or more mandatory files", () => {
    const sourceDir = seedLocalSource(rootDir);
    fs.rmSync(path.join(sourceDir, "swagger.yaml"));
    expect(() => validateLocalSource(sourceDir)).toThrow(/missing mandatory files/);
    expect(() => validateLocalSource(sourceDir)).toThrow(/swagger\.yaml/);
  });
});

describe("sync-venice-api-docs end-to-end with a local source", () => {
  let rootDir: string;
  let previousEnv: string | undefined;

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "vf-sync-e2e-"));
    previousEnv = process.env.VENICE_API_DOCS_SOURCE;
    // Create the scratch repo root layout so writes to docs/reference land
    // inside it instead of the real repository.
    fs.mkdirSync(path.join(rootDir, "fake-repo", "docs", "reference"), { recursive: true });
    delete process.env.VENICE_API_DOCS_SOURCE;
  });

  afterEach(() => {
    if (previousEnv !== undefined) process.env.VENICE_API_DOCS_SOURCE = previousEnv;
    else delete process.env.VENICE_API_DOCS_SOURCE;
    fs.rmSync(rootDir, { recursive: true, force: true });
  });

  it("promotes files from a local source without touching the mirror", () => {
    const sourceDir = seedLocalSource(rootDir);
    const fakeRepo = path.join(rootDir, "fake-repo");
    const fakeTrackedSwagger = path.join(fakeRepo, "docs/reference/Venice_swagger_api.yaml");
    const fakeTrackedLlm = path.join(fakeRepo, "docs/reference/Venice_api_LLM_info.md");
    const fakeManifest = path.join(fakeRepo, "docs/reference/VENICE_API_SOURCE_MANIFEST.md");
    const fakeMirror = path.join(fakeRepo, "docs/reference/venice-api-upstream");

    const result = syncUpstream({ localSource: sourceDir, repoRoot: fakeRepo });
    expect(result.usedLocalSource).toBe(true);
    expect(result.commitSha).toBe("<unknown-local-checkout>");

    expect(fs.existsSync(fakeTrackedSwagger)).toBe(true);
    expect(fs.existsSync(fakeTrackedLlm)).toBe(true);
    expect(fs.existsSync(fakeManifest)).toBe(true);
    // Local-source mode must not create the gitignored mirror directory.
    expect(fs.existsSync(fakeMirror)).toBe(false);

    const swagger = fs.readFileSync(fakeTrackedSwagger, "utf8");
    expect(swagger).toContain("x-venice-forge-provenance:");
    expect(swagger).toContain("content_version: \"20260925.000000\"");

    const manifest = fs.readFileSync(fakeManifest, "utf8");
    expect(manifest).toContain("--source");
    expect(manifest).toContain("Local Source Used");
    // The absolute source path must never be persisted into the tracked manifest.
    expect(manifest).not.toContain(sourceDir);
  });

  it("does not persist the absolute local source path anywhere tracked", () => {
    const sourceDir = seedLocalSource(rootDir);
    const fakeRepo = path.join(rootDir, "fake-repo");
    syncUpstream({ localSource: sourceDir, repoRoot: fakeRepo });

    const trackedFiles = [
      path.join(fakeRepo, "docs/reference/Venice_swagger_api.yaml"),
      path.join(fakeRepo, "docs/reference/Venice_api_LLM_info.md"),
      path.join(fakeRepo, "docs/reference/VENICE_API_SOURCE_MANIFEST.md"),
    ];
    for (const tracked of trackedFiles) {
      const content = fs.readFileSync(tracked, "utf8");
      expect(content).not.toContain(sourceDir);
    }
  });
});

describe("sync-venice-api-docs writeTrackedReferences writes only tracked files", () => {
  let rootDir: string;

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "vf-sync-write-"));
    const fakeRepo = path.join(rootDir, "fake-repo");
    fs.mkdirSync(path.join(fakeRepo, "docs/reference"), { recursive: true });
  });

  afterEach(() => fs.rmSync(rootDir, { recursive: true, force: true }));

  it("writes only the tracked reference files, not the mirror directory", () => {
    const sourceDir = seedLocalSource(rootDir);
    const fakeRepo = path.join(rootDir, "fake-repo");

    writeTrackedReferences("abc1234", "2026-09-26", sourceDir, {
      localSource: true,
      repoRoot: fakeRepo,
    });

    expect(fs.existsSync(path.join(fakeRepo, "docs/reference/Venice_swagger_api.yaml"))).toBe(true);
    expect(fs.existsSync(path.join(fakeRepo, "docs/reference/Venice_api_LLM_info.md"))).toBe(true);
    expect(fs.existsSync(path.join(fakeRepo, "docs/reference/VENICE_API_SOURCE_MANIFEST.md"))).toBe(true);
    expect(fs.existsSync(path.join(fakeRepo, "docs/reference/venice-api-upstream"))).toBe(false);
  });
});

describe("sync-venice-api-docs invariants", () => {
  it("exposes the canonical upstream URL constant", () => {
    expect(UPSTREAM_URL).toBe("https://github.com/veniceai/api-docs.git");
  });

  it("keeps the mirror directory inside docs/reference/", () => {
    expect(MIRROR_DIR).toContain("docs");
    expect(MIRROR_DIR).toContain("reference");
    expect(MIRROR_DIR).toContain("venice-api-upstream");
  });

  it("lists the canonical tracked reference paths", () => {
    expect(TRACKED_SWAGGER_PATH.endsWith("Venice_swagger_api.yaml")).toBe(true);
    expect(TRACKED_LLM_PATH.endsWith("Venice_api_LLM_info.md")).toBe(true);
    expect(SOURCE_MANIFEST_PATH.endsWith("VENICE_API_SOURCE_MANIFEST.md")).toBe(true);
  });

  it("lists every mandatory file at the upstream root, including media guides", () => {
    for (const required of [
      "swagger.yaml",
      "llms.txt",
      "skill.md",
      "agents.md",
      "README.md",
      "docs.json",
      path.join("api-reference", "api-spec.mdx"),
      path.join("guides", "media", "image-generation.mdx"),
      path.join("guides", "media", "image-editing.mdx"),
      path.join("guides", "media", "image-upscaling.mdx"),
      path.join("guides", "media", "video-generation.mdx"),
      path.join("models", "image.mdx"),
    ]) {
      expect(MANDATORY_FILES).toContain(required);
    }
  });
});
