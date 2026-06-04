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
      // SAFETY GUARD CONTRACT: the IPC layer (electron/ipc/handlers.ts) is the
      // authoritative safety-guard boundary. Renderer modules must not call
      // window.veniceForge.venice.* directly; they must route through
      // src/services/desktopBridge.ts so the IPC handler intercepts the
      // call and runs assessChildExploitationSafety(). The single exception
      // is the desktopBridge itself, plus the preload (which is the
      // contextBridge surface, not consumer code).
      "no-restricted-syntax": [
        "error",
        {
          selector: "MemberExpression[object.property.name='veniceForge'][property.name=/^(request|streamChat|abort)$/]",
          message: "Do not call window.veniceForge.venice.* directly — route through src/services/desktopBridge.ts so the IPC handler runs the safety guard.",
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
