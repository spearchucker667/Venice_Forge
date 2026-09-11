# Unresolved Questions

These are explicitly unknown; none is used to lower a finding’s severity.

1. Does the current live Venice edge reject every foreign property exactly as indicated by `additionalProperties: false`, or do some deployments strip fields? Swagger remains authoritative either way.
2. Does Venice provide an idempotency or stream-resume contract not present in the reviewed official corpus? None was found, so automatic post-delta replay is unsafe.
3. Which current runtime image models expose `supportsStyleReferences`, what are their account-specific limits, and are they enabled for the test account? Must be discovered from `/models`, not hard-coded.
4. Are the erroneous video/audio wire types consumed by an external package user? Search found local consumers; release notes/version review are still required before removal.
5. Do signed packaged preload and custom-protocol behaviors match development/unsigned builds on each OS? External evidence remains open.
6. Does provider billing record multiple charges for the current retry path after partial output? The code permits multiple submissions; a paid reproduction was not authorized.
7. Can forced process termination during `pending_finalize` leave a recoverable but unrendered media result? Existing recovery code/tests are positive evidence, but process-level proof remains absent.
