# Parent-session findings (pre-synthesis)

Baseline: c3ae21af2f723111d92b43c7888a60930226d213

## Independently confirmed

### VF-AUD-20260910-CI-001 — vitest 4.1.10 is vulnerable to CVE-2026-84373
Severity: P2
Confidence: High
Classification: CONFIRMED DEFECT
Affected: package.json vitest ^4.1.6; package-lock.json vitest 4.1.10; Dependabot alert #33
Observed: lockfile resolves vitest/@vitest/mocker to 4.1.10, which is < 4.1.11 (patched).
Expected: Dev-server mocker redirect paths validated; vitest >= 4.1.11.
Impact: Dev-only path traversal via Vite HMR websocket if the Vite server is reachable. Production packaged app is not affected. Hosted `npm audit --audit-level=critical` does not fail this medium advisory.
Remediation: Bump vitest to >= 4.1.11 and refresh lockfile.

### VF-AUD-20260910-CI-002 — joi prototype-pollution advisories (Dependabot #31, #32)
Severity: P3
Confidence: High
Classification: CONFIRMED DEFECT (transitive, development)
Scope: development (electron-builder). Exploitation requires feeding untrusted objects into joi custom messages / regex rename — not shown in first-party code.
Remediation: Override or wait for electron-builder to pick patched joi 18.2.5+.

### VF-AUD-20260910-HYG-001 — AGENT_REINITIALIZATION.md version drift
Severity: P3
Confidence: High
Classification: DOCUMENTATION DEFECT
File: AGENT_REINITIALIZATION.md:5 says 3.0.0-beta.2; package.json and AGENTS.md say 3.0.0-beta.3.

### VF-AUD-20260910-HYG-002 — tracked scratch script at repo root
Severity: P3
Confidence: High
Classification: CONFIRMED DEFECT (hygiene)
File: test-delete-session.js — leftover assertValidId smoke script, tracked.

### VF-AUD-20260910-API-001 — Workflow imageGen uses static defaults, not runtime /models constraints
Severity: P2
Confidence: High
Classification: CONFIRMED DEFECT (also open ROADMAP VF-GENERATION-CONTRACT-PARITY)
File: src/lib/workflow-engine.ts:115-127
Evidence: buildCanonicalImageGeneratePayload with steps 20, width/height 1024, hideWatermark true, DEFAULT_IMAGE_MODEL. No live capability/constraint resolver.
Impact: Workflow image nodes can emit incompatible bodies (wrong divisor, unsupported steps, dummy CFG-equivalent defaults) while Image Studio is model-aware.

### VF-AUD-20260910-API-002 — enable_document_tools is sent as a Venice venice_parameters field
Severity: P3
Confidence: Medium
Classification: LIKELY DEFECT / DESIGN RISK
File: src/stores/chat-stream-manager.ts:122-125
Swagger CreateChatCompletionRequest venice_parameters (docs/reference/Venice_swagger_api.yaml:1474-1551) does not declare enable_document_tools. Object additionalProperties is unspecified (defaults true), so the live API may ignore it rather than 400. The flag is a local Document Agent concern.
Remediation: Strip before wire; keep only in local agent context.

### VF-AUD-20260910-SEC-001 — Generic credential:get/set remains on the preload bridge
Severity: P2
Confidence: High
Classification: DESIGN RISK
Files: electron/preload.ts:87-97; electron/ipc/handlers/apiKeyHandlers.ts:426-448; src/services/desktopBridge.ts:2376-2395
API keys use typed apiKey:* (no get-raw). Generic credentials still round-trip secret values to the renderer for any non-reserved key. desktopCredentials has no production callers besides its definition, but window.veniceForge.credentials is still exposed.
Remediation: Remove unused generic get or return existence-only; keep typed password APIs.

### VF-AUD-20260910-SEC-002 — Custom protocol allows originless requests
Severity: P2
Confidence: High
Classification: DESIGN RISK (documented deferred VF-CAPABILITY-PROVENANCE)
File: electron/utils/customProtocolAccess.ts:12-42, 111-119
Opaque object IDs are the access control. Capability tokens exist as unused scaffolding.

### VF-AUD-20260910-DOC-001 — Swagger snapshot lag vs ROADMAP
Severity: P2
Confidence: High
Classification: DOCUMENTATION DEFECT / contract lag
Tracked swagger content_version 20260821.193530 (docs/reference/Venice_swagger_api.yaml:4-13). ROADMAP records official main at 20260826.105305 with extra video enhancement fields. Not proof current request bodies are invalid.

## Historical 2026-08-15 P1 revalidation (parent)

- P1-001 safe_mode injection: FULLY REPAIRED — ENDPOINTS_WITH_SAFE_MODE is only image generate/edit/multi-edit.
- P1-002 SSE: FULLY REPAIRED — shared SseDecoder used by electron/services/veniceClient.ts and web stream.ts.
- P1-003 video duration: FULLY REPAIRED at workflow boundary (fail-closed if videoDuration empty).
- P1-004 style_references: FULLY REPAIRED for image generate (payloadBuilders.modelAware.test.ts).
- P1-005 tools without function-calling: FULLY REPAIRED — resolveAvailableTools returns [] unless supportsFunctionCalling.
- P1-006 appendedMessages dropped in preload: FULLY REPAIRED — sanitizeStreamDeltaEnvelope / toRendererStreamDelta.
- P1-007 stream retry after partial output: FULLY REPAIRED — hasCommittedStreamState gate.
- P1-008 search provider/limit: FULLY REPAIRED — buildVeniceSearchPayload.

## Hosted validation already verified

- CI run 34044151608 on SHA c3ae21af: all 11 jobs success including packaged smoke mac/win/linux
- CodeQL run 34044151609 success; 0 open code-scanning alerts; 0 secret-scanning alerts
- 3 open Dependabot alerts (#31, #32, #33)

## Local validation

- lint:eslint PASS on Node 22.15.0
- typecheck in progress
