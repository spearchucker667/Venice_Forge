# Validation results

Environment: macOS 27.0 arm64, Node 22.23.2, npm 10.9.8. Repository engine contracts were satisfied.

| Command | Exit | Result | Finding / note |
|---|---:|---|---|
| Mandatory bootstrap commands | 0 | PASS; baseline local and remote SHA equal, branch `main` | Initial dirty worktree preserved |
| `npm ci` | 0 | PASS; 857 packages installed from lockfile | Five allowlisted deprecated transitives; one low dev-only `joi` advisory |
| Focused red/green regression commands | 0 after fixes | PASS | Static root 1; chat input 25; Document Agent 2; workspace grant/IPC 98; chat store 34 |
| `npm run ci` | 0 | PASS | ESLint, three TypeScript projects, complete segmented tests, audits, build, all contracts, dist hygiene |
| `npm run test:server` (inside CI) | 0 | PASS 64/64 | Production server and proxy behavior |
| `npm run test:electron` (inside CI) | 0 | PASS 107 files / 1,174 tests | Main, preload, IPC, services, persistence |
| `npm run test:ingestion` (inside CI) | 0 | PASS 9 files / 65 tests | |
| Segmented store tests (inside CI) | 0 | PASS 45 files / 841 tests | Core 386; chat 105; features 280; integration 70 |
| Other segmented unit tests (inside CI) | 0 | PASS | Services 780; hooks 92; lib 87; shared 374; utils 422; theme 260; scripts 276; types 118; config 100; agent 11; constants 39; research 81; i18n 53 |
| UI tests (inside CI) | 0 | PASS 39 files / 375 tests | Layout 106; chat 112; gallery 72; image 46; research 21; settings 18 |
| `npm run test:contracts` (inside CI) | 0 | PASS 23 files / 269 tests | Includes CSP invariant |
| `npm audit --omit=dev --audit-level=moderate` | 0 | PASS, 0 production vulnerabilities | |
| `npm audit --audit-level=critical` | 0 | PASS configured threshold | One low `joi` advisory remains in complete dev graph |
| `npm run build` (inside CI and packaging) | 0 | PASS | Web + server + Electron |
| `npm run verify:contracts` (inside CI) | 0 | PASS | Static, feature, security, i18n, and release verifier families |
| `npm run verify:dist` (inside CI) | 0 | PASS | Built-tree hygiene and secret scan |
| `npm run verify:i18n:release` content stages | 0 | PASS | 12 locales / 12 namespaces; 4,034 keys each; generated artifacts updated |
| `npm run dist:mac:arm64` | 0 | PASS | Unsigned local app, DMG, ZIP, updater metadata, blockmaps, checksums |
| `RUN_ELECTRON_SMOKE=true npx vitest run tests/smoke/ --no-file-parallelism` | 0 | PASS 3 files / 7 tests | Real packaged app, onboarding/restart, CSP positive/negative controls |
| `node scripts/clean-release-staging.cjs` | 0 | PASS | Removed unpacked staging only |
| `node scripts/verify-dist.cjs --mac --arch arm64` | 0 | PASS | DMG, ZIP, metadata, blockmaps, checksum sidecars |
| Live `PORT=43127 HOST=127.0.0.1 npm start` probe | 0 | PASS | HTTP 200, hashed built JS, no `/src/main.tsx` |
| `npm run verify:contracts:static` | 0 | PASS | 303 Markdown files; security/network/CSP/theme/API/release checks |

## Expected non-success evidence

- The first aggregate `npm run ci` stopped at ESLint because the newly added static-root test imported an unused symbol. The import was removed and the complete command then passed; no gate was weakened.
- The first `npm run verify:dist:mac` invocation omitted `--arch arm64`, so the verifier correctly required the absent x64 artifacts. The architecture-specific command used by hosted macOS smoke then passed.
- `verify:i18n:release` regenerated tracked count artifacts before its final cleanliness comparison. The content validation passed; the generated artifacts are part of the intended staged state and the exact command is rerun after staging.

## Interpretation

All confirmed local findings have red/green regression evidence and the repository's strongest canonical local CI gate passes. The arm64 app was launched from the actual package, not a dev server. Local packaging is intentionally unsigned because no release identity was configured; signed/notarized release acceptance and paid-provider calls remain external evidence requirements rather than source-code failures.
