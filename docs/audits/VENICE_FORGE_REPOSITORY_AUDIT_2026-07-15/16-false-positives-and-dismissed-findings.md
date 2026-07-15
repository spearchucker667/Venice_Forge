# False Positives and Dismissed Findings

| Lead | Disposition | Evidence |
|---|---|---|
| CodeQL sync watcher file race / insecure temp file | Defended false positive | `O_NOFOLLOW`; opened-descriptor `stat`, size check and `readFile`; parent realpath allowlist; symlink tests. |
| CodeQL verifier incomplete URL substring | Non-security local verifier finding | Operates on trusted tracked docs to check canonical API-base presence, not on authorization, redirects or outbound destination selection. |
| CodeQL alert in sync watcher test | Test-only | Temporary path exists only in a node test fixture; production path uses defended descriptor flow. |
| Duplicate branding SVG/NOTICE files | Intentional | Source/public parity is required by dist verification and packaging. |
| Duplicate thin pointer documents | Intentional | Tool discovery surfaces are contract-enforced pointers to `AGENTS.md`. |
| Missing npm scripts in dated superpowers plan | Historical/superseded | Dated implementation plan is not current command authority; package scripts/AGENTS are current. |
| Old repository name in dated plan | Historical context | Not active checkout guidance. Active instructions were corrected. |
| Three skipped test sites | Expected environment/tool gates | Archive scanner availability and explicit Electron headed-smoke flags. |
| `expect(true)` child guard test | Import-time invariant, not unconditional production success | Module import throws if the forbidden allowlist/genre intersection exists. |
| Deferred provider/sync placeholder comments | Intentional fail-closed scope | Not advertised; locked by `VERIFY-125`. |
| Binary CRLF candidates | Scanner artifact | Byte-level line-ending search matched binary image data; text-only recheck found no issue. |
| Large Git history objects | Informational | Largest objects are well below the hosting hard limit; rewrite risk exceeds benefit. |
