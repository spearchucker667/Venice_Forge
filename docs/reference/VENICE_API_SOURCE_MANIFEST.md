# Venice API Upstream Source Manifest

> **Upstream Repository:** `https://github.com/veniceai/api-docs`  
> **Upstream Branch:** `main`  
> **Upstream Commit SHA:** `2f0f7e41e5fc6178a0e7c887eb8c43e61edd6c57`
> **Retrieval Date:** `2026-09-11`
> **Schema Version (`info.version`):** `20260911.010226`
> **Local Reference Path (Ignored):** `docs/reference/venice-api-upstream/`  
> **Tracked Canonical Snapshot:** `docs/reference/Venice_swagger_api.yaml`  

---

## 1. Upstream Precedence and Source Authority

1. **Tier 1 — Wire Contract:** `docs/reference/venice-api-upstream/swagger.yaml` (OpenAPI 3.0.0, version `20260911.010226`). Defines endpoint paths, methods, request/response schemas, parameter enums, and content types. Optional `upscale_factor` is already on Forge quote/queue builders when a caller supplies it. Enhancement-only fields (`enhancement_model`, interpolation/HDR knobs) stay unexposed until Video Studio has an enhancement-model surface gated by live `/models` constraints.
2. **Tier 2 — Endpoint Documentation:** `docs/reference/venice-api-upstream/api-reference/**`. Defines endpoint-specific operational semantics.
3. **Tier 3 — Media Guides:** `docs/reference/venice-api-upstream/guides/media/**`. Multi-step operational workflows (image generation, editing, upscaling, Seedance 2.0, Seedance face consent, video generation, TTS, STT, music, voice cloning).
4. **Tier 4 — Runtime Model Metadata:** Live `/models`, `/models/traits`, and `/models/compatibility_mapping` APIs. Authoritative for active models, dynamic constraints, pricing, and capabilities.

---

## 2. Mandatory Source File Inventory

| Category | File Path (Upstream) | Purpose |
|---|---|---|
| Root Spec | `swagger.yaml` | Primary OpenAPI 3.0.0 wire specification |
| Root Overview | `llms.txt` | Machine-readable API index and guidance |
| Root Skill | `skill.md` | Skill definition and operational overview |
| Root Agents | `agents.md` | Agent guidelines |
| Image Endpoints | `api-reference/endpoint/image/*` | Generate, Edit, Multi-Edit, Upscale, Background-Remove, Styles |
| Video Endpoints | `api-reference/endpoint/video/*` | Quote, Queue, Retrieve, Complete, Transcriptions |
| Audio Endpoints | `api-reference/endpoint/audio/*` | Quote, Queue, Retrieve, Complete, Speech (TTS), Voices (Clone), Transcriptions (STT) |
| Model Endpoints | `api-reference/endpoint/models/*` | List, Traits, Compatibility Mapping |
| Media Guides | `guides/media/image-generation.mdx` | Image generation workflows and sizing modes |
| Media Guides | `guides/media/image-editing.mdx` | Image editing (`/image/edit`), multi-edit (`/image/multi-edit`), background removal |
| Media Guides | `guides/media/seedance-face-consent.mdx` | Two-call face-media consent attestation flow (`409 needs_consent`) |
| Media Guides | `guides/media/video-generation.mdx` | Video queue, polling, private download link lifecycle |
| Media Guides | `guides/media/music-and-sound-effects.mdx` | Audio quoting (`/audio/quote`), queuing (`/audio/queue`), retrieval |
| Media Guides | `guides/media/text-to-speech.mdx` | TTS voice generation and streaming |

---

## 3. Refreshing Upstream Documentation

To refresh the local ignored mirror:

```bash
npm run docs:venice:sync
```
