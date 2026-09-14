# Security Review — audit of `main` @ `c6d9bed3`

Scope: Electron trust boundary, IPC parity, capability tokens, CSP, secrets handling,
custom protocols, path containment, and static search pass (work order §8, §14, §28).

## Electron trust boundary — verified intact

- `contextIsolation` / no `nodeIntegration` / sandboxed preload surface verified via the
  repository's own contract tests (included in `npm test` and
  `verify:custom-protocol-privileges`); no renderer Node primitives exposed.
- Window creation: `setWindowOpenHandler` denies all popups and routes trusted external
  URLs through `promptExternalLink` (user-confirmed `shell.openExternal`); devtools
  auto-closed in production unless explicitly enabled; navigation confined to
  `loadURL(Vite dev)` / `loadFile(packaged)`.
- Permission requests: `session.defaultSession.setPermissionRequestHandler` denies all.
- All IPC goes through `registerPrivilegedIpcChannel` with payload validation,
  main-frame requirements where dialogs/writes are involved (post-IPC-P3-005), and
  `redactErrorMessage` at every error boundary.

## IPC parity — verified

- `npm run verify:contracts:static` includes `scripts/verify-ipc-parity.cjs`:
  **0 handler orphans, 0 renderer orphans** at HEAD; every preload surface is backed by
  a main handler and every handler is reachable from the renderer. The prior audit's
  dead-channel removals (`documentAgent:workspace:propose*`, generic `credential:*`,
  `updates:checking`) were re-verified absent.
- `conversations:save` envelope: preload sends `{ record, origin }`
  (`electron/preload.ts:414`); handler validates `version`, id shape, size cap
  (`electron/ipc/handlers/systemHandlers.ts:431-460`), sync-packet emission gated on
  `origin === "local-user"`. Correct at HEAD.

## Capability tokens (VF-CAPABILITY-PROVENANCE) — verified with one minor defect

- Issuance (`electron/ipc/handlers/fileHandlers.ts:88-121`): scheme allowlist
  (`venice-media` | `venice-tts` | `venice-character-cache`), 64-hex object-id check,
  profile bound from `getProfileSessionId(event.sender)`, session bound to
  `event.sender.id`, `requireMainFrame: true`.
- Verification (`electron/main.ts:404-433, 474-481`): every custom-protocol handler
  calls `authorizeCustomProtocolCapability` before serving; `venice-tts` additionally
  binds `expectedProfileId` and validates both path components; defense-in-depth origin/
  referrer checks retained; containment via `checkPathContained` and
  `readRegularFileNoFollow` (TOCTOU-safe descriptor reads) in the character-cache path.
- Revocation: on profile switch (`apiKeyHandlers.ts:544-545`), renderer destroy
  (`main.ts:49`), shutdown (`main.ts:115,557`).
- **Defect:** expired tokens are only removed lazily on re-verification
  (`customProtocolAccess.ts:315-321`) — see C6-P3-001.

## CSP — verified correct at the application layer

- `rendererCsp(false)`: `script-src 'self'` (no inline/eval), `style-src 'self'`,
  `media-src 'self' blob: venice-media: venice-tts:` (SEC-P1-001 fix confirmed),
  `connect-src 'self' venice-media: venice-character-cache: venice-tts:` in production.
- Applied via `session.defaultSession.webRequest.onHeadersReceived`
  (`electron/main.ts:305-309`); unit-tested (`rendererCsp.test.ts`).
- **Runtime verification:** page-context inline vectors are genuinely blocked in the
  packaged build (see `RUNTIME_TEST_RESULTS.md`). The smoke test that claimed to verify
  this is itself defective (C6-P1-001) — the enforcement is real; the verification was
  wrong. No meta CSP in `index.html`/`dist/index.html` — the header injection is the
  single enforcement point; that is acceptable for file://-loaded packaged renderers but
  is why the header path must never regress (covered by `applyRendererCspHeaders` tests
  from SEC-P3-004).

## Secrets — no exposure found

- Static pass: no `console.log` in `src/`; all error surfaces route through
  `redactErrorMessage`/`redactSecrets()`; `verify:safety-guard` PASS (no raw prompt
  logging or bypass patterns); `verify:storage-privacy` PASS (secret-leak protections).
- `localStorage` policy: every call site tagged `/* localStorage-allowed: <reason> */`
  and enforced by `verify:storage-policy.cjs`; no secrets persisted there.
- Capability tokens never logged (metrics deliberately exclude token values);
  `.vfbackup` import pins Argon2id INTERACTIVE constants (STOR-P1-001 fix confirmed in
  `chatFolderBackupService.ts`); vault key written temp+fsync+rename
  (`conversationVault.ts:138-160`).

## Static search pass summary (§28)

| Pattern | Hits (non-test) | Assessment |
|---|---|---|
| `TODO/FIXME/HACK/XXX` | 0 | clean |
| `console.log` in src | 0 | clean |
| `as any` / `@ts-ignore` / `as unknown as` | 101 total | reviewed samples are persistence-shape casts at storage boundaries (e.g., `StorageService.saveItem(... as Record<string, unknown>)`); no boundary-bypassing casts found |
| bare `catch {` | 371 | predominantly intentional fallbacks in protocol/file paths; spot-checked high-risk surfaces (vault, capability manager, stream manager) — no swallowed errors that convert failure into success |
| `void promise` | 141 | matched by design for fire-and-forget telemetry/cleanup; critical paths awaited |
| `dangerouslySetInnerHTML` | 1 real use | `Meteocon.tsx` — fail-closed: only transformed, CSP-safe SVG output (enforced by `verify-meteocon-csp` + strict CSP); two other hits are type-level omissions |
| `shell.openExternal` / `child_process` | contained | external links user-confirmed; no shell execution in renderer paths |

## Conclusion

The Electron security architecture at HEAD is sound; no privilege-escalation, secret-
exposure, or boundary-bypass defects were found in this pass. The two security-adjacent
items are: the broken CSP *verification* (C6-P1-001, test-side) and the token-reaping
hygiene gap (C6-P3-001, defense-in-depth unaffected).
