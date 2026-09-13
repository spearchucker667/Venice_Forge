# Security Review

## Executive security posture

**Overall:** Strong architecture with verified trust boundaries, but several defense-in-depth gaps and one functional-security regression (TTS CSP) need attention before release.

The Electron renderer runs with:
- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`
- `webSecurity: true`
- `allowRunningInsecureContent: false`
- No `webview`, no `nodeIntegrationInSubFrames`
- Navigation and window-open denied by default
- All permission requests denied globally

All 147 production IPC channels are privileged, sender-validated, and rate-limited. No generic `ipcRenderer.invoke` escape hatch exists. Secrets are stored in OS-native `safeStorage`; no raw keys cross into renderer state or logs.

## Verified-safe controls

1. **Renderer trust boundary:** `electron/preload.ts` exposes only named methods mapped to validated channels; no Node primitives, no `remote`, no `fs`, no `shell`.
2. **Venice request boundary:** Authorization header attached only in main; renderer headers stripped of auth/cookie/origin/referer/x-forwarded; endpoints/methods allowlisted; body size capped.
3. **File-system IPC:** Save/load dialogs are user-mediated; all other paths are allowlist-contained after `fs.realpath`; path traversal, symlinks, null bytes, and encoded traversal rejected.
4. **Custom protocols:** `venice-media://`, `venice-tts://`, `venice-character-cache://` handlers validate id format, read via `O_NOFOLLOW`, enforce mime allowlists, and scope CORS.
5. **SSRF defenses:** `app:proxyScrape` pins DNS lookups, blocks private hosts, destroys redirects, caps size; Jina restricted to `r.jina.ai`/`s.jina.ai`; character images restricted to allowlisted hosts.
6. **Bridge server:** loopback-only, token-strength validation, constant-time compare, per-client rate limits.
7. **Secret storage:** safeStorage with Linux plaintext fallback gated by explicit env opt-in; generic credential names reserved; lockout counters on password verify.

## Security findings

| ID | Severity | Title |
|---|---|---|
| VF-AUD-20260912-GSS-P1-001 | P1 | Family Safe Mode response screening is post-hoc for streaming chat |
| VF-AUD-20260912-GSS-P1-002 | P1 | Mandatory child-safety guard silently skips messages beyond the 32nd extracted field |
| VF-AUD-20260912-SEC-P1-001 | P1 | Renderer CSP `media-src` omits `venice-tts:` (functional regression, fail-closed) |
| VF-AUD-20260912-VCS-P1-002 | P1 | Web-transport streamed chat output is never screened by Family Safe Mode |
| VF-AUD-20260912-STOR-P1-001 | P1 | `.vfbackup` import trusts attacker-controlled Argon2id KDF parameters |
| VF-AUD-20260912-STOR-P2-009 | P2 | Custom-protocol media authorization relies on originless-request allowance; capability tokens unwired |
| VF-AUD-20260912-GSS-P2-004 | P2 | `redactSecrets` blind spots for modern token families |
| VF-AUD-20260912-GSS-P3-005 | P3 | Two call sites dispatch Venice requests outside `guardPipeline` |
| VF-AUD-20260912-GSS-P3-006 | P3 | Electron runtime safety snapshot fails open before config load |
| VF-AUD-20260912-GSS-P3-007 | P3 | `LOCAL_PATH_PATTERN` over-redaction corrupts diagnostics |

## Taint-chain highlights

### Streaming safety bypass (VF-AUD-20260912-GSS-P1-001)

- **Source:** Venice SSE stream bytes arriving in `electron/services/veniceClient.ts:596-620`.
- **Transform:** SSE decoder calls `options.onDelta` per event.
- **Validation boundary:** `performGuardedVeniceRequest` screens only after `performVeniceRequest` resolves.
- **Sink:** `safeSendToRenderer` in `veniceHandlers.ts:122` and renderer `stream.ts:84` skip delta screening in Electron mode.
- **Impact:** Guard-triggering streaming content reaches the renderer before the late 451.

### Mandatory guard field-budget bypass (VF-AUD-20260912-GSS-P1-002)

- **Source:** Outbound `/chat/completions` request body from renderer.
- **Transform:** `extractPromptLikeFields` iterates `messages` array.
- **Validation boundary:** `MAX_FIELDS = 32` shared across payload.
- **Sink:** `childExploitationGuard.ts` only sees the first 32 fields.
- **Impact:** Newest messages in long histories bypass mandatory child-safety screening.

### Backup KDF parameter trust (VF-AUD-20260912-STOR-P1-001)

- **Source:** Attacker-crafted `.vfbackup` manifest.
- **Transform:** Backup importer reads `opslimit`/`memlimit` from manifest.
- **Validation boundary:** No pinning to exporter's `INTERACTIVE` constants.
- **Sink:** `crypto_pwhash` called synchronously on the main thread.
- **Impact:** Main-process freeze / denial of service.

## Recommended security priorities

1. Fix streaming FSM parity (GSS-P1-001, VCS-P1-002, VCS-P1-004).
2. Fix mandatory guard coverage (GSS-P1-002, GSS-P2-003).
3. Pin Argon2id KDF parameters and move off main thread (STOR-P1-001).
4. Wire capability tokens for custom protocols (STOR-P2-009 / SEC-P2-002).
5. Extend `redactSecrets` patterns (GSS-P2-004).
6. Close fail-open safety snapshot window (GSS-P3-006).
