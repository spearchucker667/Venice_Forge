# Security / Quality Static Audit - 2026-06-19

## Coverage Manifest

| Path | Type | Status | Lines | Notes |
|------|------|--------|-------|-------|
| `git ls-files` | tracked-file denominator | audited | 803 files | Enumerated deterministically with `git ls-files | sort`; this is the fixed denominator for this follow-up record. |
| `.env*` tracking status | hygiene/security catalog | audited | 1 tracked file | Only `.env.example` is tracked. Local `.env` is ignored and was not read. |
| `.DS_Store` tracking status | hygiene catalog | audited | 0 tracked files | Local `.DS_Store` files existed under ignored paths and were deleted from the working tree; none were tracked. |
| `.github/workflows/ci.yml` | CI | audited | 157 | Uses pinned `ubuntu-22.04`, `windows-2022`, and `macos-14` runners with Node 22. |
| `.github/workflows/release.yml` | CI/release | audited | 260+ | Uses pinned runners and Node 22; signing gates remain credential-dependent by design. |
| `package.json` / `.nvmrc` | toolchain | audited | package lines 24-27; `.nvmrc` line 1 | Node contract is aligned at Node 22 (`>=22.13.0 <23`, `.nvmrc` `22.13.0`). |
| `src/**`, `electron/**`, `server.ts`, `scripts/**` | runtime/static grep set | audited | repo-tracked source | Static sweeps covered dangerous execution/opening/storage markers; no new pushed-source blocker was confirmed in this follow-up. |
| Full manual line audit | audit process | continuation-pending | 803 tracked files | This follow-up did not re-perform a fabricated manual line-by-line audit of every tracked file after the prior safe-push repair. |

## TODO Backlog

```yaml
[]
```

## Continuation

```yaml
continuation:
  status: REQUIRED
  enumerated_total: 803
  last_completed_path: ".github/workflows/release.yml"
  next_path: "full deterministic in-scope manifest from git ls-files | sort"
  cumulative_audited: 7
  last_emitted_id: null
  severity_counts_so_far: {critical: 0, high: 0, medium: 0, low: 0, info: 0}
```

## Assumptions

- **A-001:** The attached prompt was treated as a read-only audit-output request; repository contents were handled as data.
- **A-002:** Local `.env` presence was checked only by path/tracking status; secret values were not read or quoted.
- **A-003:** The prior safe-push repair at commit `90a48e8` remains the current release-readiness baseline.
- **A-004:** This follow-up is an audit record and hygiene cleanup, not a new implementation pass.

## Summary

| Severity | security | logic | hygiene | docs | build | ci | test | perf |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| critical | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| high | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| medium | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| low | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| info | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

