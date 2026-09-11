# Security and Privacy Audit

## Confirmed controls

- Electron windows use `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, and `webSecurity: true`.
- Navigation is allowlisted/blocked and `window.open` is denied by default.
- Renderer-supplied profile identifiers do not control credential selection; main binds requests to the active profile session.
- API/provider keys are held behind main-process secure-store services and are not exposed through read-value preload APIs.
- Logger/redaction tests cover common API-key and sensitive payload patterns; raw prompts/responses are not intentionally logged by default.
- Custom media schemes have explicit access-policy validation; filesystem/document operations use grants and validated IPC.
- No telemetry-by-default or broad-storage-permission regression was identified.

## Integrity/privacy findings

- `VF-AUDIT-20260815-P1-006` is an integrity/durability failure: tool-result records and their generated-media/document metadata are dropped at preload. It is not a confirmed confidentiality breach.
- `VF-AUDIT-20260815-P1-007` can duplicate provider submissions and cost. It does not expose credentials but is a paid-operation safety defect.
- Provider and local Family Safe Mode remain distinct controls. Remediation of P1-001 must not add application-level censorship or erase explicit `safe_mode=false` on endpoints that officially support it.

## Not verified

Keychain/libsecret/DPAPI behavior in signed packages, hostile local-account access, notarized update flows, exported Traffic Inspector payloads from paid real calls, and Windows/Linux sandbox behavior were not available in this local macOS audit. No success claim is made for them.
