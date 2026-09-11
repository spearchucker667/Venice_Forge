# Runtime test results

## Production web start — PASS

After the static-root correction, a real production build was started with:

```text
PORT=43127 HOST=127.0.0.1 npm start
```

The HTTP probe returned status 200 and `text/html; charset=utf-8`, referenced the hashed built `/assets/index-*.js`, and contained no `/src/main.tsx`. The server was stopped cleanly after the probe. The bundled integration test independently launches a bounded temporary server bundle and proves the same behavior when the process working directory is the repository root.

## Packaged Electron — PASS

`npm run dist:mac:arm64` produced an actual arm64 `.app`, DMG, ZIP, updater metadata, blockmaps, and checksums. With `RUN_ELECTRON_SMOKE=true`, all 7 smoke assertions passed across 3 files. Coverage included:

- packaged application launch;
- first-run age acknowledgement and onboarding;
- profile state persistence and trusted profile restoration after app restart;
- renderer/main bridge availability and profile-scoped chat save;
- no production `style-src` bootstrap violation;
- a deliberate inline-style negative control that proves the CSP assertion detects violations;
- packaged executable discovery.

The unpacked staging directory was removed afterward and the arm64 release artifacts passed `verify-dist.cjs --mac --arch arm64`.

## Not performed / external acceptance

- Real API-key persistence and paid Venice/provider requests.
- Signed/notarized macOS or signed Windows artifact execution.
- Two-device sync and recovery.
- Full manual screen-reader, keyboard-only, zoom, reduced-motion, or native-locale tour.

These items require credentials, signing infrastructure, multiple devices, or qualified human review. They remain explicit acceptance work and are not represented as completed runtime validation.
