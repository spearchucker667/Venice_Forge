# Test Gaps

## Findings that expose missing regression coverage

| ID | Missing test |
|---|---|
| VF-AUD-20260912-SEC-P3-004 | No automated assertion that the production CSP is delivered to the packaged `file://` renderer |
| VF-AUD-20260912-GSS-P1-001 | No test that streaming chat with guard-triggering final body delivers zero deltas |
| VF-AUD-20260912-GSS-P1-002 | No test for >32 non-empty messages; newest message screening not asserted |
| VF-AUD-20260912-GSS-P2-003 | No test asserting a blocking signal past character 8,000 of a single field is caught |
| VF-AUD-20260912-IPC-P1-001 | No test exercises the actual preload envelope for `conversations:save` |
| VF-AUD-20260912-VCS-P1-001 | `chatTtsBridge` test mocks the wrong response shape; real body path untested |
| VF-AUD-20260912-VCS-P1-003 | No integration test for `RpChatView` → `veniceStreamChat` request shape |
| VF-AUD-20260912-VCS-P1-004 | No test commits partial stream then asserts rollback on 451 |
| VF-AUD-20260912-ZST-P2-015 | No test for fragmented tool-call accumulation across SSE deltas |
| VF-AUD-20260912-ZST-P2-016 | No test asserting bootstrap normalization removes trailing empty assistant messages |
| VF-AUD-20260912-ZST-P2-017 | No test that `createBlank` survives reload |
| VF-AUD-20260912-ZST-P2-018 | No concurrency test for `patchMedia` atomicity |

## Test-quality observations

- **Conditional skips:** 3 files use environment-gated skips (`tests/smoke/*.test.ts`, `scripts/verify-archive-clean.test.ts`). These are intentional and documented.
- **No `.only` / `.skip` abuse:** repository-wide grep found no `.only(` or unconditional `.skip` in production test files.
- **Mock fidelity risk:** several tests mock the canonical client at the wrong layer (e.g., TTS body shape), allowing implementation drift. Recommend contract tests against real `parseBody` output.
- **No packaged-renderer CSP test:** the most significant latent regression risk is untested at the integration level.

## Recommended test additions

1. Packaged-renderer CSP delivery test (Electron smoke).
2. Streaming safety parity tests for Electron, web proxy, and bridge server.
3. IPC parity consumer-liveness test: every preload method must have a non-test renderer consumer.
4. End-to-end vault save test using the actual preload envelope.
5. Concurrent media persistence stress test.
6. Tool-call fragmentation test for chat-stream-manager.
