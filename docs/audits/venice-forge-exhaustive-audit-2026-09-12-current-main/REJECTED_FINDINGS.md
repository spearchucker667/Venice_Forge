# Rejected Findings / False Positives

## Domain: electron-main-security
## Rejected candidates / false positives

- **“`electron/security/` is missing.”** Not a defect — the security layer is `electron/utils/` + `electron/ipc/validation.ts` + per-service guards; all reviewed.
- **“Preload exposes an overly broad surface.”** 907 lines but every method maps 1:1 to a named, privileged, sender-validated IPC channel; there is no generic `invoke`/`send` escape hatch, no `remote`, no Node primitive. The stream-delta listener validates envelopes at the preload boundary (`preload.ts:46-56`).
- **“`registerIpcChannel` (non-privileged) weakens the boundary.”** Unused in production code — only tests/mocks import it; all 147 production channels are privileged.
- **“`sandbox: true` breaks preload.”** Preload uses only `contextBridge` + `ipcRenderer`, which sandbox supports.
- **“`data:text/html` fallback in `loadURL` error paths is a navigation hole.”** Static error text only, loaded by main on failure, `encodeURIComponent`-escaped (`main.ts:240, 248`).
- **“`console-message` logging leaks prompt text.”** Output is truncated to 10 000 chars and passed through `redactErrorMessage` before persistence (`main.ts:213-223`); inspector telemetry contract excludes prompts/keys/URLs by design (`inspectorTelemetry.ts:73`).
- **“`existsCaseInsensitive` in `navigation.ts` permits case-based TOCTOU.”** It is only an existence pre-check; the decision comes from `fs.realpathSync` of both target and root plus prefix comparison, which resolves the true casing.
- **“`mediaService.generateMediaThumb` writes attacker bytes.”** Renderer-supplied base64 must decode to PNG-magic bytes, dimensions ≤ 8192², and is written under a sha256-named 0o600 file via temp+rename inside the thumbs dir (`mediaService.ts:315-359`).
- **“`characterImageCache` fetchImage attaches the API key to arbitrary URLs.”** Bearer header is added only for the allowlisted Venice hosts after a 401/403, redirect targets are re-validated, chain ≤ 1 hop (`characterImageCache.ts:215-250`).
- **“`proxyScrape` DNS check is bypassable by re-resolution.”** The custom `lookup` callback pins the exact previously-screened address/family into the socket (`systemHandlers.ts:161-164`); all A/AAAA records are screened first.
- **“Bridge token strength fallback is unsafe.”** A weak env token causes a fresh 256-bit token to be generated and a loud warning, never silent acceptance of the weak token (`bridgeServer.ts:187-199`); headless mode hard-refuses to start without a usable token (`main.ts:307-315`).
- **“`sync:setSyncFolder` accepts a renderer path.”** It only confirms the currently configured folder; real selection is dialog-mediated (`syncHandlers.ts:45-50`); `writePacket` enforces a store allowlist, id regex, envelope-id match, size caps, and encryption before any disk write (`syncFolderWatcher.ts:786-847`).
- **“`safeStorage` plaintext fallback.”** Windows/macOS fail closed; Linux requires explicit env opt-in and emits a `[SECURITY]` warning (`secureStore.ts:119-144, 170-180`).
- **“Capability manager token flaws.”** 256-bit `crypto.randomBytes`, TTL bounded 1 ms–24 h, single-use store keyed by token value, revoke by session/profile, token never logged (`customProtocolAccess.ts:248-342`) — scaffolding itself is sound; the gap is purely that it is unwired (P2-002).
- **“`evaluateCustomProtocolAccess` `allowOrigin: "null"`.”** Correct for an opaque `file://` client; never `*`; `Vary: Origin` always emitted (`customProtocolAccess.ts:131-153, 161-170`).
- **“Auto-update allows forced install.”** `quitAndInstall` requires a real `update-downloaded` event in-process (`updates.ts:78-90, 88-90`).
- **“Profile isolation bypass via forged `profileId`.”** Venice handlers overwrite renderer-supplied profile ids with the main-bound session profile (`veniceHandlers.ts:47-60`); `profileSession` binding is only set after password verification (`apiKeyHandlers.ts:545-584`) and ids pass `isValidProfileStorageId`.

## Domain: guard-secrets-safety

## Domain: ipc-parity
## Rejected candidates

- **`apiKey:set`/`apiKey:delete` return `{code, safeMessage}` instead of `error`** — rejected as a defect: `desktopApiKey.set/delete` are typed to `ApiKeyMutationResult` and `src/stores/auth-store.ts:147-155` consumes `code`/`safeMessage` consistently; the web branch of the same bridge returns the same shape. Contract is internally consistent, just different from other channels.
- **`sync:writePacket` lacks handler-level payload validation** — rejected as a defect: the handler forwards to `writePacket` in `electron/services/syncFolderWatcher.ts:786-831`, which enforces the store allowlist, ID charset/length, `..` rejection, per-packet byte cap, record-object shape, and inner-ID match. Defense-in-depth note only.
- **Web-mode crash/no-op risk for Electron-only preload methods** — rejected: every `desktopBridge` export guards `isElectron()` and returns a defined error object or documented no-op unsubscribe (verified for `desktopSync`, `desktopMedia`, `desktopCharacterImage`, `desktopInspector`, `desktopBackgroundTask.onUpdate`, `desktopCharacterCreator`, `desktopReplicate`, `desktopHuggingFace`, `desktopTts`, `desktopImageInspector`). No unguarded `window.veniceForge` dereference exists outside `isElectron()` branches in `src` (all 209 `window.veniceForge` matches are in `desktopBridge.ts` or comments/mocks).
- **`masterPassword:set` minimum length of 4** — rejected as a defect: intentional product decision documented in the handler; lockout throttling exists on verify.
- **`chat:save`/`chat:get` missing the strict ID charset/null-byte validation that `conversations:*` has** — rejected as a defect: `chatStorage` service layer owns chat ID validation and the legacy `chat:` family is back-compat; noted as inconsistency only.
- **fileHandlers comment claiming media import allowlist includes Downloads/Documents/Desktop** — rejected as a defect: the comment at `fileHandlers.ts:352-355` is stale (service only allows Pictures/Venice Forge + thumb cache, `mediaService.ts:154-158`), but the implementation is the stricter, safe direction.
- **`replicate:generateImage` return type includes undeclared `disposition` field** — rejected: additive field, TypeScript structural typing tolerates it, and the channel is unwired anyway (covered by P3-004).
- **Preload `jina.request` `profileId` ignored by handler (session-authoritative)** — rejected: consistent with the rest of the credential channels; renderer-supplied profile selectors are deliberately never honored (documented pattern).


