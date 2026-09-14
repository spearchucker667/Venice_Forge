# Security review

## Electron boundary

Current configuration and tests preserve `contextIsolation: true`, `nodeIntegration: false`, sandboxing, and web security. Privileged behavior is exposed through the typed preload surface rather than raw `ipcRenderer`. Handler registration, sender validation/rate limiting, URL policy, custom media protocols, profile scope, file grants, secure storage, and external navigation controls were inspected and exercised by the Electron/contract suites.

Dirty-tree review confirmed `VF-AUD-20260911-P1-002`: the unpublished `approvals:list` change authorized workspace proposals by a generic `grant_` prefix and could disclose public proposal views across renderer/profile session families. The handler now delegates ownership/expiry to `WorkspaceGrantService`, and profile switching revokes all grants for the renderer session family. Focused workspace-grant and IPC tests pass. No P0 defect, raw credential exposure, arbitrary filesystem access, or code-execution path was confirmed.

## IPC parity

Static string-set comparison between preload invocations and handler literals was rejected as proof because this repository registers multiple channels through typed helpers/dynamic families. The canonical IPC contract and Electron suites passed. High-risk chains examined include credentials, profile cleanup, Document Agent grants/approvals/attachment promotion, generated-media custody, custom media protocols, and Venice requests.

The new `electron/services/rpProfilePaths.ts` validates profile IDs and confines paths to an allowlisted profile directory. RP IPC consumers consistently supply the sender's trusted profile session, profile purge is scoped to a validated non-default profile, and the Electron test suite passes. No traversal or cross-profile deletion defect was established.

## Credentials and privacy

API-key get operations in the current worktree expose existence/status rather than raw secret values. Provider calls remain in the trusted main/proxy boundary. Searches and diagnostics review found no new committed credential, token, signed URL, prompt, or raw payload disclosure. No real credentials were printed or used by this audit.

## Network and content security

The repository's safety, network-boundary, custom-protocol, and provider contract verifiers pass through `verify:contracts`. The production CSP remains strict. `VF-AUD-20260911-P1-001` and `VF-AUD-20260911-P2-001` are correctness failures under that CSP; weakening CSP is explicitly not an acceptable remediation.

## Residual design risks

1. Custom protocol requests that lack Origin/Referer are still accepted under MIME/path/profile containment because Chromium media requests can omit both. The capability-token design remains deferred in `docs/ROADMAP.md`.
2. The media safety classifier reports semantic classifiers unavailable; structural validation is not equivalent to semantic classification.
3. Exact-SHA hosted CodeQL/security execution is required after publication; local network, safety, IPC, dependency, and packaged-output gates pass.

## Dependency security

The production dependency audit is clean at moderate severity. The complete graph retains low-severity `joi` advisories. Vitest and `@vitest/mocker` resolve to 4.1.11 in the cleanly installed lockfile; hosted alert closure must be confirmed after publication.
