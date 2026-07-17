# Reports Directory

This directory contains report governance for Venice Forge.

## Current Sources

Current operational truth lives in:

- `docs/summary_of_work.md`
- `docs/DOCS_INDEX.md`
- `docs/ROADMAP.md`


## Historical Reports

Files under `docs/reports/historical/` are retained for traceability only. They
are not current validation proof and are not current TODO lists. If a historical
report conflicts with live source, package scripts, workflow files, or
`docs/summary_of_work.md`, rerun validation and trust the live repository.

The canonical map of retained reports is
[`CANONICAL_REPORT_INDEX.md`](CANONICAL_REPORT_INDEX.md).

Do not add audit reports at the repository root. Put durable reports under
`docs/reports/` or `docs/reports/historical/`, and keep `docs/DOCS_INDEX.md`
current when a report changes authority.

## Retention and metadata

- Keep current work only in `docs/ROADMAP.md`; reports never become competing TODO ledgers.
- Register each retained report in `CANONICAL_REPORT_INDEX.md` with its status and validated commit.
- Move superseded reports under `historical/` and identify the superseding authority in the index.
- Raw evidence bundles remain external or ignored by default. Retain at most the latest two raw bundles per release line unless a legal or release-provenance requirement says otherwise.
- Source handoffs include tracked files only. An ignored or untracked local evidence directory is never copied implicitly.
