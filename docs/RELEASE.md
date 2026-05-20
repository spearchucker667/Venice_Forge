# Release Checklist — Venice Forge

## Pre-release

- [ ] All tests pass: `npm run typecheck && npm test && npm run build`
- [ ] Version bumped in `package.json`
- [ ] `build/icon.ico` exists and is a valid multi-resolution Windows icon
- [ ] `.env` not committed (checked via `git status`)
- [ ] No real API key in any committed file
- [ ] `electron-builder.config.cjs` `appId`, `productName` match desired branding
- [ ] CHANGELOG updated (if maintained)

## Build

```bash
npm install
npm run build        # builds renderer + Electron main process
npm run dist:win     # produces NSIS installer + portable .exe
```

Output is in `release/`.

## Windows signing (optional but recommended)

To sign the installer for trusted distribution:

1. Obtain a code-signing certificate (EV or standard).
2. Add to `electron-builder.config.cjs`:
   ```js
   win: {
     certificateFile: "path/to/cert.pfx",
     certificatePassword: process.env.WIN_CERT_PASSWORD,
   }
   ```
3. Set `WIN_CERT_PASSWORD` in your CI environment.
4. Never commit the certificate or password.

## Publishing

electron-builder's `publish` is set to `null` (disabled) by default.
To publish to GitHub Releases, configure:

```js
publish: { provider: "github", owner: "your-org", repo: "your-repo" }
```

And set `GH_TOKEN` in your CI environment.

## Post-release

- [ ] Tag the release in git: `git tag v1.x.x && git push origin v1.x.x`
- [ ] Upload `release/` artifacts to GitHub Releases
- [ ] Verify the installer works on a clean Windows machine
- [ ] Update `README.md` if any setup steps changed
