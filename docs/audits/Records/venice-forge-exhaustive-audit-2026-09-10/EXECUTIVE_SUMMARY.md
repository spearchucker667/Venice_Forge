# Executive summary

Audit baseline SHA: `c3ae21af2f723111d92b43c7888a60930226d213`
Package version: `3.0.0-beta.3`
Local `main` equals `origin/main`.
Audit date: 2026-09-10.

## Verdict

Venice Forge is **not ready for an unconditional production or beta tag** until the P1 items below are fixed.

The application at this SHA **typechecks, lints, and passed hosted CI including packaged Electron smoke on macOS, Windows, and Linux** (run `34044151608`, 2026-09-06). CodeQL on this SHA succeeded with **zero open code-scanning alerts**. The August 2026 P1 API/streaming defects were independently revalidated and are **repaired in current source**.

Blocking classes:

1. **Production audit gate is red today.** `npm audit --omit=dev --audit-level=moderate` fails on `js-yaml@4.3.1` (GHSA-2883-xcg3-v3hh). The override `"js-yaml": "^4.3.1"` pins the vulnerable range via `electron-updater`. Hosted CI on this SHA is stale relative to the advisory.
2. **Desktop backup/sync can omit live chats.** The UI writes the encrypted Conversation Vault; export lists legacy `chat-history`.
3. **Document Agent advertised tools are not completable.** Approval list is filtered to `limited:` grants (workspace/media unlistable). `document.promoteAttachment` cannot resolve chat-registered attachments because register and tool sessions disagree.
4. **Paid video/music polling can locally timeout at 120s** while the provider P80 example is 145s; VPS `download_url` does not survive Electron restart; web gallery can store signed URLs or data URLs.
5. **Web FSM media size guard is dead as a streaming cap.** `createProxyMiddleware` is constructed per request; Layer 2 is assigned after http-proxy-middleware binds `on.proxyRes`; `responseInterceptor` buffers the entire body before any 256 MiB check.
6. **External release acceptance remains incomplete** (signed artifacts, paid live ops, two-device sync, headed a11y, native review) — already on `docs/ROADMAP.md`. Signature *evidence JSON* is additionally derived from a boolean flag (P2-021).

No P0 (RCE, credential dump of the Venice key, unrestricted filesystem, or app-unusable) defect was confirmed.

Specialist scratch under `scratch/` was sampled and independently revalidated. Specialist P1s were **not** copied wholesale: Electron `credential:get` / `profilePassword:clear` / unscoped RP stores remain P2; i18n `Tr:` scaffolding is P2 because non-English locales are already `isProductionComplete: false`; `test:ci` omissions are a test gap (hosted coverage still runs those files on `push` to `main`).

## Counts

| Metric | Count |
|---|---:|
| Tracked files | 1834 |
| Substantive tracked artifacts | 1535 |
| Confirmed defects | 42 |
| P0 | 0 |
| P1 | 8 |
| P2 | 25 |
| P3 | 9 |
| Design risks (non-defect / deferred) | 6 |
| Test gaps | 16 |
| Improvements | 8 |
| Historical 2026-08-15 P1s still present | 0 of 8 |

## Highest-risk current findings

1. **VF-AUD-20260910-P1-001** — Production `js-yaml@4.3.1` fails the moderate audit gate.
2. **VF-AUD-20260910-P1-002** — Backup/sync exports legacy chat files, not the vault the UI writes.
3. **VF-AUD-20260910-P1-007** — FSM media Layer 2 never registers; interceptor buffers unbounded bodies.

## Validation snapshot (this session)

| Check | Result |
|---|---|
| `npm run lint:eslint` (Node 22.15.0) | PASS |
| `npm run typecheck` | PASS |
| `npm run test:ci` | PASS piecewise (one transient markdown-link fail while this package was incomplete; all shards green after) |
| `npm run build` | PASS |
| `npm run verify:dist` | PASS |
| `npm audit --omit=dev --audit-level=moderate` | FAIL (js-yaml high) |
| `npm audit --audit-level=critical` | PASS (exit 0; moderate/high remain) |
| Hosted CI `34044151608` @ this SHA | PASS (11/11 jobs) |
| Hosted CodeQL `34044151609` @ this SHA | PASS |
| Open CodeQL alerts | 0 |
| Open Dependabot alerts | 3 (vitest mocker medium; two joi lows) |

## Release readiness

**NOT READY** for a production tag. **CONDITIONAL** for continued beta development on this SHA: hosted packaged smoke is green, but P1-001 would fail a re-run of contracts, P1-002 is a live backup data defect, P1-003 / P1-008 make advertised Document Agent tools non-completable, and P1-007 leaves the web FSM media path uncapped until after full-body buffer.
