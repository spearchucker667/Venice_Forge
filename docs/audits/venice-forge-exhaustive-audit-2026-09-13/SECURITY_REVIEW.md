# Security Review — Venice Forge Exhaustive Audit (2026-09-13)

**Audit baseline SHA:** `2f672682d57f82e5cd2d0ecefa42a4a525a9504c`  
**Review Focus:** Electron Process Isolation, Privileged IPC, Custom Protocols, Content Security Policy, Shell Boundaries, and Secret Management.

---

## 1. Process Boundary & WebPreferences

All renderer windows are created in `electron/main.ts` with strict security hardening:
```typescript
webPreferences: {
  preload: preloadPath,
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  webSecurity: true,
  devTools: isDev || allowProdDevTools,
}
```

### Controls Evaluated:
- **Sandbox:** Enabled. The renderer process runs in a sandboxed Chromium renderer with zero direct Node.js API access.
- **Context Isolation:** Enabled. The preload script runs in an isolated JavaScript context; prototypes cannot be poisoned by the renderer.
- **Node Integration:** Disabled. `process`, `require`, and Node built-ins are inaccessible from DOM contexts.
- **Permission Requests:** Globally denied via `session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false))`.
- **Window Open & Navigation:**
  - `setWindowOpenHandler` denies all child window popups (`{ action: "deny" }`).
  - Trusted external URLs (`https:`, non-private IPs) prompt the user with a native confirmation dialog displaying a truncated URL before invoking `shell.openExternal`.
  - In packaged builds, `will-navigate` allows only local `file://` URLs verified to reside strictly inside `dist/`.

---

## 2. Content Security Policy (CSP)

The CSP is dynamically injected via `session.defaultSession.webRequest.onHeadersReceived` in `electron/main.ts:305-309` and defined in `electron/utils/rendererCsp.ts`:

### Packaged Directives:
```text
default-src 'self';
script-src 'self';
style-src 'self';
font-src 'self' data: https:;
img-src 'self' data: blob: venice-media: venice-character-cache:;
media-src 'self' blob: data: venice-media: venice-tts:;
connect-src 'self' https://api.venice.ai https://*.venice.ai https://image.pollinations.ai https://text.pollinations.ai https://api.hyperbolic.xyz https://api.replicate.com https://r8.im https://replicate.delivery https://api.anthropic.com https://generativelanguage.googleapis.com https://api.groq.com https://api.deepseek.com https://api.mistral.ai https://api.x.ai https://api.openai.com https://api.cohere.com https://openrouter.ai https://api.together.xyz;
object-src 'none';
base-uri 'self';
form-action 'none';
frame-ancestors 'none';
```

### Invariants Verified:
- Neither `'unsafe-inline'` nor `'unsafe-eval'` is present in `script-src` in production builds.
- Inline styles are prohibited by `style-src 'self'` and verified by `tests/csp/inlineStyleInvariant.test.ts`.
- Custom protocols (`venice-media:`, `venice-tts:`, `venice-character-cache:`) are strictly restricted to `img-src` and `media-src`.

---

## 3. Custom Protocol Architecture & Capability Tokens

Three privileged custom schemes are registered in `electron/main.ts`:
- `venice-media:` (Generated images, videos, exported media)
- `venice-tts:` (Cached local text-to-speech MP3s)
- `venice-character-cache:` (Cached character avatars)

### Capability Token Enforcement (`electron/utils/customProtocolAccess.ts`):
- To load any custom protocol URL in an `<img>`, `<audio>`, or `<video>` tag, the renderer must first call `app:media:issueCapabilityUrl` or `resolvePlayableMediaUrl`.
- The main process mints a cryptographically random 256-bit token bound to `{ objectId, profileId, sessionId }` with a 1-hour TTL.
- Protocol request handlers reject requests lacking a valid, unexpired token with HTTP 403 Forbidden.
- Tokens are automatically reaped on a 512-entry threshold sweep (`cd27ebc2`) and revoked immediately on renderer reload, destroy, profile switch, or app shutdown.

### Path Containment & Descriptor-Safe Reads:
- Paths are validated using `checkPathContained(targetPath, baseDir)` with `fs.realpathSync` to prevent symlink traversal.
- File reads use descriptor-safe `readRegularFileNoFollow()`: opens with `O_RDONLY | O_NOFOLLOW` and verifies `fstat.isFile()`, completely eliminating TOCTOU symlink races.

---

## 4. Privileged IPC Architecture & Parity

- **Total Registered Channels:** 190 channels across 14 handler modules in `electron/ipc/handlers/`.
- **Preload Methods:** 190 invoke methods, 10 event listeners.
- **Orphan Channels:** 0 renderer orphans, 0 main-process orphans (`verify:ipc-parity` passes 190/190).
- **Sender Validation:** Every handler registered with `registerPrivilegedIpcChannel` validates `event.senderFrame` against `http://localhost:5173` (dev) or packaged `dist/` (prod).
- **Main Frame Gating:** File dialogs, token issuance, and sync folder operations enforce `requireMainFrame: true`, blocking iframes from invoking privileged channels.
- **Rate Limiting:** Wrapped in `rateLimitIpcHandler` to mitigate message flood denial-of-service.

---

## 5. Secret Management & Cryptography

### Credential Lifecycle:
- **Storage:** Stored in OS-native secure storage via Electron `safeStorage` (macOS Keychain, Windows DPAPI, Linux Secret Service).
- **No Plaintext Passwords:** Master and profile passwords are never stored in plaintext on any operating system, even if plaintext fallback is enabled on Linux.
- **Password KDF:** PBKDF2-SHA256 with 310,000 iterations and 16-byte random salt.
- **Vault Encryption:** AES-256-GCM with unique 12-byte IV per record and authenticated additional data (`venice-forge:vault:${type}:v1:${id}`).
- **Folder Backup Encryption:** Argon2id13 KDF (`_sodium.crypto_pwhash_ALG_ARGON2ID13`) + XChaCha20-Poly1305 AEAD.
- **Bridge Boundary:** API keys are never returned across the IPC bridge to the renderer; only boolean configured flags and truncated hints (`key_...1234`) are exposed.
- **Redaction:** `redactSecrets()` and `redactErrorMessage()` scrub API keys (`sk-...`, `venice_...`) and Bearer tokens from console output, logs, and error toasts.

---

## 6. Hardening Recommendations (P2 / P3)

1. **`will-redirect` Event Guard (`P2`):** Hook `contents.on("will-redirect")` in `electron/main.ts` to cancel un-approved 3xx navigations.
2. **Fallback Meta CSP (`P2`):** Include a static `<meta http-equiv="Content-Security-Policy">` in `index.html` as a fallback in case header interception is ever bypassed.
3. **`setPermissionCheckHandler` (`P3`):** Add `session.defaultSession.setPermissionCheckHandler(() => false)` alongside the request handler.
4. **Pinned PowerShell Binary (`P3`):** In `windowsCredentialStore.ts:70`, resolve `%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe` directly rather than invoking `"powershell.exe"` from PATH.
