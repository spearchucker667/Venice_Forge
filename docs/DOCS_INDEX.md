# Venice Forge Documentation Index

This is the canonical source-of-truth navigation map for all documentation in this repository. Documents are organized by the [Diátaxis](https://diataxis.fr) framework: **tutorials** (learning), **how-to guides** (task), **reference** (information), and **explanation** (understanding).

---

## Start Here

- [README.md](../README.md) — Repository landing page, features, setup, and architecture overview.
- [ABOUT.md](ABOUT.md) — What Venice Forge is, goals, architecture, data flow, and tab overview.
- [FAQ.md](FAQ.md) — Frequently asked questions about privacy, credentials, safety, storage, and compatibility.
- [SUPPORT.md](../SUPPORT.md) — Where to get help and how to report issues.

---

## Tutorials (Learning-Oriented)

> Step-by-step walkthroughs that teach a workflow and produce a meaningful result.

- [user/ST_CARD_STUDIO.md](user/ST_CARD_STUDIO.md) — Import, edit, draft, chat, and export a character card.
- [DEVELOPMENT/building.md](DEVELOPMENT/building.md) — Local development, packaging, and validation across Windows and macOS.
- [DEVELOPMENT/macos.md](DEVELOPMENT/macos.md) — macOS-specific development setup, permissions, signing, and troubleshooting.

---

## How-To Guides (Task-Oriented)

> Direct, actionable steps to solve a specific real-world problem.

### Development

- [DEVELOPMENT/troubleshooting.md](DEVELOPMENT/troubleshooting.md) — Solutions for common dev environment or build failures.
- [DEVELOPMENT/testing.md](DEVELOPMENT/testing.md) — Run targeted test shards, measure durations, and understand regression escalation.
- [DEVELOPMENT/i18n-tooling.md](DEVELOPMENT/i18n-tooling.md) — `i18n:extract`, `i18n:sync-catalogs`, `i18n:coverage` workflow.
- [DEVELOPMENT/performance-baselines.md](DEVELOPMENT/performance-baselines.md) — Profile bundle size and render performance before monolith refactors.
- [DEVELOPMENT/CONFIG.md](DEVELOPMENT/CONFIG.md) — Configure local YAML options and import secure keys.

### Backup & Sync

- [user/backup-and-sync.md](user/backup-and-sync.md) — Create encrypted backups, import existing backups, and set up sync folders.
- [user/sync-troubleshooting.md](user/sync-troubleshooting.md) — Safe recovery from passphrase loss, conflicts, and two-device problems.
- [DEVELOPMENT/sync-testing.md](DEVELOPMENT/sync-testing.md) — Automated fixture tests and manual two-device QA protocol.

### Media & Images

- [user/IMAGE_INSPECTOR.md](user/IMAGE_INSPECTOR.md) — Analyze local images, extract prompts, and understand source discovery.
- [user/chat-model-selection.md](user/chat-model-selection.md) — Select models per conversation, configure provider defaults, and reconcile fallbacks.

### Release

- [RELEASE/release.md](RELEASE/release.md) — Release requirements, versioning, and publishing checklist.
- [RELEASE/signing-and-notarization.md](RELEASE/signing-and-notarization.md) — Set up certificates and resolve macOS app quarantine.

### Translation

- [i18n/TRANSLATION_GUIDE.md](i18n/TRANSLATION_GUIDE.md) — Translation guidelines, conventions, and contribution workflow.

---

## Reference (Information-Oriented)

> Precise, systematic descriptions of interfaces, formats, and configuration.

### API & Network Contracts

- [reference/Venice_swagger_api.yaml](reference/Venice_swagger_api.yaml) — Authoritative local OpenAPI snapshot (`20260911.010226`) for Venice API requests/responses.
- [reference/Venice_api_LLM_info.md](reference/Venice_api_LLM_info.md) — Venice-provided LLM integration reference.
- [reference/VENICE_API_SYSTEM_PROMPT.md](reference/VENICE_API_SYSTEM_PROMPT.md) — Core system prompt for AI agents integrating with the Venice API.
- [reference/VENICE_API_SOURCE_MANIFEST.md](reference/VENICE_API_SOURCE_MANIFEST.md) — Upstream API documentation mirror provenance and sync contract.
- [reference/seedance-2-0-api-guide.md](reference/seedance-2-0-api-guide.md) — Seedance video generation API reference.
- [reference/seedance-face-consent-api-guide.md](reference/seedance-face-consent-api-guide.md) — Seedance face-consent API reference.

### Formats & Compatibility

- [reference/CHARACTER_CARD_V2_COMPATIBILITY.md](reference/CHARACTER_CARD_V2_COMPATIBILITY.md) — Supported Tavern/CCv2 formats, mappings, limits, and runtime semantics.
- [developer/CHARACTER_CARD_CODEC.md](developer/CHARACTER_CARD_CODEC.md) — Character Card V2 PNG codec limits, verification, and chunk contract.
- [developer/CHARACTER_CARD_MAPPINGS.md](developer/CHARACTER_CARD_MAPPINGS.md) — Tavern/V2 DTO to internal card and character-book mappings.
- [testing/CHARACTER_CARD_FIXTURES.md](testing/CHARACTER_CARD_FIXTURES.md) — Synthetic fixture policy and validation commands.
- [architecture/data-export-format.md](architecture/data-export-format.md) — Authenticated `.vfbackup` envelope, portability, and compatibility contract.
- [design/LOADING_AND_SURFACE_CONTRACT.md](design/LOADING_AND_SURFACE_CONTRACT.md) — Semantic loading, reduced-motion, mesh structure, and interactive-border rules.
- [design/THEME_SYSTEM.md](design/THEME_SYSTEM.md) — CSS custom property tokens, contrast checking, and YAML palette integration.

### Architecture Specifications

- [DEVELOPMENT/FILE_TREE.md](DEVELOPMENT/FILE_TREE.md) — Directory structure reference.
- [DEVELOPMENT/platform-support.md](DEVELOPMENT/platform-support.md) — Desktop OS compatibility matrices.
- [DEVELOPMENT/storage-policy.md](DEVELOPMENT/storage-policy.md) — IndexedDB storage configuration, encryption, and folder layouts.
- [DEVELOPMENT/BRIDGE.md](DEVELOPMENT/BRIDGE.md) — Headless loopback bridge specifications.
- [DEVELOPMENT/JINA_PROVIDER.md](DEVELOPMENT/JINA_PROVIDER.md) — Jina-backed search and scrape integration reference.
- [DEVELOPMENT/image-model-capabilities.md](DEVELOPMENT/image-model-capabilities.md) — Image model capability registry and Seedream model reference.
- [DEVELOPMENT/sync-architecture.md](DEVELOPMENT/sync-architecture.md) — Main/renderer trust boundary, packet lifecycle, conflicts, tombstones, and recovery.
- [DEVELOPMENT/sync-provider-interface.md](DEVELOPMENT/sync-provider-interface.md) — Fail-closed contract for deferred WebDAV/S3-compatible transports.
- [developer/image-inspector-architecture.md](developer/image-inspector-architecture.md) — Image Inspector ingestion, IPC, structured analysis, error and privacy contracts.
- [design/MEDIA_STUDIO.md](design/MEDIA_STUDIO.md) — Media Studio command center actions, visual diffs, and lineage trees.

### Threat Models & Security

- [security/ST_CARD_IMPORT_THREAT_MODEL.md](security/ST_CARD_IMPORT_THREAT_MODEL.md) — Card/PNG/IPC/AI trust boundaries and logging rules.
- [security/security-model.md](security/security-model.md) — Credential, IPC, safety, and portable-data boundaries.
- [security/sync-threat-model.md](security/sync-threat-model.md) — Attacker model and mitigations for untrusted sync folders.

### Internationalization

- [i18n/GLOSSARY.md](i18n/GLOSSARY.md) — Internationalization terminology glossary.
- [i18n/translation-status.json](i18n/translation-status.json) — Machine-readable structural, runtime-surface, and linguistic-review metadata (schema v4).
- [i18n/native-review-status.json](i18n/native-review-status.json) — Per-locale qualified-review state and production-completion input.

### Release & Legal

- [RELEASE/SIGNED_ARTIFACT_EVIDENCE.md](RELEASE/SIGNED_ARTIFACT_EVIDENCE.md) — Cryptographic verification hashes of released binaries.
- [RELEASE/repository-settings.md](RELEASE/repository-settings.md) — GitHub environments and branch protections.
- [RELEASE/ST_CARD_STUDIO_MIGRATION.md](RELEASE/ST_CARD_STUDIO_MIGRATION.md) — Character schema, draft, import/export, sync, and compatibility migration notes.
- [legal/PRIVACY.md](legal/PRIVACY.md) — Detailed technical privacy and local credential storage model.
- [legal/DISCLAIMER.md](legal/DISCLAIMER.md) — Liability exclusions and warranty waivers.
- [legal/NOTICE.md](legal/NOTICE.md) — Copyright attributions and third-party notices.
- [legal/THIRD_PARTY_NOTICES.md](legal/THIRD_PARTY_NOTICES.md) — Dependency licenses and brand attributions.
- [legal/TRADEMARKS.md](legal/TRADEMARKS.md) — Venice.ai and external trademark nominative-use notices.

### Source Code Contracts

- [`../src/shared/chatMediaReferenceContracts.ts`](../src/shared/chatMediaReferenceContracts.ts) — Canonical `ChatMediaReference` parity contract between renderer and main.
- [`../src/shared/promptLimits.ts`](../src/shared/promptLimits.ts) — Unicode code-point budgets and dynamic-limit helper.
- [`../inactive-features/research-browser/README.md`](../inactive-features/research-browser/README.md) — Inactive archive boundary for the former embedded Research Browser.

---

## Explanation (Understanding-Oriented)

> Why the system behaves as it does, how concepts relate, and design rationale.

### Architecture & Design

- [architecture/memory-isolation.md](architecture/memory-isolation.md) — Conversation-scoped memory retrieval, exclusions, and preview lifecycle.
- [design/DESIGN.md](design/DESIGN.md) — Product design principles and interaction guidance.
- [design/CHARACTER_RP.md](design/CHARACTER_RP.md) — Local Character RP architecture and memory boundaries.
- [design/ST_CARD_STUDIO.md](design/ST_CARD_STUDIO.md) — ST Card Studio compatibility decisions, trust boundaries, and phase gates.
- [design/MEMORY.md](design/MEMORY.md) — Semantic memory store structure and injection disclosures.
- [design/LOREBOOKS.md](design/LOREBOOKS.md) — Lorebook JSON formats and key trigger injection.
- [design/SCENE_GENERATION.md](design/SCENE_GENERATION.md) — Dynamic scene-generation rules and background asset maps.
- [design/REPOSITORY_TREE.md](design/REPOSITORY_TREE.md) — Codebase layout and design rationale.
- [DEVELOPMENT/rp-token-counting.md](DEVELOPMENT/rp-token-counting.md) — Compiled prompt estimates and over-budget save behavior.
- [features/DOCUMENT_AGENT.md](features/DOCUMENT_AGENT.md) — Limited Documents, workspace grants, approval integrity, path security, lazy directory tree, tool execution context, preset semantics, attachment promotion, and supported document/workspace tools.

### Design History & Reports

- [design/PUBLIC_PROFILE_DISCOVERY.md](design/PUBLIC_PROFILE_DISCOVERY.md) — Platform-specific site query logic.
- [design/VENICE_UI_EXTRACTION.md](design/VENICE_UI_EXTRACTION.md) — Internal UI extraction/reference notes; implementation remains authoritative.
- [design/pastel-theme-pack-report.md](design/pastel-theme-pack-report.md) — Pastel Aqua/Pink Theme Pack implementation report.
- [implementation/document-agent-implementation-report.md](implementation/document-agent-implementation-report.md) — Document Agent implementation and verification report.

### Discovery & Planning

- [discovery/DISCOVERY_DOCUMENT_AGENT.md](discovery/DISCOVERY_DOCUMENT_AGENT.md) — Repository reconciliation and Phase 0 architecture evidence.
- [superpowers/specs/2026-08-31-unified-theme-ci-csp-electron-replicate-design.md](superpowers/specs/2026-08-31-unified-theme-ci-csp-electron-replicate-design.md) — Approved integrated design for Theme Engine V2, CI/package hardening, Electron test typechecking, strict-CSP Meteocon rendering, and durable Replicate paid submissions.
- [superpowers/plans/2026-08-31-unified-hardening-coordinator.md](superpowers/plans/2026-08-31-unified-hardening-coordinator.md) — Execution coordinator for the approved five-workstream hardening program, integrated validation, and direct-main publication.
- [superpowers/plans/2026-08-31-electron-test-typecheck.md](superpowers/plans/2026-08-31-electron-test-typecheck.md) — Test-first plan to eliminate Electron test compiler debt and add the dedicated project to canonical typechecking.
- [superpowers/plans/2026-08-31-csp-meteocon-remediation.md](superpowers/plans/2026-08-31-csp-meteocon-remediation.md) — Test-first plan for CSP-compatible Meteocon SVG transformation and source/build/package regression coverage.
- [superpowers/plans/2026-08-31-replicate-paid-submission-durability.md](superpowers/plans/2026-08-31-replicate-paid-submission-durability.md) — Test-first plan for Replicate write-ahead persistence, deduplication, ambiguity handling, restart recovery, and bounded reads.
- [superpowers/plans/2026-08-31-theme-ci-reconciliation.md](superpowers/plans/2026-08-31-theme-ci-reconciliation.md) — Reconciliation plan for the inherited Theme Engine V2 and CI/package implementation.
- [superpowers/specs/2026-08-31-theme-engine-v2-and-ci-hardening-design.md](superpowers/specs/2026-08-31-theme-engine-v2-and-ci-hardening-design.md) — Approved design for Theme Engine V2 architecture and CI workflow hardening.
- [superpowers/plans/2026-08-31-theme-engine-v2-and-ci-hardening.md](superpowers/plans/2026-08-31-theme-engine-v2-and-ci-hardening.md) — Test-first implementation plan for Theme Engine V2 and CI hardening.
- [superpowers/specs/2026-08-30-audit-remediation-design.md](superpowers/specs/2026-08-30-audit-remediation-design.md) — Approved design for August 30 audit findings remediation.
- [superpowers/plans/2026-08-30-audit-remediation.md](superpowers/plans/2026-08-30-audit-remediation.md) — Test-first implementation plan for August 30 audit findings remediation.
- [superpowers/plans/2026-09-01-theme-aware-code-blocks.md](superpowers/plans/2026-09-01-theme-aware-code-blocks.md) — Implementation plan for theme-aware syntax-colorized code rendering and Theme Maker Code & Syntax editor.
- [superpowers/specs/2026-09-01-theme-aware-code-rendering-design.md](superpowers/specs/2026-09-01-theme-aware-code-rendering-design.md) — Design specification for theme-aware syntax highlighting, code-theme tokens, preset registry, and persistence contracts.
- [superpowers/specs/2026-08-23-semantic-image-prompt-enhancer-design.md](superpowers/specs/2026-08-23-semantic-image-prompt-enhancer-design.md) — Implemented semantic grounding, trust-layer, model-context, configuration-migration, and validation contract for Image Studio prompt enhancement/remix.
- [superpowers/specs/2026-08-24-deferred-provider-integration-design.md](superpowers/specs/2026-08-24-deferred-provider-integration-design.md) — Design specification for deferred provider integrations (Replicate, Bedrock, Vertex, Azure OpenAI, Hugging Face, Cohere).
- [superpowers/specs/2026-08-26-provider-boundary-style-references-design.md](superpowers/specs/2026-08-26-provider-boundary-style-references-design.md) — Approved design for provider-operation request allowlists and runtime-gated Image Studio style references (`PROV-001`, `PROV-005`).
- [superpowers/specs/2026-08-26-document-agent-end-to-end-repair-design.md](superpowers/specs/2026-08-26-document-agent-end-to-end-repair-design.md) — Approved design for Document Agent end-to-end repair: workspace contracts, lazy tree, tool execution context, preset authority, and attachment promotion.
- [superpowers/plans/2026-08-26-provider-boundary-style-references.md](superpowers/plans/2026-08-26-provider-boundary-style-references.md) — Test-first implementation plan for the approved `PROV-001` and `PROV-005` remediation.

---

## Developer Onboarding

- [CONTRIBUTING.md](../CONTRIBUTING.md) — Branch conventions, validation commands, and PR checklist.
- [AGENTS.md](../AGENTS.md) — Instructions for AI coding agents and session handoffs.
- [.cursorrules](../.cursorrules) — Thin pointer to AGENTS.md for Cursor-compatible agents.
- [AGENT_REINITIALIZATION.md](../AGENT_REINITIALIZATION.md) — Agent re-initialization protocol. Supplementary agent notes under `docs/AGENTS/` are local-only and gitignored.
- [../scripts/dev-tools/README.md](../scripts/dev-tools/README.md) — Internal development-tool inventory.

---

## Project Governance

### Roadmap & Session Handoff

- [ROADMAP.md](ROADMAP.md) — Canonical current-work-only task ledger.
- [summary_of_work.md](summary_of_work.md) — Active session handoff ledger.

### Audit Evidence

- [audits/venice-forge-exhaustive-audit-2026-09-12/README.md](audits/venice-forge-exhaustive-audit-2026-09-12/README.md) — 2026-09-12 exhaustive multi-agent audit package (SHA `c1aa891b`). Re-verification confirms 19/19 prior findings (4 P1, 6 P2, 5 P3, 2 DR, 3 TG) and 7 re-pass findings (N1..N7) fully remediated, verified, committed, and published to `main`. See `FINDINGS.md`, `VALIDATION_RESULTS.md`, and `summary_of_work.md`.
- [audits/venice-forge-exhaustive-audit-2026-09-12-c6d9bed/README.md](audits/venice-forge-exhaustive-audit-2026-09-12-c6d9bed/README.md) — **Latest.** 2026-09-12/13 audit of `main` @ `c6d9bed3` (post-remediation). All local validation green; re-verified all prior 13 P1 fixes. New findings: 1 P1 (defective packaged-CSP smoke probe introduced by `bb29350e` — hosted `main` CI red), 1 P3 (capability-token expired reaping), 1 DR, 2 TG, 2 IMP. See `EXECUTIVE_SUMMARY.md`, `FINDINGS.md`, `CI_REVIEW.md`, `RUNTIME_TEST_RESULTS.md`.
- [audits/venice-forge-exhaustive-audit-2026-09-12-current-main/README.md](audits/venice-forge-exhaustive-audit-2026-09-12-current-main/README.md) — 2026-09-12 independent re-audit of current `main` (`84cf5bbe`, v3.0.0-beta.3). Original package identifies 55 findings (0 P0, 13 P1, 20 P2, 22 P3). Same-day remediation closed all 13 P1s and the confirmed P2/P3s listed in `REMEDIATION_STATUS.md` (re-verified at `c6d9bed3` by the `c6d9bed` audit, except its SEC-P3-004 claim superseded by that package's P1). See `EXECUTIVE_SUMMARY.md`, `FINDINGS.md`, `VALIDATION_RESULTS.md`, and `summary_of_work.md`.
- [audits/venice-forge-exhaustive-audit-2026-09-11/README.md](audits/venice-forge-exhaustive-audit-2026-09-11/README.md) — 2026-09-11 current-worktree audit, six resolved follow-up findings, and local/package validation evidence for baseline SHA `c3ae21af`. External acceptance remains in `ROADMAP.md`.
- [audits/venice-forge-exhaustive-audit-2026-09-10/README.md](audits/venice-forge-exhaustive-audit-2026-09-10/README.md) — 2026-09-10 exhaustive current-`main` audit package (SHA `c3ae21af`). Evidence only; remaining work is in `ROADMAP.md`.
- [audits/Records/repository-hygiene-audit.md](audits/Records/repository-hygiene-audit.md) — 2026-09-01 repository hygiene inventory and keep/remove rationale.
- [audits/Records/repository-hygiene-final-report.md](audits/Records/repository-hygiene-final-report.md) — 2026-09-01 hygiene execution report.
- [audits/Records/Function_calling_todo.md](audits/Records/Function_calling_todo.md) — Implementation/acceptance specification referenced by roadmap; not a checkbox ledger.
- [audits/Records/Venice_Forge_Video_Research_Browser_Remediation_Work_Order.md](audits/Records/Venice_Forge_Video_Research_Browser_Remediation_Work_Order.md) — Historical work order for the inactive research-browser feature.
- [audits/repo-management/README.md](audits/repo-management/README.md) — Historical repository hygiene and reorganization handoffs.

### Repository Maintenance & Hygiene

- [repository-maintenance/README.md](repository-maintenance/README.md) — 2026-09-11 repository organization, hygiene report, and move/deletion manifests.
- [repository-maintenance/REPOSITORY_HYGIENE_REPORT.md](repository-maintenance/REPOSITORY_HYGIENE_REPORT.md) — Comprehensive repository hygiene audit, policy enforcement, and validation evidence.
- [repository-maintenance/FILE_MOVE_MANIFEST.md](repository-maintenance/FILE_MOVE_MANIFEST.md) — Complete file move and rename manifest with backwards-compatibility notes.
- [repository-maintenance/DELETION_MANIFEST.md](repository-maintenance/DELETION_MANIFEST.md) — Exhaustive deletion and un-tracking manifest with rationale.

### Historical Reports

- [reports/historical/README.md](reports/historical/README.md) — Guideline for audit history and historical report rules.
- [reports/historical/remediation-report-2026-09-01.md](reports/historical/remediation-report-2026-09-01.md) — 2026-09-01 Code Health, Performance & Security Remediation Report.
- [reports/historical/CANONICAL_REPORT_INDEX.md](reports/historical/CANONICAL_REPORT_INDEX.md) — Navigator for past validation audits.
- [reports/VENICE_FORGE_POST_AUGUST_24_AUDIT_REPORT.md](reports/VENICE_FORGE_POST_AUGUST_24_AUDIT_REPORT.md) — 2026-08-25 Post-August-24 provider-update audit and remediation report.
- [reports/FINAL_AUDIT_REMEDIATION_REPORT_2026-08-26.md](reports/FINAL_AUDIT_REMEDIATION_REPORT_2026-08-26.md) — 2026-08-26 Current-main CI repair, exhaustive repository audit, and remediation report.
- [reports/MEDIA_PREVIEW_TRAFFIC_INSPECTOR_REMEDIATION_REPORT_2026-07-26.md](reports/MEDIA_PREVIEW_TRAFFIC_INSPECTOR_REMEDIATION_REPORT_2026-07-26.md) — 2026-07-26 Traffic Inspector emitter wiring remediation report.
- [reports/MEDIA_SAVE_PIPELINE_AUDIT_2026-07-28.md](reports/MEDIA_SAVE_PIPELINE_AUDIT_2026-07-28.md) — 2026-07-28 Media Studio Save As pipeline audit report.
- [reports/historical/FINAL_ACCEPTANCE_REPORT.md](reports/historical/FINAL_ACCEPTANCE_REPORT.md) — 2026-08-23 Final acceptance and release readiness report.
- [reports/historical/DEFERRED_WORK_DECISION_RECORD.md](reports/historical/DEFERRED_WORK_DECISION_RECORD.md) — 2026-08-23 Engineering decisions for deferred roadmap items.
- [archives/README.md](archives/README.md) — Archive policy and non-authoritative historical-material boundary.

### Retired / Deleted During Hygiene

These files were removed, merged, or archived during the 2026-08-22 and 2026-09-01 hygiene passes:
- `CLAUDE.md`, `GEMINI.md`, `.windsurfrules` — Redundant copies of AGENTS.md.
- `docs/SUPPORT.md`, `docs/privacy.md` — Duplicates of root-level files.
- `docs/BUG_HUNTING_AGENT_PROMPT.md` — Internal agent prompt; not user-facing documentation.
- `VENICE_FORGE_COMPLETE_AUDIT.md` — Root-level audit stub removed 2026-09-01.
- `docs/archives/session-history-pre-2026-07-11.md` — 1.29 MiB agent session dump untracked 2026-09-01; git history retains the blob.
- `docs/reports/historical/historical_summary_of_work.md` — Superseded 1.22 MiB ledger untracked 2026-09-01; live ledger is `docs/summary_of_work.md`.
- `scratch/` — Directory added to `.gitignore`.

Leaf nodes `docs/security-model.md`, `docs/data-export-format.md`, `docs/backup-and-sync.md`, `docs/sync-troubleshooting.md`, `docs/chat-model-selection.md`, and `docs/memory-isolation.md` were moved into topic subdirectories during the hygiene pass. The sole authority for current paths is this index.
