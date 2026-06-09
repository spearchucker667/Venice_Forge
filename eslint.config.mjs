import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default tseslint.config(
  js.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}", "electron/**/*.{ts,tsx}", "scripts/**/*.test.ts", "server.ts", "server.test.ts"],
    extends: [tseslint.configs.recommended],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: ["./tsconfig.json", "./tsconfig.electron.json", "./tsconfig.electron.test.json"],
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-console": ["warn", { allow: ["warn", "error"] }],
      // CANONICAL API BOUNDARY: renderer modules must not call
      // window.veniceForge.* directly. All access must route through
      // src/services/desktopBridge.ts. The only exceptions are:
      //   - desktopBridge.ts itself (the bridge implementation)
      //   - electron/preload.ts (the contextBridge surface)
      //   - src/stores/chat-store.ts (legacy module-level hydration;
      //     function-level paths have been refactored — Group C will
      //     migrate the remaining queueMicrotask).
      "no-restricted-syntax": [
        "error",
        {
          selector: "MemberExpression[object.property.name='veniceForge']",
          message: "Do not access window.veniceForge.* directly — route through src/services/desktopBridge.ts.",
        },
      ],
    },
  },
  {
    files: ["scripts/**/*.cjs", "*.config.cjs"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
      sourceType: "commonjs",
    },
    rules: {
      "no-console": "off",
    },
  },
  {
    files: ["src/services/desktopBridge.ts", "electron/preload.ts", "src/stores/chat-store.ts"],
    rules: {
      // desktopBridge is the one allowed caller; preload is the
      // contextBridge surface; chat-store.ts is documented as the
      // single legacy exception that calls chat.* directly (pre-bridge).
      "no-restricted-syntax": "off",
    },
  },
  {
    files: ["**/*.test.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    ignores: [
      "dist/**",
      "dist-electron/**",
      "release/**",
      "node_modules/**",
    ],
  }
);
