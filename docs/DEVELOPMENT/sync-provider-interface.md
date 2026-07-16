# Sync Provider Interface

The only implemented transport is a user-selected local folder. Third-party desktop clients may replicate that folder, but Venice Forge does not currently contain WebDAV, S3-compatible, or proprietary cloud-provider clients.

A future provider adapter must expose bounded list/read/write/delete operations over opaque encrypted packet bytes and metadata. It must not receive application plaintext or a renderer-owned credential. Credentials belong in Electron main/OS secure storage, endpoints must be explicitly configured and validated, and redirects, TLS failures, private-network access, response sizes, retries, timeouts, pagination, cancellation, conditional writes, and redacted errors must have tests.

Adapters must preserve the existing packet schema, atomic/conditional publication semantics, idempotent operation IDs, tombstones, conflict rules, and watcher recovery. Provider availability must fail closed: no UI control may advertise or accept credentials for an adapter until its custody, transport, and test contracts pass.

Live in-place key rotation is a separate future protocol. Until implemented, a passphrase change creates a new sync set and requires device re-enrollment.