---

# IPC Channel Inventory (195 handler channels + 11 emitter channels)

Generated 2026-09-12 from HEAD 84cf5bbe. Columns: channel · handler location · preload location · renderer consumer chain · payload-validation assessment. “✅” = validation observed at the main-process boundary or a validated service boundary it exclusively calls.

| # | Channel | Handler | Preload | Renderer consumer | Validated? |
|---|---------|---------|---------|-------------------|------------|
| 1 | `apiKey:delete` | electron/ipc/h/apiKeyHandlers.ts:698 | preload.ts:159 | desktopApiKey.delete | ✅ |
| 2 | `apiKey:getStatus` | electron/ipc/h/apiKeyHandlers.ts:665 | preload.ts:153 | desktopApiKey ← auth-store | ✅ |
| 3 | `apiKey:isConfigured` | electron/ipc/h/apiKeyHandlers.ts:657 | preload.ts:150 | desktopApiKey ← auth-store | ✅ session-authoritative |
| 4 | `apiKey:set` | electron/ipc/h/apiKeyHandlers.ts:669 | preload.ts:156 | desktopApiKey.set ← auth-store.ts:149 | ✅ key format; {code,safeMessage} shape consistent with consumer |
| 5 | `apiKey:test` | electron/ipc/h/apiKeyHandlers.ts:844 | preload.ts:162 | desktopApiKey.test | ✅ |
| 6 | `app:characterImage:clearCache` | electron/ipc/h/fileHandlers.ts:466 | preload.ts:365 | desktopCharacterImage.clearCache | ✅ |
| 7 | `app:characterImage:get` | electron/ipc/h/fileHandlers.ts:446 | preload.ts:362 | desktopCharacterImage ← useCharacterImage | ✅ trusted-Venice-URL allowlist, redirect-pinning, magic-byte check, byte cap |
| 8 | `app:characterImage:inventory` | electron/ipc/h/fileHandlers.ts:476 | preload.ts:370 | desktopCharacterImage.getInventory | ✅ |
| 9 | `app:checkForUpdates` | electron/ipc/updates.ts:40 | preload.ts:517 | desktopUpdates | ✅ dev-mode guard + 30s timeout |
| 10 | `app:downloadUpdate` | electron/ipc/updates.ts:63 | preload.ts:520 | desktopUpdates | ✅ 5min timeout |
| 11 | `app:getDiagnostics` | electron/ipc/h/systemHandlers.ts:246 | preload.ts:259 | desktopApp ← initDesktopBridge | ✅ redacted |
| 12 | `app:getVersion` | electron/ipc/h/systemHandlers.ts:242 | preload.ts:245 | desktopApp.getVersion | ✅ (P3-006 rate-limit note) |
| 13 | `app:installUpdate` | electron/ipc/updates.ts:78 | preload.ts:523 | desktopUpdates | ✅ downloaded-flag gate |
| 14 | `app:isEncryptionAvailable` | electron/ipc/h/systemHandlers.ts:244 | preload.ts:255 | desktopApp | ✅ |
| 15 | `app:loadJsonFile` | electron/ipc/h/fileHandlers.ts:324 | preload.ts:321 | desktopFiles.importJsonFile | partial: no mainFrame check |
| 16 | `app:loadYamlFile` | electron/ipc/h/fileHandlers.ts:299 | preload.ts:327 | desktopFiles.importYamlFile | partial: no mainFrame check |
| 17 | `app:media:export-files` | electron/ipc/h/fileHandlers.ts:213 | preload.ts:310 | desktopMedia.exportMediaFiles | ✅ mainFrame + item mapping |
| 18 | `app:media:import` | electron/ipc/h/fileHandlers.ts:356 | preload.ts:334 | desktopMedia.importMedia | ✅ service allowlist (Pictures/VF + thumbs), realpath, size, MIME sniff |
| 19 | `app:media:meta` | electron/ipc/h/fileHandlers.ts:402 | preload.ts:344 | desktopMedia.readMediaMeta | ✅ same allowlist |
| 20 | `app:media:persist-generated-image` | electron/ipc/h/fileHandlers.ts:86 | preload.ts:281 | desktopMedia.persistGeneratedImage ← media studio | ✅ mainFrame + data-URL parse + base64 strict + magic-byte sniff |
| 21 | `app:media:retry-generated-image` | electron/ipc/h/fileHandlers.ts:131 | preload.ts:290 | desktopMedia.retryGeneratedImage | ✅ UUIDv4 regex + opaque recovery ID |
| 22 | `app:media:reveal` | electron/ipc/h/fileHandlers.ts:383 | preload.ts:338 | desktopMedia.revealMedia | ✅ reveal-safe dir allowlist |
| 23 | `app:media:save-data-url` | electron/ipc/h/fileHandlers.ts:194 | preload.ts:301 | desktopMedia.saveMediaAs | ✅ mainFrame |
| 24 | `app:media:save-generated` | electron/ipc/h/fileHandlers.ts:174 | preload.ts:298 | desktopMedia.saveMediaAs | ✅ mainFrame + mediaId |
| 25 | `app:media:save-generated-recovery` | electron/ipc/h/fileHandlers.ts:151 | preload.ts:295 | desktopMedia.saveGeneratedImageRecovery | ✅ mainFrame + recovery custody lookup |
| 26 | `app:media:thumb` | electron/ipc/h/fileHandlers.ts:426 | preload.ts:350 | desktopMedia.generateMediaThumb | ✅ sha256 format, source cap, maxDim clamp 32–1024 |
| 27 | `app:openConversationsFolder` | electron/ipc/h/fileHandlers.ts:485 | preload.ts:444 | desktopConversations ← memory-panel | ✅ profile-scoped dir |
| 28 | `app:openLogsFolder` | electron/ipc/h/systemHandlers.ts:266 | preload.ts:265 | desktopApp | ✅ |
| 29 | `app:proxyScrape` | electron/ipc/h/systemHandlers.ts:98 | preload.ts:268 | desktopApp.proxyScrape | ✅ https-only, DNS-wide private-IP block, no redirects, content-type allowlist, 2MiB cap, body screen |
| 30 | `app:saveJsonFile` | electron/ipc/h/fileHandlers.ts:243 | preload.ts:318 | desktopFiles.exportJson/exportBackupFile | partial: size cap + basename; **no mainFrame check (P3-005); cancel {ok:false} vs load {ok:true} (P3-009); filePath missing from preload type (P3-009)** |
| 31 | `app:saveYamlFile` | electron/ipc/h/fileHandlers.ts:276 | preload.ts:324 | desktopFiles | partial: no mainFrame check (P3-005) |
| 32 | `backgroundTask:cancel` | electron/ipc/h/backgroundTaskHandlers.ts:181 | preload.ts:793 | desktopBackgroundTask | ✅ ownership |
| 33 | `backgroundTask:clear` | electron/ipc/h/backgroundTaskHandlers.ts:209 | preload.ts:799 | desktopBackgroundTask | ✅ ownership |
| 34 | `backgroundTask:create` | electron/ipc/h/backgroundTaskHandlers.ts:93 | preload.ts:784 | desktopBackgroundTask | ✅ type enum + id/queueId |
| 35 | `backgroundTask:list` | electron/ipc/h/backgroundTaskHandlers.ts:171 | preload.ts:790 | desktopBackgroundTask | ✅ profile filter |
| 36 | `backgroundTask:retry` | electron/ipc/h/backgroundTaskHandlers.ts:195 | preload.ts:796 | desktopBackgroundTask | ✅ ownership |
| 37 | `backgroundTask:submitPaidQueue` | electron/ipc/h/backgroundTaskHandlers.ts:223 | preload.ts:802 | desktopBackgroundTask ← paid queue | ✅ operation enum + model validation |
| 38 | `backgroundTask:subscribe` | electron/ipc/h/backgroundTaskHandlers.ts:77 | preload.ts:778 | desktopBackgroundTask ← task store | ✅ profile-filtered snapshot |
| 39 | `backgroundTask:unsubscribe` | electron/ipc/h/backgroundTaskHandlers.ts:88 | preload.ts:781 | desktopBackgroundTask | ✅ |
| 40 | `backgroundTask:update` | electron/ipc/h/backgroundTaskHandlers.ts:119 | preload.ts:787 | desktopBackgroundTask | ✅ ownership + status/stage enums + provider-polled field restrictions |
| 41 | `backgroundTask:update` | (main → renderer event) | preload backgroundTask.onUpdate (:806) | desktopBridge event subscriber | n/a (emit path) |
| 42 | `characterCards:applyImport` | electron/ipc/characterCardFileHandlers.ts:193 | preload.ts:623 | desktopCharacterCards | ✅ + safety assessment |
| 43 | `characterCards:chooseImportFile` | electron/ipc/characterCardFileHandlers.ts:121 | preload.ts:617 | desktopCharacterCards ← import UI | ✅ dialog + candidate TTL |
| 44 | `characterCards:consumeImportCandidate` | electron/ipc/characterCardFileHandlers.ts:163 | preload.ts:620 | desktopCharacterCards | ✅ handle + sender binding |
| 45 | `characterCards:delete` | electron/ipc/rpHandlers.ts:148 | preload.ts:614 | desktopCharacterCards | ✅ |
| 46 | `characterCards:exportJson` | electron/ipc/characterCardFileHandlers.ts:279 | preload.ts:629 | desktopCharacterCards ← CharacterLibrary:284 | ✅ cardId + profile enum |
| 47 | `characterCards:exportPng` | electron/ipc/characterCardFileHandlers.ts:301 | preload.ts:632 | desktopCharacterCards | ✅ |
| 48 | `characterCards:get` | electron/ipc/rpHandlers.ts:112 | preload.ts:608 | desktopCharacterCards | ✅ id validated |
| 49 | `characterCards:list` | electron/ipc/rpHandlers.ts:100 | preload.ts:605 | desktopCharacterCards ← characterCardService | ✅ profile-scoped |
| 50 | `characterCards:save` | electron/ipc/rpHandlers.ts:124 | preload.ts:611 | desktopCharacterCards | ✅ parseSavePayload unwraps envelope + origin |
| 51 | `characterCards:undoImport` | electron/ipc/characterCardFileHandlers.ts:265 | preload.ts:626 | desktopCharacterCards | ✅ undo record |
| 52 | `characterCreator:exportCard` | electron/ipc/characterCreatorHandlers.ts:69 | preload.ts:869 | desktopCharacterCreator.exportCard ← CharacterCreatorView.tsx:763 | ✅ forbidden keys + spec check + size cap + atomic write |
| 53 | `characterCreator:validateCard` | electron/ipc/characterCreatorHandlers.ts:54 | preload.ts:872 | **none — dead channel (P3-004)** | ✅ validated but unwired |
| 54 | `chat-folders:create` | electron/ipc/h/chatFolderHandlers.ts:220 | preload.ts:453 | desktopChatFolders | ✅ full input type-guard |
| 55 | `chat-folders:delete` | electron/ipc/h/chatFolderHandlers.ts:250 | preload.ts:468 | desktopChatFolders | ✅ |
| 56 | `chat-folders:export-backup` | electron/ipc/h/chatFolderHandlers.ts:262 | preload.ts:474 | desktopChatFolders | ✅ passphrase+confirm; **no mainFrame check (P3-005)** |
| 57 | `chat-folders:get-backup-preview` | electron/ipc/h/chatFolderHandlers.ts:256 | preload.ts:471 | desktopChatFolders | ✅ |
| 58 | `chat-folders:get-lock-state` | electron/ipc/h/chatFolderHandlers.ts:331 | preload.ts:492 | desktopChatFolders | ✅ |
| 59 | `chat-folders:import-backup` | electron/ipc/h/chatFolderHandlers.ts:307 | preload.ts:483 | desktopChatFolders | ✅ token consume + mode validation |
| 60 | `chat-folders:list` | electron/ipc/h/chatFolderHandlers.ts:210 | preload.ts:450 | desktopChatFolders ← folder UI | ✅ requireProfileSessionId (strict) |
| 61 | `chat-folders:lock` | electron/ipc/h/chatFolderHandlers.ts:316 | preload.ts:486 | desktopChatFolders | ✅ passphrase 8–1024 |
| 62 | `chat-folders:move-conversation` | electron/ipc/h/chatFolderHandlers.ts:238 | preload.ts:462 | desktopChatFolders | ✅ |
| 63 | `chat-folders:move-conversations` | electron/ipc/h/chatFolderHandlers.ts:244 | preload.ts:465 | desktopChatFolders | ✅ |
| 64 | `chat-folders:pick-import-file` | electron/ipc/h/chatFolderHandlers.ts:281 | preload.ts:477 | desktopChatFolders | ✅ capability token + lstat/realpath binding |
| 65 | `chat-folders:preview-import` | electron/ipc/h/chatFolderHandlers.ts:298 | preload.ts:480 | desktopChatFolders | ✅ token resolve (non-consuming) + re-validation |
| 66 | `chat-folders:rename` | electron/ipc/h/chatFolderHandlers.ts:226 | preload.ts:456 | desktopChatFolders | ✅ |
| 67 | `chat-folders:reorder` | electron/ipc/h/chatFolderHandlers.ts:232 | preload.ts:459 | desktopChatFolders | ✅ |
| 68 | `chat-folders:unlock` | electron/ipc/h/chatFolderHandlers.ts:322 | preload.ts:489 | desktopChatFolders | ✅ + backoff error surfaced |
| 69 | `chat:delete` | electron/ipc/h/systemHandlers.ts:367 | preload.ts:401 | desktopChat.delete | ✅ id + origin |
| 70 | `chat:get` | electron/ipc/h/systemHandlers.ts:318 | preload.ts:393 | desktopChat.get | ✅ length cap (charset check weaker than conversations:get — noted) |
| 71 | `chat:list` | electron/ipc/h/systemHandlers.ts:268 | preload.ts:377 | desktopChat.list ← chat-store | ✅ profile-scoped |
| 72 | `chat:listPage` | electron/ipc/h/systemHandlers.ts:291 | preload.ts:389 | desktopChat.listPage — **no caller (dead wrapper, P3-004)** | ✅ offset/limit clamped |
| 73 | `chat:save` | electron/ipc/h/systemHandlers.ts:332 | preload.ts:397 | desktopChat.save ← chat-store fallback | ✅ size cap, origin validation, profile forced |
| 74 | `config:deleteTheme` | electron/ipc/configHandlers.ts:167 | preload.ts:591 | desktopConfig.deleteTheme | ✅ |
| 75 | `config:exportTemplate` | electron/ipc/configHandlers.ts:130 | preload.ts:582 | desktopConfig.exportTemplate | partial: **no mainFrame check (P3-005)** |
| 76 | `config:get` | electron/ipc/configHandlers.ts:37 | preload.ts:564 | desktopConfig ← settings | ✅ sanitized |
| 77 | `config:getStatus` | electron/ipc/configHandlers.ts:45 | preload.ts:573 | desktopConfig | ✅ paths redacted |
| 78 | `config:initialize` | electron/ipc/configHandlers.ts:62 | preload.ts:567 | desktopConfig | ✅ |
| 79 | `config:loadMergedThemes` | electron/ipc/configHandlers.ts:146 | preload.ts:585 | desktopConfig | ✅ |
| 80 | `config:openFolder` | electron/ipc/configHandlers.ts:71 | preload.ts:576 | desktopConfig | ✅ |
| 81 | `config:reload` | electron/ipc/configHandlers.ts:53 | preload.ts:570 | desktopConfig | ✅ |
| 82 | `config:resetSecureStoreKeys` | electron/ipc/configHandlers.ts:177 | preload.ts:599 | desktopConfig | ✅ |
| 83 | `config:saveTheme` | electron/ipc/configHandlers.ts:154 | preload.ts:588 | desktopConfig.saveTheme | ✅ ThemeFamilyV2 guard |
| 84 | `config:writeSanitized` | electron/ipc/configHandlers.ts:79 | preload.ts:579 | desktopConfig.writeSanitized | ✅ FSM write blocked; sanitized writer |
| 85 | `conversations:archive` | electron/ipc/h/systemHandlers.ts:486 | preload.ts:426 | **none (P3-004)** | ✅ validated but unwired |
| 86 | `conversations:delete` | electron/ipc/h/systemHandlers.ts:465 | preload.ts:423 | desktopConversations.delete ← chat-store:660 | ✅ |
| 87 | `conversations:detectLegacyHistory` | electron/ipc/h/systemHandlers.ts:619 | preload.ts:441 | desktopConversations ← memory-panel:41 | ✅ default-only |
| 88 | `conversations:get` | electron/ipc/h/systemHandlers.ts:418 | preload.ts:417 | desktopConversations.get | ✅ charset+null-byte+length |
| 89 | `conversations:list` | electron/ipc/h/systemHandlers.ts:389 | preload.ts:414 | desktopConversations.list ← chat-store:1648, backupExportService:57 | ✅ filter shape |
| 90 | `conversations:migrateLegacyHistory` | electron/ipc/h/systemHandlers.ts:601 | preload.ts:438 | desktopConversations ← memory-panel | ✅ default-profile-only |
| 91 | `conversations:pullContext` | electron/ipc/h/systemHandlers.ts:522 | preload.ts:432 | desktopConversations.pullContext ← use-chat.ts:104 | ✅ clamps + 2-stage safety screen |
| 92 | `conversations:rebuildIndex` | electron/ipc/h/systemHandlers.ts:591 | preload.ts:435 | desktopConversations ← memory-panel:72 | ✅ |
| 93 | `conversations:save` | electron/ipc/h/systemHandlers.ts:431 | preload.ts:420 | desktopConversations.save ← chat-store.ts:1426 | ✅ validation OK but **envelope mismatch — handler rejects every call (P1-001)** |
| 94 | `conversations:search` | electron/ipc/h/systemHandlers.ts:503 | preload.ts:429 | **none (P3-004)** | ✅ validated but unwired |
| 95 | `credential:delete` | electron/ipc/h/apiKeyHandlers.ts:450 | preload.ts:96 | desktopCredentials.delete — **no caller (dead)** | partial: reserved-name guard only |
| 96 | `credential:get` | electron/ipc/h/apiKeyHandlers.ts:438 | preload.ts:93 | desktopCredentials.get — **no caller (dead)** | partial: reserved-name guard only |
| 97 | `credential:set` | electron/ipc/h/apiKeyHandlers.ts:426 | preload.ts:90 | desktopCredentials.set — **no caller (dead)** | ❌ no shape/size validation, no profile scope — P2-003 |
| 98 | `documentAgent:approvals:decide` | electron/ipc/h/documentAgentHandlers.ts:208 | preload.ts:856 | desktopDocumentAgent | ✅ decision enum + plan type checks + profile match + grant re-check |
| 99 | `documentAgent:approvals:list` | electron/ipc/h/documentAgentHandlers.ts:295 | preload.ts:854 | desktopDocumentAgent | ✅ grant scoping |
| 100 | `documentAgent:attachments:promote` | electron/ipc/h/documentAgentHandlers.ts:327 | preload.ts:850 | desktopDocumentAgent | ✅ registry resolve + MIME classify |
| 101 | `documentAgent:attachments:register` | electron/ipc/h/documentAgentHandlers.ts:378 | preload.ts:847 | desktopDocumentAgent | ✅ fields capped (bodyB64 ≤2MB) |
| 102 | `documentAgent:documents:create` | electron/ipc/h/documentAgentHandlers.ts:131 | preload.ts:821 | desktopDocumentAgent | ✅ overwrite=false + blocks array + format enum |
| 103 | `documentAgent:documents:delete` | electron/ipc/h/documentAgentHandlers.ts:164 | preload.ts:833 | desktopDocumentAgent | ✅ |
| 104 | `documentAgent:documents:export` | electron/ipc/h/documentAgentHandlers.ts:313 | preload.ts:842 | desktopDocumentAgent | ✅ mainFrame + format + atomic write |
| 105 | `documentAgent:documents:list` | electron/ipc/h/documentAgentHandlers.ts:147 | preload.ts:824 | desktopDocumentAgent | ✅ |
| 106 | `documentAgent:documents:proposeEdits` | electron/ipc/h/documentAgentHandlers.ts:183 | preload.ts:836 | desktopDocumentAgent | ✅ ops 1–200 + plan factory |
| 107 | `documentAgent:documents:proposeRestore` | electron/ipc/h/documentAgentHandlers.ts:272 | preload.ts:839 | desktopDocumentAgent | ✅ |
| 108 | `documentAgent:documents:read` | electron/ipc/h/documentAgentHandlers.ts:152 | preload.ts:827 | desktopDocumentAgent | ✅ |
| 109 | `documentAgent:documents:revisions` | electron/ipc/h/documentAgentHandlers.ts:159 | preload.ts:830 | desktopDocumentAgent | ✅ |
| 110 | `documentAgent:permissions:set` | electron/ipc/h/documentAgentHandlers.ts:93 | preload.ts:816 | desktopDocumentAgent ← agent UI | ✅ preset bounded by setEffectiveAgentPermissionPreset |
| 111 | `documentAgent:workspace:choose` | electron/ipc/h/documentAgentHandlers.ts:393 | preload.ts:860 | desktopDocumentAgent ← workspace UI | ✅ mainFrame + dialog + grant issue |
| 112 | `documentAgent:workspace:list` | electron/ipc/h/documentAgentHandlers.ts:497 | preload.ts:862 | desktopDocumentAgent.workspace.list | ✅ grant check |
| 113 | `documentAgent:workspace:proposeChangeset` | electron/ipc/h/documentAgentHandlers.ts:407 | — **not exposed** — | **none — dead handler (P2-002)** | partial: grant-only, **no capability check** |
| 114 | `documentAgent:workspace:proposeMove` | electron/ipc/h/documentAgentHandlers.ts:436 | — **not exposed** — | **none — dead handler (P2-002)** | partial: grant-only, **no capability check** |
| 115 | `documentAgent:workspace:proposeTrash` | electron/ipc/h/documentAgentHandlers.ts:463 | — **not exposed** — | **none — dead handler (P2-002)** | partial: grant-only, **no capability check** |
| 116 | `documentAgent:workspace:read` | electron/ipc/h/documentAgentHandlers.ts:497 | preload.ts:863 | desktopDocumentAgent.workspace.read | ✅ grant check |
| 117 | `documentAgent:workspace:revoke` | electron/ipc/h/documentAgentHandlers.ts:489 | preload.ts:861 | desktopDocumentAgent | ✅ session binding |
| 118 | `documentAgent:workspace:search` | electron/ipc/h/documentAgentHandlers.ts:497 | preload.ts:864 | desktopDocumentAgent.workspace.search | ✅ grant check |
| 119 | `huggingface:getModelCatalog` | electron/ipc/h/huggingfaceHandlers.ts:13 | preload.ts:902 | desktopHuggingFace ← provider settings | partial: `force` flag unreachable via preload (P3-008) |
| 120 | `imageInspector:chooseImage` | electron/ipc/h/imageInspectorHandlers.ts:35 | preload.ts:498 | desktopImageInspector ← inspector UI | ✅ dialog + size cap + persist |
| 121 | `imageInspector:ingestClipboardImage` | electron/ipc/h/imageInspectorHandlers.ts:68 | preload.ts:501 | desktopImageInspector | ✅ |
| 122 | `imageInspector:readMediaDataUrl` | electron/ipc/h/imageInspectorHandlers.ts:93 | preload.ts:511 | desktopImageInspector | ✅ sha64 regex |
| 123 | `imageInspector:resolveMediaInput` | electron/ipc/h/imageInspectorHandlers.ts:83 | preload.ts:506 | desktopImageInspector | ✅ mediaId sha64 regex |
| 124 | `inspector:telemetry` | (main → renderer event) | preload inspector.onTelemetry (:882) | desktopBridge event subscriber | n/a (emit path) |
| 125 | `inspector:telemetry:subscribe` | electron/ipc/h/inspectorTelemetryHandlers.ts:31 | preload.ts:880 | via preload.inspector.onTelemetry ← desktopInspector | ✅ register; **broadcast not profile-scoped (P3-007)** |
| 126 | `inspector:telemetry:unsubscribe` | electron/ipc/h/inspectorTelemetryHandlers.ts:36 | preload.ts:885 | via onTelemetry unsubscribe | ✅ |
| 127 | `jina:request` | electron/ipc/h/jinaHandlers.ts:124 | preload.ts:227 | desktopJina ← research workspace | ✅ host allowlist r.jina.ai/s.jina.ai, header allowlist, body cap, guard |
| 128 | `jinaApiKey:delete` | electron/ipc/h/jinaHandlers.ts:114 | preload.ts:213 | desktopJinaApiKey | ✅ |
| 129 | `jinaApiKey:isConfigured` | electron/ipc/h/jinaHandlers.ts:92 | preload.ts:207 | desktopJinaApiKey | ✅ |
| 130 | `jinaApiKey:set` | electron/ipc/h/jinaHandlers.ts:100 | preload.ts:210 | desktopJinaApiKey | ✅ trim/length |
| 131 | `jinaApiKey:test` | electron/ipc/h/jinaHandlers.ts:289 | preload.ts:216 | desktopJinaApiKey | ✅ |
| 132 | `lorebooks:delete` | electron/ipc/rpHandlers.ts:280 | preload.ts:662 | desktopLorebooks | ✅ |
| 133 | `lorebooks:get` | electron/ipc/rpHandlers.ts:245 | preload.ts:656 | desktopLorebooks | ✅ |
| 134 | `lorebooks:list` | electron/ipc/rpHandlers.ts:234 | preload.ts:653 | desktopLorebooks | ✅ |
| 135 | `lorebooks:save` | electron/ipc/rpHandlers.ts:257 | preload.ts:659 | desktopLorebooks | ✅ |
| 136 | `masterPassword:change` | electron/ipc/h/apiKeyHandlers.ts:479 | preload.ts:111 | desktopMasterPassword | ✅ current-password verify + lockout |
| 137 | `masterPassword:clear` | electron/ipc/h/apiKeyHandlers.ts:515 | preload.ts:114 | desktopMasterPassword | ✅ current-password verify |
| 138 | `masterPassword:isSet` | electron/ipc/h/apiKeyHandlers.ts:462 | preload.ts:102 | desktopMasterPassword ← profile-store | ✅ (see P3-006 rate-limit type note) |
| 139 | `masterPassword:set` | electron/ipc/h/apiKeyHandlers.ts:464 | preload.ts:105 | desktopMasterPassword ← settings UI | ✅ min-length + already-set guard |
| 140 | `masterPassword:verify` | electron/ipc/h/apiKeyHandlers.ts:503 | preload.ts:108 | desktopMasterPassword | ✅ lockout via verifyMasterPassword |
| 141 | `personas:delete` | electron/ipc/rpHandlers.ts:214 | preload.ts:647 | desktopPersonas | ✅ |
| 142 | `personas:get` | electron/ipc/rpHandlers.ts:179 | preload.ts:641 | desktopPersonas | ✅ |
| 143 | `personas:list` | electron/ipc/rpHandlers.ts:168 | preload.ts:638 | desktopPersonas | ✅ |
| 144 | `personas:save` | electron/ipc/rpHandlers.ts:191 | preload.ts:644 | desktopPersonas | ✅ envelope unwrap |
| 145 | `profile:purge` | electron/ipc/h/systemHandlers.ts:77 | preload.ts:144 | desktopProfilePurge ← profilePurge.ts | ✅ requested==session check |
| 146 | `profilePassword:clear` | electron/ipc/h/apiKeyHandlers.ts:630 | preload.ts:138 | desktopProfilePassword | ✅ password gate |
| 147 | `profilePassword:isSet` | electron/ipc/h/apiKeyHandlers.ts:537 | preload.ts:129 | desktopProfilePassword | ✅ |
| 148 | `profilePassword:set` | electron/ipc/h/apiKeyHandlers.ts:586 | preload.ts:132 | desktopProfilePassword | ✅ session-authoritative; default profile rejected |
| 149 | `profilePassword:verify` | electron/ipc/h/apiKeyHandlers.ts:610 | preload.ts:135 | desktopProfilePassword | ✅ + lockout; sets session on success |
| 150 | `profileSession:activate` | electron/ipc/h/apiKeyHandlers.ts:545 | preload.ts:126 | desktopProfilePassword.activate ← profile-store.ts:115,238 | ✅ password verify + session rebind + capability cleanup |
| 151 | `providerApiKey:delete` | electron/ipc/h/apiKeyHandlers.ts:732 | preload.ts:174 | desktopProviderApiKey | ✅ |
| 152 | `providerApiKey:isConfigured` | electron/ipc/h/apiKeyHandlers.ts:707 | preload.ts:168 | desktopProviderApiKey ← settings | ✅ providerId parse |
| 153 | `providerApiKey:set` | electron/ipc/h/apiKeyHandlers.ts:716 | preload.ts:171 | desktopProviderApiKey | ✅ structured-credential redirect |
| 154 | `providerApiKey:test` | electron/ipc/h/apiKeyHandlers.ts:848 | preload.ts:177 | desktopProviderApiKey | ✅ |
| 155 | `providerCredential:delete` | electron/ipc/h/apiKeyHandlers.ts:772 | preload.ts:189 | desktopProviderCredential | ✅ |
| 156 | `providerCredential:isConfigured` | electron/ipc/h/apiKeyHandlers.ts:745 | preload.ts:183 | desktopProviderCredential | ✅ |
| 157 | `providerCredential:set` | electron/ipc/h/apiKeyHandlers.ts:754 | preload.ts:186 | desktopProviderCredential | ✅ validateProviderCredential schema per provider |
| 158 | `providerCredential:test` | electron/ipc/h/apiKeyHandlers.ts:869 | preload.ts:192 | desktopProviderCredential | ✅ |
| 159 | `providerSettings:get` | electron/ipc/h/apiKeyHandlers.ts:785 | preload.ts:198 | desktopProviderSettings | ✅ |
| 160 | `providerSettings:update` | electron/ipc/h/apiKeyHandlers.ts:789 | preload.ts:201 | desktopProviderSettings | ✅ full structural validation |
| 161 | `replicate:generateImage` | electron/ipc/h/replicateHandlers.ts:94 | preload.ts:896 | desktopReplicate — **no caller (P3-004)** | ✅ input validation + durable paid-task submission |
| 162 | `rpAssets:delete` | electron/ipc/rpHandlers.ts:414 | preload.ts:692 | desktopRpAssets | ✅ |
| 163 | `rpAssets:get` | electron/ipc/rpHandlers.ts:379 | preload.ts:686 | desktopRpAssets | ✅ |
| 164 | `rpAssets:list` | electron/ipc/rpHandlers.ts:366 | preload.ts:683 | desktopRpAssets | ✅ chatId filter |
| 165 | `rpAssets:save` | electron/ipc/rpHandlers.ts:391 | preload.ts:689 | desktopRpAssets | ✅ |
| 166 | `rpChats:delete` | electron/ipc/rpHandlers.ts:346 | preload.ts:677 | desktopRpChats | ✅ |
| 167 | `rpChats:get` | electron/ipc/rpHandlers.ts:311 | preload.ts:671 | desktopRpChats | ✅ |
| 168 | `rpChats:list` | electron/ipc/rpHandlers.ts:300 | preload.ts:668 | desktopRpChats | ✅ |
| 169 | `rpChats:save` | electron/ipc/rpHandlers.ts:323 | preload.ts:674 | desktopRpChats | ✅ |
| 170 | `safety:setFamilySafeMode` | electron/ipc/configHandlers.ts:95 | preload.ts:120 | desktopSafety ← settings | ✅ master-password gate; FSM blocked in generic config write |
| 171 | `scenarios:delete` | electron/ipc/rpHandlers.ts:480 | preload.ts:708 | desktopScenarios | ✅ |
| 172 | `scenarios:get` | electron/ipc/rpHandlers.ts:445 | preload.ts:702 | desktopScenarios | ✅ |
| 173 | `scenarios:list` | electron/ipc/rpHandlers.ts:434 | preload.ts:699 | desktopScenarios | ✅ |
| 174 | `scenarios:save` | electron/ipc/rpHandlers.ts:457 | preload.ts:705 | desktopScenarios | ✅ |
| 175 | `sync:acknowledgeOperation` | electron/ipc/h/syncHandlers.ts:173 | preload.ts:747 | desktopSync | ✅ operationId hex64 |
| 176 | `sync:applyRemoteMutation` | electron/ipc/h/syncHandlers.ts:91 | preload.ts:726 | desktopSync ← sync engine | ✅ token authority + store switch + profile scope |
| 177 | `sync:beginBackupExport` | electron/ipc/h/syncHandlers.ts:184 | preload.ts:750 | desktopSync ← backup UI | ✅ per-sender lease |
| 178 | `sync:chooseSyncFolder` | electron/ipc/h/syncHandlers.ts:17 | preload.ts:714 | desktopSync ← sync UI | ✅ main-process dialog |
| 179 | `sync:createReplaceImportRecovery` | electron/ipc/h/syncHandlers.ts:231 | preload.ts:759 | desktopSync | ✅ |
| 180 | `sync:decryptBackup` | electron/ipc/h/syncHandlers.ts:220 | preload.ts:756 | desktopSync ← import | partial: no size cap on ciphertext — minor |
| 181 | `sync:encryptBackup` | electron/ipc/h/syncHandlers.ts:196 | preload.ts:753 | desktopSync | ✅ lease token + profile + payload profile binding |
| 182 | `sync:getLatestReplaceImportRecovery` | electron/ipc/h/syncHandlers.ts:249 | preload.ts:762 | desktopSync | ✅ |
| 183 | `sync:getStatus` | electron/ipc/h/syncHandlers.ts:64 | preload.ts:735 | desktopSync | ✅ |
| 184 | `sync:getSyncFolder` | electron/ipc/h/syncHandlers.ts:41 | preload.ts:717 | desktopSync | ✅ |
| 185 | `sync:loadReplaceImportRecovery` | electron/ipc/h/syncHandlers.ts:262 | preload.ts:765 | desktopSync | ✅ |
| 186 | `sync:onRemoteChange` | (main → renderer event) | preload sync.onRemoteChange (:769) | desktopBridge event subscriber | n/a (emit path) |
| 187 | `sync:pauseSync` | electron/ipc/h/syncHandlers.ts:63 | preload.ts:732 | desktopSync | ✅ |
| 188 | `sync:rendererSessionAttached` | electron/ipc/h/syncHandlers.ts:66 | preload.ts:738 | desktopSync | partial: no null-guard on input (throws→caught) — minor |
| 189 | `sync:setEmissionSuppressed` | electron/ipc/h/syncHandlers.ts:76 | preload.ts:741 | desktopSync | partial: same |
| 190 | `sync:setSyncFolder` | electron/ipc/h/syncHandlers.ts:45 | preload.ts:720 | desktopSync | ✅ only re-affirms picker result |
| 191 | `sync:startSync` | electron/ipc/h/syncHandlers.ts:52 | preload.ts:723 | desktopSync | ✅ password string + session profile (params.profileId ignored by design) |
| 192 | `sync:stopSync` | electron/ipc/h/syncHandlers.ts:60 | preload.ts:729 | desktopSync | ✅ |
| 193 | `sync:writePacket` | electron/ipc/h/syncHandlers.ts:86 | preload.ts:744 | desktopSync ← sync engine | ✅ validated downstream (allowlist, id charset, byte cap, id match) |
| 194 | `theme:updated` | (main → renderer event) | preload config.onThemeUpdated (:595) | desktopBridge event subscriber | n/a (emit path) |
| 195 | `tts:clearCache` | electron/ipc/h/chatTtsHandlers.ts:10 | preload.ts:236 | desktopTts | ✅ |
| 196 | `tts:synthesize` | electron/ipc/h/chatTtsHandlers.ts:6 | preload.ts:233 | desktopTts ← chat TTS | ✅ service-layer opts validation |
| 197 | `updates:available` | (main → renderer event) | preload updates.onUpdateAvailable (:527) | desktopBridge event subscriber | n/a (emit path) |
| 198 | `updates:checking` | (main → renderer event) | **no preload listener (P3-009 dead emitter)** | desktopBridge event subscriber | n/a (emit path) |
| 199 | `updates:downloaded` | (main → renderer event) | preload updates.onUpdateDownloaded (:548) | desktopBridge event subscriber | n/a (emit path) |
| 200 | `updates:error` | (main → renderer event) | preload updates.onUpdateError (:555) | desktopBridge event subscriber | n/a (emit path) |
| 201 | `updates:not-available` | (main → renderer event) | preload updates.onUpdateNotAvailable (:534) | desktopBridge event subscriber | n/a (emit path) |
| 202 | `updates:progress` | (main → renderer event) | preload updates.onDownloadProgress (:541) | desktopBridge event subscriber | n/a (emit path) |
| 203 | `venice:abort` | electron/ipc/h/veniceHandlers.ts:139 | preload.ts:83 | attachAbort (desktopBridge.ts:84) | ✅ string/length check |
| 204 | `venice:request` | electron/ipc/h/veniceHandlers.ts:53 | preload.ts:39 | desktopVenice.request ← veniceClient.ts | ✅ endpoint/method allowlist, body cap, header blocklist, profile forced from session |
| 205 | `venice:streamChat` | electron/ipc/h/veniceHandlers.ts:74 | preload.ts:58 | desktopVenice.streamChat ← veniceClient.ts | ✅ same validator + chat/completions-only + guard + agent loop |
| 206 | `venice:streamDelta` | (main → renderer event) | preload venice.streamChat onDelta (preload.ts:57) | desktopBridge event subscriber | n/a (emit path) |

