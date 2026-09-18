# Venice API Upstream Source Manifest

> **Upstream Repository:** `https://github.com/veniceai/api-docs`
> **Upstream Branch:** `main`
> **Upstream Commit SHA:** `e787d6fe07372f7961dc292979a3bdf4b95497e3`
> **Retrieval Date:** `2026-09-18`
> **Schema Version (`info.version`):** `20260916.135625`
> **Local Reference Path (Ignored):** `docs/reference/venice-api-upstream/`
> **Tracked Canonical Snapshot:** `docs/reference/Venice_swagger_api.yaml`

---

## 1. Upstream Precedence and Source Authority

1. **Tier 1 — Wire Contract:** `docs/reference/venice-api-upstream/swagger.yaml` (OpenAPI 3.0.0, version `20260916.135625`). Defines endpoint paths, methods, request/response schemas, parameter enums, and content types.
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
npm run docs:venice:sync
```

The command refreshes the ignored upstream mirror, validates the mandatory source inventory, and promotes the Swagger and LLM-reference snapshots with provenance into the tracked knowledge base.
