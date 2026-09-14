# Venice Forge — Runtime Test Results

**Audit date:** 2026-09-12

---

## Status: Automated Testing Only

This audit conducted automated testing only. Manual runtime testing (launching the packaged application and exercising UI features) was not performed during this session.

---

## Automated Smoke Test Coverage

The CI pipeline includes packaged Electron smoke tests via `tests/smoke/`:

- **macOS arm64:** `electron-smoke-macos` job in `ci.yml` — builds and launches the packaged `.app`, runs `tests/smoke/` with `RUN_ELECTRON_SMOKE=true`
- **Windows x64:** `electron-smoke-windows` job — builds and launches the packaged `.exe` / portable
- **Linux x86_64:** `electron-smoke-linux` job — builds and launches with `xvfb-run`

These smoke tests verify that:
1. The packaged app boots without immediate crash
2. Basic startup invariants are satisfied
3. No packaging or runtime bootstrap regressions exist

The CI smoke tests run against the current `main` SHA and are required to pass before merging.

---

## Local Test Results

| Test Suite | Result | Count |
|---|---|---|
| Full `npm test` | ✅ PASS | 5,844 passed, 3 skipped, 0 failed |
| Test files | 513 passed, 2 skipped | — |
| Duration | 943 seconds | — |

The 3 skipped tests are legitimate conditional skips (e.g., smoke tests that skip when `RUN_ELECTRON_SMOKE` is not set).

---

## Manual Testing Recommendation

For full manual QA coverage, the following surfaces should be tested with a live Venice API key:

1. **Chat** — text generation, streaming, stop button, system prompt, temperature/max-tokens controls
2. **Image Generation** — prompt-to-image, upscale, background removal, image editing
3. **Media Studio** — gallery, background tasks, persistence across restart
4. **Research Workspace** — session creation, deletion, exported citations
5. **RP Studio** — character editor, persona, scene context, image generation
6. **Character Cards** — import, export, validation, AI generation
7. **Settings** — theme switching, Family Safe Mode toggle, safety enforcement
8. **Traffic Inspector** — request/response tracing
9. **Sync** — profile sync (if configured)
10. **Documents/Agent** — document upload, agent tool usage

No manual QA was performed in this audit session.