## Domain: main-storage
## Rejected candidates

- **`backupCrypto.decryptPayload` AES-256-GCM legacy branch (12-byte IV from file)** —
  nonce is randomly generated per encryption on the write side; legacy-format compatibility
  is deliberate and authenticated (GCM tag verified). No actionable defect beyond the
  documented migration path.
- **`chatFolderLockService` Argon2id `INTERACTIVE` preset** — consistent between lock and
  backup export; passphrase-gated, fail-closed, with attempt backoff. Acceptable.
- **`importBackup` new-folder mode allows duplicate source ids to overwrite each other** —
  reachable only with a hand-crafted backup; legitimate exports contain unique ids per
  profile. Recorded as a hardening note, not a defect.
- **`mediaService.decodePng` does not verify chunk CRCs and tolerates truncated IDAT** —
  malformed input yields throwaway thumbnail garbage (never persisted user data) or the
  renderer canvas fallback (decodeImage returns null for non-PNG/RGBA/gray). Palette PNGs
  (color type 3) and grayscale+alpha (type 4) are excluded but fall back gracefully.
- **`generatedVideoDownload` SSRF posture** — DNS-resolves all addresses, rejects private/
  loopback/link-local/reserved ranges, pins the request to the resolved IP via a custom
  `lookup`, keeps TLS hostname verification intact. Sound for the stated threat model.
