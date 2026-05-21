# Contributing to Venice Forge

Thank you for your interest in contributing to **Venice Forge**! This document provides guidelines and workflows for contributors.

## Code of Conduct

Please read and follow our [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Getting Started

### Prerequisites

- Node.js 20 or 22
- npm 10+
- Windows 10/11 (for full Electron packaging tests)
- A Venice API key ([venice.ai](https://venice.ai))

### Development Setup

```bash
git clone https://github.com/spearchucker667/Test-ai.git
cd Test-ai
npm install
```

Copy `.env.example` to `.env` and set your `VENICE_API_KEY` for web-mode development.

### Running in Development

```bash
# Electron desktop mode (recommended)
npm run dev:electron

# Web mode (Vite + Express proxy)
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
# Type-check everything (renderer + Electron main)
npm run typecheck

# Run tests
npm test

# Build all targets
npm run build
```

All three commands must pass before opening a PR.

### Testing

- Tests live next to the source file: `src/services/foo.ts` → `src/services/foo.test.ts`.
- Use pure-function tests where possible (no mocking).
- When fixing a bug, add a regression guard comment: `// BUG-NNN regression guard`.
- Server tests must include `// @vitest-environment node` at the top.

### Code Style

- TypeScript **strict mode** is enforced. Avoid `any`; use proper types.
- Use `function` declarations for modules, not arrow functions.
- CSS classes use kebab-case.
- Keep changes minimal and focused.

## Security

If you discover a security vulnerability, **do not open a public issue**. Instead:

1. Open a GitHub issue with the label `security`.
2. Request a private discussion in the issue body.
3. Wait for maintainer contact before sharing exploit details.

See [docs/SECURITY.md](docs/SECURITY.md) for the full security model.

## Pull Request Checklist

- [ ] `npm run typecheck` passes
- [ ] `npm test` passes
- [ ] `npm run build` passes
- [ ] New code includes tests where applicable
- [ ] Documentation updated (README, AGENTS.md, etc.)
- [ ] CHANGELOG.md updated under `[Unreleased]`

## Questions?

Open a [GitHub Discussion](https://github.com/spearchucker667/Test-ai/discussions) or reach out via an issue.

---

**Maintainer:** @spearchucker667
