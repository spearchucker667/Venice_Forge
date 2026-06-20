# Building Venice Forge

This document covers all commands for local development, packaging, and validation across Windows and macOS.

## Quick Start (Development)

```bash
npm install
npm run dev:electron   # Start the desktop app in development mode
# or
npm run dev            # Start Express proxy + Vite web renderer
```

`npm run dev:web` starts only the Vite renderer. It proxies `/api/*` to
the Express proxy at `http://127.0.0.1:3000` by default; override with
`VITE_API_PROXY_TARGET` if the proxy runs elsewhere.

## Cross-Platform Validation

Before submitting a PR, always run the cross-platform baseline validations:
```bash
npm run lint:eslint
npm run typecheck
npm test
npm run verify:safety-guard
npm run verify:contracts
npm run build
npm run verify:icon
```

## Safety Regression Checks

When changing safety boundaries, prompt extraction, diagnostics redaction, or
new prompt-carrying endpoints, also run:

```bash
npm run verify:safety-guard
npx vitest run tests/safety/guardPipeline.test.ts tests/safety/enforcementBoundaries.test.ts scripts/verify-safety-guard.test.ts --fileParallelism=false
```

Use synthetic builders from `tests/safety/fixtureBuilders.ts` for unsafe test
inputs. Do not paste raw unsafe phrases into new fixtures unless a narrow,
reviewed exception is unavoidable.

## Packaging for Windows

Run the following on Windows PowerShell:
```powershell
npm run dist:win
npm run checksum:release
npm run verify:dist:win
npm run verify:dist:portable
```

This generates NSIS setup executables and portable binaries in the `release/` directory.

## Packaging for macOS

Run the following on macOS Terminal:
```bash
npm run dist:mac
npm run checksum:release
npm run verify:dist:mac
```

This generates Apple Silicon and Intel `.dmg` and `.zip` artifacts in the `release/` directory.

## Checksums
The `npm run checksum:release` script runs deterministically across platforms, outputting a `<filename>.sha256` sidecar for every `.exe`, `.dmg`, and `.zip` artifact.