- **`characterImageCache.writeMeta` non-atomic + lazy orphan cleanup** — benign: orphaned
  `.bin` files are reaped by `listEntries` during eviction/inventory; worst case is a stale
  cache entry.
- **`chatStorage.listConversations` early-break pagination math** — verified: the
  `+1` overshoot guarantees `truncated` is reported whenever the batch loop broke early;
  legacy array/envelope duality is handled at every in-domain call site
  (chatFolderService.ts:190-191, chatFolderBackupService.ts:123-124, 170-171, 537-542).
- **`conversationVault.getRecordPath` uses `createdAt` in the path** — id and profile are
  validated; `createdAt` only selects `records/<year>/<month>/` inside the validated
  profile root; non-numeric dates degenerate to a `NaN/` folder inside the root. Contained.
- **`readRegularFileNoFollow` (utils/secureFile.ts)** — opens `O_RDONLY|O_NOFOLLOW`,
  fstats through the same descriptor, rejects non-regular files. Correct TOCTOU closure for
  its two call sites.
- **`purgeProfileChatHistory` / `purgeProfileConversationVault` / `purgeRpProfileDirs` /
  `purgeProfileTtsCache`** — all validate `isValidProfileStorageId`, refuse `default`, and
  `rm -rf` only the validated profile subtree; quarantine/backup files live inside the same
  subtree and are removed with it. Compliant with §13 purge expectations.
