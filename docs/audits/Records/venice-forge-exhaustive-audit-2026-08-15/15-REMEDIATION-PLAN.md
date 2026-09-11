# Remediation Plan

## WP-01 — Strict API request correctness

**Objective:** Correct P1-001, P1-008, P2-001, and P2-002 with schema-derived builders.
**Affected files:** safe-mode helper/transports, search UI/provider, chat/audio payload builders/types/tests.
**Dependencies:** Refreshed tracked Swagger.
**Strategy:** Centralize logical-to-wire translation; forbid undeclared fields; retain local/provider safety separation.
**Tests:** Minimal/full schema fixtures for every affected endpoint, including multipart.
**Validation:** Focused tests, `verify:safety-guard`, `verify:venice-contract-drift`, typecheck, lint, build.
**Compatibility:** Mostly behavioral/backward-compatible; exported audio wire type needs deprecation/version review.
**Acceptance:** Exact current-Swagger bodies, explicit `safe_mode=false` preserved only where supported, no duplicate request logic.

## WP-02 — Video contract and paid-submission guard

**Objective:** Correct P1-003 before any video queue call.
**Affected files:** media contract types/builders, workflow schema/engine, approval/quote tests/docs.
**Dependencies:** WP-01 schema harness.
**Strategy:** Make duration required and model-constrained; remove foreign fields; keep quote, approval hash, and queue payload consistent.
**Tests:** Default workflow local failure, exact quote/queue bodies, duplicate submission, approval invalidation.
**Validation:** Workflow/media suites, contracts, authorized quote-only probe.
**Compatibility:** Behavioral; deprecate erroneous exported fields if public.
**Acceptance:** Invalid workflow cannot reach approval/dispatch; valid quote and queue share canonical inputs.

## WP-03 — Shared streaming conformance

**Objective:** Correct P1-002 in one shared incremental decoder.
**Affected files:** Web/Electron streaming clients and tests.
**Dependencies:** None.
**Strategy:** Stateful UTF-8 and SSE framing with typed provider/malformed errors and deterministic EOF/abort handling.
**Tests:** Shared adversarial conformance vectors over every relevant chunk boundary.
**Validation:** Parser, chat, agent, full test/build suites; authorized Unicode stream.
**Compatibility:** Behavioral/backward-compatible.
**Acceptance:** Web/Electron emit identical events/errors for identical byte streams.

## WP-04 — Agent IPC durability

**Objective:** Correct P1-006.
**Affected files:** shared stream types, handler, preload, desktop bridge, chat stream/store.
**Dependencies:** Prefer shared event type from WP-03.
**Strategy:** One serializable delta contract; validate and preserve appended messages; atomic persistence.
**Tests:** Full boundary integration and restart rendering.
**Validation:** Electron/agent/chat suites and packaged smoke.
**Compatibility:** Additive backward-compatible.
**Acceptance:** Tool messages and media/document metadata survive main-to-renderer and restart.

## WP-05 — Capability-driven tools and image references

**Objective:** Correct P1-004, P1-005, and P3-001.
**Affected files:** runtime model types/classification, chat builder, scene service/image builder, static capability config.
**Dependencies:** Current runtime model fixtures with upstream provenance.
**Strategy:** Remove invented production IDs; gate tools/references only on explicit runtime metadata; map `style_references` exactly.
**Tests:** Missing/false/true capabilities, limits/strength, catalog refresh, exact bodies.
**Validation:** Model/chat/scene contracts, typecheck, build, authorized reference image if budget approved.
**Compatibility:** Additive metadata plus behavioral correction.
**Acceptance:** No current model allowlist; unsupported capabilities fail closed with truthful UI.

## WP-06 — Retry and false-success safety

**Objective:** Correct P1-007 and align errors with partial state.
**Affected files:** chat stream manager, store/UI error model, agent tool execution guards.
**Dependencies:** WP-03 event/error semantics.
**Strategy:** Do not replay after any observable delta/tool call; mark partial results; require explicit retry; guarantee one tool execution per acknowledged call.
**Tests:** Partial output before every retryable class, abort/backoff races, exact provider call count.
**Validation:** Deterministic stream/store tests and Traffic Inspector manual verification.
**Compatibility:** Behavioral/backward-compatible.
**Acceptance:** One user send cannot silently become multiple billable generations after output begins.

## WP-07 — CI, documentation, and external acceptance

**Objective:** Prevent recurrence and close release evidence without false claims.
**Affected files:** contract verifier, CI workflows, API guide/examples, roadmap/summary, release QA evidence.
**Dependencies:** WP-01 through WP-06.
**Strategy:** Schema-generate validation vectors, shared SSE suite, IPC envelope checks, then signed/paid/cross-platform/manual acceptance.
**Tests:** Full CI plus explicit external matrix.
**Validation:** `npm run ci`, signed installer/update, paid queue/restart, accessibility/high zoom/themes.
**Compatibility:** Internal/additive.
**Acceptance:** All findings closed with executed evidence; remaining external blockers stay visibly open.
