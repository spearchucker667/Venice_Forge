# Signing and Notarization

Public distribution of Electron applications requires OS-level code signing to bypass security warnings.

## Release Types and Signing Requirements

Venice Forge artifacts are classified into three levels of signing:

1. **Local unsigned builds**: Executing `npm run dist:win` or `npm run dist:mac` locally without credentials produces unsigned artifacts. These will trigger Windows SmartScreen and macOS Gatekeeper warnings.
2. **Deliberate unsigned tag drafts**: Set `RELEASE_ALLOW_UNSIGNED=true` for an explicitly approved unsigned draft exception, then remove or reset the variable after the run.
3. **Production signed/notarized tag releases**: Version tag releases (e.g. `v1.0.0`) fail closed by default if credentials are missing. See [SIGNED_ARTIFACT_EVIDENCE.md](SIGNED_ARTIFACT_EVIDENCE.md) for how to verify these.

## Windows Authenticode

Windows requires an EV or Standard Code Signing Certificate to clear SmartScreen warnings.
`electron-builder` requires the following environment variables:
- `WIN_CSC_LINK`: Path or URL to the certificate.
- `WIN_CSC_KEY_PASSWORD`: Password for the certificate.

## macOS Developer ID and Notarization

Apple requires both application signing and automated Notarization.
`electron-builder` will attempt to sign and notarize the app if the following are provided:
- `CSC_LINK` / `CSC_KEY_PASSWORD`: P12 certificate and password.
- Apple App Store Connect credentials (configured via `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID`).

`hardenedRuntime: true` and an explicit `notarize: { teamId: process.env.APPLE_TEAM_ID }` block are enabled in `electron-builder.config.cjs` only when signing credentials are configured (CI release or local builds with env vars set). Unsigned local binaries will still successfully build; the hardened runtime flag primarily affects notarization requirements for public releases.

**Never commit code signing certificates or passwords to the repository.**
