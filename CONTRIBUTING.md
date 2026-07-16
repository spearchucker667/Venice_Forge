# Contributing to Venice Forge

The canonical repository is `spearchucker667/Venice_Forge`. Dependency changes must update both `package.json` and the npm-generated `package-lock.json`; run `npm run verify:lockfile` with the supported Node 22/npm 10 toolchain.

Thank you for your interest in contributing to **Venice Forge**! This document provides guidelines and workflows for contributors.

## Code of Conduct

Please read and follow our [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Public Repository Expectations

- Keep pull requests focused and reviewable.
- Do not commit secrets, `.env` files, generated release artifacts, or local logs.
- Keep README, [docs/ABOUT.md](docs/ABOUT.md), [docs/FAQ.md](docs/FAQ.md), [SECURITY.md](SECURITY.md), [docs/RELEASE/release.md](docs/RELEASE/release.md), [LEGAL.md](LEGAL.md), and [docs/DEVELOPMENT/JINA_PROVIDER.md](docs/DEVELOPMENT/JINA_PROVIDER.md) current when behavior, packaging, or legal assumptions change.

- Treat all API keys (Venice and Jina) as secrets. Never expose them to renderer code, frontend bundles, issue screenshots, or test fixtures.
- Every new prompt-sending path **must** call `assessChildExploitationSafety()` and `recordDecision()` before forwarding to Venice. Do not bypass the guard. Be aware that the guard actively screens `negative_prompt` fields and analyzes cross-sentence contexts. Do not log raw prompt text. Safety tests must use synthetic/redacted fixtures only.

## Getting Started

### Prerequisites

- Node.js 22.13 or newer (Node 22.x)
- npm 10+
- Windows 10/11 or macOS 13+ (for full Electron packaging tests)
- A Venice API key ([venice.ai](https://venice.ai))

### Development Setup

```bash
git clone https://github.com/spearchucker667/Venice_Forge.git
cd Venice_Forge
npm ci
```

Copy `.env.example` to `.env` and set your `VENICE_API_KEY` for web-mode development.

### Running in Development

```bash
# Electron desktop mode (recommended)
npm run dev:electron

# Web mode (Vite + Express proxy)
npm run dev

# Vite renderer only
npm run dev:web
```

## Development Workflow

### Branch Naming

- `feature/description` — new features
- `fix/description` — bug fixes
- `security/description` — security patches
- `docs/description` — documentation updates

### Before Committing

```bash
# Lint and type-check everything (renderer + Electron main)
npm run lint:eslint
npm run typecheck

# Run tests and security guard verification
npm test
npm run verify:safety-guard
npm run verify:markdown-links
npm run verify:contracts

# Focused ST Card Studio changes
npm run test:character-cards
npm run verify:character-card-v2
npm run verify:character-card-png
npm run verify:character-card-security

# Build all targets
npm run build
npm run verify:dist

# Validate icons and dist builds
npm run verify:icon
npm run dist:mac # or dist:win, depending on your OS
npm run checksum:release
npm run verify:dist:mac # macOS artifacts, on macOS
npm run verify:dist:win # Windows installer + portable, on Windows
npm run verify:dist:portable # Windows portable only
```

All commands and validations must pass before opening a PR. Note that Windows releases must be validated on Windows, and macOS releases on macOS.

### Testing

- Tests live next to the source file: `src/services/foo.ts` → `src/services/foo.test.ts`.
- Use pure-function tests where possible (no mocking).
- When fixing a bug, add a regression guard comment: `// BUG-NNN regression guard`.
- Server tests must include `// @vitest-environment node` at the top.
- Character-card fixtures must be synthetic and belong under `tests/fixtures/character-cards/`; do not commit third-party cards or copyrighted character content.

### Code Style

- TypeScript **strict mode** is enforced. Avoid `any`; use proper types.
- Use `function` declarations for modules, not arrow functions.
- CSS styling relies on Tailwind v4 utility classes inline with JSX, following the "Premium Dark Glass" theme.
- Keep changes minimal and focused.

## Security & Reporting

If you discover a security vulnerability, **do not open a public issue**. Instead:

1. Follow [SECURITY.md](SECURITY.md).
2. Request a private maintainer discussion before sharing exploit details.
3. Never post API keys, bearer tokens, `.env` contents, certificates, or private logs.

If you encounter unsafe content, safety guard bypasses, or AI-generated material that inappropriately represents minors (CSAM) during development:
- **Do not share the explicit material** in pull requests, issues, or directly with maintainers.
- **Report CSAM** immediately to the [NCMEC CyberTipline](https://report.cybertip.org/) and [Venice.ai Trust & Safety](https://venice.ai/support).
- **Report the bypass mechanism** using GitHub private vulnerability reporting.

See [SECURITY.md](SECURITY.md) for the full security model.

## Pull Request Checklist

- [ ] `npm run lint:eslint` passes
- [ ] `npm run typecheck` passes
- [ ] `npm test` passes
- [ ] `npm run verify:contracts` passes
- [ ] `npm run build` passes
- [ ] `npm run verify:dist` passes after `npm run build`
- [ ] Platform-specific packaging checks pass for the target OS (`npm run verify:dist:win` and `npm run verify:dist:portable` on Windows; `npm run verify:dist:mac` on macOS)
- [ ] New code includes tests where applicable
- [ ] Documentation updated (README, AGENTS.md, docs/FAQ.md, etc.)
- [ ] `docs/audits/CHANGELOG.md` updated under `[Unreleased]`
- [ ] Legal/TOS notes reviewed if Venice API behavior, privacy, or release claims changed
- [ ] Markdown links checked when docs changed

## Questions?

Use [SUPPORT.md](SUPPORT.md) for issue routing.

---

**Maintainer:** @spearchucker667
