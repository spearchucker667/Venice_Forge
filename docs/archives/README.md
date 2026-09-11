# Archives Directory

This directory is reserved for historical files retained for traceability.

During the repository-wide documentation hygiene pass in July 2026, stale TODO roadmaps, transient agent logs, and redundant redirect stubs were deleted or merged into the central [`docs/ROADMAP.md`](../ROADMAP.md) and historical [`docs/reports/historical/CANONICAL_REPORT_INDEX.md`](../reports/historical/CANONICAL_REPORT_INDEX.md).

The 2026-09-01 public-distribution hygiene pass untracked the pre-2026-07-11 session dump (`session-history-pre-2026-07-11.md`, 1.29 MiB). That file is not required to build, test, or document the product. Git history still contains the blob. New session extracts must stay untracked; `/docs/archives/` is gitignored for that reason.

Tracked content that remains here:

- `superpowers/` — historical plans and specs that predate the live `docs/superpowers/` tree
- `work-orders/` — closed work-order text kept for traceability

For active tasks, refer to [`docs/ROADMAP.md`](../ROADMAP.md).
For the live session ledger, see [`docs/summary_of_work.md`](../summary_of_work.md).
For this hygiene pass, see [`docs/audits/Records/repository-hygiene-audit.md`](../audits/Records/repository-hygiene-audit.md).
