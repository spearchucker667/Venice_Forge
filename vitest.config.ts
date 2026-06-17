import { defineConfig } from "vitest/config";
import path from "node:path";
import os from "node:os";
import viteConfig from "./vite.config";

// Node 26+ emits an experimental-localStorage warning unless --localstorage-file
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
    fileParallelism: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      thresholds: {
        branches: 61,
        functions: 68,
        lines: 73,
        statements: 70,
      },
      exclude: [
        "node_modules/",
        "dist/",
        "dist-electron/",
        "release/",
        "scripts/",
        "**/*.test.ts",
        "**/*.test.tsx",
        "vite.config.ts",
        "vitest.config.ts",
      ],
    },
  },
});
