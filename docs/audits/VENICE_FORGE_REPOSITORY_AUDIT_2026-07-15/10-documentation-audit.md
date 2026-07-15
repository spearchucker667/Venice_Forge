# Documentation Audit

## VF-AUDIT-004 — Agent guidance contradicted the canonical root and CodeQL setup

- Priority/confidence: P2 / confirmed; fixed
- Evidence: `AGENTS.md` declared `/Users/super_user/Projects/Venice_Forge` canonical and immediately called the same path historical; Copilot and all four thin pointers repeated the contradiction. `AGENTS.md` also described CodeQL default setup although `.github/workflows/codeql.yml` is tracked and required by `scripts/verify-ci-contract.cjs`.
- Impact: an agent could refuse the correct checkout or audit the wrong static-analysis configuration.
- Remediation: name the actual historical repository identity (`Windows-Venice-API-connector`), document the tracked advanced CodeQL workflow, and extend `verify:agent-docs` with two regression cases.
- Verification: `node scripts/verify-agent-docs.cjs`, its Vitest suite, Markdown links, contracts and CI.

| Document | Confirmed issue | Updated | Validation |
|---|---|---:|---|
| `AGENTS.md` | Root contradiction; stale CodeQL setup | Yes | Agent-doc verifier/tests |
| `.github/copilot-instructions.md` | Root contradiction | Yes | Agent-doc verifier/tests |
| `CLAUDE.md`, `GEMINI.md`, `.cursorrules`, `.windsurfrules` | Root contradiction | Yes | Thin-pointer contract |
| `docs/ROADMAP.md` | Must receive open audit work | Yes | Roadmap verifier |
| `docs/summary_of_work.md` | Mandatory session handoff | Yes | Handoff verifier |
| `docs/DOCS_INDEX.md` | New durable audit package | Yes | Markdown links |

The only missing npm-script references found were in a retained dated implementation plan under `docs/superpowers/plans/`; its commands are historical design evidence, not current operator guidance. Old repository-name mentions there are contextual history. No broken current Markdown link was found in the pre-edit scan.
