# Improvements (Non-Defect Recommendations)

These items are not bugs but would reduce future defect probability or improve maintainability.

| ID | Area | Recommendation | Rationale |
|---|---|---|---|
| IMP-001 | IPC hygiene | Remove or expose the three dead `documentAgent:workspace:propose*` handlers | Dead privileged surface reduces audit burden |
| IMP-002 | IPC hygiene | Delete the dead `credential:set/get/delete` wrapper and its renderer bridge | Unused generic credential IPC is unnecessary risk |
| IMP-003 | IPC hygiene | Add a verifier that every preload method has a non-test renderer consumer | Prevents future dead-surface drift |
| IMP-004 | Diagnostics | Restrict `LOCAL_PATH_PATTERN` relative-path arm to absolute home prefixes | Preserves API paths/dates while still redacting private machine paths |
| IMP-005 | Custom protocols | Wire the already-scaffolded capability-token manager | Defense-in-depth against renderer XSS using media URLs |
| IMP-006 | Safety | Make Electron runtime safety snapshot fail-closed on config-load failure | Matches web-proxy fail-closed default |
| IMP-007 | Storage | Compaction strategy for conversation vault manifest journal | Prevents unbounded journal growth |
| IMP-008 | Storage | Prune departed devices from sync ack collection | Prevents unbounded event-file accumulation |
| IMP-009 | Storage | Reap generated-media recovery and quarantine artifacts | Prevents disk-space exhaustion |
| IMP-010 | Venice client | Add absolute stream lifetime on Electron | Matches the 300 s web deadline |
| IMP-011 | Venice client | Deduplicated `veniceFetch` should resolve pending inspector rows | Avoids stale telemetry state |
| IMP-012 | Stores | Distinguish empty-library vs load-failure states in library stores | Enables retry UI |
| IMP-013 | Docs | Update `AGENT_REINITIALIZATION.md` resolved-version claims to match `package-lock.json` | Currently lists React 19.0.1 and Electron 43.1.1; resolved are 19.2.8 and 43.2.0 |

## Documentation accuracy note

`AGENT_REINITIALIZATION.md` §6 lists:
- React 19.0.1 — actual resolved: 19.2.8
- Electron 43.1.1 — actual resolved: 43.2.0

The other versions (Vite 8.1.5, Express 5.2.1, Zustand 5.0.14) match. The two stale claims should be refreshed.
