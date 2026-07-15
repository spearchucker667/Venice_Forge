# Tests and Coverage

The suite contains 365 test files across server, Electron, ingestion, renderer/unit/UI, contract/security and environment-specific smoke groups. Segmented `test:ci` ownership is enforced so every non-smoke test file belongs to a segment. Tests run serially where shared IndexedDB/global state makes parallel execution unsafe.

| Area | Evidence / assessment |
|---|---|
| Express proxy | 59 route/security tests in `server.test.ts`. |
| Electron main/IPC/services | Broad unit/integration coverage, including descriptor-read regression added as `VERIFY-126`. |
| Renderer/services/stores | Component, store, migration and safety suites; CharacterLibrary redaction regression added. |
| Contracts | Named guards `VERIFY-001` through `VERIFY-126`, audit scripts and workflow parity. |
| Smoke | Electron and research-browser suites are opt-in/environment-specific; skips are intentional and documented. |
| Coverage | 4,284 tests passed across 360 files. Statements 72.33%, branches 64.09%, functions 70.40%, lines 75.59%; every enforced threshold passed. |

Three skip sites were inspected: archive-clean conditionally skips when an external scanner is unavailable; Electron and research-browser smoke require their explicit runtime flag/display. None hides a normal unit failure. The `expect(true)` in the child-exploitation guard test follows an import-time invariant that throws on failure; it is weakly expressive but not a false pass.

The focused remediation run passed 28 tests. Full segmented CI and the independent coverage run both passed; aggregate CI success was not substituted for coverage evidence.
