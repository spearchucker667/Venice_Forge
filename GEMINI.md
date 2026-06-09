# Gemini Agent Instructions

Use `AGENTS.md` as the source of truth for this repository.

Before making changes, read:

1. `AGENTS.md`
2. `README.md`
3. `docs/summary_of_work.md` — canonical session handoff ledger
4. `docs/TODO.md` when doing audits, bug fixes, or documentation sync

Mandatory: update `docs/summary_of_work.md` at the end of every
session (see `AGENTS.md` § *Mandatory Session Handoff*).

Do not duplicate or override the security rules in `AGENTS.md`. In particular:

- Never expose or log Venice/Jina API keys.
- Route Venice API calls through the existing client/IPC/proxy paths.
- Every new prompt-sending path must call `assessChildExploitationSafety()` and `recordDecision()` before forwarding to Venice.
- Run `npm run lint:eslint`, `npm run typecheck`, `npm test`, `npm run verify:safety-guard`, and `npm run build` before PR-ready changes when practical.
