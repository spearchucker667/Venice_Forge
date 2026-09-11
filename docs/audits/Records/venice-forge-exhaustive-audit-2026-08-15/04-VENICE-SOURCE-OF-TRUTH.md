# Venice Source of Truth

## Refreshed corpus

`npm run docs:venice:sync` refreshed the ignored mirror at `docs/reference/venice-api-upstream/` from `https://github.com/veniceai/api-docs.git` branch `main`.

| Datum | Value |
|---|---|
| Upstream HEAD | `6e69346b13695bd53ba33a1d34e7b28841e10f98` |
| Upstream date | `2026-08-15 01:49:10 +0000` |
| Subject | `chore: sync static model snapshot` |
| Swagger version | `20260814.194349` |
| Previous repository baseline | `db3b9f4f40fe71abff2011bcaa9c23ad797c94f3`, Swagger `20260814.153445` |

The relevant upstream diff was inspected. The Swagger change is additive: version advancement plus optional `ModelResponse.discount_to_user` constrained to `0 < value < 1`. Static-model/search/pricing support files also changed. The tracked Swagger snapshot and `docs/reference/VENICE_API_SOURCE_MANIFEST.md` were refreshed in this audit.

## Sources consulted

- `swagger.yaml`
- `agents.md`, `skill.md`, `llms.txt`
- `api-reference/endpoint/{chat,models,image,video,audio,augment}/**`
- `guides/media/**`
- `overview/**`
- `data/static-models.json` (reference only, never a production allowlist)

## Precedence used

Swagger wire schemas controlled field names, requiredness, enums, encodings, and `additionalProperties`; guides controlled operational sequences; runtime model endpoints controlled live IDs/capabilities; local tests counted only where they did not contradict those sources.
