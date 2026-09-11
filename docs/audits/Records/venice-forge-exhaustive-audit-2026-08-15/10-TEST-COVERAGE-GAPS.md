# Test Coverage Gaps

The local suite passed, but these gaps directly explain why confirmed defects remained green.

| Priority | Gap | False-confidence mechanism | Required regression |
|---|---|---|---|
| P1 | Current Swagger validation of outbound payloads | Builders are tested against hand-written expectations | Validate every operation’s minimal/full body against the refreshed schema |
| P1 | Safe-mode endpoint matrix | Tests encode the same unsupported endpoint list | Assert no foreign fields on strict schemas; test multipart and JSON paths |
| P1 | Both SSE implementations | Happy events; Electron test misdefines single newline as complete | Adversarial byte/event boundaries, multiline events, UTF-8 splits, errors, EOF |
| P1 | Workflow video default | Builder tests permit missing duration | Compile default workflow and reject locally before dispatch/approval |
| P1 | Scene reference wire request | Service mocks `buildImagePayload` | Exact `style_references` request through real builder and runtime capabilities |
| P1 | Normal-chat tool capability | Playground gates correctly; chat tests inject bodies | Unsupported/missing/supported `supportsFunctionCalling` end-to-end |
| P1 | Agent stream IPC envelope | Main and renderer tests stop on opposite sides of preload | Handler → preload → bridge → store test preserving appended messages/metadata |
| P1 | Partial-output retry | Retry test fails before the first delta | Delta/tool call then network/429/5xx; exact request count and partial state |
| P1 | Research search body | Tests assert `provider`, reproducing the bug | Exact `search_provider`/`limit` and schema-validation assertions |
| P2 | Prompt caching | Test asserts nested key | Exact top-level key and schema test |
| P2 | Audio language | Local wire type uses wrong name | Exact `language_code` and upstream-provenance fixture |
| Release | Paid/signed/cross-platform behavior | Local mocks/builds cannot prove external boundaries | Authorized live quotes/submissions; signed macOS/Windows installs; restart recovery |

No audit-only test was committed because the request is a fact-driven audit, not remediation. Each work package names the minimum regression set that must accompany its code correction.
