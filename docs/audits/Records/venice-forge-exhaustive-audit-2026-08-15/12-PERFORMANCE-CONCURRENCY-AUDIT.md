# Performance and Concurrency Audit

## Confirmed issue

`VF-AUDIT-20260815-P1-007` is the principal concurrency/cost defect. Automatic retry can overlap the logical lifetime of a partially observed stream and replay tool-capable paid work without continuation or idempotency.

## Reviewed controls

- Stream cancellation uses signal IDs in Web/Electron and main tracks active requests.
- Background polling is bounded, persists durable queue identifiers, and does not persist ephemeral signed download URLs.
- Background “retry” resumes an existing queued task rather than blindly submitting a new paid generation.
- Store tests cover batching/flush behavior, profile isolation, and selected race conditions.
- Document/workspace search and read paths enforce result/byte bounds.
- Media output sizes and request bodies are bounded in the reviewed clients.

## Remaining performance evidence gaps

- No profiler trace was captured for very large chat histories, galleries, documents, or research workspaces in this audit.
- Forced-crash recovery during queue finalization and concurrent duplicate UI submission need process-level tests.
- SSE byte-by-byte regressions should include memory ceilings and cancellation cleanup.
- Cross-platform filesystem performance and large-media exports remain outside local evidence.

No other P1/P2 performance defect was confirmed from static traces and executed tests.
