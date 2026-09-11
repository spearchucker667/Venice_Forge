# Confirmed findings

## VF-AUD-20260911-P1-001 — Production web start serves source HTML and renders a blank page

Severity: P1
Confidence: High
Classification: CONFIRMED DEFECT
Remediation status: RESOLVED AND VERIFIED

Affected files:

- `server.ts:114-127`
- `server.ts:1250-1252`
- `package.json:51-54`
- `scripts/start-production.cjs`

Affected subsystem: Production web server / build output / CSP

Observed behavior:

After `npm run build`, `PORT=4173 npm start` returns the repository-root source `index.html` (348 bytes) instead of the built `dist/index.html` (14,991 bytes). That HTML requests `/bootstrap-theme.js` and `/src/main.tsx`. The production response uses nonce/strict-dynamic script policy; both source script requests are rejected and the page stays blank.

Expected behavior:

The production server must resolve its bundled module directory deterministically and serve the built renderer entry and static assets from `dist`, independent of the caller's current working directory.

Evidence:

`getModuleDir()` looks for `globalThis.__filename`, which ordinary bundled CommonJS does not provide. The esbuild CommonJS bundle cannot preserve `import.meta.url`, so the second branch throws and the function returns `process.cwd()`. Starting through the documented `npm start` command from the repository root consequently reads root `index.html`.

```text
HTTP 200
content-length: 348
console: Refused to load /bootstrap-theme.js due to script-src ... strict-dynamic
console: Refused to load /src/main.tsx due to script-src ... strict-dynamic
Playwright body snapshot: empty
```

Reproduction:

1. Run `npm run build`.
2. Run `PORT=4173 npm start` from the repository root.
3. Compare `curl -s http://127.0.0.1:4173/ | wc -c` with `wc -c dist/index.html`.
4. Open the URL and inspect the renderer console; the page is blank and both source scripts are CSP-blocked.

Root cause:

The CJS output path resolver tests unavailable globals and falls back to the launch working directory. The production static root is therefore coupled to `cwd` rather than `dist/server.cjs`.

Impact:

The documented production web application is unusable. This is release-blocking for any deployment or smoke path that uses `npm start`.

Recommended remediation:

Make the CJS bundle use its real `__dirname` or pass an explicit, validated dist directory from `start-production.cjs`; do not derive production assets from arbitrary `cwd`. Preserve the existing CSP. Return a clear startup error if the built index is absent.

Required regression tests:

- Build and start from the repository root and from a different working directory.
- Assert `/` returns the built entry, its hashed `/assets/*` references, and no `/src/main.tsx` reference.
- Run a browser smoke asserting a non-empty app shell and no CSP console errors.

Dependencies / related findings: None.

## VF-AUD-20260911-P2-001 — Shared logo is blocked by production style CSP

Severity: P2
Confidence: High
Classification: CONFIRMED DEFECT
Remediation status: RESOLVED AND VERIFIED

Affected files:

- `src/components/ui/logo.tsx:4-32`
- `electron/utils/rendererCsp.ts:24-45`
- `tests/csp/inlineStyleInvariant.test.ts`

Affected subsystem: Branding / theming / Electron and web CSP

Observed behavior:

`VeniceLogo` puts width, height, and CSS mask declarations in a React `style` attribute. Production Electron uses `style-src 'self'`; the invariant test identifies this exact component as an offender. Browsers enforcing that policy reject the style, so the span loses the properties that make the logo visible.

Expected behavior:

Reusable application UI must render under the strict production CSP without inline styles.

Evidence:

```text
npx vitest run tests/csp/inlineStyleInvariant.test.ts --no-file-parallelism
FAIL 1/1
offender: src/components/ui/logo.tsx:21
```

`npm run test:contracts` independently fails for the same test after 22 files and 268 other contract tests pass.

Reproduction:

1. Run the focused test above.
2. Load a production-CSP renderer surface containing `VeniceLogo`.
3. Inspect the rejected inline style and missing mask/dimensions.

Root cause:

The light-theme logo remediation moved mask configuration to a dynamic inline style without reconciling the repository's no-inline-style production contract.

