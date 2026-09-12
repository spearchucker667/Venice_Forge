# Venice Forge — Security Review
**Audit date:** 2026-09-12

---

## Summary

The application implements an **excellent defense-in-depth Electron security posture**. No security-critical defects were found. Two minor design risks were identified that are not exploitable given the current navigation and IPC validation controls.

---

## Electron Security Configuration

| Control | Setting | Status |
|---|---|---|
| `contextIsolation` | `true` | ✅ Correct |
| `nodeIntegration` | `false` | ✅ Correct |
| `sandbox` | `true` | ✅ Correct |
| `webSecurity` | `true` | ✅ Correct |
| DevTools | Disabled in production (env var `VENICE_BRIDGE_DEBUG_DEVTOOLS` required) | ✅ Correct |
| Permission request handler | Denies all browser permissions | ✅ Correct |

Source: `electron/main.ts:183-187, 506`

---

## IPC Architecture

### Sender Validation

All privileged IPC channels are protected by `validateIpcSender()` in `electron/utils/validateIpcSender.ts`:
- **Development:** Only `http://localhost:5173` (Vite dev server) is trusted
- **Production:** Only `file://` URLs within the packaged `dist/` directory are trusted
- Rejects: `file://localhost`, all private hostnames, other http/https origins, data: URLs

### Rate Limiting

All IPC channels are wrapped with `rateLimitIpcHandler()` in `electron/utils/rateLimit.ts`, preventing renderer-side request flooding.

### Privileged vs Non-Privileged Channels

- **Privileged channels** (secrets, config, files, Venice dispatch, paid generation, sync, documents, background tasks, media): Require `registerPrivilegedIpcChannel` → sender validation + rate limit
- **Non-privileged channels** (UI state, theme queries, non-secret reads): Use `registerIpcChannel` → rate limit only

---

## Credential Management

| Concern | Implementation | Status |
|---|---|---|
| API key storage | OS secure storage (`safeStorage` / Keychain on macOS) | ✅ |
| Credential in renderer | Never — main-process authoritative | ✅ |
| Credential in logs | Redacted via `redactSecrets()` | ✅ |
| Credential in config.yaml | Stripped before write (`secrets.*: ""`) | ✅ |
| Renderer-supplied API key | Rejected — profile resolved server-side | ✅ |
| Linux fallback (no safeStorage) | Logged as SECURITY warning; requires `keep_plaintext_keys` flag | ⚠️ DOCUMENTED RISK |

---

## Navigation Security

```typescript
// electron/main.ts: will-navigate handler
win.webContents.on('will-navigate', (event, url) => {
  if (!isAllowedAppNavigation(url)) event.preventDefault();
});

// electron/main.ts: web-contents-created handler (subframes)
app.on('web-contents-created', (_event, wc) => {
  wc.on('will-navigate', (event, url) => {
    if (!isAllowedAppNavigation(url)) event.preventDefault();
  });
});
```

`isAllowedAppNavigation()` permits only:
- The Vite dev server origin in development
- `file://` URLs inside the packaged renderer directory in production

All external links require explicit user confirmation via `promptExternalLink()` dialog.

---

## Custom Protocol Security

| Protocol | Access Control | Path Containment | Content-Type Allowlist |
|---|---|---|---|
| `venice-character-cache://` | 64-char hex key validation | ✅ | ✅ |
| `venice-tts://` | alphanumeric-hyphen profile ID regex | ✅ | N/A |
| `venice-generated-media://` | Origin/referrer defense-in-depth | ✅ | ✅ |

Note: `main.ts:33-37` has an acknowledged future improvement comment (`VF-CAPABILITY-PROVENANCE`) for upgrading generated-media to opaque capability tokens. Current origin/referrer check is defense-in-depth.

---

## Safety Pipeline

The local Family Safe Mode enforcement (`guardPipeline.ts`) correctly:
1. Reads safety state from **main-process runtime singleton** (`runtimeSafetySettings.ts`)
2. **Never** reads renderer-supplied `localFamilySafeModeEnabled` flag
3. Applies semantic media screening to all known image/video fields
4. Applies textual screening with binary fields replaced by `[binary-media]`
5. Returns consistent `HTTP 451` blocks across all endpoint types

Source: `electron/services/guardPipeline.ts` (verified fully)

---

## Venice Request Security

The `performVeniceRequest` function (`electron/services/veniceClient.ts`) correctly:
- Uses main-process Node.js `https` module (not renderer fetch)
- Enforces endpoint allowlist via `validateVeniceIpcRequest()`
- Blocks known dangerous headers: authorization, host, cookie, content-length, transfer-encoding, origin, referer, proxy-authorization, proxy-authenticate
- Validates body size against `VENICE_MAX_BODY_BYTES`
- Applies concurrency limit (max 10 concurrent requests)
- Validates profile ID (alphanumeric-hyphen regex, 64-char max)

---

## Identified Security Risk Items

| ID | Finding | Exploitable? | Severity |
|---|---|---|---|
| VF-AUD-20260912-DR-001 | Stream sent to WebContents not WebFrameMain | **No** — navigation strictly locked | Design risk |
| VF-AUD-20260912-DR-002 | Guard array response handling | **No** — current Venice API returns objects, not bare arrays | Design risk |
| VF-AUD-20260912-P1-001 | Binary UTF-8 decode memory waste | No security impact | P1 performance |
| VF-AUD-20260912-P1-002 | Non-atomic config write | No security impact | P1 data integrity |

---

## Conclusion

**Security posture: STRONG.** No exploitable security defects found. The application correctly implements all critical Electron security controls. The two design risks identified are non-exploitable in the current deployment context. The credential boundary is well-enforced and no secret material is observable from renderer code or logs.
