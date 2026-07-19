# 06 API Contract Audit

## Canonical API Reference
The canonical source of truth for the Venice API is `docs/reference/Venice_swagger_api.yaml`.

## API Drift Verification
The codebase utilizes strict request and response adapters matching the Venice OpenAPI spec. Tests specifically assert adherence through the `verify:provider-adapters` and `verify:venice-api-docs` contract suites.
- **/chat/completions**: Matches structure. System contexts and tools injected cleanly.
- **/models & /characters**: Synchronized with catalog fetches.
- **/image/generate, /video/queue, etc.**: The application uses structured `GenerationRecipe` configurations strictly mapping payload formats to model capabilities (via `src/config/image-model-capabilities.ts`).

## Conclusion
The internal adapters mirror the external API contracts completely, reinforced by the comprehensive static automated testing matrix. No drift identified.
