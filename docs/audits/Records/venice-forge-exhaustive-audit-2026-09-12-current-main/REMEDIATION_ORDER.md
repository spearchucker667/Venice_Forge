# Remediation Order

Recommended implementation sequence based on dependency topology and blast radius, not merely severity.

## Phase 1 — Safety & data integrity (blocks release)

These fixes change user-visible behavior and require focused regression tests.

1. **VF-AUD-20260912-GSS-P1-001** — Streaming Family Safe Mode parity: buffer or incrementally screen chat SSE deltas before renderer delivery.
2. **VF-AUD-20260912-GSS-P1-002** — Mandatory guard field budget: always extract the final user/system messages regardless of total history length.
3. **VF-AUD-20260912-VCS-P1-002** — Web proxy streaming screening: apply the same response-screening path to `/chat/completions` SSE.
4. **VF-AUD-20260912-VCS-P1-004** — Partial-stream rollback: do not commit buffered deltas when the stream is later blocked or fails.
5. **VF-AUD-20260912-STOR-P1-001** — Pin Argon2id KDF parameters in `.vfbackup` import; consider moving KDF off the main thread.
6. **VF-AUD-20260912-STOR-P1-002** — Distinguish systemic key failure from per-file corruption in the vault.
7. **VF-AUD-20260912-STOR-P1-003** — Atomic vault master-key write (temp + rename).
8. **VF-AUD-20260912-STOR-P1-004** — Preserve avatar when `saveCharacterCard` payload omits avatar data.
9. **VF-AUD-20260912-ZST-P1-014** — Remove or disclose RP-chat cascade delete on character-card removal.

## Phase 2 — Core API & transport correctness

10. **VF-AUD-20260912-VCS-P1-001** — Fix TTS body shape mismatch (`chatTtsBridge` expects Buffer; canonical client returns `{dataBase64}`).
11. **VF-AUD-20260912-VCS-P1-003** — Fix `RpChatView` request shape: drop invented `endpoint`, add `stream: true`.
12. **VF-AUD-20260912-IPC-P1-001** — Align `conversations:save` preload envelope with handler expectation.
13. **VF-AUD-20260912-SEC-P1-001** — Add `venice-tts:` to CSP `media-src`.
14. **VF-AUD-20260912-VCS-P2-006** — Exclude billable POSTs from idempotent retry policy or make retry idempotent.
15. **VF-AUD-20260912-VCS-P2-005** — Add absolute stream lifetime on Electron.

## Phase 3 — IPC contract parity

16. **VF-AUD-20260912-IPC-P2-002** — Remove or expose dead `documentAgent:workspace:propose*` handlers.
17. **VF-AUD-20260912-IPC-P2-003** — Remove dead generic `credential:set/get/delete` surface.
18. **VF-AUD-20260912-IPC-P3-006** — Fix rate-limit wrapper return-type mutation.
19. **VF-AUD-20260912-IPC-P3-005** — Consistent main-frame sender gating.
20. **VF-AUD-20260912-IPC-P3-007** — Profile-scope inspector telemetry broadcast.

## Phase 4 — Persistence & state consistency

21. **VF-AUD-20260912-STOR-P2-006** — Unique temporary filenames in storage services.
22. **VF-AUD-20260912-STOR-P2-007** / **P3-013** — Vault journal compaction and media artifact reaping.
23. **VF-AUD-20260912-STOR-P2-008** — Prune departed devices from sync ack collection.
24. **VF-AUD-20260912-ZST-P2-018** — Atomic `patchMedia` read-modify-write.
25. **VF-AUD-20260912-ZST-P2-016** — Bootstrap normalization path.
26. **VF-AUD-20260912-ZST-P2-017** — Persist blank persona/lorebook/scenario records.
27. **VF-AUD-20260912-ZST-P2-019** — Await `persistCompletedTaskMedia` and surface failures.
28. **VF-AUD-20260912-ZST-P2-020** / **STOR-P2-005** — Preserve future-version chat files on downgrade.

## Phase 5 — Tests & verifiers

29. Add packaged-renderer CSP delivery smoke test.
30. Add streaming FSM regression tests (Electron + web proxy).
31. Add IPC consumer-liveness verifier.
32. Add TTS end-to-end body-shape test against real `parseBody` output.
33. Add fragmented tool-call accumulation test.
34. Add concurrent `patchMedia` / `upsertDerivative` test.

## Phase 6 — Defense-in-depth & polish

35. **VF-AUD-20260912-SEC-P2-002** / **STOR-P2-009** — Wire capability tokens for custom protocols.
36. **VF-AUD-20260912-GSS-P2-004** — Extend `redactSecrets` token families.
37. **VF-AUD-20260912-GSS-P3-006** — Fail-closed safety snapshot on config-load failure.
38. **VF-AUD-20260912-GSS-P3-007** / **IMP-004** — Tighten `LOCAL_PATH_PATTERN`.
39. **VF-AUD-20260912-ZST-P3-021** — Verify `settings-store` `partialize` for `pendingSettingsSection`.
40. **VF-AUD-20260912-ZST-P3-022** — Distinguish load-failure from empty-library states.
41. **IMP-013** — Refresh `AGENT_REINITIALIZATION.md` version claims.

## Parallelizable groups

- Phase 1 and Phase 2 can proceed in parallel once the safety/streaming architecture is agreed upon.
- Phase 3 (IPC parity) is independent of Phase 4 (persistence) except for the `conversations:save` fix, which is in Phase 2.
- Phase 5 test additions should be authored alongside each fix, not deferred.
