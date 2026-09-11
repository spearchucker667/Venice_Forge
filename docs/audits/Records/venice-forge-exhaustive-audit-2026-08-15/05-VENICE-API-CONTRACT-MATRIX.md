# Venice API Contract Matrix

This matrix maps every Venice operation referenced by production code. “Correct” means the reviewed path is consistent with Swagger `20260814.194349`; it does not imply a paid live call was executed.

| Operation | Main callers | Body/encoding | Response/stream handling | Audit status |
|---|---|---|---|---|
| `GET /models` | catalog/status/diagnostics | none | JSON list, runtime classification | Correct; P3 optional type drift |
| `GET /models/traits` | catalog discovery | none | JSON traits | Correct |
| `GET /models/compatibility_mapping` | compatibility discovery | none | JSON mapping | Correct |
| `GET /characters`, `GET /characters/{slug}` | character discovery | query/path | JSON normalization | Correct |
| `POST /chat/completions` | chat/playground/agent | JSON, optional stream/tools | Web + Electron SSE | P1 streaming/tool gating; P2 cache-key placement |
| `POST /embeddings` | embeddings client | JSON | JSON vectors | P1 foreign `safe_mode` injection |
| `POST /image/generate` | image UI/workflow/agent/scenes | JSON | JSON/base64/URLs normalized | P1 invalid scene references |
| `POST /image/edit` | image tools/workflow | multipart | JSON image result | Correct for reviewed core fields |
| `POST /image/multi-edit` | multi-edit | multipart | JSON image result | Correct for reviewed core fields |
| `POST /image/upscale` | image tools/workflow | multipart/JSON adapter | binary/JSON normalized | Correct |
| `POST /image/background-remove` | image tools | multipart/JSON adapter | binary image | Correct |
| `GET /image/styles` | image UI | none | JSON style list | Correct |
| `POST /video/quote` | workflow/media contract | JSON | quote JSON | P1 requiredness/foreign fields |
| `POST /video/queue` | workflow/background tasks | JSON | durable queue ID | P1 default request invalid/foreign fields |
| `POST /video/retrieve` | main polling | JSON | status/private URL | Correct locally; live unverified |
| `POST /video/complete` | completion helper | JSON | completion response | Structurally reviewed; live unverified |
| `POST /video/transcriptions` | media transcription | multipart/JSON adapter | transcription response | Structurally reviewed; live unverified |
| `POST /audio/quote` | workflow/media | JSON | quote JSON | Structurally reviewed |
| `POST /audio/queue` | workflow/background tasks | JSON | durable queue ID | P2 `language` vs `language_code` |
| `POST /audio/retrieve` | main polling | JSON | status/private URL | Correct locally; live unverified |
| `POST /audio/complete` | completion helper | JSON | completion response | Structurally reviewed; live unverified |
| `POST /audio/speech` | TTS | JSON/binary | bounded audio response | P1 foreign `safe_mode` injection |
| `POST /audio/transcriptions` | STT | multipart | transcription JSON | P1 foreign `safe_mode` form field |
| `POST /audio/voices` | voice clone | multipart | JSON voice result | Structurally reviewed; live unverified |
| `POST /augment/search` | search/research | JSON | normalized results | P1 wrong names plus foreign `safe_mode` |
| `POST /augment/scrape` | search/research | JSON | normalized page | P1 foreign `safe_mode` |
| `POST /augment/text-parser` | ingestion | multipart | parsed text | P1 foreign `safe_mode` form field |

## Cross-field conclusions

- Strict schemas with `additionalProperties: false` make foreign-field injection a request failure, not harmless forward compatibility.
- `/video/queue.duration`, `/video/quote.duration`, and the correct research fields (`search_provider`, `limit`) are authoritative required/name constraints.
- `/image/generate` uses `style_references[{image,strength}]`; `reference_image_urls` belongs to video queue, not image generation.
- `prompt_cache_key` is top-level chat request metadata, outside `venice_parameters`.
- Model IDs and `supportsFunctionCalling`/`supportsStyleReferences` must come from runtime discovery.
