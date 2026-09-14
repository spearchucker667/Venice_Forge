# Improvements — Venice Forge Exhaustive Audit (2026-09-13)

**Audit baseline SHA:** `2f672682d57f82e5cd2d0ecefa42a4a525a9504c`

---

## IMP-001 — Defense-in-Depth Electron Navigation & Permission Hooks

### Affected file:
`electron/main.ts:210, 535, 570`

### Rationale:
While `will-navigate` blocks top-level document navigations, Electron security guidance recommends registering `will-redirect` and `will-attach-webview` on `web-contents-created`, and registering `session.setPermissionCheckHandler` alongside `setPermissionRequestHandler`.

### Recommended Implementation:
1. In `electron/main.ts:535`:
   ```typescript
   session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
   session.defaultSession.setPermissionCheckHandler(() => false);
   ```
2. In `app.on("web-contents-created", (_event, contents) => { ... })`:
   ```typescript
   contents.on("will-redirect", (event, url) => {
     if (!isAllowedAppNavigation(url)) event.preventDefault();
   });
   contents.on("will-attach-webview", (event) => {
     event.preventDefault();
   });
   ```

---

## IMP-002 — Baseline Fallback CSP `<meta>` Tag in `index.html`

### Affected file:
`index.html:1-15`

### Rationale:
Currently, the renderer CSP is delivered entirely through dynamic header modification via `session.defaultSession.webRequest.onHeadersReceived`. While effective, adding a baseline `<meta http-equiv="Content-Security-Policy">` tag to `index.html` provides defense-in-depth against unexpected bootstrap bypasses.

### Recommended Implementation:
Add to `<head>` of `index.html`:
```html
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self'; object-src 'none';">
```

---

## IMP-003 — Handle CORS Preflight `OPTIONS` in Express Proxy

### Affected file:
`server.ts:863-867`

### Rationale:
In `server.ts`, `ALLOWED_VENICE_METHODS = ["GET", "POST"]` is evaluated before CORS preflight processing, returning HTTP 405 Method Not Allowed for browser `OPTIONS` preflight requests.

### Recommended Implementation:
Either permit `"OPTIONS"` in `ALLOWED_VENICE_METHODS` or handle `req.method === "OPTIONS"` directly in the CORS middleware before method allowlisting.

---

## IMP-004 — Resolve Canonical System Path for `powershell.exe` on Windows

### Affected file:
`electron/services/windowsCredentialStore.ts:70`

### Rationale:
`spawnSync("powershell.exe", ...)` searches for PowerShell via the user's `PATH`. To eliminate untrusted search path vulnerabilities (CWE-426), resolve the canonical System32 binary path.

### Recommended Implementation:
```typescript
const systemRoot = process.env.SystemRoot || "C:\\Windows";
const canonicalPowershell = path.join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
const powershellPath = fs.existsSync(canonicalPowershell) ? canonicalPowershell : "powershell.exe";
```
