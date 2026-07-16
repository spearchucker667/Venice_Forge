# Sync Testing

Automated sync tests use temporary directories and deterministic device/profile IDs. They must cover authenticated round trips, wrong passphrases, modified tags/ciphertext, oversized and malformed envelopes, store/record-ID mismatches, atomic-write cleanup, startup reconciliation, duplicate replay, tombstones, divergent edits, remote-apply token expiry, and profile isolation.

Run the focused contract with:

```bash
npm run verify:backup-sync
```

Two-device manual QA uses two clean profiles or machines pointed at one test sync folder. Create distinct offline edits on both devices, allow the external folder provider to converge, then verify conflict copies/merges and restart recovery. Repeat deletion/tombstone delivery and pause/resume. Never use production credentials or personal content in fixtures, logs, screenshots, or packet captures.

WebDAV/S3-compatible adapters and live in-place sync-key rotation are deferred and therefore have no passing implementation claim. Tests for a future adapter must prove credential custody, TLS/endpoint validation, bounded retries, cancellation, pagination, conditional writes, and failure redaction before it can be selectable.
