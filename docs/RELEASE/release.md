# Dual-Platform Release Checklist

> **Phase 2J hardening.** This checklist is wired into the new `verify:release-packaging-hardening` CI gate (`VERIFY-052`). Any change to artifact filenames, signing steps, verification commands, or the release workflow **must** keep the gate green. See the Phase 2J audit table below for the full scope.

## Version

1. Update `version` in `package.json`.
2. Run `npm install` so `package-lock.json` stays in sync.
3. Update `CHANGELOG.md` with the new version section.
4. Confirm `README.md`, `AGENTS.md`, [LEGAL.md](../LEGAL.md), [SECURITY.md](../../SECURITY.md), `SUPPORT.md`, `PRIVACY.md`, and this checklist match the release.
   - Validate Family Safe Mode and Adult Mode independently, including proof that Adult Mode does not invoke the local rule engine and that Venice API Safe Mode changes only the provider request parameter.
   - **Trigger:** Update this checklist and the linked docs whenever artifact filenames, signing steps, verification commands, or the release workflow changes.
   - **Trigger:** Update `SECURITY.md` whenever allowed Venice endpoints, safety guard boundaries, or the supported version policy changes.
5. Confirm public-facing badges and GitHub templates still point at `spearchucker667/Venice-API-connector`.

## Local Windows Build

Run on Windows PowerShell:

```powershell
npm run clean
npm ci
npm run typecheck
npm test
npm run build
npm run dist:win
npm run checksum:release
npm run verify:dist:win
npm run verify:dist:portable
```

Expected artifacts:

- `release/Venice-Forge-<version>-x64-Setup.exe`
- `release/Venice-Forge-<version>-x64-Portable.exe`
- `release/Venice-Forge-<version>-x64-Setup.exe.sha256`
- `release/Venice-Forge-<version>-x64-Portable.exe.sha256`

## Local macOS Build

Run on macOS Bash/Zsh:

```bash
npm run clean
npm ci
npm run typecheck
npm test
npm run build
npm run dist:mac
npm run checksum:release
npm run verify:dist:mac
```

Expected artifacts:

- `release/Venice-Forge-<version>-arm64.dmg` and `.zip`
- `release/Venice-Forge-<version>-x64.dmg` and `.zip`
- Associated `.sha256` checksums

## Signing & Notarization

### Windows
Signing is optional for local development. Configure electron-builder-compatible signing with `CSC_LINK`/`CSC_KEY_PASSWORD` or `WIN_CSC_LINK`/`WIN_CSC_KEY_PASSWORD` for distribution. Unsigned builds may trigger SmartScreen.

### macOS
Local macOS builds are unsigned unless valid signing credentials are supplied. Unsigned local builds will trigger Gatekeeper warnings and are not notarized.

## GitHub Actions

Use `.github/workflows/release.yml` for both Windows and macOS builds.

Triggers:
- Manual `workflow_dispatch`
- Version tags matching `v*`

The workflow runs separate Windows and macOS packaging jobs, executes `npm ci`, typecheck, tests, build, packaging commands (`dist:win` or `dist:mac`), checksum generation, and verification scripts (`verify:dist:*`), then uploads the signed or unsigned bundles as release assets.

## Architecture-Specific macOS Builds

For local single-architecture builds, use:
- `npm run dist:mac:arm64` — Apple Silicon only.
- `npm run dist:mac:x64` — Intel only.

## Smoke Test

- [ ] Fresh launch routes to API key setup when no key exists.
- [ ] Save, test, and delete API key.
- [ ] Invalid key returns a clean `401`/`403` style message.
- [ ] Model refresh succeeds after a valid key is saved.
- [ ] Chat and image generation work.
- [ ] Batch run completes successfully.
- [ ] Research (web search, scrape, text-parser) returns results.
- [ ] Public Profile Discovery authorization gate and run.
- [ ] AI Research synthesis returns cited results.
- [ ] Export data creates versioned JSON without secrets.
- [ ] Import validates and merges data without clearing existing records; pre-import backup saved to disk.
- [ ] Copy diagnostics redacts secrets.
- [ ] Open logs folder works.
- [ ] Setup installer installs and uninstalls without deleting user data.
- [ ] Portable exe launches without installation.
- [ ] `verify:dist:portable` passes (`Venice-Forge-<version>-x64-Portable.exe` + `.sha256`).
- [ ] SHA-256 checksum files match the final uploaded `.exe` files.
- [ ] Release notes state whether artifacts are signed or unsigned.
- [ ] Legal/TOS notes in [LEGAL.md](../LEGAL.md) still link to current Venice pages.

