# Document Agent

Document Agent is Venice Forge's local-first, main-process-authoritative document workspace. It separates app-managed documents from explicitly granted workspace access and never grants shell, Git, network, keychain, database, or operating-system control.

## Access modes

- **Off** exposes no document tools.
- **Read attachments only** is reserved for files explicitly attached to the active conversation.
- **Limited Documents** is the safe default. It permits bounded reads, non-overwriting creation, edit proposals, immutable revision reads/restoration, and user-mediated export for documents owned by the active Venice Forge project.
- **Manage selected workspace** requires a native directory picker. The grant is limited to one root, one agent session, supported extensions, and bounded operations. It is not persisted across app restart.

The initial renderer surface exposes managed-document creation, reading, edit review, restoration, export, and workspace grant/revocation. Main-process workspace changeset, move, and recoverable-trash primitives exist behind the policy boundary but are not presented as autonomous renderer actions.

## Approval integrity

An edit proposal is prepared without writing. Its SHA-256 hash covers the canonical tool name, validated arguments, base revisions, affected resources, grant, and public preview. The renderer submits the displayed proposal ID and hash. Main consumes an approval once, rejects replay or mismatch, verifies the active profile and current revision, then appends a new immutable revision. Persisted approvals from an earlier app runtime cannot execute automatically.

## Managed storage and revisions

Managed document metadata and revisions live beneath Electron `userData`, partitioned by the authenticated profile. The renderer receives opaque IDs, relative library paths, bounded blocks, and opaque cursors—not storage paths. New documents use `overwrite: false`. Edits and restoration append revisions; restoration never moves the current pointer backward or deletes later history.

Supported normalized block types are headings, paragraphs, lists, tables, code, quotes, managed-image references, and page breaks. The current lightweight editor directly edits a single paragraph; complex documents remain readable, exportable, and available to structured tool operations.

## Formats

The application serializes TXT, Markdown, JSON, CSV, HTML, DOCX, and PDF. Models cannot submit binary DOCX or PDF bytes.

- JSON must be representable by `JSON.stringify` and uses deterministic indentation.
- CSV rows must match the declared column width. Cells beginning with `=`, `+`, `-`, or `@` are prefixed to prevent spreadsheet formula injection.
- HTML is generated from escaped normalized blocks with a restrictive embedded CSP. Active content is never copied through.
- DOCX bytes are generated with the `docx` library.
- PDF bytes are generated with `pdf-lib` as a reflowed derivative; this is not arbitrary in-place PDF editing or secure visual redaction.

## Workspace security

Workspace paths must be relative and no longer than 500 characters. Main rejects POSIX and Windows absolute paths, UNC/device/URI paths, home shortcuts, null bytes, encoded traversal, dot segments, alternate data streams, reserved Windows device names, invalid trailing characters, symlinks, and special files. Existing targets and nearest existing parents are resolved through `realpath` and checked by path components, not string prefixes.

Listing and search are bounded, extension-limited, hidden/dependency/VCS directories are excluded by default, binary files are skipped, and search is implemented in-process without shell commands or subprocesses. File creation uses exclusive creation. Prepared changesets verify expected hashes, stage outputs in the destination directory, retain app-managed backups, commit deterministically, and attempt rollback on failure.

High-level Node path checks cannot eliminate every filesystem time-of-check/time-of-use race on every platform. Main revalidates immediately before operations and uses no-follow file descriptors for bounded reads, but packaged-platform review remains required before enabling broader autonomous mutations.

## Export and privacy

Export always opens a native save dialog from a validated main-frame sender. The model never selects or receives the absolute destination. Main serializes, validates, writes a same-directory temporary file, flushes it, and renames it into place. The result includes only display name, format, byte count, and warnings.

Document Agent audit records are append-only, hash chained, and contain event metadata only. Bodies, raw model arguments, API keys, bearer tokens, signed data, and absolute paths are excluded or redacted.

## Validation

The regression sequence `VERIFY-145` through `VERIFY-154` covers the registry and revisions, one-time approvals, hostile path handling, all serializers, bounded workspace operations, the typed preload/main boundary, native export, audit chaining, redaction, and attachment-to-managed-document promotion. Run:

```bash
npx vitest run src/agent electron/agent electron/ipc/handlers.test.ts src/config/tabs.test.ts src/App.navigation.test.ts src/components/layout/sidebar.test.tsx --no-file-parallelism
npm run lint:eslint
npm run typecheck
```

## Promote attachment

`attachment:promote` (granted in `Limited Documents` and above; never in `Off` or `Read attachments only`) lets a chat attachment become a managed document. Bodies are base64-decoded in main, capped at 1 MiB, classified against a MIME allow-list with an HTML blocklist, and non-overwriting. Text-bearing MIME types redact secrets through the canonical redaction pipeline before being split into bounded paragraph blocks; binary MIME types emit a deterministic placeholder block set with `contentKind: "binary"` metadata and the bytes are not retained. Every promotion records an audit event (`toolName: "document.promoteAttachment"`, `outcome: "execution"`, `resourceIds: [<document id>]`, `metadata: { attachmentId, mimeType, sizeBytes, format, mode, bytesRedacted }`) and propagates `createdBy: "import"` through `ManagedDocumentService.create()` so the revision lineage remains auditable.

The canonical implementation and acceptance specification remains [`docs/audits/TODO/Function_calling_todo.md`](../audits/TODO/Function_calling_todo.md). The repository reconciliation report is [`docs/discovery/DISCOVERY_DOCUMENT_AGENT.md`](../discovery/DISCOVERY_DOCUMENT_AGENT.md).
