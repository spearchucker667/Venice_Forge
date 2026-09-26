# Venice API Upstream Source Manifest

> **Upstream Repository:** `https://github.com/veniceai/api-docs`
> **Upstream Branch:** `main`
> **Upstream Commit SHA:** `18c329e559c724b0fc8c319cb1198d99221b3c4b`
> **Retrieval Date:** `2026-09-26`
> **Schema Version (`info.version`):** `20260918.184256`
> **Local Reference Path (Ignored):** `docs/reference/venice-api-upstream/`
> **Tracked Canonical Snapshot:** `docs/reference/Venice_swagger_api.yaml`

> **Note on the local source option (added 2026-09-26):** The sync script now supports `--source <path>` and `VENICE_API_DOCS_SOURCE` so a developer can reuse a pre-existing api-docs checkout instead of cloning into the gitignored mirror. If the supplied checkout is itself a fork of `veniceai/api-docs` whose `main` is behind the upstream `main`, the snapshot will reflect that fork's HEAD — that is the user's responsibility to keep current. The path is consumed at runtime only and is intentionally not persisted to any tracked repository file. Use the default remote path (`npm run docs:venice:sync` with no `--source`) when the canonical upstream is required.

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