Impact:

Branding can disappear or render as a zero-size element in production-only paths, while development can appear correct because its CSP permits inline styles.

Recommended remediation:

Move mask and size variants into self-hosted CSS/classes. If arbitrary numeric sizes are required, constrain them to an enumerated class contract or use an image element that does not require inline styling. Do not add `'unsafe-inline'`.

Required regression tests:

- Keep the existing CSP invariant green.
- Render all supported logo sizes under production CSP and assert visible dimensions/mask.
- Cover light and dark themes.

Dependencies / related findings: None.

## VF-AUD-20260911-P2-002 — Enter handlers submit during active IME composition

Severity: P2
Confidence: High
Classification: CONFIRMED DEFECT
Remediation status: RESOLVED AND VERIFIED

Affected files:

- `src/components/chat/chat-input.tsx:375-383`
- `src/components/playground/playground-chat.tsx:383-390`
- `src/components/layout/api-key-dialog.tsx:176-187`
- `src/components/documents/DocumentAgentView.tsx:980-985`

Affected subsystem: Chat / forms / international input

Observed behavior:

The handlers invoke submit, connect, send, or search whenever `key === "Enter"`; none checks `nativeEvent.isComposing`. Enter is also the normal IME candidate-confirmation key. For Japanese, Chinese, Korean, and other composition input, selecting a candidate can therefore submit incomplete text or trigger an unintended action.

Expected behavior:

Enter-driven actions must be ignored while composition is active and execute only after composition ends.

Evidence:

A repository-wide source search found no `isComposing` guard in renderer TypeScript/TSX. The primary composer calls `handleSubmit()` at line 382 solely on Enter plus Shift state. Equivalent patterns exist in the listed surfaces. The application ships `ja`, `zh-CN`, and `ko` locales, making the path supported rather than hypothetical.

Reproduction:

1. Select a CJK IME.
2. Type a composing phrase in the primary chat textarea.
3. Press Enter to accept a candidate.
4. Observe that the submit handler is eligible to run before composition completes.

Root cause:

Keyboard shortcuts were implemented without the DOM composition-state guard.

Impact:

Core chat can send partial text; secondary forms can connect, search, rename, or create unexpectedly. Users may disclose or persist content they did not intend to submit.

Recommended remediation:

Centralize an IME-safe Enter predicate and apply it to every Enter-to-action input. Preserve Shift+Enter newline behavior and button submission.

Required regression tests:

- Dispatch Enter with `nativeEvent.isComposing = true` and assert no action.
- Dispatch Enter after composition ends and assert exactly one action.
- Cover primary chat plus representative single-line and secondary-chat surfaces.

Dependencies / related findings: None.

## VF-AUD-20260911-P3-001 — Document Agent working-group selector lacks an accessible name

Severity: P3
Confidence: High
Classification: CONFIRMED DEFECT
Remediation status: RESOLVED AND VERIFIED

Affected files:

- `src/components/documents/DocumentAgentView.tsx:640-660`

Affected subsystem: Documents / accessibility

Observed behavior:

The visible “Working Group” text is a sibling `<span>`. The `<select>` has no associated `<label>`, `aria-label`, or `aria-labelledby`, so assistive technology receives an unnamed combobox.

Expected behavior:

The selector must expose a localized accessible name associated through native label semantics or `aria-labelledby`.

Evidence:

Static inspection shows no naming relationship. React Doctor independently reported the select at line 648 as its accessibility finding.

Reproduction:

1. Render Document Agent with at least one project.
2. Query `getByRole("combobox", { name: /working group/i })` or inspect the accessibility tree.
3. The named-role query fails.

Root cause:

The visual caption was not programmatically associated with the form control.

Impact:

Screen-reader users cannot determine what the selector controls without exploring surrounding content.

Recommended remediation:

Use a localized `<label htmlFor>` and matching `id`, or a stable translated `aria-labelledby` relationship.

Required regression tests:

- Assert the combobox is reachable by its localized accessible name.
- Run the focused component axe/accessibility check.

