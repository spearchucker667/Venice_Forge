# Platform Support Matrix

| OS | Architecture | Status | Packaging | Storage |
|----|--------------|--------|-----------|---------|
| Windows 10/11 | x64 | **Supported** | NSIS, Portable | DPAPI |
| macOS 13+ | Apple Silicon (arm64) | **Supported** | DMG, ZIP | Keychain |
| macOS 13+ | Intel (x64) | **Supported** | DMG, ZIP | Keychain |
| Linux | x64 / arm64 | *Not officially packaged* | - | Plaintext fallback only with `VENICE_FORGE_ALLOW_PLAINTEXT_KEY_STORAGE=true` (Dev Only) |
| Web (Browser) | Any | **Supported (Dev Mode)** | - | Server `.env` (Venice), LocalStorage (Jina) |

### Known Limitations
- Windows ARM64 is not currently packaged by default.
- A Linux AppImage target exists in `electron-builder.config.cjs` but is **not officially supported** or smoke-tested.
