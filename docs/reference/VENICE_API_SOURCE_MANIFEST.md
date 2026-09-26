# Venice API Upstream Source Manifest

> **Upstream Repository:** `https://github.com/veniceai/api-docs`
> **Upstream Branch:** `main`
> **Upstream Commit SHA:** `18c329e559c724b0fc8c319cb1198d99221b3c4b`
> **Retrieval Date:** `2026-09-26`
> **Schema Version (`info.version`):** `20260918.184256`
> **Local Reference Path (Ignored):** `docs/reference/venice-api-upstream/`
> **Tracked Canonical Snapshot:** `docs/reference/Venice_swagger_api.yaml`

---

## 1. Upstream Precedence and Source Authority

1. **Tier 1 — Wire Contract:** `docs/reference/venice-api-upstream/swagger.yaml` (OpenAPI 3.0.0, version `20260918.184256`). Defines endpoint paths, methods, request/response schemas, parameter enums, and content types.
2. **Tier 2 — Endpoint Documentation:** `docs/reference/venice-api-upstream/api-reference/**`. Defines endpoint-specific operational semantics.
3. **Tier 3 — Media Guides:** `docs/reference/venice-api-upstream/guides/media/**`. Defines multi-step media workflows.
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
| Audio Endpoints | `api-reference/endpoint/audio/*` | Music, text-to-speech, voice cloning, speech-to-speech conversion, and transcription |
| Model Endpoints | `api-reference/endpoint/models/*` | List, traits, and compatibility mapping |
| Media Guides | `guides/media/*.mdx` | Image, video, audio, voice-changer, and consent workflows |

## 3. Refreshing Upstream Documentation

```bash
# Default: clone or refresh the gitignored mirror from the upstream URL.
npm run docs:venice:sync

# Use a pre-existing local checkout (path is never persisted).
npm run docs:venice:sync -- --source ../api-docs
VENICE_API_DOCS_SOURCE=../api-docs npm run docs:venice:sync
```

The command refreshes the upstream mirror (or reads from the supplied local source), validates the mandatory source inventory, and promotes the Swagger and LLM-reference snapshots with provenance into the tracked knowledge base. The local source path is used at runtime only and is intentionally not written to any tracked repository file.

## 4. Source reconciliation — 2026-09-26 (drift fix)

The tracked snapshot was previously pinned to a stale local fork commit `db3b9f4f` / schema `20260814.153445`. That commit does not declare `ModelResponse.discount_to_user` (`src/types/venice.ts:137` declares the field as part of P3-001, with coverage in `src/types/venice.test.ts`), so `npm run verify:venice-contract-drift` failed with `[DRIFT-FAIL] Swagger declares discount_to_user`.

The user authorized reverting the tracked snapshot to the upstream commit the mirror was already pointing at: `18c329e5` / schema `20260918.184256`. Both bodies (`docs/reference/Venice_swagger_api.yaml` and `docs/reference/Venice_api_LLM_info.md`) were refreshed via the canonical `writeTrackedReferences()` helper, byte-for-byte equivalent to the upstream content at that commit with provenance headers rewritten. The gitignored mirror `docs/reference/venice-api-upstream/` was already at the same commit (`18c329e5`, schema `20260918.184256`), so mirror and tracked snapshot are consistent again.

After this refresh:

- `verify:venice-api-docs` passes with `upstream_commit: 18c329e5`, `content_version: "20260918.184256"`.
- `verify:venice-contract-drift` passes all 24 contract drift assertions, including the four `ModelResponse` capability fields and the `supportsFunctionCalling` gate.
- `src/types/venice.ts` and `src/shared/modelCapabilities.ts` are unchanged; P3-001 functionality is preserved.

Compared with the previous `db3b9f4f` snapshot, `18c329e5` adds `discount_to_user:` (line 5266), `/decisions`, `/systemone`, the four `/audio/voice-changer/{queue,quote,retrieve,complete}` paths, their request schemas, `BackgroundRemoveImageMultipartRequest`, and `anon_user_id` on image requests. Shared schemas for chat, Responses, images, embeddings, video, audio, and model metadata are restored to the upstream shape; shared paths for API keys and model discovery are similarly restored.

Runtime reconciliation with the live Venice provider (model availability, current `discount_to_user` values, capability surface) remains in [`docs/ROADMAP.md`](../ROADMAP.md) and is not changed by this documentation refresh. The refresh was produced by reading the upstream commit through `git show` on a local clone of the public repository; the local clone path was never written to any tracked repository file.
