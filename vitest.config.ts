import { configDefaults, defineConfig } from "vitest/config";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import viteConfig from "./vite.config";

// CI junit output: ensure the deterministic report directory exists so the
// reporter never fails on a missing directory after a test failure.
if (process.env.GITHUB_ACTIONS === "true") {
  fs.mkdirSync(path.join(process.cwd(), "test-results"), { recursive: true });
}

// Node 26+ emits a experimental-localstorage warning unless --localstorage-file
// is provided. Suppress it only for test workers; the flag is unknown on Node 22.
const nodeMajor = parseInt(process.versions.node.split(".")[0]!, 10);
if (
  nodeMajor >= 26 &&
  !process.env.NODE_OPTIONS?.includes("--localstorage-file")
) {
  process.env.NODE_OPTIONS = `${process.env.NODE_OPTIONS ?? ""} --localstorage-file=${path.join(
    os.tmpdir(),
    "vitest-localstorage",
  )}`.trim();
}

const resolvedViteConfig = typeof viteConfig === "function" ? (viteConfig as () => Record<string, unknown>)() : viteConfig;

export default defineConfig({
  ...resolvedViteConfig,
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    exclude: [...configDefaults.exclude, "inactive-features/**"],
    pool: "forks",
    testTimeout: 30000,
    // CI-only JUnit output so failure artifacts carry real diagnostics
    // (test-results/junit.xml). Local `vite`/`vitest` developer output is
    // unchanged: the reporter is only added when GITHUB_ACTIONS is set.
    ...(process.env.GITHUB_ACTIONS === "true"
      ? {
          reporters: ["default", "junit"],
          outputFile: {
            junit: path.join(process.cwd(), "test-results", "junit.xml"),
          },
        }
      : {}),
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      // When running the dedicated script-coverage suite, only scripts/ should
      // contribute to coverage and the thresholds should reflect the scripts/
      // bar. Otherwise scripts/ are excluded and the global app thresholds apply.
      thresholds:
        process.env.COVERAGE_SCRIPTS === "true"
          ? {
              branches: 41,
              functions: 38,
              lines: 57,
              statements: 56,
            }
          : {
              branches: 59,
              functions: 68,
              lines: 73,
              statements: 70,
            },
      exclude: [
        "node_modules/",
        "dist/",
        "dist-electron/",
        "release/",
        ...(process.env.COVERAGE_SCRIPTS === "true"
          ? ["src/", "electron/"]
          : ["scripts/"]),
        "**/*.test.ts",
        "**/*.test.tsx",
        "vite.config.ts",
        "vitest.config.ts",
      ],
    },
  },
});
