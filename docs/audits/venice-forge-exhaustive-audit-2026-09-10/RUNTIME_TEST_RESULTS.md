# Runtime test results

## Headed local application

**Not run** in this audit session.

This environment did not drive the Electron GUI or Vite web UI through a click-path matrix. No paid Venice calls were made.

## Substitutes that were run

| Substitute | Result |
|---|---|
| Hosted packaged Electron smoke (macOS arm64, Windows portable, Linux xvfb) on SHA `c3ae21af` | PASS — CI run `34044151608` |
| `npm run test:server` (this session, Node 22.15.0) | PASS — 64 tests |
| Electron main-process vitest shard (this session, in `test:ci`) | in progress / see VALIDATION_RESULTS.md |
| `verify:safety-guard`, `verify:network-boundaries`, `verify:custom-protocol-privileges` | PASS |

## Paths not exercised live

- First-run / onboarding dialogs
- API-key save into OS secure storage
- Streaming chat with a live key
- Image/video/audio paid generation
- Document Agent approvals
- Theme Maker visual switching
- Two-device sync
- Screen-reader / keyboard-only full tour

These remain under `VF-EXTERNAL-RELEASE-ACCEPTANCE-2026-08-31` and `VF-I18N-NATIVE-REVIEW-001`.
