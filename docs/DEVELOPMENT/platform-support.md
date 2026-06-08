# Platform Support Matrix

| OS | Architecture | Status | Packaging | Storage |
|----|--------------|--------|-----------|---------|
| Windows 10/11 | x64 | **Supported** | NSIS, Portable | DPAPI |
| macOS 13+ | Apple Silicon (arm64) | **Supported** | DMG, ZIP | Keychain |
| macOS 13+ | Intel (x64) | **Supported** | DMG, ZIP | Keychain |
| Linux | x64 / arm64 | *Not officially packaged* | AppImage, deb, rpm (electron-builder config; CI Linux job) | Plaintext fallback only with `VENICE_FORGE_ALLOW_PLAINTEXT_KEY_STORAGE=true` (Dev Only) |
| Web (Browser) | Any | **Supported (Dev Mode)** | - | Server `.env` (Venice), LocalStorage (Jina) |

### Release / packaging hardening (VERIFY-052)

Every cross-platform packaging command (`dist:win`, `dist:portable`, `dist:mac`, `dist:mac:arm64`, `dist:mac:x64`, and the Linux job in `.github/workflows/release.yml`) is preceded by `npm run verify:icon && npm ci && npm run audit && npm run verify:release-packaging-hardening && npm run typecheck && npm test && npm run build`, and followed by `npm run checksum:release`, the platform-specific `verify:dist:*`, and `node scripts/verify-archive-clean.cjs`. The canonical Node version is **22.x** (>=22.13.0 <23) and is pinned in `engines.node`, `ci.yml`, and `release.yml`.

### Known Limitations
- Windows ARM64 is not currently packaged by default.
- A Linux AppImage/deb/rpm target exists in `electron-builder.config.cjs` and is built in the Linux CI job, but it is **not officially supported or smoke-tested** (and the only safe storage fallback on Linux requires `VENICE_FORGE_ALLOW_PLAINTEXT_KEY_STORAGE=true`).
- Windows ARM64 users can run the x64 binary through emulation but it is not a primary target.
