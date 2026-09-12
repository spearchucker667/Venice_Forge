# Rejected Findings — Venice Forge Exhaustive Audit (2026-09-12)

Findings initially suspected during the audit but verified as **NOT defects** are recorded here to prevent future audits from re-discovering them.

## RJ-1 — IPC parity gap (initially reported as P1 contract defect)

**Candidate:** During the initial IPC channel parity scan, a regex-based check reported 9 preload channels without corresponding main handlers and 3 orphan main handlers. This would have been a P1 contract defect (renderer features would throw "no handler registered" at runtime).

**Investigation:**

1. The regex `/ipcMain\.handle\(\s*["']([^"']+)["']/` only matched direct string-literal channel registrations.
2. The actual handler code uses channel constants resolved from `const X = { key: "channel" } as const` blocks (e.g. `imageInspectorIpc`, `characterCreatorIpcChannels`).
3. It also uses template-literal registrations (`documentAgent:workspace:${channel}`) inside a `for (const [channel, operation] of [["list", "list"], ...]) as const` loop.

After extending the parity scan to:

1. Build a constant map from all `const X = { ... } as const` blocks across `electron/` and `src/types/`.
2. Resolve `registerPrivilegedIpcChannel(X.path)` references via that map.
3. Track template-literal registrations via the inner loop's literal array.

the parity result was clean:

- `main.handle channels: 192`
- `preload.invoke channels: 192`
- `preload.on channels: 10`

with 0 missing handlers and 0 orphans.

**Result:** **NOT A DEFECT** — the initial regex was an artifact, not a real gap.

**Evidence:**
- `src/types/desktop.ts:519-524` — defines `imageInspectorIpc`.
- `electron/ipc/handlers/imageInspectorHandlers.ts:35, 68, 83, 93` — uses `imageInspectorIpc.X` for all 4 channels.
- `electron/ipc/handlers/characterCreatorHandlers.ts:54-55, 69-70` — uses `characterCreatorIpcChannels.X` for the 2 channels.
- `electron/ipc/handlers/documentAgentHandlers.ts:496-507` — uses `documentAgent:workspace:${channel}` template literal in a `for` loop covering `list`, `read`, `search`.

**Lesson learned:** Any future IPC parity verifier MUST resolve channel constants via the constant map. See `IMPROVEMENTS.md` DR-001 for the recommended automated verifier.

## RJ-2 — Renderer `any` casts (initially reported as P2 type-safety defect)

**Candidate:** During the renderer UI scan, several `as any` casts were observed in `src/services/desktopBridge.ts` and `src/components/chat/message-bubble.tsx`.

**Investigation:**

The current working tree (post-remediation) shows that the `/* eslint-disable @typescript-eslint/no-explicit-any */` directives have been removed and the `as any` casts have been replaced with typed alternatives:

- `src/services/desktopBridge.ts:1351, 1385, 2495` — `as any` replaced with the natural return type (e.g. `{ ok: false; error: string }`).
- `src/components/chat/message-bubble.tsx:981, 1009` — `as any[]` replaced with `as ChatMediaReference[]`; `as any` replaced with `as ConversationMessage`.
- `electron/services/chatFolderService.ts:225` — `any` parameter replaced with `{ metadata?: { character?: unknown } }`.

**Result:** **NOT A DEFECT** (in the current working tree) — remediated. The dirty diff in the working tree is the source of truth.

**Note for future audits:** the `git log` for these files should show the `any`-removal commit when it is eventually pushed.

## RJ-3 — `assertPathContained` exact-root match (initially reported as P3)

**Candidate:** `electron/services/configService.ts:155-173` uses `return relative && ...` which would reject the case where `resolved === allowedRoots[i]` exactly (because `path.relative(root, resolved)` returns `""`, which is falsy).

**Investigation:**

This is technically a logic quirk (the check is overly strict for the exact-root case), but it is **not exploitable**:

1. Setting `VENICE_FORGE_CONFIG_FILE=$HOME` to the home directory itself is not a realistic attack scenario — the user controls their own env var.
2. Even if accepted, the user is just writing the config file to the home directory, which is benign.
3. The check still rejects any path that resolves to a parent of an allowed root (`../`) or to an absolute path on a different drive.

**Result:** **NOT A DEFECT (security)** — but recorded as a P3 improvement (`IMPROVEMENTS.md` EDGE-1 / `FINDINGS.md` VF-AUD-20260912-N3).

## RJ-4 — `.finally(release)` returns void (initially reported as P3)

**Candidate:** `electron/services/veniceClient.ts:749` uses `.finally(release)` which would replace the resolved value of the outer promise if `releaseVeniceSlot` were ever to return a non-undefined value.

**Investigation:**

`releaseVeniceSlot` is explicitly typed `: void` (line 166 of `electron/services/veniceClient.ts`). TypeScript's `void` return type allows callers to return any value from the implementation without type-checking the consumer, but at runtime the value is still returned. However, the current implementation is `function releaseVeniceSlot(): void { ... }` with no explicit return, so `undefined` is returned. The pattern is correct today.

**Result:** **NOT A DEFECT** — but recorded as a fragility improvement (`IMPROVEMENTS.md` STYLE-2 / `FINDINGS.md` VF-AUD-20260912-N4) because a future refactor could inadvertently break the contract.
