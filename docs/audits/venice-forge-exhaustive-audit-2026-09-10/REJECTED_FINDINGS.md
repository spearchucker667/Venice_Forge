# Rejected findings

## Candidate: Renderer file access is unrestricted (`app:readLocalFile`)

Result: **NOT a filesystem bypass.**

Reason: Preload still invokes `app:readLocalFile`, but no main-process handler is registered. The call cannot read a path. Classified instead as dead IPC (VF-AUD-20260910-P3-002). Media import/reveal paths use allowlisted dialogs and `fileHandlers.ts` validation.

## Candidate: `dangerouslySetInnerHTML` in Meteocon is XSS

Result: **NOT A DEFECT.**

Reason: Markup is bundled SVG, parsed, sanitized (`sanitizeSvgDocument`), and replaced with `EMPTY_SVG` on parse failure (`src/components/ui/Meteocon.tsx:93-100`). Tests reject script injection.

## Candidate: `nodeIntegration` / missing `contextIsolation`

Result: **NOT A DEFECT.**

Reason: `electron/main.ts:183-185` sets `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.

## Candidate: `sync:setSyncFolder` accepts renderer paths

Result: **NOT A DEFECT.**

Reason: Handler rejects any path that is not already the main-process chosen folder (`electron/ipc/handlers/syncHandlers.ts:45-49`).

## Candidate: `sync:writePacket` is an arbitrary file write

Result: **NOT A DEFECT.**

Reason: `writePacket` allowlists store names, validates ids, bounds payload size, requires active sync password/identity, and encrypts into the chosen sync folder (`electron/services/syncFolderWatcher.ts:786-822`).

## Candidate: `app:proxyScrape` is unauthenticated SSRF

Result: **NOT A DEFECT** at the confirmed-exploit threshold.

Reason: https-only, private hostname block, DNS `all: true` private-IP reject, pinned `lookup` for the request, redirects destroyed. Residual DNS-rebinding after connect is mitigated by pinning the resolved address.

## Candidate: August 2026 P1 SSE / safe_mode / video duration / search wire bugs

Result: **FULLY REPAIRED** (see FINDINGS.md historical table). Not copied forward.

## Candidate: Family Safe Mode can be overridden by renderer IPC

Result: **NOT A DEFECT.**

Reason: `VeniceIpcRequest` comments and `veniceHandlers` drop renderer safety flags; `guardPipeline` reads main-process runtime snapshot.

## Candidate: Workflow persists image data URLs

Result: **NOT A DEFECT** for persistence.

Reason: `useWorkflowStore` `partialize` persists only `workflows` and `activeWorkflowId` (`src/stores/workflow-store.ts:227-230`). `runResults` with `[image:data:...]` stay in memory for the session. Performance risk only.

## Candidate: Specialist Electron P1s (generic `credential:get`, `profilePassword:clear`, unscoped RP stores)

Result: **CONFIRMED but already filed at P2.**

Reason: Independently revalidated. XSS/compromised-renderer required for credential get and password clear; RP isolation is a profile-privacy defect, not a Venice-key dump. Kept as VF-AUD-20260910-P2-002 / P2-005 / P2-006. Not promoted to P1.

## Candidate: Specialist i18n P1s (`Tr:` prefixes, verifier miss)

Result: **CONFIRMED, demoted to P2.**

Reason: 726 `Tr:` leaves and 77 key-name leftovers are real visible scaffolding. Non-English locales are already `isProductionComplete: false` (`VF-I18N-NATIVE-REVIEW-001`). en-US is unaffected. Filed as VF-AUD-20260910-P2-019, not P1.

## Candidate: Specialist SRV-009 (web FSM forces provider `safe_mode`)

Result: **DUPLICATE.**

Reason: Already VF-AUD-20260910-P2-008.

## Candidate: Specialist SRV-007 (`TRUST_PROXY` rate-limit key includes `req.ip`)

Result: **NOT PROMOTED.**

Reason: `HOST` is forced to loopback. Concatenating `req.ip` is a real logic bug if an operator later binds widely *and* sets `TRUST_PROXY`, but it is not a current default-bind defect. Recorded only in `scratch/server-proxy.md`.

## Candidate: Specialist CI-001 (`test:ci` omits 59 files) as P1

Result: **TEST GAP, not a product P1.**

Reason: Hosted `coverage` job still runs those files on `push` to `main`. `release.yml` uses `test:ci` only — process risk, filed as TG-009.

## Candidate: Complete age-gate legal bypass via Command Palette

Result: **LIKELY, not independently headed-confirmed.**

Reason: z-index stacking and Cmd/Ctrl+K during first-run are CONFIRMED (P2-018). Whether a user can finish provider/paid work without acknowledging the gate was not headed-verified.

## Candidate: Specialist DOC-001/002 as new P1s

Result: **ALREADY FILED.**

Reason: DOC-001 is VF-AUD-20260910-P1-003. DOC-002 is VF-AUD-20260910-P1-008. DOC-003/004 are P2-020/P2-022. DOC-013 is P3-004.

## Candidate: Specialist UI-001–038 copied as a block

Result: **NOT COPIED WHOLESALE.**

Reason: Independently promoted UI-001 (P2-018), UI-011 (P2-023), UI-004/005/006 (P2-024), UI-010 (P3-008), UI-012 (P3-009). Remaining CONFIRMED a11y/ARIA/theme items stay in `scratch/ui-a11y-theme.md` (unnamed gallery dialogs, incomplete combobox, number shortcuts 1–9 of 22, dead `text-text`, etc.). No headed Electron/Chromium session. Do not treat the 32-count specialist list as FINDINGS authority.
