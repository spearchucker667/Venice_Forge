# Support

Use this routing guide for public support and maintenance requests.

**Maintainer:** fayeblade (@spearchucker667)

## Where to Ask

- Bugs: open a GitHub issue using the bug report template.
- Feature requests: open a GitHub issue using the feature request template.
- Security reports: follow [SECURITY.md](../SECURITY.md).
- Release and packaging questions: check [RELEASE/release.md](RELEASE/release.md).
- Architecture questions: check [ABOUT.md](ABOUT.md).
- General questions: check [FAQ.md](FAQ.md).

## What to Include

For bugs, include:

- App version from `package.json` or the Status tab.
- Runtime mode: Electron desktop or web mode.
- OS, Node.js version, and CPU Architecture (e.g., Apple Silicon vs Intel).
- Artifact type (e.g., NSIS installer, Portable exe, macOS DMG, macOS ZIP).
- For macOS locally built unsigned artifacts: Did you see Gatekeeper or quarantine errors?
- Steps to reproduce.
- Expected behavior and actual behavior.
- Sanitized diagnostics from the Status tab.

Never post Venice API keys, bearer tokens, `.env` contents, certificates, or raw logs that contain secrets.
