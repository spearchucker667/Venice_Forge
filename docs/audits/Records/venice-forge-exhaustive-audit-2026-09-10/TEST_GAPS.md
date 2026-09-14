# Test gaps

Gaps below are tied to current findings or independently observed holes. Passing `test:ci` does not close them. Numbered TG-001–TG-016.

## TG-001 — Production js-yaml version gate

No test or verifier asserts `electron-updater`'s `js-yaml` is `>= 4.3.2`. CI relies on `npm audit`, which lagged the advisory until after the last hosted run.

Related: VF-AUD-20260910-P1-001

## TG-002 — Workflow image nodes vs live `/models`

Workflow tests exercise engine topology and payload builders against static fixtures. There is no test that a workflow `imageGen` node consumes runtime `widthHeightDivisor` / `steps.max` the way Image Studio does.

Related: VF-AUD-20260910-P2-001

## TG-003 — Preload ↔ handler parity

No automated inventory that every `ipcRenderer.invoke("…")` in `electron/preload.ts` has a `registerPrivilegedIpcChannel` / `registerIpcChannel` registration. `app:readLocalFile` drifted out of parity.

Related: VF-AUD-20260910-P3-002

## TG-004 — Generic credential IPC absence or existence-only

Handler tests cover reserved-name blocking. They do not assert that generic `credential:get` is gone or that it never returns a secret string to the renderer.

Related: VF-AUD-20260910-P2-002

## TG-005 — Chat stream body does not leak local Document Agent flags

`chat-stream-manager` tests assert `enable_document_tools` **is** present. If the field is local-only, tests currently lock in the leak.

Related: VF-AUD-20260910-P3-004

## TG-006 — Video poll timeout vs documented P80

No test freezes time at 121s with retrieve still PROCESSING. Related: VF-AUD-20260910-P1-004.

## TG-007 — Restart without ephemeral `download_url`

No test drops `ephemeralSecrets` then completes a VPS-style retrieve JSON. Related: VF-AUD-20260910-P1-005.

## TG-008 — Web gallery must not upsert signed URLs

`persistCompletedTaskMedia` is not asserted to reject `https://` expiring URLs. Related: VF-AUD-20260910-P1-006.

## TG-009 — `test:ci` shard union vs tracked tests

`test:ci` explicit store/UI shards miss 59 tracked `*.test.ts(x)` files that **do** run in the hosted `coverage` job (`vitest run`) but **do not** run in `release.yml` (`test:ci` only). `verify-ci-contract.cjs` treats a `src/<dir>` prefix as fully covered. Related process finding, not a product runtime bug.

## TG-010 — FSM media streaming cap vs real http-proxy-middleware

`server.test.ts` mocks `createProxyMiddleware`, so constructor-time `on.proxyRes` binding and unbounded interceptor buffering are invisible. Related: VF-AUD-20260910-P1-007, P2-013, P2-014.

## TG-011 — Attachment register vs agent session

No test registers via IPC without `agentSessionId` then executes `document.promoteAttachment` with a tool context that has one. Related: VF-AUD-20260910-P1-008.

## TG-012 — `Tr:` / key-name leftover sentinels

`verify:i18n` and `resourceNormalizer` reject `[XX]` and `__MISSING__:` only. 726 `Tr:` leaves and 77 key-name leftovers pass `--strict`. Related: VF-AUD-20260910-P2-019.

## TG-013 — `executeAgentTool` must parse with `argsValidator`

Registry validator tests do not prove the executor calls `parse`. Related: VF-AUD-20260910-P2-020.

## TG-014 — Signature evidence from real verifier output

`write-signature-evidence.test.ts` asserts the boolean `--unsigned` mapping. No test requires captured `codesign`/`stapler`/Authenticode text, or a missing `.app` directory failing the job. Related: VF-AUD-20260910-P2-021.

## TG-015 — Promote MIME/size from registry

No test registers `application/pdf` then tool-calls `mimeType: "text/plain"` through `executeAgentTool`. Related: VF-AUD-20260910-P2-022.

## TG-016 — Packaged-safe default avatar and modal focus trap

Message-bubble test only checks the seal filename substring, not a leading `/`. No test that ApiKeyDialog / CharacterCreatorLocalPicker / ImportPlanModal trap Tab. Related: VF-AUD-20260910-P2-023, P2-024.

## Observed non-gaps

- SSE adversarial framing is covered by `electron/services/veniceClient.sseParser.test.ts` and the shared decoder tests.
- Stream retry after partial output is gated by `hasCommittedStreamState` with focused tests.
- Packaged Electron smoke is gated in CI (`RUN_ELECTRON_SMOKE=true`) on three OSes for this SHA.
- Safety, network-boundary, and custom-protocol verifiers passed in this session.
