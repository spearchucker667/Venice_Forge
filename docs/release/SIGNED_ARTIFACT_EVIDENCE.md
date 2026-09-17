# Signed Artifact Evidence

> **Current status:** no production signed/notarized artifact has been verified
> in this file yet. Pending rows are placeholders only and must not be treated
> as release approval.

## Purpose

This file records verification evidence for production Venice Forge desktop artifacts.

## Required for production release

- macOS `.app`, `.dmg`, and `.zip` artifacts must be signed and notarized.
- Windows installer artifacts must have a valid Authenticode signature.
- Portable Windows artifacts must either be signed or explicitly excluded from the primary signed distribution channel.

## macOS verification commands

```bash
codesign --verify --deep --strict --verbose=4 "/Applications/Venice Forge.app"
spctl -a -vv --type execute "/Applications/Venice Forge.app"
xcrun stapler validate "/Applications/Venice Forge.app"
```

## Windows verification commands

```powershell
Get-AuthenticodeSignature ".\Venice-Forge-<version>-x64-Setup.exe" | Format-List *
Get-FileHash ".\Venice-Forge-<version>-x64-Setup.exe" -Algorithm SHA256
```

## Release evidence log

| Version | Date    |  Commit | macOS signed | macOS notarized | Windows signed | Verifier | Evidence |
| ------- | ------- | ------: | -----------: | --------------: | -------------: | -------- | -------- |
| pending | pending | pending | pending | pending | pending | pending | No signed production artifacts verified yet. |
