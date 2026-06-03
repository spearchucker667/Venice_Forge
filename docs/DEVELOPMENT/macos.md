# macOS Support

Venice Forge officially supports macOS 13+ on both Apple Silicon (`arm64`) and Intel (`x64`) architectures.

## Local Building

macOS packaging requires `build/icon.icns` (and `verify:icon` additionally checks `build/icon.ico` for cross-platform completeness). 

To build locally:
```bash
npm run clean
npm install
npm run typecheck
npm test
npm run build
npm run verify:icon
npm run dist:mac
npm run checksum:release
npm run verify:dist:mac
```

You can target a specific architecture via:
- `npm run dist:mac:arm64`
- `npm run dist:mac:x64`

### Expected Artifacts
The build outputs will be in the `release/` directory:
- `Venice-Forge-<version>-arm64.dmg`
- `Venice-Forge-<version>-arm64.zip`
- `Venice-Forge-<version>-x64.dmg`
- `Venice-Forge-<version>-x64.zip`

## Security Posture

### API Key Storage
API keys (Venice and optional Jina) are securely persisted using the Electron `safeStorage` API, which binds directly to your macOS Keychain.
If macOS Keychain is unavailable or errors out, Venice Forge will refuse to store any API key. There is no plaintext fallback available for macOS.

### Gatekeeper and Quarantine
Local builds are unsigned by default. `electron-builder` does not apply an ad-hoc signature when signing credentials are absent, so local `.dmg` or `.zip` files will trigger macOS Gatekeeper's quarantine flag.

For your own locally trusted builds, you can remove the quarantine flag using:
```bash
xattr -dr com.apple.quarantine "/Applications/Venice Forge.app"
```
**Warning:** Never use this command to bypass Gatekeeper for untrusted or internet-downloaded binaries.

## Data Locations
- **API Key (Encrypted)**: `~/Library/Application Support/Venice Forge/secure-prefs.json`
- **Application Logs**: `~/Library/Application Support/Venice Forge/logs/venice-forge.log`
- **Images, Chats, Settings**: Renderer IndexedDB

For automated notarization and signing instructions for public releases, refer to [SIGNING_AND_NOTARIZATION.md](../RELEASE/signing-and-notarization.md).
