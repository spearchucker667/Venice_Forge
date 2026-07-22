# 01 File Inventory

## Top-Level Directories

| Directory | Purpose | Version Control | Classification | Status |
|---|---|---|---|---|
| `.config` | Configuration files for tools or IDEs. | Should be tracked | Configuration | Keep |
| `.design-captures` | Design captures/screenshots. | Generally untracked | Historical evidence | Review for tracking/archive |
| `.impeccable` | Impeccable tool config/cache. | Untracked | Cache | Gitignore |
| `.superpowers` | Superpowers design tool artifacts. | Untracked | Cache | Gitignore |
| `.vscode` | VSCode settings and launch configs. | Tracked | Configuration | Keep |
| `assets` | Static media assets, icons, fonts, branding. | Tracked | Source | Keep |
| `build` | Electron builder output and release artifacts. | Untracked | Generated/Release | Gitignore |
| `config` | Application-level configuration files (e.g., themes). | Tracked | Source | Keep |
| `coverage` | Test coverage output. | Untracked | Generated/Cache | Gitignore |
| `dist` | Vite build output for renderer. | Untracked | Generated | Gitignore |
| `dist-electron` | Compiled Electron main/preload code. | Untracked | Generated | Gitignore |
| `docs` | Documentation and architecture records. | Tracked | Documentation | Requires deep audit |
| `electron` | Main process and preload script source code. | Tracked | Source | Keep |
| `inactive-features` | Deprecated features (e.g. research-browser). | Tracked | Source/Historical | Keep as archive |
| `node_modules` | NPM dependencies. | Untracked | Generated | Gitignore |
| `public` | Public assets served directly by Vite. | Tracked | Source | Keep |
| `scratch` | Temporary scripts and outputs. | Untracked | Cache | Gitignore |
| `scripts` | Build, release, and verification scripts. | Tracked | Source | Keep |
| `src` | React frontend and shared renderer code. | Tracked | Source | Keep |
| `tests` | Unit, integration, and E2E tests. | Tracked | Test | Keep |

## Top-Level Files (Selection)
- `.cursorrules`, `.windsurfrules`, `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`: AI Agent rules/instructions.
- `package.json`, `package-lock.json`: NPM package manifests.
- `vite.config.ts`, `vitest.config.ts`: Vite and test configurations.
- `tsconfig.json`, `tsconfig.electron.json`: TypeScript configurations.
- `eslint.config.mjs`: Linter configuration.
- `electron-builder.config.cjs`: Packaging configuration.
- `server.ts`, `server.test.ts`: Express development server and proxy tests.
- `rewrite_history.py`, `update_history.py`, `scratch.diff`: Ad-hoc scratch/script files. Should likely be ignored or removed.
