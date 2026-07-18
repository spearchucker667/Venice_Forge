# Venice Forge Deep Scan Evidence Manifest

- Snapshot: `Venice_Forge-clean-20260717-031029.zip`
- Commit: `f00cf997c69b81874ef603a3ac68577f3a48709e`
- Report: `Venice_Forge_Deep_Scan_2026-07-17_031029.md`
- Generated: `2026-07-17T10:53:18.410978+00:00`

## Status files

| File | Exit status |
|---|---:|
| `build.status` | `0` |
| `contracts-features.status` | `0` |
| `contracts-release.status` | `0` |
| `lint.status` | `0` |
| `npm-rebuild-electron.status` | `0` |
| `profile-purge-chat-history-reproduction.status` | `0` |
| `test-ci.status` | `1` |
| `test-unit-stores-canonical.status` | `0` |
| `tts-cross-profile-reproduction.status` | `0` |
| `ui-chat.status` | `0` |
| `ui-layout-rerun.status` | `0` |
| `ui-media-gallery.status` | `0` |
| `ui-media-image.status` | `0` |
| `ui-research-rerun.status` | `0` |
| `ui-settings.status` | `0` |
| `unit-types.status` | `0` |

## Primary reproductions

- `profile-purge-chat-history-reproduction.log`: demonstrates retained profile chat after main purge.
- `tts-cross-profile-reproduction.log`: demonstrates machine-global TTS cache reuse across profiles.
- `bounded-runner-process-tree-reproduction.log`: demonstrates surviving grandchild after timeout.
- `transcription-contract-evidence.txt`: compares the hardcoded model to the bundled Swagger enum.
- `formdata-safe-mode-evidence.txt` and `audio-safe-mode-contract-evidence.txt`: trace provider Safe Mode wiring gaps.

## Validation logs

- `lint.log`, `tsc-renderer.log`, `tsc-electron.log`, `build.log`
- `test-ci.log`, `test-unit-stores-canonical.log`, workflow and UI shard logs
- Markdown, release, roadmap, provider, and contract verifier logs

The report distinguishes source defects from the Electron binary download limitation caused by an offline lifecycle-disabled audit install.
