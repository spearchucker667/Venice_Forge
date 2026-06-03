# Security Policy

The full Venice Forge security model is maintained in [SECURITY.md](SECURITY.md).

## Reporting a Vulnerability

Do not include exploit details, API keys, tokens, or private user data in a public issue.

Use one of these routes:

- **GitHub private vulnerability reporting** — If enabled, use the
  [Security → Report a Vulnerability](../../security/advisories/new) workflow
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

All outgoing Venice API requests are screened by a content safety guard
(`src/shared/safety/childExploitationGuard.ts`) before the payload is
forwarded. This runs at every enforcement boundary — the renderer transport
(`veniceClient.ts`), Electron IPC handlers, the Express web proxy, and every
prompt-sending UI module (`ChatModule`, `ImageModule`, `BatchModule`,
`SearchScrapeModule`). The guard implements advanced features such as
cross-sentence context detection and `negative_prompt` extraction. The proxy
operates on a "fail-close" design (returning a 500 status) if the guard
encounters any extraction errors. Raw prompt text is never logged by the safety
system.

The Jina research provider (`r.jina.ai`/`s.jina.ai`) sends requests via direct
`fetch()` outside the Venice transport chain. A renderer-layer guard runs in
`SearchScrapeModule.tsx` (both `runAiResearch()` and `runProfileDiscovery()`)
before any Jina or research dispatch, ensuring this path is also guarded.

Safety-guard enforcement is verified by `scripts/verify-safety-guard.cjs`,
which checks all enforcement boundaries (`veniceClient.ts`, `handlers.ts`,
`server.ts`, `SearchScrapeModule.tsx`) as a CI gate. Run it with:

```bash
npm run verify:safety-guard
```

A comprehensive safety guard audit was conducted in May–June 2026 covering all
request paths, payload extraction coverage, logging/diagnostics behavior, static
verification script robustness, and test fixture safety. Findings are tracked in
`TODO.md` under "CSAM Safety Guard Audit (June 2026)".

> **Maintainer trigger:** Update this document whenever the allowed Venice API endpoint list (`src/shared/validation.ts`) or the safety guard enforcement boundaries change.

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

## Research Provider Security

- **Jina AI**: Requests are sent directly to `r.jina.ai` and `s.jina.ai`. The Jina API key is redacted from all logs, diagnostics, and exports. A renderer-layer safety guard runs before all Jina dispatch (see Content Safety above).
- **Generic HTTP**: Disabled by default. When enabled, it routes traffic through a backend proxy to perform DNS resolution and enforce strict SSRF blocklists on the resolved IP. Only allows `text/html`, `text/plain`, `application/xhtml+xml`, and `application/json` responses.
- All research traffic respects the same endpoint allowlist and safety guard as Venice API calls.

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
