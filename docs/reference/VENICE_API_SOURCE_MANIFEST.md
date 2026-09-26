# Venice API Upstream Source Manifest

> **Selected Source Repository:** `https://github.com/spearchucker667/api-docs`
> **Original Upstream Repository:** `https://github.com/veniceai/api-docs`
> **Upstream Branch:** `main`
> **Upstream Commit SHA:** `db3b9f4f40fe71abff2011bcaa9c23ad797c94f3`
> **Retrieval Date:** `2026-09-26`
> **Schema Version (`info.version`):** `20260814.153445`
> **Local Reference Path (Ignored):** `docs/reference/venice-api-upstream/`
> **Tracked Canonical Snapshot:** `docs/reference/Venice_swagger_api.yaml`
> **Local Source Used:** User-selected, clean local api-docs checkout. Source files were read without fetching or modifying that checkout. This is a pinned local-source reconciliation, not a claim about current remote upstream. The absolute source path is not retained.

---

## 1. Upstream Precedence and Source Authority

1. **Tier 1 — Wire Contract:** `docs/reference/Venice_swagger_api.yaml` (OpenAPI 3.0.0, version `20260814.153445`). Defines endpoint paths, methods, request/response schemas, parameter enums, and content types.
2. **Tier 2 — Endpoint Documentation:** `api-reference/**` in the selected source. Defines endpoint-specific operational semantics.
3. **Tier 3 — Media Guides:** `guides/media/**` in the selected source. Defines multi-step media workflows.
4. **Tier 4 — Runtime Model Metadata:** Live `/models`, `/models/traits`, and `/models/compatibility_mapping` APIs. Authoritative for active models, dynamic constraints, pricing, and capabilities.

## 2. Mandatory Source File Inventory

| Category | File Path (Upstream) | Purpose |
|---|---|---|
| Root Spec | `swagger.yaml` | Primary OpenAPI 3.0.0 wire specification |
| Root Overview | `llms.txt` | Machine-readable API index and guidance |
| Root Skill | `skill.md` | Skill definition and operational overview |
| Root Agents | `agents.md` | Agent guidelines |
| Image Endpoints | `api-reference/endpoint/image/*` | Generate, edit, multi-edit, upscale, background removal, and styles |
| Video Endpoints | `api-reference/endpoint/video/*` | Quote, queue, retrieve, complete, and transcriptions |
| Audio Endpoints | `api-reference/endpoint/audio/*` | Music, text-to-speech, voice cloning, and transcription |
| Model Endpoints | `api-reference/endpoint/models/*` | List, traits, and compatibility mapping |
| Media Guides | `guides/media/*.mdx` | Image, video, audio, and consent workflows |

## 3. Refreshing Upstream Documentation

```bash
# Default: clone or refresh the gitignored mirror from the upstream URL.
npm run docs:venice:sync

# Use a pre-existing local checkout (path is never persisted).
npm run docs:venice:sync -- --source ../api-docs
VENICE_API_DOCS_SOURCE=../api-docs npm run docs:venice:sync
```

The command refreshes the upstream mirror (or reads from the supplied local source), validates the mandatory source inventory, and promotes the Swagger and LLM-reference snapshots with provenance into the tracked knowledge base. The local source path is used at runtime only and is intentionally not written to any tracked repository file.


## 4. Selected-source reconciliation — 2026-09-26

The previous snapshot was `18c329e559c724b0fc8c319cb1198d99221b3c4b`, schema `20260918.184256`. The user explicitly selected this local fork as the source of truth, so both Swagger and the LLM index now reproduce its content, with repository provenance added. This deliberately moves the documentation to an older schema; application code was not downgraded or changed. The ignored mirror is not evidence for this selected source.

Compared with the previous snapshot, the selected Swagger omits `/decisions`, `/systemone`, and the four `/audio/voice-changer/{queue,quote,retrieve,complete}` paths. It also omits their request schemas and `BackgroundRemoveImageMultipartRequest`. Shared schemas differ for chat, Responses, images, embeddings, video, audio, and model metadata; shared paths also differ for API keys and model discovery. These are source-version differences, not proof that deployed endpoints stopped working. Image requests no longer declare `anon_user_id`. `npm run verify:venice-contract-drift` fails because this source lacks `discount_to_user`, which the verifier expects. The verifier was not weakened. Runtime reconciliation remains in [the roadmap](../ROADMAP.md).

The selected editing guide and `llms.txt` still describe three inputs and PNG-only results. Swagger instead declares `capabilities.maxInputImages`, JPEG/PNG/WebP edit results, and `output_format`. Its default edit model is `firered-image-edit`, while the guide uses `qwen-edit`. Prefer Swagger plus runtime capabilities over those guide examples. Keep the imported LLM index verbatim; this note supplies the correction.

The sync helper's promotion function was used directly for this documentation-only update. The full sync command requires `guides/media/voice-changer.mdx`, absent from this selected source, and its generated manifest assumes the original upstream remote. The manifest was corrected to the verified fork provenance. Do not use the default remote sync to reproduce this review, or silently weaken the inventory validator. Both promoted bodies were compared byte-for-byte with the selected source.

See [Image Editor requirements](../DEVELOPMENT/image-editor-requirements.md) for the requested feature and supported API mapping. The snapshot records provider contract evidence, not instructions to install upstream skills or override repository safety policy.