- **Sync packet path containment (`openSecureWatchedFile`)** — realpath-of-parent allowlist
  (`blobs`/`objects` only), pre/post-open lstat symlink checks, `O_NOFOLLOW`, regular-file
  fstat, 50 MiB cap, per-object serialization via `syncApplyQueue`. Robust.
- **Folder-backup import file approval (`issueBackupFileCapability`)** — dialog-mediated,
  symlink rejected, size-capped, and re-validated (size/mtime/dev/ino/realpath) at resolve
  time with TTL and single-use consumption. Robust; the KDF-param gap (VF-AUD-20260912-P1-001)
  is the one hole in this flow.

## Domain: stores-persistence
## Rejected candidates / false positives

- **"API keys enter Zustand state or localStorage."** NOT FOUND. Keys are kept in main-process secure storage; renderer stores hold only `configured` booleans.
- **"Cross-profile persistence leak."** NOT FOUND. Profile-scoped stores reload on switch; media/protocol grants are revoked.
- **"IDB schema migration v20 data loss."** NOT REPRODUCED. Migration chain v1–v20 was verified consistent with `DB_VERSION=20`.

## Domain: venice-client-streaming
## Rejected candidates

- **`data: [DONE]` with trailing whitespace would miss the terminator** — Venice emits the exact
  terminator per the OpenAI convention the decoder documents; adding a trim would accept
  non-conformant frames. Not a defect at this contract.
