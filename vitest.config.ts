import { defineConfig } from "vitest/config";
import viteConfig from "./vite.config";

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
        global: {
          branches: 70,
          functions: 80,
          lines: 80,
          statements: 80,
        },
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
