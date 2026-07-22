# 03 — Agent-File Audit & Instruction Integrity

**Audit Date:** 2026-07-20 (Executed: 2026-07-22)  
**Target Repository:** `spearchucker667/Venice_Forge`  
**Inspected Agent Files:**
- `AGENTS.md` (root, 20,068 bytes)
- `AGENT_REINITIALIZATION.md` (root, 17,821 bytes)
- `CLAUDE.md` (root, 1,100 bytes)
- `GEMINI.md` (root, 1,100 bytes)
- `.github/copilot-instructions.md` (2,795 bytes)
- `.cursorrules` (1,565 bytes)
- `.windsurfrules` (1,565 bytes)
- `docs/AGENTS/AGENTS.md`, `docs/AGENTS/gemini.md`, `docs/AGENTS/agent-reinitialization.md`

---

## 1. Inventory & Governance Structure

Venice Forge utilizes multi-agent instruction files to align AI coding assistants across various IDEs (Cursor, Windsurf, GitHub Copilot, Gemini CLI, Claude Code).

| File Location | Role & Scope | Stated Version | Stated Node Engine | Compliance Status |
| ------------- | ------------ | -------------- | ------------------ | ----------------- |
| `AGENTS.md` | Primary canonical repo instructions | `3.0.0-beta.1` (Line 6) | `>=22.13.0 <23.0.0` | **NON-COMPLIANT** (Format mismatch with `verify:release-metadata`) |
| `AGENT_REINITIALIZATION.md` | Handoff recovery instructions | `3.0.0-beta.1` | `>=22.13.0 <23.0.0` | COMPLIANT |
| `CLAUDE.md` | Pointer file to `AGENTS.md` | Unstated | Unstated | COMPLIANT |
| `GEMINI.md` | Pointer file to `AGENTS.md` | Unstated | `>=22.13.0 <23.0.0` | COMPLIANT |
| `.github/copilot-instructions.md` | Copilot system instructions | `3.0.0-beta.1` | `>=22.13.0` | COMPLIANT |
| `.cursorrules` / `.windsurfrules` | IDE pointer files | Unstated | Unstated | COMPLIANT |

---

## 2. Stale Facts and Contract Verification Failures

### 2.1 Release Metadata Verifier Failure (`verify:release-metadata`)
- **Observed Error:** Running `npm run verify:contracts` fails during static contract verification:
  ```text
  [verify:release-metadata] FAIL
  - AGENTS.md version must match package.json.
  ```
- **Root Cause Analysis:** `scripts/verify-release-metadata.cjs` line 17 expects the exact string `**Version:** 3.0.0-beta.1` inside `AGENTS.md`:
  ```js
  if (!agents.includes(`**Version:** ${version}`)) failures.push("AGENTS.md version must match package.json.");
  ```
  However, line 6 of `AGENTS.md` contains:
  ```markdown
  > **Declared version:** `3.0.0-beta.1`
  ```
  Because `AGENTS.md` uses `**Declared version:**` instead of `**Version:**`, the verifier fails even though both files specify `3.0.0-beta.1`.

### 2.2 Stack Version Drift & Stale Claims
- **Stale Claims in Documentation:** Historical audit reports and some agent doc sections reference hypothetical future runtime versions such as `Electron 42`, `Vite 6`, `Express 4`.
- **Actual `package.json` Dependencies:**
  - Electron: `^34.0.0` (`devDependecies`)
  - Vite: `^6.0.7` (`devDependencies`)
  - Express: `^4.21.2` (`dependencies`)
  - React: `^19.0.0` (`dependencies`)
  - TypeScript: `~5.7.2` (`devDependencies`)
  - Node Engine: `>=22.13.0 <23.0.0` (`engines.node`)

---

## 3. Security Boundary & Single Venice Entry Point Audit

`AGENTS.md` Section 9 mandates:
> **Single Venice Entry Point:** Venice requests must flow through `veniceFetch()` / `veniceStreamChat()` in `src/services/veniceClient.ts`, or a verified canonical adapter delegating to them. Do not add ad hoc Venice `fetch()` calls in components, stores, workflows, or background tasks.

### 3.1 Verification of Code Base Compliance
A ripgrep search was conducted across `electron/` and `src/` for raw `api.venice.ai` or direct `fetch()` calls:
```bash
rg -n 'api\.venice\.ai|/image/generate|/video/queue|/audio/|fetch\s*\(' electron src
```

**Results:**
1. **Agent Tool Executor (`electron/agent/runtime/agent-tool-executor.ts`):**
   Calls `performGuardedVeniceRequest()` from `electron/services/guardPipeline.ts`, which delegates to the canonical guarded transport. Direct raw `fetch()` calls to Venice endpoints are **NOT** present.
2. **Main Venice Client (`src/services/veniceClient.ts` & `electron/services/guardPipeline.ts`):**
   Centralizes header injection, API key lookup from OS secure storage, secret redaction, and Family Safe Mode screening.
3. **TTS & Video Services (`electron/services/videoRetrieveService.ts`, `src/services/chatTtsController.ts`):**
   All requests route through `veniceFetch()` or IPC bridges calling the canonical guard pipeline.

**Conclusion:** The codebase complies with the Single Venice Entry Point mandate. No ad-hoc direct Venice network requests exist in agent runtime modules.

---

## 4. Recommendations for Agent File Maintenance

1. **Fix `AGENTS.md` Version Format:** Update line 6 of `AGENTS.md` to include `**Version:** 3.0.0-beta.1` so `verify-release-metadata.cjs` passes cleanly.
2. **Single Canonical Agent Source:** Maintain `AGENTS.md` as the single authoritative source of truth. Pointer files (`CLAUDE.md`, `GEMINI.md`, `.cursorrules`, `.windsurfrules`) should contain no duplicated version strings or stack details, delegating entirely to `AGENTS.md`.
3. **Automated Stack Fact Verification:** Expand `scripts/verify-stack-facts.cjs` to validate all stated versions in `docs/AGENTS/` against `package.json` during pre-PR checks.