Dependencies / related findings: None.

## VF-AUD-20260911-P1-002 — Workspace approval previews crossed renderer/profile session boundaries

Severity: P1
Confidence: High
Classification: CONFIRMED DEFECT
Remediation status: RESOLVED AND VERIFIED

Affected files:

- `electron/ipc/handlers/documentAgentHandlers.ts`
- `electron/ipc/handlers/apiKeyHandlers.ts`
- `electron/agent/policy/workspace-grant-service.ts`

Affected subsystem: Document Agent / IPC authorization / profile isolation

Observed behavior:

The unpublished approval-list remediation accepted every pending approval whose grant ID started with `grant_`. `ApprovalCoordinator` is process-global, so a renderer bound to another profile or renderer session could receive public proposal views created under a different workspace grant. Switching profiles also left that renderer's prior workspace grants alive.

Expected behavior:

Only limited/media approvals for the active profile and workspace approvals owned by the caller's renderer session family may cross the IPC boundary. Profile switching must revoke capabilities issued to the previous profile session.

Evidence:

The old filter was equivalent to `grantId.startsWith("grant_")` with no grant lookup or session-family check. A focused test established that a grant issued to `runtime:renderer_1:agent_a` was not distinguishable from one issued to `runtime:renderer_2:agent_b` at the list boundary.

Reproduction:

1. Issue workspace grants from two renderer session families.
2. Create pending proposals under each grant.
3. Invoke `documentAgent:approvals:list` from either renderer.
4. Before remediation, both `grant_*` proposals satisfy the filter.

Root cause:

The handler inferred authorization from a grant-ID prefix instead of asking the authoritative grant service to prove ownership and expiry.

Impact:

Proposal summaries, affected paths, document previews, or pending privileged actions could be disclosed across local profiles/renderers, violating the Electron authorization boundary.

Recommended remediation:

Resolve each grant through `WorkspaceGrantService`, require an unexpired grant owned by the caller's exact renderer session family, and revoke that family during profile rebinding.

Required regression tests:

- Accept root and `:agent_*` grants belonging to one renderer family.
- Reject grants belonging to another renderer family.
- Revoke all family grants on profile switch.
- Keep limited/media profile grants scoped to the active profile.

Dependencies / related findings: None.

## VF-AUD-20260911-P2-003 — Delayed history hydration overwrote newer same-ID chat state

Severity: P2
Confidence: High
Classification: CONFIRMED DEFECT
Remediation status: RESOLVED AND VERIFIED

Affected files:

- `src/stores/chat-store.ts`
- `src/stores/chat-store.test.ts`

Affected subsystem: Chat state / asynchronous hydration / persistence

Observed behavior:

`applyLoadedHistory()` inserted persisted records first and retained an in-memory conversation only when its ID was absent. If a user created or modified a conversation while the asynchronous list request was in flight and disk returned an older record with the same ID, hydration replaced the newer in-memory object.

Expected behavior:

State created or modified after hydration begins must win over the stale read snapshot for the same stable conversation ID.

Evidence:

A deferred-list test created a conversation, changed its model to `local-model`, then resolved history with the same ID and `stale-persisted-model`. Before remediation the final model was `stale-persisted-model`; after reversing same-ID precedence it remains `local-model`.

Reproduction:

1. Delay `desktopConversations.list()`.
2. Create or modify a same-ID in-memory conversation.
3. Resolve the list with an older record.
4. Observe the local update being replaced before remediation.

Root cause:

The merge treated the asynchronous read snapshot as authoritative for ID collisions despite local mutations occurring after the read began.

Impact:

Fast startup/profile-switch interactions could visibly revert the model, messages, title, or other conversation state and later persist that stale state.

Recommended remediation:

Merge disk records first and always overlay current in-memory records by ID. Continue using profile reset to clear old-profile state before starting a new profile hydration.

Required regression tests:

- Deferred list with a same-ID local mutation must preserve local state.
- Disk-only records must still hydrate.
- Vault plus legacy fallback must deduplicate by ID.

Dependencies / related findings: None.
