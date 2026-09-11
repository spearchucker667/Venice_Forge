# Documentation Drift

## Corrected by this audit

- Refreshed ignored official corpus to `veniceai/api-docs@6e69346b13695bd53ba33a1d34e7b28841e10f98`.
- Updated tracked Swagger provenance/version and added the upstream `discount_to_user` schema property.
- Updated `docs/reference/VENICE_API_SOURCE_MANIFEST.md`.
- Registered this evidence bundle in `docs/DOCS_INDEX.md`, `docs/summary_of_work.md`, and the active remediation set in `docs/ROADMAP.md`.

## Confirmed drift requiring remediation

- `src/shared/veniceSafeMode.ts` comments claim unsupported endpoints accept `safe_mode`.
- Canonical media contract documentation/types label unsupported video fields as wire fields and use `language` instead of `language_code`.
- Image builder comments call `reference_image_urls` a valid image-generation field.
- Tests and feature copy imply character-reference support through an undocumented model ID.
- Chat retry behavior lacks user-facing disclosure that a replay may submit another generation.

## Authority hygiene

Historical audit records remain evidence, not status ledgers. `docs/ROADMAP.md` remains current-work authority; `docs/summary_of_work.md` records this session and validation. No historical report was edited or used to close a live finding without current source evidence.
