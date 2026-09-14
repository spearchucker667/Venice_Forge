# Rejected findings and false-positive control

## Object URL leak in generated-media recovery

Candidate: React Doctor flagged `URL.createObjectURL()` in `background-task-store.ts`.

Result: **FALSE POSITIVE / NOT REPRODUCIBLE.** The store revokes a previous object URL when replacing it and revokes retained URLs when clearing completed tasks. Focused tests assert revocation.

## Fetch response consumed without status validation

Candidate: static React diagnostics warned that a fetch response could be read without checking status.

Result: **FALSE POSITIVE.** The relevant production code checks `response.ok` before consuming the successful response path.

## Workflow adjacency non-null assertion

Candidate: a non-null assertion appeared unsafe.

Result: **FALSE POSITIVE.** Adjacency entries are initialized for every node, and edges referencing invalid nodes are rejected/skipped before access.

## Sequential await loops

Candidate: several loop/await patterns were reported as performance bugs.

Result: **DESIGN-INTENT / NOT CONFIRMED.** Reviewed loops are bounded or preserve correctness ordering. No latency or unbounded-work evidence justified promotion.

## Generic static IPC set mismatch

Candidate: a regex inventory found more preload invocation strings than static `ipcMain.handle` string literals.

Result: **INVALID ANALYSIS METHOD.** Typed/dynamic handler registration makes literal-set comparison incomplete. Canonical Electron/contract suites passed, and no unmatched privileged channel was demonstrated.

## Packaged Electron smoke failure

Candidate: the three real smoke cases failed.

Result: **TRANSIENT ENVIRONMENTAL PRECONDITION, NOT A SOURCE DEFECT.** No packaged darwin/arm64 app existed during the initial audit attempt, so the default suite correctly skipped those cases. After `npm run dist:mac:arm64`, the real packaged suite passed 3 files / 7 tests.

## Current profile-path service traversal/over-deletion

Candidate: the new untracked profile path/purge service could delete another profile or unrelated data.

Result: **NOT CONFIRMED.** Profile IDs are validated, directory names are allowlisted, and current call-site searches did not show unrelated storage beneath the purged RP root. Retain focused containment tests before publication.
