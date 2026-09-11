# Improvements

These are not confirmed defects. They reduce future defect probability.

1. **IPC channel inventory generator** — emit preload invokes vs `register*IpcChannel` names in `verify:contracts`.
2. **Raise master-password minimum** — current floor is 4 characters (`electron/ipc/handlers/apiKeyHandlers.ts:469`). A higher floor plus a strength hint is product policy, not a bypass.
3. **Wire custom-protocol capability tokens** — scaffolding in `electron/utils/customProtocolAccess.ts` is unused. Already deferred as `VF-CAPABILITY-PROVENANCE-2026-08-31`.
4. **Meaningful commit subjects** — HEAD is `update`. Tracked as `VF-GOVERNANCE-2026-08-25-002`.
5. **Refresh `AGENT_REINITIALIZATION.md`** or archive it so agents do not treat beta.2 as current (also P3-001).
6. **Vertex express guard** — `isGoogleVertexConfig` still accepts `authMode: "full"` and requires `projectId`/`location` on express (`electron/ipc/handlers/apiKeyHandlers.ts:202-215`). Align with the public `{ authMode: "express"; apiKey }` type. Full OAuth remains deferred (`VF-VERTEX-FULL-OAUTH`).
7. **Pin `js-yaml` exactly** after the 4.3.2 bump so `^` cannot float backward on a bad lockfile regenerate.
8. **Electron fuses / ASAR integrity** — packaged builds set `asar: true` only. Enabling `enableEmbeddedAsarIntegrityValidation`, disabling `runAsNode`, and restricting cookie encryption is packaging hardening, not a demonstrated bypass (`scratch/ci-release-tests.md` CI-012).
