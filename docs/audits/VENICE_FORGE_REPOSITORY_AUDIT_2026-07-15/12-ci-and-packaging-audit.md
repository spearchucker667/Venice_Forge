# CI and Packaging Audit

| Surface | Result |
|---|---|
| Workflow inventory | CI, CodeQL, dependency review, platform/sensitive tests, packaged smoke and release workflows reviewed. |
| Action pinning | All third-party `uses:` references are pinned to full commit SHAs. |
| Workflow permissions | Job/workflow permissions are scoped, but repository default Actions permission is write (`VF-AUDIT-001`). |
| Branch enforcement | Documented protection is absent on live `main` (`VF-AUDIT-001`). |
| CI parity | Root `npm run ci` includes lint, both typechecks, segmented tests, moderate audit, build, all contracts and dist-output verification. |
| Packaging files | Explicit Electron Builder inclusion minimizes root/debug-file leakage. |
| Release permissions | Read by default; publish job grants required writes explicitly. |
| Signing/notarization | Not performed during audit; requires protected credentials and external service access. |

The exact baseline commit had all observed hosted workflow jobs and CodeQL analysis complete successfully. A successful CodeQL workflow means analysis completed; it does not mean zero alerts. Six open alerts were separately triaged in `06-security-findings.md`.

Local macOS packaging is unsigned evidence only. Windows/Linux packaging, signed installer update paths, notarization and release publication remain runner/credential dependent and are not inferred from build-output verification.
