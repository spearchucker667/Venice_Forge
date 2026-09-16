# Media Save Pipeline Audit — 2026-07-28

> **Historical snapshot.** Retained evidence only; the live repository, `docs/ROADMAP.md`, and `docs/summary_of_work.md` are authoritative.

> [!NOTE]
> **IMMUTABLE HISTORICAL RECORD**
> This report is a point-in-time snapshot of the repository state as of July 28, 2026. It is preserved for historical context and is not updated to track current `main`.

## Executive Summary

VF-VERIFY-005 found five renderer save variants and two obsolete main-process writers that bypassed the current single-item Save As contract. The implementation now has one renderer entry point, `desktopMedia.saveMediaAs`, and one Electron export owner, `electron/services/generatedMediaExport.ts`. Generated IDs and legacy data, blob, HTTP, and allowlisted custom-protocol sources converge before the native dialog. The main process validates format signatures, normalizes filenames, and atomically writes the original bytes.

The arm64 app, DMG, ZIP, and checksums were built, and packaged launch smoke passed. The package is ad-hoc/unsigned: this Mac has no Developer ID identity or notarization profile. Signed, notarized, hardened-runtime, App Sandbox/security-scoped-bookmark, Intel macOS, and Windows acceptance remain externally blocked and are not reported as passing.

## Confirmed Defects and Corrections

| Severity | Defect and cause | Correction | Regression evidence |
|---|---|---|---|
| High | Image Studio used `saveRoutedImage`, and Gallery Inspector used `exportMedia`; both wrote to a fixed Pictures folder rather than the native single-file dialog. | Removed both IPC/preload/service surfaces and routed callers through `saveMediaAs`. | IPC absence assertions; Image and Gallery suites. |
| High | Audio and Music used renderer anchor downloads in Electron. | Route TTS, music, and uploaded/future audio sources through `saveMediaAs`; retain browser fallback only inside the canonical bridge. | Audio UI and desktop bridge suites. |
| Medium | Image Tools reported success after a cancelled native dialog. | Consume the canonical `saved | cancelled | failed` result and notify only on `saved`. | Export cancellation and bridge-result tests. |
| Medium | Format policy omitted AAC, Ogg, Opus, and audio MP4/M4A and was duplicated between persistence and export. | Added shared `mediaFormat.ts` policy used by both services. | Store and export format matrices. |
| Medium | ASCII-only filename cleanup destroyed Unicode and did not consistently handle reserved or oversized names. | NFC-preserving sanitizer, platform-invalid-character replacement, reserved-device handling, 120-character cap, and canonical extension enforcement. | Unicode, long, and Windows-reserved filename cases. |
| Low | The native-dialog verifier permanently flagged the approved bulk directory chooser. | Added its narrow allow marker; no general exception or verifier weakening. | `verify:no-native-dialogs`. |

## Canonical Architecture

```text
Gallery / Image / Image Tools / Audio / Music / Video
                         |
                         v
              desktopMedia.saveMediaAs
                 /                 \
       opaque generated ID     legacy/source URL
                 |             fetch -> bytes/MIME
                 +--------+--------+
                          v
             typed preload + validated IPC
                          v
          generatedMediaExport.saveMediaAs
                          v
         native Save dialog -> atomic byte write
```

Web mode uses the same renderer entry point and a browser blob download because no privileged filesystem bridge exists there. Bulk Media Studio export remains a distinct multi-file operation in `generatedMediaExport.ts`; it uses one approved directory chooser and the same format and atomic-write helpers.

## Media Write-Path Inventory

- `generatedMediaExport.ts`: sole user-directed Electron media export owner (single Save As and bulk export).
- `generatedMediaStore.ts` and generated-media streaming services: app-managed durable custody, not user export; bytes are addressed by opaque IDs.
- `chatTtsBridge.ts`: bounded app-managed TTS playback cache, not user export.
- `characterImageCache.ts`: app-managed character-image cache, not user export.
- `mediaService.ts`: import/read/thumbnail responsibilities; obsolete user export writer removed.
- JSON/YAML/document/backup native dialogs are non-media exports and remain out of this work order.

No renderer imports Node filesystem, path, shell, or Electron APIs. Renderer-supplied filenames are suggestions only; destination selection remains main-owned through the native dialog.

## Format and Integrity Policy

Supported families are PNG, JPEG, WebP, GIF, AVIF, MP4 video, MP3, WAV, FLAC, Ogg, Opus, AAC, and audio MP4/M4A. Export rejects empty bytes, unsupported MIME types, and signature/MIME mismatch before opening the dialog. The accepted source buffer is written byte-for-byte, preserving PNG transparency, JPEG EXIF, and audio/container metadata without transcoding. Tests compare exact output bytes, including an EXIF-bearing JPEG and an 8 MiB MP3.

Overwrite uses atomic temporary write, file sync, and rename. Cancellation performs no write and produces no success result. The generated-media route revalidates the opaque ID and stored integrity before export.

## Validation Evidence

- Node 22.13.1 / npm 10.9.2 baseline: lint, typecheck, build, and the pre-change full suite passed (4,826 passed, 1 skipped).
- Focused post-change renderer, Electron IPC, persistence, bridge, and export suites passed.
- `npm run dist:mac:arm64` produced the app, DMG, ZIP, blockmaps, and SHA-256 files.
- `RUN_ELECTRON_SMOKE=true npm run smoke:electron` passed (1/1).
- `codesign -dv` reports `Signature=adhoc`, no TeamIdentifier; `spctl` rejects the package as improperly sealed for distribution. This is blocker evidence, not signed-package acceptance.

- Final post-change gates passed: zero-warning ESLint, both TypeScript projects, 103-check aggregate contracts, and full Vitest (4,834 passed, 1 skipped across 444 files).

## Remaining Risks and Follow-up

1. Provide a Developer ID identity and notarization Keychain profile, then build and exercise the signed/notarized DMG and ZIP. Verify hardened runtime, entitlements, Gatekeeper, overwrite, custom protocols, and real Save As for representative image/audio/video records.
2. Run Windows signed-package Save As and filename acceptance.
3. Run paid-provider generation/recovery cases only with explicit expenditure authorization.
4. Exercise backup-restored and migrated real user fixtures in a disposable profile. Automated tests prove the shared source normalization and bytes, but no private production dataset was mutated in this session.

These remain tracked by `VF-VERIFY-005` in `docs/ROADMAP.md`.
