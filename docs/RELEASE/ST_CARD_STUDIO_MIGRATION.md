# ST Card Studio migration notes

The RP character schema adds optional Character Card V2 compatibility fields and encrypted local `characterCardDrafts` records. Existing IDs and avatars are retained. Missing greeting arrays and extension objects normalize idempotently; description is never inferred as personality and author is never inferred as creator notes.

Desktop users can import V1 JSON, V2 JSON, and V2 PNG through main-owned dialogs. Existing matching cards are never overwritten silently. Standard exports contain only V2 fields; local media IDs, linked lorebook IDs, sync revisions, credentials, and provider settings remain internal.

Drafts do not synchronize. Manual encrypted backup continues to exclude them unless the caller explicitly enables draft inclusion. Character-card sync divergence preserves a complete conflict copy and merges only safe collection fields.

Character Card V3, compressed PNG metadata, V3 embedded assets, and bulk card archives remain unsupported.
