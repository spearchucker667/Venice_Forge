# Rejected Findings — Venice Forge Exhaustive Audit (2026-09-13)

**Audit baseline SHA:** `2f672682d57f82e5cd2d0ecefa42a4a525a9504c`

---

## 1. Candidate: Custom Protocol Traversal via Encoded Slashes (`%2e%2e`)

### Suspected Defect:
Custom schemes (`venice-media:`, `venice-tts:`, `venice-character-cache:`) might allow path traversal or arbitrary file retrieval via percent-encoded traversal sequences (`%2e%2e`, `%2f`).

### Result:
**NOT A DEFECT.**

### Reason:
All custom protocol handlers in `electron/main.ts` validate object IDs against strict regular expressions before performing any filesystem operations:
- `venice-character-cache:` enforces `/^[a-f0-9]{64}$/` on key (`main.ts:472`).
- `venice-tts:` enforces `/^[a-f0-9]{64}$/` on audio ID and `/^[a-z0-9]+(?:-[a-z0-9]+)*$/` on profile ID (`main.ts:424-425`).
- `venice-media:` routes to `createGeneratedMediaResponse()` which validates ID format and capability tokens.
Furthermore, resolved paths are validated via `checkPathContained()` with canonical `realpath`, and file descriptors are opened using `O_NOFOLLOW`. Encoded traversal is completely impossible.

---

## 2. Candidate: `shell.openPath` Insecure File Access via Renderer IPC

### Suspected Defect:
Renderer code might invoke IPC handlers to open arbitrary local folders or executables on the user's desktop.

### Result:
**NOT A DEFECT.**

### Reason:
Only three IPC channels invoke `shell.openPath`:
1. `app:openConversationsFolder` (`fileHandlers.ts:540`): resolves `getProfileConversationsDir(profileId)` (internal app directory).
2. `app:openLogsFolder` (`logger.ts:207` via `systemHandlers.ts:266`): resolves `getLogsDir()` (internal app directory).
3. `config:openFolder` (`configService.ts:669` via `configHandlers.ts:71`): resolves `configPath` (internal app directory).
None of these channels accept a renderer-specified path; all targets are strictly computed inside the trusted main process.

---

## 3. Candidate: Legacy `modelId` Parameter Sent in Image Edit Requests

### Suspected Defect:
`src/shared/venice-media-contract/payload-builders.ts` might send deprecated `modelId` instead of canonical `model` to `/image/edit`.

### Result:
**NOT A DEFECT.**

### Reason:
Inspection of `buildCanonicalImageEditPayload` in `src/shared/venice-media-contract/payload-builders.ts:153-157`:
```typescript
const payload: EditImageWirePayload = {
  model: req.model, // <--- Canonical parameter
  prompt: req.prompt,
  image: req.image,
};
```
The codebase correctly uses `model` for single image edit, while reserving `modelId` exclusively for `/image/multi-edit` where the upstream schema demands `modelId`. This is enforced by `verify-venice-contract-drift.cjs`.

---

## 4. Candidate: `atomicReplaceFile` Temporary File Collision Under Concurrency

### Suspected Defect:
Fast concurrent writes to the same file might collide on temporary filenames and overwrite each other's staging files.

### Result:
**NOT A DEFECT.**

### Reason:
Both `atomicReplaceFile()` (line 45) and `atomicReplaceFileSync()` (line 75) in `electron/utils/atomicFileReplace.ts` construct temporary paths using `crypto.randomUUID()`:
```typescript
const tmp = `${target}.tmp-${crypto.randomUUID()}`;
```
Each temporary path contains 122 bits of cryptographic entropy, guaranteeing uniqueness across concurrent operations and threads.

---

## 5. Candidate: Headless Bridge Server Unauthenticated Access

### Suspected Defect:
When launched with `--headless`, the Express bridge server might allow unauthenticated local processes to invoke privileged Venice API channels.

### Result:
**NOT A DEFECT.**

### Reason:
`electron/services/bridgeServer.ts` strictly validates that:
1. `process.env.VENICE_BRIDGE_TOKEN` is configured and meets minimum entropy requirements (rejecting empty or weak tokens).
2. Every incoming HTTP request carries `Authorization: Bearer <token>` matching `VENICE_BRIDGE_TOKEN`.
3. Host binding is strictly constrained to loopback interfaces (`127.0.0.1`, `localhost`, `::1`) via `isValidBridgeHost()`.
