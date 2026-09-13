# Validation Results — Venice Forge Exhaustive Audit (2026-09-13)

**Audit baseline SHA:** `2f672682d57f82e5cd2d0ecefa42a4a525a9504c`  
**Execution Environment:** macOS Darwin 25.3.0 arm64, Node `v22.23.2`, npm `10.9.8`

---

## Command Execution Matrix

| Command | Exit Code | Result | Summary / Related Finding |
|---|---|---|---|
| `npm run lint:eslint` | 0 | **PASS** | ESLint verified `src`, `electron`, `server.ts`, `scripts` with `--max-warnings=0`. |
| `npm run typecheck` | 0 | **PASS** | TypeScript checked `tsconfig.json`, `tsconfig.electron.json`, `tsconfig.electron.test.json`. |
| `npm test` | 0 | **PASS** | Vitest executed 522 test files, 5,945 tests passed, 0 failed, 0 skipped. |
| `npm run verify:contracts` | 0 | **PASS** | Verified static (24 checks), features (5 domains), and release packaging (104 checks). |
| `npm run build` | 0 | **PASS** | Bundled Vite renderer (`dist/`), Esbuild server (`dist/server.cjs`), Electron main/preload (`dist-electron/`). |
| `npm run verify:dist` | 0 | **PASS** | Output files, bundle manifests, and required runtime assets verified. |
| `npm audit --omit=dev --audit-level=moderate` | 0 | **PASS** | 0 vulnerabilities found in production dependencies. |
| `npm audit --audit-level=critical` | 0 | **PASS** | 0 critical vulnerabilities in full dependency tree. |
| `node scripts/verify-ipc-parity.cjs` | 0 | **PASS** | 190 handler-registered channels, 190 preload invoke channels, 10 preload on channels, 0 orphans. |
| `npm run verify:safety-guard` | 0 | **PASS** | Safety pipeline enforcement across renderer, main, and proxy verified. |
| `npm run verify:theme-tokens` | 0 | **PASS** | 182 files scanned, 0 hardcoded colors in themeable surfaces. |
| `npm run verify:meteocon-csp` | 0 | **PASS** | Meteocon SVG and font CSP requirements validated. |
| `npm run verify:network-boundaries` | 0 | **PASS** | Outbound network boundaries and loopback restrictions validated. |
| `npm run verify:custom-protocol-privileges` | 0 | **PASS** | Standard/secure privileges for `venice-media:`, `venice-tts:`, `venice-character-cache:` verified. |
| `npm run verify:venice-contract-drift` | 0 | **PASS** | Wire payloads aligned with OpenAPI specification snapshot `20260911.010226`. |
| `npm run verify:bundle-budget` | 0 | **PASS** | All main, CSS, PDF worker, and vendor chunks within strict budget caps. |
| `npm run verify:prompt-language` | 0 | **PASS** | 0 unjustified English-only prompt directives. |
| `npm run verify:transitive-deprecations` | 0 | **PASS** | Exactly 5 known deprecations within the allowlist. |
| `npm run verify:no-native-dialogs` | 0 | **PASS** | No blocking native dialogs found in production rendering paths. |
| `npm run verify:i18n-hardcoded-regressions` | 0 | **PASS** | 0 regressions against `config/i18n-hardcoded-baseline.json` across 530 files. |
| `npm run verify:release-readiness` | **1** | **FAIL** | **Exit code 1** — `verify-i18n.cjs --strict` failed on 55 `__MISSING__:` markers in 11 locales. **Blocks Release.** (`VF-AUD-20260913-P1-001`) |

---

## Detailed Output Excerpts

### 1. `npm run lint:eslint`
```text
> venice-forge@3.0.0-beta.3 lint:eslint
> eslint src electron server.ts scripts --max-warnings=0

(exited 0 with no warnings)
```

### 2. `npm run typecheck`
```text
> venice-forge@3.0.0-beta.3 typecheck
> tsc --noEmit && tsc --noEmit --project tsconfig.electron.json && tsc --noEmit --project tsconfig.electron.test.json

(exited 0 with no diagnostic errors)
```

### 3. `npm test`
```text
 Test Files  522 passed (522)
      Tests  5945 passed (5945)
   Start at  06:52:43
   Duration  258.16s (transform 38.87s, setup 359.71s, import 112.40s, tests 313.38s, environment 394.64s)
```

### 4. `npm run verify:release-readiness` (Failure Log)
```text
> venice-forge@3.0.0-beta.3 verify:release-readiness
> npm run verify:contracts && npm run verify:i18n:release

... [contracts passed 104/104] ...

> venice-forge@3.0.0-beta.3 verify:i18n:release
> node scripts/verify-i18n.cjs --strict --write-status && node scripts/i18n-locale-status.cjs --write ...

 - Locale 'de' key 'common:surface.componentsLayoutMemoryPanel.heading.searchVault' still carries __MISSING__ placeholder: "__MISSING__:Search vault"
 - Locale 'de' key 'common:runtimeGenerated.stores.profileStore.notification.profileNameCannotBeEmpty' still carries __MISSING__ placeholder: "__MISSING__:runtimeGenerated.stores.profileStore.notification.pr"
 - Locale 'de' key 'common:runtimeGenerated.stores.profileStore.notification.maximumProfileLimitReached' still carries __MISSING__ placeholder: "__MISSING__:runtimeGenerated.stores.profileStore.notification.ma"
 - Locale 'de' key 'media:imageStudioRuntime.replicateQueued' still carries __MISSING__ placeholder: "__MISSING__:Replicate generation queued"
 - Locale 'de' key 'media:imageStudioRuntime.replicateQueuedDetail' still carries __MISSING__ placeholder: "__MISSING__:The image will appear in Task Center and Media Studi"
[... repeated across 11 locales ...]
Command failed with exit code 1.
```