## Publish

1. Create a tag: `git tag v<version> && git push origin v<version>`.
2. Download artifacts from the workflow or use local `release/`.
3. Smoke test on clean Windows and macOS environments:
   - Verify chat, image generation, batch, research, and model browsing.
   - Test memory save, search, and injection in chat.
   - Test file, URL, and image attachments (vision models only).
   - Verify export/import and settings persistence.
4. Upload artifacts and checksums to the release.
5. Note whether artifacts are signed or unsigned.
6. Update the GitHub Release notes from `CHANGELOG.md`.

---

## Phase 2J: Release / Packaging Hardening

The release pipeline is protected by a single-source-of-truth audit at `scripts/verify-release-packaging-hardening.cjs` (wired into the `ci` script and the GitHub `release.yml` workflow). Before tagging a release, the gate must pass locally and in CI.

### What the gate checks

| Area | Assertion |
|---|---|
| Package scripts | `verify:release-packaging-hardening`, `verify:archive-clean`, `verify:dist`, `verify:research-workspace`, `verify:workspace-contracts`, `checksum:release`, `lint:eslint`, `typecheck` are all present and equal to expected strings |
| `ci` chain | Includes `verify:release-packaging-hardening` and every prior phase gate |
| Node version | `engines.node` pins Node 22 (>=22.13.0 <23); both `.github/workflows/{ci,release}.yml` pin `node-version: 22` |
| CI workflow | Runs `verify:dist` + `npm run typecheck` + `npm test` + `npm run build` before packaging |
| Release workflow | Runs `verify:dist:*` + `checksum:release` + archive hygiene after every platform packaging job |
| Electron builder | `electron-builder.config.cjs` declares `appId`, `directories`, `asar: true`, and excludes `.map` source maps |
| Docs present | `docs/RELEASE/release.md`, `docs/RELEASE/signing-and-notarization.md`, `docs/DEVELOPMENT/building.md`, `docs/DEVELOPMENT/platform-support.md`, `docs/DEVELOPMENT/troubleshooting.md` |
| `.gitignore` | Excludes `node_modules/`, `/dist/`, `/dist-electron/`, `/release/`, `/coverage/`, `.env*` (allowlisting `.env.example`), `.config/*.yaml` (allowlisting `.config/*.example.yaml`) |
| Archive hygiene | `git ls-files` contains no `node_modules/`, `dist/`, `dist-electron/`, `release/`, `coverage/`, `.env*` (non-example), `.config/*.local.yaml`, `*.db`, `*.log`, `chat-history/`, `docs/AGENTS/`, etc. (delegates to `scripts/verify-archive-clean.cjs` `BAD_PATTERNS`) |
| Icon assets | `build/icon.{ico,icns,png}` are tracked |
| Dist hygiene (build outputs) | `verify-dist.cjs` rejects source maps, test files, `.env*`, `.config/*.local.yaml`, `*.db`, `chat-history/`, `.design-captures/`, `.integration-src/` in `dist/` and `dist-electron/` (always — even in local mode) |
| Secret-leak heuristic | `verify-dist.cjs` scans text files in `dist/` and `dist-electron/` for `venice_<40+ alnum>` / `sk-<20+ alnum>` / `Bearer <20+ chars>` tokens (the regex is intentionally tight and does not match internal constants like `venice_forge_traffic_logs_v1`) |

### Verifier ordering

| Phase | Commands | Requires `npm run build`? |
|---|---|---|
| Pre-build | `npm run lint:eslint`, `npm run typecheck`, `npm test`, `npm run verify:safety-guard`, `npm run verify:markdown-links`, `npm run verify:archive-clean`, `npm run verify:release-packaging-hardening`, `npm run verify:model-aware-recipes`, `npm run verify:media-studio-power-tools`, `npm run verify:status-diagnostics`, `npm run verify:prompt-library`, `npm run verify:scene-composer`, `npm run verify:rp-studio-polish`, `npm run verify:workflow-templates`, `npm run verify:storage-privacy`, `npm run verify:research-workspace` | No |
| Build | `npm run build` | N/A (produces `dist/` + `dist-electron/` + `dist/server.cjs`) |
| Post-build | `npm run verify:dist` (and `verify:dist:win` / `verify:dist:mac` / `verify:dist:portable` / `verify:dist:release` after `dist:*` packaging) | Yes |
| Packaging | `npm run dist:win`, `npm run dist:mac`, `npm run dist:mac:arm64`, `npm run dist:mac:x64`, `npm run dist:portable` | Yes (each script runs `build` internally) |

