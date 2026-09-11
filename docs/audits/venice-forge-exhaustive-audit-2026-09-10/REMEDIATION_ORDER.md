# Remediation order

Sequence follows dependency topology, not only severity.

## Phase 1 — Security / data integrity / build blockers

| ID | Why first |
|---|---|
| VF-AUD-20260910-P1-001 | Unblocks the production `npm audit --omit=dev --audit-level=moderate` gate. One lockfile/override change. |
| VF-AUD-20260910-P1-007 | Web FSM media OOM path. Same `server.ts` pass as P2-013 (listener leak) and P2-014 (413 `res.json()`). |
| VF-AUD-20260910-P1-002 | Backup/sync must read the Conversation Vault or users can lose chats on export. |
| VF-AUD-20260910-P2-012 | Same conversation owner: do not let create/profile-switch suppress vault list. |
| VF-AUD-20260910-P2-005 | Profile lock can be dropped without a verifier (same identity-boundary pass as credentials). |

P1-001 is lockfile-only and can land immediately. P1-007 is Express-only and can land in parallel with P1-001. P1-002 is a storage-path change; do not mix with a lockfile bump.

## Phase 2 — Core API and IPC contracts

| ID | Notes |
|---|---|
| VF-AUD-20260910-P2-002 | Remove or existence-only generic credential IPC. |
| VF-AUD-20260910-P3-002 | Delete dead `app:readLocalFile` preload (same preload/IPC pass). |
| VF-AUD-20260910-P3-004 | Strip `enable_document_tools` from Venice wire (chat-stream-manager + tests). |
| VF-AUD-20260910-P2-008 | Stop web proxy from forcing provider `safe_mode` from FSM. |
| VF-AUD-20260910-P2-015 | Generic 502 body (no `err.message`). Same proxy pass as P2-008 / P1-007. |
| VF-AUD-20260910-P2-016 | Jina `redirect: "error"`. |
| VF-AUD-20260910-P2-017 | System-prompt limit must walk array `content`. |
| VF-AUD-20260910-P2-009 | Shared abort detection so Stop Generation is not a fake error. |
| VF-AUD-20260910-P2-010 | Fail streams on provider error frames and Electron truncated UTF-8 EOF. |
| VF-AUD-20260910-P2-011 | Align stream timeouts (60s socket vs 300s renderer). |
| VF-AUD-20260910-P1-003 | Document Agent approval list/UI for media and workspace grants. |
| VF-AUD-20260910-P1-008 | Same Document Agent pass: register/resolve attachments on one session tuple. |
| VF-AUD-20260910-P2-020 | Wire `argsValidator.parse` in `executeAgentTool` (same executor file as P1-008). |
| VF-AUD-20260910-P2-022 | Same promote path: MIME/size from registry, not tool args. |
| VF-AUD-20260910-P2-025 | Consume approval only after successful execute. |
| VF-AUD-20260910-P2-026 | Unknown agent sessions fail closed (`off`), not `limited_documents`. |
| VF-AUD-20260910-P2-006 | Profile-scope RP stores (needed before complete profile purge). |

These three touch IPC/chat request shape and can be one PR if review bandwidth allows, or two: (credentials+readLocalFile) then (stream body).

## Phase 3 — Persistence and state consistency

| ID | Notes |
|---|---|
| VF-AUD-20260910-P1-005 | Restart-safe VPS video completion without persisting signed URLs. |
| VF-AUD-20260910-P1-006 | Web (and remaining Electron save paths) must not persist signed URLs or media data URLs. |

These share the generated-media store / recovery-custody design. Do them after or with P1-004 (poll timeout), because timeout currently prevents late completion.

## Phase 4 — Feature correctness

| ID | Notes |
|---|---|
| VF-AUD-20260910-P1-004 | Raise video/music poll wall-clock above documented P80 (or make timeout non-terminal). |
| VF-AUD-20260910-P2-001 | Workflow image nodes + live `/models` (already `VF-GENERATION-CONTRACT-PARITY-2026-09-01`). |
| VF-AUD-20260910-P2-004 | Refresh Swagger snapshot, then decide on video enhancement fields. |

P2-001 should follow or include a Swagger refresh if new image constraints appeared upstream.

## Phase 5 — Tests and CI

| ID | Notes |
|---|---|
| VF-AUD-20260910-P2-003 | vitest >= 4.1.11 (dev CVE). |
| VF-AUD-20260910-P3-005 | joi override if electron-builder still pulls < 18.2.5. |
| VF-AUD-20260910-P2-021 | Signature evidence from real `codesign`/Authenticode; fail if `.app` missing. |
| TG-003 | Preload/handler parity verifier. |
| TG-009 | `test:ci` shard union vs tracked `*.test.ts` (59 files only on coverage job). |

P2-003 can parallel Phase 1 if lockfile churn is coordinated (do **one** `npm install` that bumps js-yaml + vitest together).

## Phase 6 — Accessibility / UX / polish

| ID | Notes |
|---|---|
| VF-AUD-20260910-P2-018 | Command Palette must not stack above the age-gate. |
| VF-AUD-20260910-P2-024 | Focus-trap the API-key, character-picker, and import-plan overlays. |
| VF-AUD-20260910-P2-023 | Relative or imported default AI avatar (packaged `file://`). |
| VF-AUD-20260910-P2-019 | Strip `Tr:` / key-name leftovers; teach `verify:i18n` to fail on them. Native review remains `VF-I18N-NATIVE-REVIEW-001`. |
| VF-AUD-20260910-P3-008 | Light-theme logo mark. |
| VF-AUD-20260910-P3-009 | Replace `bg-background` / `bg-surface-base` / `text-error` with theme tokens. |

Headed a11y remains `VF-EXTERNAL-RELEASE-ACCEPTANCE-2026-08-31`.

## Phase 7 — Cleanup and architecture hardening

| ID | Notes |
|---|---|
| VF-AUD-20260910-P3-001 | AGENT_REINITIALIZATION version header. |
| VF-AUD-20260910-P3-003 | Delete `test-delete-session.js`. |
| Design risks | Capability tokens, Rules01 admin, FSM classifier — already on ROADMAP. |

## Parallelization

Safe in parallel after Phase 1 lands (or in the same lockfile commit if carefully tested):

- P3-001 docs
- P3-003 delete scratch file
- P3-002 preload deletion
- P3-004 stream-body strip (tests only + chat-stream-manager)
- P2-018 palette z-index / first-run gate (renderer-only)
- P2-019 `Tr:` sentinel + catalog scrub (i18n-only)

Do **not** parallel independent lockfile regenerations.

P1-007 + P2-013 + P2-014 + P2-015 + P2-016 + P2-008 are one `server.ts` PR if review bandwidth allows. P1-003 + P1-008 + P2-020 + P2-022 + P2-025 + P2-026 are one Document Agent PR.
