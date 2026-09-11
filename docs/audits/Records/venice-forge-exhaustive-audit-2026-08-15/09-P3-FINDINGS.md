# P3 Findings

## VF-AUDIT-20260815-P3-001

**ID:** VF-AUDIT-20260815-P3-001
**Severity:** P3
**Status:** CONFIRMED
**Area:** Runtime model metadata typing
**File:** `src/types/venice.ts`; model classification/capability types
**Lines:** model response/type declarations
**Symbol:** `VeniceModel`, image/model capability interfaces
**Evidence:** Swagger `20260814.194349` adds optional `discount_to_user`; current types do not expose it. Current style-reference capability/constraint fields are also not represented in the types consumed by scene generation. Raw model objects are spread/preserved, so the discount field is not destroyed at runtime.
**Expected:** Additive optional authoritative metadata fields with documented absence semantics.
**Actual:** Compile-time consumers cannot safely access current metadata and one feature falls back to static capability fiction.
**Impact:** No immediate general model-catalog failure; future pricing displays and capability consumers can drift or duplicate casts.
**Root cause:** Runtime preservation and TypeScript schema maintenance are not generated from the refreshed model schema.
**Related occurrences:** `supportsStyleReferences`, `maxStyleReferences`, `supportsStyleReferenceStrength`.
**Authoritative Venice reference:** `ModelResponse.discount_to_user` and model specification/constraint properties.
**Remediation:** Add optional fields, provenance-backed fixtures, and a schema/type drift assertion; never hard-code current catalog IDs.
**Tests required:** Omitted/present discount parsing; bounds; style-reference capability mapping.
**Validation:** Typecheck, model classification/store tests, contract drift verifier.
**Compatibility impact:** additive backward-compatible.
