# Security Model

## Chat-folder privacy gate

The chat-folder passphrase feature is an IPC access-control and privacy gate inside Venice Forge. It prevents ordinary renderer actions from listing, moving, renaming, deleting, or exporting a gated folder until the main process authorizes access. It is not per-folder encryption at rest: conversation storage remains protected by the operating-system account and application storage permissions. Encrypted `.vfbackup` export is a separate feature and uses Argon2id plus XChaCha20-Poly1305.

Venice Forge keeps provider credentials in Electron `safeStorage`; the renderer receives configured-state information, not persisted keys. Venice requests cross the context-isolated preload boundary and are checked by the main-process guard pipeline. Web development uses the Express proxy and must not persist credentials in browser storage.

Implemented fallback providers are explicitly allowlisted by the main process. Cohere, Hugging Face, Azure OpenAI, AWS Bedrock, and Google Vertex AI are implemented for chat; Replicate is implemented as an async media-generation provider. All providers use Electron `safeStorage` for credentials and context-isolated preload IPC for configuration. Providers are only routable once implemented, configured, enabled, capability-compatible, and model-compatible. Provider credentials can be manually removed and replaced; scheduled credential rotation is not implemented.

## Primary API route selection (Fraterna)

As of v3.1.0 the user can switch the primary API route to the public
Fraterna upstream (`fraterna.ai`), which mirrors a curated subset
of the same contract under the same `/api/v1` prefix and the same
Venice API key. Security guarantees:

- The route selection is **profile-scoped** and main-process
  authoritative (`electron/services/providerSettingsStore.ts`). The
  renderer mirror is hydrated via the desktop bridge; renderer-only
  state cannot select a route.
- The shared IPC validator
  (`electron/ipc/validation.ts:validateVeniceIpcRequest`) is unchanged.
  Endpoint allowlisting remains the single source of truth; the route
  resolver chooses the host AFTER endpoint validation has passed.
- Both routes use the same Venice API key. No new credential, no new
  secret persistence layer, no new outbound allowlist. The
  network-boundaries verifier
  (`scripts/verify-network-boundaries.cjs`) treats the Fraterna host as
  a fixed allowlist entry alongside `api.venice.ai`.
- The full safety guard pipeline (Local Family Safe Mode, child
  exploitation guard, prompt-limit, system-prompt limits, response
  screening) applies to both hosts identically. Web mode applies every
  proxy-level guard to the Fraterna pair the same way it does to the
  Venice pair.
- Endpoints the Fraterna route does not support (e.g.
  `/billing/*`, `/audio/*`, `/video/*`, `/api_keys/*`, `/x402/*`,
  `/crypto/rpc/*`, `/responses`, `/characters/*`, `/augment/*`,
  `/embeddings`, `/image/edit`, `/image/upscale`) fall
  back transparently to the canonical Venice host, so the surface area
  is identical regardless of which route is selected.
- Diagnostics export bundles include `primaryApiRoute: "<id>"` so
  support engineers can confirm the user's selection. The export
  remains free of API keys, raw prompts, base64 media, and absolute
  paths.

For the canonical contract, the per-endpoint capability matrix, and the
implementation seams see
[`docs/DEVELOPMENT/FRATERNA_ROUTING.md`](../DEVELOPMENT/FRATERNA_ROUTING.md).

Local Family Safe Mode and Venice provider `safe_mode` are separate controls. The main process owns the desktop safety snapshot. New Electron backup and sync encryption uses Argon2id with XChaCha20-Poly1305; the main-process decryptor retains PBKDF2-SHA-256/AES-256-GCM support for legacy 12-byte-IV envelopes. Browser-mode manual backups use that PBKDF2/AES-GCM compatibility format. Sync passphrases are transient and are cleared when sync pauses or stops.

Portable data excludes API keys, authorization tokens, passwords, passphrases, secrets, sync-folder settings, and machine-local paths. Import and sync accept only allowlisted stores, validate record IDs, reject malformed/oversized envelopes, and preserve divergent user content instead of silently overwriting it.

Renderer IndexedDB encryption and the desktop Conversation Vault are not equivalent boundaries. Renderer stores use a non-extractable AES-GCM Web Crypto key persisted in same-origin IndexedDB; this resists casual offline inspection, but renderer-origin code can ask Web Crypto to use it. The Conversation Vault performs cryptography and filesystem access in Electron main with an OS-`safeStorage`-protected key. A future migration may move additional high-value store cryptography behind narrow typed IPC, but current envelopes and migrations remain supported.

ST Card Studio keeps PNG parsing, filesystem paths, dialogs, and persisted provider credentials outside the renderer. Import previews use sender-scoped, five-minute, single-use opaque handles. The main process enforces file and decoded-metadata limits, PNG dimensions/pixels/chunk counts, CRCs, terminal `IEND`, strict Base64/UTF-8/JSON decoding, safety assessment, collision decisions, atomic writes, and semantic export re-import verification. Vision requests resolve durable local media IDs, treat visible text as untrusted, require strict structured output, support cancellation, and never persist generated content until the user applies it. Character-card sync keeps a full losing conflict copy; only greetings, tags, non-conflicting extension namespaces, book entries, versions, and metadata are safely unioned. Encrypted drafts are local-only and excluded from sync/default backups.

Image Inspector also keeps file selection, clipboard ingestion, decoding, and durable media reads behind narrow main-process IPC. Supported PNG, JPEG, and WebP inputs are bounded by signature, byte count, dimensions, and decoded pixels before provider dispatch. Structured model output is treated as untrusted and must pass the versioned analysis contract. Direct source-image web matching is disabled until a supported allowlisted provider and credential/privacy boundary exist; historical query-derived results remain explicitly labeled.

Privileged IPC handlers (secrets, configuration, filesystem, provider dispatch, paid generation, background tasks, sync, documents, media) are registered through `registerPrivilegedIpcChannel()` and validated with `validateIpcSender()`. Development trusts only the Vite dev-server origin; packaged production trusts only `file://` URLs inside the renderer root. Loopback, link-local, RFC1918, and non-`file:` protocols are rejected. The renderer preload exposes only named channels; raw `ipcRenderer` is not exposed, and `contextIsolation`/`sandbox`/`nodeIntegration: false` remain enforced.

See [SECURITY.md](../../SECURITY.md), the [Image Inspector architecture](../DEVELOPMENT/image-inspector-architecture.md), the [ST Card import threat model](ST_CARD_IMPORT_THREAT_MODEL.md), [backup-and-sync.md](../user/backup-and-sync.md), and [sync-threat-model.md](sync-threat-model.md).
