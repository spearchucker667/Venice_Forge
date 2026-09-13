# Test Shards and Feedback Bounds

## Packaged Electron smokes (local gate)

The `tests/smoke/` suites launch a real packaged binary and are skipped by `npm test`
when no package exists. Before pushing changes that touch the smoke suites, the CSP
header path, or packaging, run them locally against a freshly built package:

```bash
npm run build
npm run dist:mac:arm64   # or dist:portable / dist:linux for other platforms
RUN_ELECTRON_SMOKE=true npx vitest run tests/smoke/
```

`RUN_ELECTRON_SMOKE=true` forces the suites to run even without a discoverable package
(the packaged-executable discovery test still needs one). Hosted CI runs these suites on
every push via the `electron-smoke-*` jobs; a failure there is much cheaper to reproduce
locally first. When probing CSP enforcement in these suites, use page-context vectors
only — see the CSP probe guidance in `tests/smoke/packaged-launch-csp.test.ts` for why
CDP-based eval probes are invalid (VF-AUD-20260912-C6-P1-001).

`npm run test:ci` is the aggregate correctness command. It runs named server, Electron, ingestion, unit-domain, UI-domain, and contract shards and must end with a conclusive exit status. Shared IndexedDB/global-state suites remain serial; isolation-sensitive execution order must not be relaxed merely for speed.

## Historical 2026-07-16 local baseline

> This baseline is retained for historical reference only. Current validation uses Node 22 per `.nvmrc` and `package.json#engines`.

Runtime: Node `v26.5.0` / npm `11.17.0` (use supported Node 22 for release authority).

| Shard | Result | Observed duration |
|---|---:|---:|
| Server | 59 tests | 0.42 s |
| Electron | 687 tests | 18.81 s |
| Ingestion | 65 tests | 3.43 s |
| Unit stores | 727 tests | 18.71 s |
| Unit services | 659 tests | 28.41 s |
| Remaining unit domains | 1,180 tests | each under 16 s |
| UI domains | 308 tests | each under 16 s |
| Contracts | 221 tests | 9.24 s |
| Aggregate | 3,906 tests | 174.76 s wall time |

## Feedback contract

- Investigate any individual shard exceeding 120 seconds or the aggregate exceeding 300 seconds on a comparable runner.
- Record the last completed shard/file and runner/runtime before calling a run hung.
- Do not exclude tests, reduce coverage, or remove serial isolation to meet the bound.
- Diagnose open handles, leaked timers/listeners, repeated Electron startup, and shared IndexedDB fixtures first.
- CI exposes the named shards through command output even when they are composed into one required job; a future split into independent jobs must retain one aggregate required result.
