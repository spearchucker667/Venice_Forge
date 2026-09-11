# P2 Findings

## VF-AUDIT-20260815-P2-001

**ID:** VF-AUDIT-20260815-P2-001
**Severity:** P2
**Status:** CONFIRMED
**Area:** Chat prompt caching
**File:** `src/types/venice.ts`; `src/utils/payloadBuilders.ts`; `src/utils/payloadBuilders.test.ts`
**Lines:** `133`; `154-156`; `61-73`
**Symbol:** `VeniceParameters.prompt_cache_key`, `buildChatPayload`
**Evidence:** Swagger defines `prompt_cache_key` at the top level of `ChatCompletionRequest`; the type, builder, and test place it inside `venice_parameters`.
**Expected:** Top-level bounded string.
**Actual:** Nested provider parameter.
**Impact:** Prompt caching is ineffective or the request is rejected when enabled; cost/performance expectations are false.
**Root cause:** OpenAI-compatible request metadata was mistaken for a Venice-only parameter.
**Related occurrences:** The regression test protects the wrong shape.
**Authoritative Venice reference:** `ChatCompletionRequest.properties.prompt_cache_key`.
**Remediation:** Move the field to the top-level request type/builder and reject duplicates.
**Tests required:** Exact body assertion, absent/empty/boundary length, schema validation.
**Validation:** Payload-builder tests, chat tests, contract drift verifier.
**Compatibility impact:** behavioral but backward-compatible.

## VF-AUDIT-20260815-P2-002

**ID:** VF-AUDIT-20260815-P2-002
**Severity:** P2
**Status:** CONFIRMED
**Area:** Audio queue contract
**File:** `src/shared/venice-media-contract/payload-builders.ts`; `src/shared/venice-media-contract/types.ts`
**Lines:** `390-410`; audio queue wire/logical types
**Symbol:** `buildCanonicalAudioQueuePayload`
**Evidence:** The builder maps logical `language` to wire `language`; current Swagger declares `language_code`.
**Expected:** Serialize the documented `language_code` field.
**Actual:** Serialize an undocumented field.
**Impact:** Language selection may be rejected or ignored for queued music/audio generation.
**Root cause:** Logical and wire names were not separated in the canonical contract.
**Related occurrences:** Canonical builder tests do not validate against Swagger.
**Authoritative Venice reference:** `/audio/queue` request schema.
**Remediation:** Rename the wire property while preserving the logical API; document the mapping.
**Tests required:** Exact body and schema tests; multilingual queue fixture with upstream provenance.
**Validation:** Media-contract/workflow tests and contract drift verifier.
**Compatibility impact:** internal wire correction; exported wire type change may be breaking and needs deprecation/version review.
