# CI and Release Audit

## CI assessment

The repository has meaningful layered gates: ESLint, dual TypeScript projects, bounded Vitest shards, dependency audits, renderer/server/Electron builds, static feature/security contracts, repository identity/roadmap/documentation checks, and distribution-output verification. Workflow definitions pin and separate platform responsibilities more carefully than a single broad test job.

The gates are nevertheless insufficient to establish production readiness because:

- schema-drift tests do not validate all outbound request bodies field by field;
- several unit tests encode incorrect expected wire shapes;
- Web and Electron streaming tests do not share an adversarial conformance suite;
- preload callback envelopes lack an end-to-end contract test;
- hosted CI cannot infer paid-provider semantics from mocks;
- signed/notarized Windows/macOS and headed accessibility/update behavior require external evidence.

## Release status

This audit does not supersede `docs/ROADMAP.md`. `VF-VERIFY-005`, Document Agent release hardening, and native localization review remain open. The newly confirmed P1 findings add code-level release blockers.

## Required CI additions

1. Generate or compile request validators from the tracked Swagger and run every production operation fixture through them.
2. Run the same SSE conformance vectors against Web and Electron adapters.
3. Add a preload IPC contract test for every streamed property.
4. Fail CI when production model IDs are introduced outside fixtures/reference data.
5. Keep paid/signed/manual evidence as explicit external checks; do not replace it with mocks.
