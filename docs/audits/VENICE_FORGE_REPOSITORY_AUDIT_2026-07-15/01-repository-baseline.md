# Repository Baseline

| Property | Observed value |
|---|---|
| Canonical root | `/Users/super_user/Projects/Venice_Forge` |
| Git top-level | `/Users/super_user/Projects/Venice_Forge` |
| Branch | `main` |
| Baseline commit | `f735b101f85fdad82e879335f63d5c13b1b24d1b` |
| Initial worktree | Clean: no staged, modified, or untracked files |
| Remote | `spearchucker667/Venice_Forge` |
| Required engine | Node `>=22.13.0 <23.0.0`, npm `>=10.0.0` |
| Default shell runtime | Node 26.5.0 / npm 11.17.0 (unsupported; not used for validation) |
| Audit runtime | Node 22.13.1 / npm 10.9.2 |
| Other installed managers | pnpm 11.13.0; Yarn 1.22.22; neither is active |

The absolute-root bootstrap in `AGENTS.md` passed before edits. `node_modules/`, `dist/`, `dist-electron/`, `release/`, coverage, local config, logs, archives and `.DS_Store` files are ignored outputs. No existing user changes were overwritten or reverted.

The repository is a single npm package rather than a workspace monorepo. It has one renderer, one Electron main/preload pipeline, and one Express proxy build.
