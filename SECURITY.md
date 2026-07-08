# Security Policy

This file is the source of truth for Venice Forge's security, local safety,
logging, diagnostics, and API-key handling model.

## Reporting a Vulnerability

Do not include exploit details, API keys, tokens, or private user data in a public issue.

Use one of these routes:

- **GitHub private vulnerability reporting** — If enabled, use the
  [Security → Report a Vulnerability](https://github.com/spearchucker667/Venice_Forge/security/advisories/new) workflow
  on the repository. This keeps the report private until a fix is coordinated
  and is the preferred channel.
- **Issue label routing** — If private reporting is not available, open a
  GitHub issue labeled `security` and request a private maintainer discussion
  in the issue body. Do not post exploit details publicly.

The maintainer will triage reports for supported versions and coordinate
disclosure before any public details are posted.

## Supported Versions

Only the latest release tag is actively maintained. Older versions do not
receive security patches.

## Reporting Unsafe Content / CSAM

If you encounter unsafe content, safety guard bypasses, or AI-generated material that inappropriately represents minors (CSAM), report it immediately:
1. **NCMEC CyberTipline**: If the material involves child exploitation, report it directly to the [National Center for Missing & Exploited Children (NCMEC)](https://report.cybertip.org/).
2. **Venice.ai Trust & Safety**: Report the incident to Venice.ai through their official support channels at [venice.ai/support](https://venice.ai/support).
3. **Repository Maintainers**: Report bypasses of the Venice Forge safety guard using GitHub's private vulnerability reporting feature in this repository.

## 18+ Age Requirement & Inherent Risks

**Venice Forge strictly requires users to be 18 years or older.**
The application connects to unrestricted AI endpoints that may generate explicit or sensitive content. Due to the inherent risk of producing AI-generated images that may inappropriately represent minors (CSAM), use of this software by minors is strictly prohibited. Users assume all responsibility for the generated content.

## Content Safety

**Family Safe Mode** is an optional local guardrail. It is enabled by default,
runs entirely on-device, performs no network calls, and is designed to block a
specific class of child-exploitation and youth-sexualization requests before
they are sent upstream. It does **not** guarantee that all unsafe, unlawful, or
policy-violating content will be prevented, and it is not a legal/compliance
system.

When Family Safe Mode is enabled, Venice Forge evaluates prompt-like request
fields with the local guard in `src/shared/safety/childExploitationGuard.ts`
and `src/shared/safety/localFamilySafeGuard.ts`. The guard is endpoint-aware and
extracts prompt-like fields such as `messages`, `prompt`, `negative_prompt`,
`query`, `text`, and `input`. It uses rule-based normalization, cross-sentence
context detection, and endpoint-aware extraction. When Family Safe Mode is
disabled, **Adult Mode** skips the local rule engine entirely. Adult Mode does
not disable Venice's own provider controls, nor the separate Venice API
`safe_mode` parameter.

### What the guard covers

- Request-side prompt screening for the canonical Venice endpoint matrix locked
  by `VERIFY-015`: `/chat/completions`, `/image/generate`,
  `/image/edit`, `/image/multi-edit`, `/augment/search`,
  `/augment/scrape`, `/augment/text-parser`, `/embeddings`,
  `/audio/speech`, `/audio/transcriptions`, and `/video/queue`.
- Research and scrape dispatch paths that originate in the renderer and are
  routed through guarded transports/providers.
- Jina and generic scrape **response-body** screening through
  `screenResponseBody()` for `/api/proxy-jina`, `/api/proxy-scrape`, and the
  corresponding Electron IPC handlers. Large text responses are sampled against
  the first 8 KiB window before the app returns them to the renderer.

### Where it runs

- Renderer preflight and module boundaries:
  `src/services/veniceClient.ts`,
  `src/components/search/SearchScrapeView.tsx`,
  `src/research/agent/researchRunner.ts`,
  `src/research/providers/veniceResearchProvider.ts`,
  `src/research/providers/jinaResearchProvider.ts`,
  `src/shared/safety/characterImportSafety.ts`,
  `src/services/rp/sceneGenerationService.ts`.
- Electron main-process authoritative enforcement:
  `electron/services/guardPipeline.ts` via
  `performGuardedVeniceRequest()` / `checkLocalFamilyGuard()`, used by
  Venice-touching IPC handlers and the loopback bridge.
- Web-mode authoritative enforcement:
  `server.ts`, which applies the local guard to supported request bodies and
  response-body screening to Jina/scrape text responses.

### Privacy and logging guarantees

- The local guard is privacy-preserving in the narrow sense that it performs no
  network calls and does not send blocked request text or blocked response text
  to an external moderation service.
- Blocked **requests** are not forwarded upstream.
- Blocked **response bodies** from Jina/scrape are not returned to the
  renderer; callers get the canonical 451 block body instead.
- Raw prompt text, matched terms, and raw blocked response text are not written
  to the safety audit counters, safe diagnostics snapshot, or exported safe
  diagnostics.
- Safety audit counters are aggregate-only:
  `allowed`, `warned`, `blocked`, `bySeverity`, `byCategory`,
  `lastDecisionAt`, and `lastReasonCode`. They do not persist prompt text,
  matched snippets, or content hashes.

### What it does not do

- It does not guarantee safe or lawful outputs.
- It does not replace provider moderation, provider privacy modes, or user
  judgment.
- It does not inspect every binary/media payload type semantically.
- It does not currently screen arbitrary third-party response bodies outside the
  Jina/scrape text-response paths.
- It does not fully inspect `/image/upscale` because the current extractor has
  no prompt-like fields for that endpoint; `VERIFY-015` documents this
  pass-through intentionally.

> **Web Deployment Warning:** In web mode, the web proxy defaults Local Family Safe Mode to ON. The client-sent `X-Venice-Forge-Family-Safe-Mode` header is ignored unless the server-side environment variable `VENICE_FORGE_ALLOW_CLIENT_SAFETY_OVERRIDE=true` is explicitly set. The authoritative server override is the environment variable `VENICE_FORGE_LOCAL_FAMILY_SAFE_MODE_ENABLED`. The client header is dev-only compatibility plumbing, not a production safety boundary. Use Electron/local desktop mode for owner-controlled Family Safe Mode behavior. Provider/API restrictions may still apply regardless of Adult Mode.

Safety-guard enforcement is verified by `scripts/verify-safety-guard.cjs`,
which checks the core enforcement boundaries (`src/services/veniceClient.ts`,
`electron/ipc/handlers.ts`, `server.ts`) plus current research/Jina dispatch
paths (`src/components/search/SearchScrapeView.tsx`,
`src/research/agent/researchRunner.ts`, `src/research/providers/veniceResearchProvider.ts`,
`src/research/providers/jinaResearchProvider.ts`) as a CI gate. Run it with:

```bash
npm run verify:safety-guard
```

A comprehensive safety guard audit was conducted in May–June 2026 covering all
request paths, payload extraction coverage, logging/diagnostics behavior, static
verification script robustness, and test fixture safety. Current findings and
validation evidence are tracked in `docs/summary_of_work.md`.

> **Maintainer trigger:** Update this document whenever the allowed Venice API endpoint list (`src/shared/validation.ts`) or the safety guard enforcement boundaries change.

### Maintainer checklist for new endpoints

When adding or changing a Venice, Jina, scrape, research, RP, or bridge path
that can carry user-controlled prompt text or returned text:

1. Update the endpoint allowlist in `src/shared/validation.ts` and any
   Electron validation mirror if required.
2. Extend `src/shared/safety/promptPayloadExtractor.ts` so the new request shape
   exposes prompt-like fields to the guard.
3. Route the path through the canonical guard boundary:
   `performGuardedVeniceRequest()` / `checkLocalFamilyGuard()` in Electron main,
   or `maybeRunLocalFamilyGuard()` / `screenResponseBody()` in renderer or web
   proxy code as appropriate.
4. Add or update regression tests. At minimum, revisit
   `tests/safety/guardPipeline.test.ts` and any path-specific tests such as
   `server.test.ts`, `electron/ipc/handlers.test.ts`, or RP/research tests.
5. Run the safety verification commands below and update docs if the endpoint
   matrix, screening behavior, diagnostics, or limitations changed.

### Verification and test commands

High-signal safety verification:

```bash
npm run verify:safety-guard
npx vitest run tests/safety/guardPipeline.test.ts tests/safety/enforcementBoundaries.test.ts scripts/verify-safety-guard.test.ts --fileParallelism=false
```

Broader regression confirmation:

```bash
npm run verify:contracts
npm test -- --fileParallelism=false
```

### Fixture safety for tests

- Use the synthetic builders in `tests/safety/fixtureBuilders.ts` for unsafe
  triggers and obfuscated variants.
- Do not paste raw unsafe phrases into tests unless the existing fixture policy
  already requires a narrowly scoped exception.
- Keep assertions focused on `reasonCode`, 451 shape, counter behavior, and
  transport blocking. Do not snapshot raw unsafe payload text into logs,
  fixtures, or expected outputs.

### Known limitations and future work

- Response-body screening currently samples only the first 8 KiB of Jina/scrape
  text responses.
- The safety verifier is boundary-oriented. It proves routing and no-raw-log
  policy, not semantic completeness.
- The endpoint matrix is explicit rather than automatic; new prompt-carrying
  endpoints must be wired intentionally.
- Future improvements should stay conservative: expand endpoint coverage,
  improve extractor support where new prompt-carrying shapes appear, and add
  more path-specific regression tests without weakening the no-raw-log rule.

## Headless Bridge Security

When started with `--headless`, the application runs an Express loopback bridge server (`electron/services/bridgeServer.ts`). The following safety measures are strictly enforced:
- **Loopback-Only Interface:** The bridge server binds strictly to the local loopback interface (`127.0.0.1`). Binding to any public/LAN interface is blocked by default to prevent network-level credential reuse or SSRF attacks.
- **Token Authorization:** Every request must provide a `Bearer` token in the `Authorization` header. If `VENICE_BRIDGE_TOKEN` is not set in the environment, a cryptographically secure 32-byte hex token is generated at boot and held in memory. The bridge does not print the token to logs or standard output.
- **Family Safe Mode:** Prompt-carrying requests are checked in the Main process when Family Safe Mode is enabled. The headless bridge reads `safety.local_family_safe_mode_enabled` from the validated YAML config. Adult Mode skips the local check.
- **Runtime snapshot is the source of truth:** Every Venice-touching IPC handler routes through `performGuardedVeniceRequest` / `checkLocalFamilyGuard` in `electron/services/guardPipeline.ts`. The renderer-supplied `localFamilySafeModeEnabled` field is no longer trusted; the canonical toggle state lives in `electron/services/runtimeSafetySettings.ts` and is initialised from the validated YAML at boot. All entry points (chat, image, audio, video, embeddings, augment, Jina, scrape, research context) emit the same canonical 451 block shape. See VERIFY-015 in `tests/safety/guardPipeline.test.ts`.
- **Renderer hydration gate:** Renderer-side preflight guards (`saveCharacterCard`, `savePersona`, `appendRpMessage`, `generateScene`) route the toggle value through `getEffectiveRendererLocalFamilySafeModeEnabled` / `getEffectiveRendererVeniceApiSafeMode` in `src/safetyHydration.ts`. In Electron mode these helpers throw `ConfigNotHydratedError` until the main-process config snapshot has hydrated into the renderer, preventing the renderer from making a preflight decision that disagrees with the canonical main-process state. The RP Studio orchestrator disables safety-sensitive save controls while the hydration is pending and surfaces a banner explaining the wait. See VERIFY-017 in `tests/safety/hydrationGate.test.ts`.
- **Returned body screening:** Jina (`/api/proxy-jina`) and generic HTTP scrape (`/api/proxy-scrape`) web-proxy endpoints now screen the response body through `screenResponseBody()` before forwarding to the renderer. Large bodies are sampled against an 8 KiB window. A detected block is converted into the same 451 shape as a request-side block.

## Traffic Inspector

The **Traffic Inspector** logs request/response diagnostics to the renderer store (`src/stores/inspector-store.ts`).
- **Secret Masking:** To prevent exposing keys to local logs, the UI, or export functions, all header lists are sanitized. Header keys matching `Authorization`, `Cookie`, `x-api-key`, or names containing `key` or `token` are automatically replaced with `******`.
- **Non-mutating safety preview:** Inspector previews use `previewLocalFamilyGuard()` so they do not increment audit counters. Aggregate counters are produced only by the authoritative enforcement path.
- **Sandbox rendering:** The Traffic Inspector switch disables renderer Markdown/HTML formatting to prevent template injection or rendering exploits from unsafe model outputs, and shows the raw text directly alongside local safety audit signals. The internal persisted Zustand state field remains `redTeamMode` for backwards compatibility; the user-visible label is **Traffic Inspector**. Adult-character visibility is a regular user preference (driven by `localFamilySafeModeEnabled`) and is **not** gated by the Traffic Inspector switch.


External URLs opened via `shell.openExternal` are validated by
`electron/utils/urlSecurity.ts`: only `https:` with public routable hostnames
is allowed. RFC 1918 and loopback addresses are blocked.

## API Key Storage

Venice Forge stores API keys using OS-provided encryption where available:
- **Windows**: `safeStorage` (DPAPI)
- **macOS**: `safeStorage` (Keychain)

Both the **Venice API key** and the optional **Jina API key** use the same storage policy and file (`secure-prefs.json`).

For Windows and macOS, there is **no plaintext fallback**. The application will refuse to save any API key if OS-level encryption is unavailable.
For Linux and other platforms, a plaintext fallback may be permitted if the `VENICE_FORGE_ALLOW_PLAINTEXT_KEY_STORAGE=true` environment variable is explicitly set in the process environment (e.g., `.env` for web mode development, or the shell environment for Electron).

## Profile-Locked Credentials

Per-Profile credentials are stored under the same `secure-prefs.json` file but with namespaced keys and a tighter rejection policy:

- **Credential names:** `profile_password:<profileId>` (e.g. `profile_password:work`). A stolen `secure-prefs.json` file alone cannot infer the subject without the `profileId` mapping, which is held in IndexedDB on the local machine.
- **Storage policy:** All profile-password credentials are routed through the same `safeStorage` path as the Venice / Jina API keys. Plaintext fallback (Linux) is **always refused** for profile-password credentials, even when `VENICE_FORGE_ALLOW_PLAINTEXT_KEY_STORAGE=true`. The opt-in env-var only applies to API-key class credentials.
- **Strict No-Plaintext Credential gate:** `electron/services/secureStore.ts` ships with a frozen `STRICT_NO_PLAINTEXT_CREDENTIAL_NAMES = {"password","master_password","profile_password"}` and a regex `STRICT_NO_PLAINTEXT_CREDENTIAL_PATTERN` that matches `^profile_password:` and `^profile_password_` (any profile id) plus any credential name ending in `_password`. `isStrictNoPlaintextCredential(name)` is invoked first in `setCredential` (throws) and `getCredential` (returns null) before the platform branch. See the regression guard suite in `electron/services/secureStore.test.ts` covering write-throws-on-Linux-plaintext-for-`master_password`-even-with-env-flag and the matching `profile_password` namespace coverage.
- **Verifier:** `setProfilePassword(password, profileId)` stores a structured verifier record: `{ version: 1, algorithm: "pbkdf2-sha256", iterations: 310000, salt, digest }`. The salt is random per profile-password write, the digest is PBKDF2-SHA256, and verification uses `crypto.timingSafeEqual`. Legacy unsalted SHA-256 verifier strings are rejected rather than treated as configured passwords.
- **User-visible status:** The Storage & Privacy dashboard surfaces whether any profile password verifier is configured (read-only; the password itself never crosses the IPC boundary). The Profiles panel can set, remove, and verify profile passwords; switching into a password-protected profile requires successful verification through the dedicated `profilePassword:*` IPC bridge.

## Local Master YAML Config

The optional `config.yaml` and `themes.yaml` files are a **bootstrap mechanism**, not a key store. Their security model is:

- **Renderer never sees raw API keys.** The IPC channel `config:get` returns only `secrets.has_venice_api_key: boolean` and `secrets.has_jina_api_key: boolean`. Raw values never cross the IPC boundary.
- **Plaintext keys in the YAML are imported into `safeStorage` on startup.** They are then redacted from the file unless `secrets.keep_plaintext_keys: true` is explicitly set.
- **Default generated config files never contain real keys.** The shipped example templates ship with empty strings.
- **Existing secure-store keys are not overwritten** unless `developer.force_import_keys: true` is set.
- **Local secret files are gitignored.** `.config/*.yaml` is ignored; `!.config/*.example.yaml` is re-included to keep the templates tracked.
- **Path values must be local.** Any value with a `scheme://` (e.g. `https://`, `file://`) is rejected by the schema and replaced with the default.
- **Generic patches cannot set plaintext keys.** `config:writeSanitized` always strips `secrets.*` regardless of the patch payload; UI-entered keys still flow through the dedicated `apiKey:set` / `jinaApiKey:set` IPC channels.
- **No remote URLs.** The config service never makes network calls; the schema blocks any URL-like path.
- **Explicit local-mode control.** `safety.local_family_safe_mode_enabled` defaults to true. Setting it false selects Adult Mode and skips local rule evaluation. `safety.venice_api_safe_mode` is separate and controls only the provider request parameter.

## Research Provider Security

- **Jina AI**: Electron sends requests from the main process using the OS-secure Jina key. Web mode sends requests through the Express proxy using only the server-side `JINA_API_KEY`; renderer-supplied Jina credential headers are dropped. Keys are redacted from logs, diagnostics, and exports. A renderer-layer safety guard runs before dispatch (see Content Safety above).
- **Generic HTTP**: Disabled by default. When enabled, it routes traffic through a backend proxy to perform DNS resolution and enforce strict SSRF blocklists on the resolved IP. Only allows `text/html`, `text/plain`, `application/xhtml+xml`, and `application/json` responses.
- All research traffic respects the same endpoint allowlist discipline and the
  same local Family Safe Mode policy where prompt-carrying request text or
  Jina/scrape response text is involved.

## Not Protected Against

The security model does **not** protect against the following:
- Unsigned Windows SmartScreen warnings.
- Unsigned macOS Gatekeeper warnings.
- Local malware or debuggers running under the same OS user account.
- Keychain/session compromise if the OS user is compromised.

**Clarification**: macOS Gatekeeper and quarantine flags are mechanisms for distribution trust and execution prevention. They are not app data encryption mechanisms.

## Code & Dependency Auditing

Dependencies are audited with `npm audit` before each release. To run a
manual audit:

```bash
npm audit
```

A clean audit at the `moderate` level or higher (`npm audit --audit-level=moderate`) is a release gate requirement.

`npm run verify:safety-guard` is also a mandatory release and commit security gate — see the Content Safety section above for details.

## Static Analysis (CodeQL)

The tracked `.github/workflows/codeql.yml` workflow automatically runs CodeQL analysis on pull requests, pushes to main, and on a schedule. You can opt-out by setting the repository variable `VENICE_FORGE_DISABLE_CODEQL=true`. Findings appear in
[Security → Code Scanning](https://github.com/spearchucker667/Venice_Forge/security/code-scanning).

### Current open alerts

The authoritative open-alert count lives in
[Security → Code Scanning](https://github.com/spearchucker667/Venice_Forge/security/code-scanning).
A snapshot taken on 2026-06-22 shows **29 open CodeQL findings**: one error
(`js/log-injection`), eleven warnings, and seventeen notes. The warnings cover
areas such as `file-access-to-http`, `incomplete-multi-character-sanitization`,
`remote-property-injection`, and `incomplete-url-substring-sanitization`; the
notes are mostly `unused-local-variable` and `missing-space-in-concatenation`.
These findings are triaged in priority order; the live view always reflects the
current state.

Two intentional suppressions in `server.ts` are annotated at the call site with
`// nosec:js/<rule-id>` plus an inline justification:

- `server.ts:703-709` — `js/resource-exhaustion`: `setTimeout` duration is
  `Math.min(timeoutMs, 180000) || 30000` (3-minute max). CodeQL does not see
  the clamp because it lives inside a conditional expression.
- `server.ts:712-718` — `js/request-forgery`: The Jina Reader URL is parsed
  from a user-supplied string but then restricted to the `r.jina.ai` /
  `s.jina.ai` allowlist and required to use `https:` (see `server.ts:362-365`).
  SSRF to internal services is impossible by construction.

If a future CodeQL update flags these sites again, the suppressions and
allowlist check should be re-verified, not removed.

### GitHub Actions action pinning

All third-party Actions are pinned to a commit SHA, not a tag, to prevent
supply-chain attacks via a compromised tag update. The version comment is
appended after the SHA for maintainer reference:

- `actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5` (v4.2.2)
- `actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020` (v4.4.0)
- `actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02` (v4.6.2)
- `actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093` (v4.3.0)
- `softprops/action-gh-release@b4309332981a82ec1c5618f44dd2e27cc8bfbfda` (v3.0.0)
- `github/codeql-action/*@dd903d2e4f5405488e5ef1422510ee31c8b32357` (v3)
- `actions/dependency-review-action@2031cfc080254a8a887f58cffee85186f0e49e48` (v4.9.0)

When bumping any pinned action, look up the new SHA via
`gh api repos/<owner>/<repo>/git/refs/tags/<tag>` and update both the SHA
and the version comment. Dependabot's `github-actions` ecosystem entry in
`.github/dependabot.yml` keeps the SHAs current.
