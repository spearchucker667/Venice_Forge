# Venice Forge Privacy & Security Model

**Age Requirement**: Use of this application is strictly limited to
individuals 18 years of age and older.

Venice Forge is local-first. It stores user data on the local machine and sends
content upstream only when you explicitly use provider-backed features such as
chat, generation, research, or scrape flows. It does **not** claim complete
privacy or complete safety protection.

## API Key Security

- **Desktop mode:** Venice and optional Jina API keys are stored in OS secure
  storage (`safeStorage`: DPAPI on Windows, Keychain on macOS). The renderer
  does not receive the raw keys.
- **Web development mode:** Persistent keys belong on the local Express server
  (`.env`). Browser-entered Jina keys are memory-only for the current page
  session and are not written to browser storage.
- **No first-party telemetry:** Venice Forge does not ship first-party
  analytics or telemetry. This does not change what upstream providers may log
  once you send them a request.

## Local Data Storage

- **Desktop conversations:** current Conversation Vault records are stored under
  the app data `conversations/` directory as AES-256-GCM encrypted files. The
  vault key is protected with Electron `safeStorage` where available. Older
  `chat-history/*.json` files may still exist as legacy migration or backup
  artifacts and are plaintext until migrated or deleted by the user.
- **IndexedDB stores:** images, files, settings, web-fallback conversations,
  memories, prompts, scenes, workflows, profile metadata, and other local
  records are stored in renderer IndexedDB. Encrypted stores use app-managed
  AES-GCM wrapping via `src/services/storageService.ts`; the `diagnostics`
  store is intentionally excluded.
- **Profile-scoped records:** IndexedDB records are physically keyed by active
  profile where applicable while preserving logical IDs to callers. Legacy
  unscoped rows belong to the default profile.
- **Profile passwords:** the Profiles panel can set, remove, and verify a
  profile password before switching into a locked profile. The secure-store
  verifier stores salted PBKDF2 records through `safeStorage`; raw passwords
  are not written to disk or returned over IPC.
- **Diagnostics:** the `diagnostics` store is intentionally unencrypted because
  it contains sanitized timing/status metadata only. Safe diagnostics exclude
  API keys, bearer tokens, raw prompt content, base64 media, and full local
  absolute paths.
- **No cloud sync:** Venice Forge does not sync your local data to a Venice
  Forge-operated cloud service.

## Local Safety and Privacy Boundaries

- **Family Safe Mode** is a local, on-device guard. It performs no network
  moderation calls.
- Prompt-like request fields for supported Venice/research endpoints are
  screened before they are forwarded upstream.
- Jina and generic scrape text responses are screened locally before the app
  returns them to the renderer; large responses are sampled against the first
  8 KiB.
- Blocked request text is not sent upstream. Blocked response text is not
  returned to the renderer.
- Raw prompt text, matched terms, and blocked raw response text are not stored
  in the aggregate safety audit counters or safe diagnostics snapshot.
- Safety audit counters are aggregate-only:
  `allowed`, `warned`, `blocked`, `bySeverity`, `byCategory`,
  `lastDecisionAt`, and `lastReasonCode`.

## Network Architecture

- Venice requests use allowlisted endpoints validated in shared code used by the
  proxy and Electron IPC layers.
- Electron mode sends Venice and Jina traffic from the main process.
- Web development mode sends Venice and Jina traffic through the local Express
  proxy.
- Generic HTTP scraping is disabled by default and guarded by backend DNS/IP
  checks when enabled.
- `shell.openExternal` only allows `https:` URLs with public routable
  hostnames.

## Known Limits

- Local storage encryption is not equivalent to OS credential storage.
- Same-user malware, browser compromise, injected extensions, or memory access
  are outside the local threat model.
- Profile password unlock is an in-app switch gate and does not replace OS
  account locking, full-disk encryption, or process-memory protections.
- Legacy desktop `chat-history/*.json` files, generated exports, and user-made
  backups are user-controlled files and may be plaintext.
- Family Safe Mode is not a guarantee that all unsafe or unlawful content will
  be blocked.
- Upstream provider privacy behavior, retention, and safety policies remain
  independent of Venice Forge.

## Export and Import

- You can export your workspace locally at any time.
- Safe export paths redact API-key-like values and strip plaintext secrets.
- Imports validate structure, reject unexpected stores where applicable, and
  avoid blindly trusting secret-like fields.

For the full guard contract, verification commands, and maintainer guidance,
see [SECURITY.md](../../SECURITY.md).
