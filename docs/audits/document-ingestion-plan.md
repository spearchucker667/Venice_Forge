# Document Ingestion Plan

## Pre-existing Failures
- `npm test -- --runInBand` fails because `--runInBand` is not a valid Vitest 4 flag. Substitute with `--fileParallelism=false`.

## Phase 0 — Baseline
- [x] Run baseline validation.
- [x] Record pre-existing failures.
- [x] Inspect current attachment, chat, parser, and rendering files.
- [x] Confirm exact current limitations.
- [x] Create `docs/audits/document-ingestion-plan.md`.

## Phase 1 — Types and classifier
- [x] Add `src/types/ingestion.ts`.
- [x] Add file classifier.
- [x] Add limits/errors modules.
- [x] Add classifier tests.

## Phase 2 — Local text/code ingestion
- [x] Implement text ingestion.
- [x] Implement markdown/code ingestion.
- [x] Add language detection.
- [x] Add context wrapper.
- [x] Add truncation handling.

## Phase 3 — PDF/DOCX/DOC ingestion
- [x] Wrap existing PDF parser into ingestion service.
- [x] Add DOCX parser using dynamic `mammoth`.
- [x] Add DOC parser-required route.
- [x] Add Venice parser fallback function.
- [x] Add tests.

## Phase 4 — Image ingestion and vision gating
- [x] Expand image type support.
- [x] Add metadata extraction.
- [x] Add downscaling/normalization.
- [x] Add SVG safety handling.
- [x] Add vision requirement metadata.
- [x] Add exact toast behavior.

## Phase 5 — Chat UI integration
- [ ] Replace image-only input with universal attachment dropzone.
- [ ] Add attachment tray cards.
- [ ] Add preview modal.
- [ ] Update send behavior.
- [ ] Preserve existing chat streaming behavior.
- [ ] Preserve memory injection behavior.

## Phase 6 — Research integration
- [ ] Upgrade Text Parser tab into Documents tab.
- [ ] Add local parse preview.
- [ ] Add parser fallback.
- [ ] Save parsed documents to Research Workspace.
- [ ] Preserve source/citation metadata.

## Phase 7 — Markdown/LaTeX rendering
- [ ] Add `RichMarkdownRenderer`.
- [ ] Add KaTeX support.
- [ ] Add sanitizer.
- [ ] Replace ad-hoc markdown rendering in chat/research previews.
- [ ] Add renderer tests.

## Phase 8 — Storage/privacy/docs
- [ ] Verify no raw binary persistence by default.
- [ ] Update docs.
- [ ] Add verifier.
- [ ] Update changelog/summary.