- **Proxy forwards the renderer's `X-Venice-Forge-Family-Safe-Mode` header upstream** — harmless
  custom header; no confidentiality or integrity impact; removing it is cosmetic.
- **GET responses are not screened by `screenVeniceResponse`** — explicit, documented design (GETs
  carry no user content; `fetch.ts:76` comment).
- **Electron `MAX_VENICE_RESPONSE_BYTES` (25 MiB) also counts SSE bytes** — protective memory cap;
  25 MiB of tokens is far beyond configured `max_completion_tokens`; acceptable.
- **`parseEndpoint` URL normalization of `/characters/../models`** — resolves to `/models`, which
  is allowlisted; no boundary crossing (path stays on `VENICE_API_HOST` origin by construction).
- **`fsmMediaProxyRes` branch for `proxyRes` without `.on`** — dead branch in practice;
  http-proxy-middleware always supplies an `IncomingMessage`.
- **Multipart transcription bodies screened as printable-prefix text** — extractor's
  fail-safe direction only (over-screening risk, never under-screening); bounded by
  `MAX_FIELD_CHARS`.
- **`veniceFetch` mutates the caller's `options.body` when stripping chat `metadata`** — shallow
  copies of messages; documented intent; no caller depends on post-send body identity.
- **Web `veniceStreamChat` has no retry** — standard SSE practice; checkpoint retry lives in
  `chat-stream-manager.ts:264-310` and is gated on `hasCommittedStreamState`.
- **`performVeniceRequest` returns the failed 429-retry response instead of falling through to the
  next provider** — explicitly documented one-retry policy (`veniceClient.ts:415-451`,
  VF-AUD-20260831-P2-008); not drift.

## Additional rejected candidates from manual scans

- **"Hardcoded hex colors in components"** — the 3,355 hex hits are almost entirely inside theme definitions, test fixtures, and legacy YAML converters; a targeted sample of `src/components/` found no production component colors bypassing the theme token system.
- **"`@ts-expect-error` abuse"** — all occurrences are either test-only intentional wrong-type injections or ambient-type workarounds (fake-indexeddb, CSS imports); none hide production runtime defects.
- **"`console.log` leaks secrets"** — production `console.error/warn` calls either use `redactErrorMessage`, `redactSecrets`, or log only error names; the remaining `console.log` in `main.tsx` logs only crypto availability.
