# Windows Release Checklist

## Version

1. Update `version` in `package.json`.
2. Run `npm install` so `package-lock.json` stays in sync.
3. Confirm `README.md` and this checklist match the release.

## Local Build

Run on Windows PowerShell:

```powershell
npm run clean
npm install
npm run typecheck
npm test
npm run build
npm run dist:win
npm run verify:dist
```

Expected artifacts:

- `release/Venice-Forge-<version>-x64-Setup.exe`
- `release/Venice-Forge-<version>-x64-Portable.exe`

## Signing

Signing is optional for local development. For distribution, configure electron-builder-compatible signing with one of:

- `CSC_LINK` and `CSC_KEY_PASSWORD`
- `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD`

Do not commit certificates or passwords. If signing variables are missing, builds are unsigned and Windows SmartScreen may warn users.

## GitHub Actions

Use `.github/workflows/windows-release.yml`.

Triggers:

- Manual `workflow_dispatch`
- Version tags matching `v*`

The workflow runs `npm ci`, typecheck, tests, build, `dist:win`, `verify:dist`, and uploads `release/*.exe`.

## Smoke Test

- Fresh launch routes to API key setup when no key exists.
- Save, test, and delete API key.
- Invalid key returns a clean `401`/`403` style message.
- Model refresh succeeds after a valid key is saved.
- Chat and image generation work.
- Export data creates versioned JSON without secrets.
- Import validates and merges data without clearing existing records.
- Copy diagnostics redacts secrets.
- Open logs folder works.
- Setup installer installs and uninstalls without deleting user data.
- Portable exe launches.

## Publish

1. Create a tag: `git tag v<version> && git push origin v<version>`.
2. Download artifacts from the workflow or use local `release/`.
3. Smoke test on a clean Windows VM.
4. Upload artifacts and checksums to the release.
5. Note whether artifacts are signed or unsigned.