Source archives and the `clean-repo-zip.sh` output intentionally exclude `dist/`, `dist-electron/`, and `release/`. If `verify:dist` reports a missing build directory, run `npm run build` first.

### Local release validation matrix

Run before tagging a release on Node 22:

```bash
node --version   # must report v22.x
npm ci
npm run lint:eslint
npm run typecheck
npm test
npm run verify:release-packaging-hardening
npm run verify:safety-guard
npm run verify:markdown-links
npm run build
npm run verify:dist
```

The same matrix is encoded in `npm run ci`. The release workflow also runs `verify-archive-clean` and the platform-specific `verify:dist:*` after each `dist:*` packaging step.

### Safe GPT / source ZIP command

The archive-hygiene gate exists to make sure that **no local config, secrets, dist output, or generated artifacts** end up in a ZIP you share with a third-party (including a GPT context drop, a contractor handoff, or a public mirror). Before zipping, run:

```bash
cd /Users/super_user/Projects/Windows-Venice-API-connector
node scripts/verify-archive-clean.cjs
```

Then create the archive with the canonical exclusions baked in. From the parent `Projects/` directory:

```bash
cd /Users/super_user/Projects

zip -r Windows-Venice-API-connector-CLEAN-for-GPT.zip Windows-Venice-API-connector \
  -x "*/.git/*" \
  -x "*/node_modules/*" \
  -x "*/dist/*" \
  -x "*/dist-electron/*" \
  -x "*/release/*" \
  -x "*/coverage/*" \
  -x "*/.config/*.local.yaml" \
  -x "*/.env" \
  -x "*/.env.*" \
  -x "*/.DS_Store" \
  -x "*/Thumbs.db" \
  -x "*/desktop.ini" \
  -x "*/.AppleDouble/*" \
  -x "*/.integration-src/*" \
  -x "*/.vite/*" \
  -x "*/.design-captures/*" \
  -x "*/npm-debug.log*" \
  -x "*/yarn-debug.log*" \
  -x "*/pnpm-debug.log*" \
  -x "*/chat-history/*" \
  -x "*/__pycache__/*" \
  -x "*/docs/AGENTS/*"
```

The same exclusion list is enforced by `verify-archive-clean.cjs` and `verify-dist.cjs`. If the archive fails either check, fix the local repo before sharing it.

### Platform packaging commands

| Platform | Command | Outputs |
|---|---|---|
| Windows (NSIS + portable) | `npm run dist:win` | `release/Venice-Forge-<version>-x64-Setup.exe`, `…-Portable.exe`, `.sha256` |
| Windows (portable only) | `npm run dist:portable` | `release/Venice-Forge-<version>-x64-Portable.exe`, `.sha256` |
| macOS (x64 + arm64) | `npm run dist:mac` | `release/Venice-Forge-<version>-{x64,arm64}.{dmg,zip}`, `.sha256` |
| macOS (arm64) | `npm run dist:mac:arm64` | `release/Venice-Forge-<version>-arm64.{dmg,zip}` |
| macOS (x64) | `npm run dist:mac:x64` | `release/Venice-Forge-<version>-x64.{dmg,zip}` |
| Linux (AppImage, deb, rpm) | `npm run dist:linux` | `release/Venice-Forge-<version>-{x64,arm64}.{AppImage,deb,rpm}` |

Every `dist:*` script automatically runs `verify:icon && build && electron-builder && checksum:release`. The `verify:dist:*` scripts validate the resulting artifacts and their `.sha256` sidecars.

### Checksum behavior

`scripts/checksum-release.cjs` produces a `<artifact>.sha256` sidecar for every `.exe`, `.dmg`, `.zip`, `.yml`, and `.blockmap` in `release/`. Sidecars use the canonical `<hex>  <filename>\n` format that `sha256sum -c` accepts. The corresponding `verify:dist:*` and `verify-dist.cjs --mode release` modes re-hash every artifact and reject any drift.

### Artifact naming consistency

All artifacts use the same shape:

```
Venice-Forge-<version>-<arch>[-<variant>].<ext>
```

where `<variant>` is `Setup` (NSIS), `Portable` (Windows), or omitted (macOS DMG/ZIP, Linux AppImage/deb/rpm). The naming is enforced by `electron-builder.config.cjs` `artifactName` and verified by `verify:dist.cjs` + the corresponding `verify:dist:*` modes.
