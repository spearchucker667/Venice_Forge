# Venice Forge Documentation Index

This is the canonical source-of-truth navigation map for all documentation in this repository. Documents are organized by the [Diátaxis](https://diataxis.fr) framework: **tutorials** (learning), **how-to guides** (task), **reference** (information), and **explanation** (understanding).

---

## Start Here

- [README.md](../README.md) — Repository landing page, features, setup, and architecture overview.
- [README.md](README.md) — Diátaxis documentation structure overview and navigation guide.
- [ABOUT.md](ABOUT.md) — What Venice Forge is, goals, architecture, data flow, and tab overview.
- [FAQ.md](FAQ.md) — Frequently asked questions about privacy, credentials, safety, storage, and compatibility.
- [SUPPORT.md](../SUPPORT.md) — Where to get help and how to report issues.
- [SECURITY.md](../SECURITY.md) — Security policy and vulnerability disclosure protocol.
- [CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md) — Contributor standards, pledge, and enforcement responsibilities.
- [LEGAL.md](../LEGAL.md) — Legal terms, licensing declarations, and trademark notices.
- [PRODUCT.md](../PRODUCT.md) — Product vision, target personas, brand personality, and design principles.
- [Showcase Website](https://veniceforge.space.minimax.io) — Feature showcase website.
- [Demo Showcase](https://veniceforge.kimi.page/) — Interactive, but limited, website version of the app.

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
- [../.agents/skills/ci-publication-verification/SKILL.md](../.agents/skills/ci-publication-verification/SKILL.md) — Hosted CI and CodeQL dual-workflow verification runbook.
- [../.agents/skills/i18n-remediation/SKILL.md](../.agents/skills/i18n-remediation/SKILL.md) — i18n localization, placeholder integrity, and loanword verification runbook.
- [../.agents/skills/per-tab-acceptance/SKILL.md](../.agents/skills/per-tab-acceptance/SKILL.md) — Per-tab visual and accessibility audit execution and screenshot harness runbook.

### Backup & Sync

- [user/backup-and-sync.md](user/backup-and-sync.md) — Create encrypted backups, import existing backups, and set up sync folders.
- [user/sync-troubleshooting.md](user/sync-troubleshooting.md) — Safe recovery from passphrase loss, conflicts, and two-device problems.
- [DEVELOPMENT/sync-testing.md](DEVELOPMENT/sync-testing.md) — Automated fixture tests and manual two-device QA protocol.

### Media & Images

- [user/IMAGE_INSPECTOR.md](user/IMAGE_INSPECTOR.md) — Analyze local images, extract prompts, and understand source discovery.
- [user/chat-model-selection.md](user/chat-model-selection.md) — Select models per conversation, configure provider defaults, and reconcile fallbacks.

### Release

- [release/release.md](release/release.md) — Release requirements, versioning, and publishing checklist.
- [release/signing-and-notarization.md](release/signing-and-notarization.md) — Set up certificates and resolve macOS app quarantine.

### Translation

- [i18n/TRANSLATION_GUIDE.md](i18n/TRANSLATION_GUIDE.md) — Translation guidelines, conventions, and contribution workflow.

---

## Reference (Information-Oriented)

> Precise, systematic descriptions of interfaces, formats, and configuration.

### API & Network Contracts

- [reference/Venice_swagger_api.yaml](reference/Venice_swagger_api.yaml) — Authoritative local OpenAPI snapshot (`20260916.135625`) for Venice API requests/responses.
- [reference/Venice_api_LLM_info.md](reference/Venice_api_LLM_info.md) — Venice-provided LLM integration reference.
- [reference/VENICE_API_SYSTEM_PROMPT.md](reference/VENICE_API_SYSTEM_PROMPT.md) — Core system prompt for AI agents integrating with the Venice API.
- [reference/VENICE_API_SOURCE_MANIFEST.md](reference/VENICE_API_SOURCE_MANIFEST.md) — Upstream API documentation mirror provenance and sync contract.
- [reference/seedance-2-0-api-guide.md](reference/seedance-2-0-api-guide.md) — Seedance video generation API reference.
- [reference/seedance-face-consent-api-guide.md](reference/seedance-face-consent-api-guide.md) — Seedance face-consent API reference.

### Formats & Compatibility

- [reference/CHARACTER_CARD_V2_COMPATIBILITY.md](reference/CHARACTER_CARD_V2_COMPATIBILITY.md) — Supported Tavern/CCv2 formats, mappings, limits, and runtime semantics.
- [DEVELOPMENT/CHARACTER_CARD_CODEC.md](DEVELOPMENT/CHARACTER_CARD_CODEC.md) — Character Card V2 PNG codec limits, verification, and chunk contract.
- [DEVELOPMENT/CHARACTER_CARD_MAPPINGS.md](DEVELOPMENT/CHARACTER_CARD_MAPPINGS.md) — Tavern/V2 DTO to internal card and character-book mappings.
- [testing/CHARACTER_CARD_FIXTURES.md](testing/CHARACTER_CARD_FIXTURES.md) — Synthetic fixture policy and validation commands.
- [architecture/data-export-format.md](architecture/data-export-format.md) — Authenticated `.vfbackup` envelope, portability, and compatibility contract.
- [design/LOADING_AND_SURFACE_CONTRACT.md](design/LOADING_AND_SURFACE_CONTRACT.md) — Semantic loading, reduced-motion, mesh structure, and interactive-border rules.
- [design/THEME_SYSTEM.md](design/THEME_SYSTEM.md) — CSS custom property tokens, contrast checking, and YAML palette integration.
- [design/VENICE_FORGE_REFERENCE_UI_REDESIGN.md](design/VENICE_FORGE_REFERENCE_UI_REDESIGN.md) — APPROVED 2026-09-14 reference-driven UI redesign: derived `--vf-*` shell material layer, graphite/crimson visual contract, rollout phases; authoritative for visual/material redesign atop Theme Engine V2.
- [design/VENICE_FORGE_REFERENCE_UI_REDESIGN_MATRIX.md](design/VENICE_FORGE_REFERENCE_UI_REDESIGN_MATRIX.md) — UI migration ledger: per-file redesign status across all renderer surfaces (completeness proof).
- [design/reference-ui-redesign-evidence/](design/reference-ui-redesign-evidence/) — Phase 9 visual-QA screenshot evidence for the reference-driven redesign, captured by [`../scripts/capture-redesign-matrix.mjs`](../scripts/capture-redesign-matrix.mjs). Each capture lives at `<viewport>/<theme-locale-preset>/<surface>.png` and the bundle is summarized by `EVIDENCE_MANIFEST.json`.
- [design/per-tab-acceptance/README.md](design/per-tab-acceptance/README.md) — Per-tab headed visual and accessibility acceptance specification and harness (VF-20260918-P2-016 / VF-20260922-P2-011).
- [ui-modernization/THEME_SCHEMA.md](ui-modernization/THEME_SCHEMA.md) — Theme Engine V2 token definitions, schema specification, and palette constraints.
- [ui-modernization/THEME_IMPORT_EXPORT.md](ui-modernization/THEME_IMPORT_EXPORT.md) — Theme import, export, migration, duplication, and cross-platform compatibility specifications.

### Architecture Specifications

- [DEVELOPMENT/FILE_TREE.md](DEVELOPMENT/FILE_TREE.md) — Directory structure reference.
- [DEVELOPMENT/platform-support.md](DEVELOPMENT/platform-support.md) — Desktop OS compatibility matrices.
- [DEVELOPMENT/storage-policy.md](DEVELOPMENT/storage-policy.md) — IndexedDB storage configuration, encryption, and folder layouts.
- [DEVELOPMENT/BRIDGE.md](DEVELOPMENT/BRIDGE.md) — Headless loopback bridge specifications.
- [DEVELOPMENT/JINA_PROVIDER.md](DEVELOPMENT/JINA_PROVIDER.md) — Jina-backed search and scrape integration reference.
- [DEVELOPMENT/image-model-capabilities.md](DEVELOPMENT/image-model-capabilities.md) — Image model capability registry and Seedream model reference.
- [DEVELOPMENT/sync-architecture.md](DEVELOPMENT/sync-architecture.md) — Main/renderer trust boundary, packet lifecycle, conflicts, tombstones, and recovery.
- [DEVELOPMENT/sync-provider-interface.md](DEVELOPMENT/sync-provider-interface.md) — Fail-closed contract for deferred WebDAV/S3-compatible transports.
- [DEVELOPMENT/image-inspector-architecture.md](DEVELOPMENT/image-inspector-architecture.md) — Image Inspector ingestion, IPC, structured analysis, error and privacy contracts.
- [design/MEDIA_STUDIO.md](design/MEDIA_STUDIO.md) — Media Studio command center actions, visual diffs, and lineage trees.

### Threat Models & Security

- [security/ST_CARD_IMPORT_THREAT_MODEL.md](security/ST_CARD_IMPORT_THREAT_MODEL.md) — Card/PNG/IPC/AI trust boundaries and logging rules.
- [security/security-model.md](security/security-model.md) — Credential, IPC, safety, and portable-data boundaries.
- [security/sync-threat-model.md](security/sync-threat-model.md) — Attacker model and mitigations for untrusted sync folders.

### Internationalization

- [i18n/GLOSSARY.md](i18n/GLOSSARY.md) — Internationalization terminology glossary.
- [i18n/translation-status.json](i18n/translation-status.json) — Machine-readable structural, runtime-surface, and linguistic-review metadata (schema v4).
- [i18n/native-review-status.json](i18n/native-review-status.json) — Per-locale qualified-review state and production-completion input.
- [i18n/review-pack/README.md](i18n/review-pack/README.md) — Native-language review pack instructions, inventory, and per-locale checklists (VF-20260918-P3-020 / VF-20260922-P2-009).

### Release & Legal

- [release/SIGNED_ARTIFACT_EVIDENCE.md](release/SIGNED_ARTIFACT_EVIDENCE.md) — Cryptographic verification hashes of released binaries.
- [release/repository-settings.md](release/repository-settings.md) — GitHub environments and branch protections.
- [release/ST_CARD_STUDIO_MIGRATION.md](release/ST_CARD_STUDIO_MIGRATION.md) — Character schema, draft, import/export, sync, and compatibility migration notes.
- [legal/PRIVACY.md](legal/PRIVACY.md) — Detailed technical privacy and local credential storage model.
- [legal/DISCLAIMER.md](legal/DISCLAIMER.md) — Liability exclusions and warranty waivers.
- [legal/NOTICE.md](legal/NOTICE.md) — Copyright attributions and third-party notices.
- [legal/THIRD_PARTY_NOTICES.md](legal/THIRD_PARTY_NOTICES.md) — Dependency licenses and brand attributions.
- [legal/TRADEMARKS.md](legal/TRADEMARKS.md) — Venice.ai and external trademark nominative-use notices.
- [../assets/branding/NOTICE.md](../assets/branding/NOTICE.md) (and [`../public/assets/branding/NOTICE.md`](../public/assets/branding/NOTICE.md)) — Venice.ai brand kit property notice and usage guidelines.

### Source Code Contracts

- [`../src/shared/chatMediaReferenceContracts.ts`](../src/shared/chatMediaReferenceContracts.ts) — Canonical `ChatMediaReference` parity contract between renderer and main.
- [`../src/shared/promptLimits.ts`](../src/shared/promptLimits.ts) — Unicode code-point budgets and dynamic-limit helper.
- [`../inactive-features/research-browser/README.md`](../inactive-features/research-browser/README.md) — Inactive archive boundary for the former embedded Research Browser.
- [`../inactive-features/research-browser/docs/research-browser.md`](../inactive-features/research-browser/docs/research-browser.md) — Architecture reference for the former embedded Research Browser.

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
- [design/CHAT_DESIGN_SYSTEM_REFRESH_2026-09-13.md](design/CHAT_DESIGN_SYSTEM_REFRESH_2026-09-13.md) — 2026-09-13 chat + design-system refresh: "Quietly confident" direction, type scale + container widths + surface-elevation aliases, new `IconButton` / `Pill` / `Toolbar` / `Card` / `EmptyState` primitives, and chat-surface refinement plan (system + chat + shell scope).
- [ui-modernization/UI_MODERNIZATION_REPORT.md](ui-modernization/UI_MODERNIZATION_REPORT.md) — Full UI modernization report, visual systems overhaul, and implementation summary.
- [ui-modernization/DESIGN_SYSTEM.md](ui-modernization/DESIGN_SYSTEM.md) — Comprehensive Venice Forge design system: visual foundations, component primitives, surface hierarchy, motion, and spacing.
- [ui-modernization/THEME_MIGRATION.md](ui-modernization/THEME_MIGRATION.md) — Theme engine architecture, migration path from V1 to V2, and backwards compatibility guarantees.
- [ui-modernization/VISUAL_QA.md](ui-modernization/VISUAL_QA.md) — Visual QA verification matrix across 44+ built-in themes, light/dark variants, and workspaces.
- [ui-modernization/ACCESSIBILITY_REVIEW.md](ui-modernization/ACCESSIBILITY_REVIEW.md) — WCAG 2.1 AA audit, contrast ratios, keyboard navigation, focus management, and reduced motion testing.
- [ui-modernization/PERFORMANCE_REVIEW.md](ui-modernization/PERFORMANCE_REVIEW.md) — Rendering performance, paint metrics, bundle impact, CSS efficiency, and virtualization review.
- [ui-modernization/IMPLEMENTATION_PLAN.md](ui-modernization/IMPLEMENTATION_PLAN.md) — Implementation plan and task tracking for incremental UI modernization and theme refresh.
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
- [superpowers/plans/2026-09-14-reference-ui-redesign-phase-1.md](superpowers/plans/2026-09-14-reference-ui-redesign-phase-1.md) — Test-first implementation plan for Phase 1 material foundation of the reference-driven UI redesign.
- [superpowers/plans/2026-09-14-design-system-remaining-tabs.md](superpowers/plans/2026-09-14-design-system-remaining-tabs.md) — Test-first implementation plan for the approved Media Studio, Prompt Library, Scene Composer, and Workflow Templates design-system rollout.
- [superpowers/specs/2026-09-01-theme-aware-code-rendering-design.md](superpowers/specs/2026-09-01-theme-aware-code-rendering-design.md) — Design specification for theme-aware syntax highlighting, code-theme tokens, preset registry, and persistence contracts.
- [superpowers/specs/2026-09-14-design-system-remaining-tabs-design.md](superpowers/specs/2026-09-14-design-system-remaining-tabs-design.md) — Approved surgical rollout of the September 13 design-system primitives across Media Studio, Prompt Library, Scene Composer, and Workflow Templates.
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
- [DEVELOPMENT/agents/AGENT_REINITIALIZATION.md](DEVELOPMENT/agents/AGENT_REINITIALIZATION.md) — Agent re-initialization protocol.
- [DEVELOPMENT/BUG_HUNTING_AGENT_PROMPT.md](DEVELOPMENT/BUG_HUNTING_AGENT_PROMPT.md) — Reusable bug-hunt and exhaustive security audit agent system prompt template.
- [../scripts/dev-tools/README.md](../scripts/dev-tools/README.md) — Internal development-tool inventory.

---

## Project Governance

### Roadmap & Session Handoff

- [ROADMAP.md](ROADMAP.md) — Canonical current-work-only task ledger.
- [summary_of_work.md](summary_of_work.md) — Active session handoff ledger.

### Audit Evidence

- [audits/Records/venice-forge-hqe-audit-2026-09-14/README.md](audits/Records/venice-forge-hqe-audit-2026-09-14/README.md) — **Latest.** 2026-09-14 canonical HQE Protocol v5.0.0 codebase health audit across 1,951+ tracked files (baseline `c2279276`). Overall Health Score: 8/10 (Solid). Remediated and verified sidebar pointer drag persistence regression (`HQE-BUG-001`). Identified release gate blocker on missing i18n placeholders (`HQE-DOC-001`). All test suites (unit, electron, contracts, UI, ingestion, workflow, character cards) 100% green. See `HQE_FINDINGS.json`, `HQE_RUN_MANIFEST.json`, `RISK_REGISTER.md`, `REMEDIATION_PLAN.md`.
- [audits/README.md](audits/README.md) — Audit directory policy: active work orders in `TODO/`, immutable evidence in `Records/`.
- [audits/Records/VENICE_API_2026-09-16_FEATURE_GAP_AGENT_HANDOFF.md](audits/Records/VENICE_API_2026-09-16_FEATURE_GAP_AGENT_HANDOFF.md) — Venice API feature-gap work order (moved to `Records/` after the 2026-09-16/17 phased tranches shipped on `main`); cited by `docs/ROADMAP.md` and current source comments.
- [audits/Records/VENICE_FORGE_CURRENT_MAIN_DEEP_AUDIT_AGENT_HANDOFF_2026-09-16.md](audits/Records/VENICE_FORGE_CURRENT_MAIN_DEEP_AUDIT_AGENT_HANDOFF_2026-09-16.md) — 2026-09-16 current-main deep-audit handoff (moved to `Records/` after six of seven findings closed on `0dcd97a3`); P2-007 remains a separate headed-a11y release task tracked in `docs/ROADMAP.md`.
- [audits/Records/VENICE_FORGE_CURRENT_MAIN_EXHAUSTIVE_REVIEW_AGENT_HANDOFF_2026-09-18.md](audits/Records/VENICE_FORGE_CURRENT_MAIN_EXHAUSTIVE_REVIEW_AGENT_HANDOFF_2026-09-18.md) — 2026-09-18 current-`main` exhaustive review and remediation handoff (closed 2026-09-18, published `main` HEAD `b0f9f6a5`). All 18 actionable findings (`P0-001`, `P1-002..006`, `P2-007..015`, `P2-017`, `P3-018..019`) shipped in commits `07222274` through `ee6ade04`; remaining `P2-016` headed visual/accessibility QA and `P3-020` qualified native-language review require external human acceptance and are tracked in `docs/ROADMAP.md`.
- [audits/Records/VENICE_FORGE_CURRENT_MAIN_DEEP_AUDIT_AGENT_HANDOFF_2026-09-14.md](audits/Records/VENICE_FORGE_CURRENT_MAIN_DEEP_AUDIT_AGENT_HANDOFF_2026-09-14.md) — 2026-09-14 current-main deep-audit handoff (replaces the archived `venice-forge-exhaustive-audit-2026-09-13` package). Source-of-truth remediation work order; tracked in `docs/ROADMAP.md` under `VF-AUD-20260916-CURRENT-MAIN`.
- [audits/Records/venice-forge-exhaustive-audit-2026-09-12-c6d9bed/README.md](audits/Records/venice-forge-exhaustive-audit-2026-09-12-c6d9bed/README.md) — 2026-09-12/13 audit of `main` @ `c6d9bed3` (post-remediation). All local validation green; re-verified all prior 13 P1 fixes. Remediated and verified on hosted CI in `067dca58` / `2f67268`. See `EXECUTIVE_SUMMARY.md`, `FINDINGS.md`, `CI_REVIEW.md`, `RUNTIME_TEST_RESULTS.md`.
- [audits/Records/venice-forge-exhaustive-audit-2026-09-12/README.md](audits/Records/venice-forge-exhaustive-audit-2026-09-12/README.md) — 2026-09-12 exhaustive multi-agent audit package (SHA `c1aa891b`). Re-verification confirms 19/19 prior findings (4 P1, 6 P2, 5 P3, 2 DR, 3 TG) and 7 re-pass findings (N1..N7) fully remediated, verified, committed, and published to `main`. See `FINDINGS.md`, `VALIDATION_RESULTS.md`, and `summary_of_work.md`.
- [audits/Records/venice-forge-exhaustive-audit-2026-09-12-current-main/README.md](audits/Records/venice-forge-exhaustive-audit-2026-09-12-current-main/README.md) — 2026-09-12 independent re-audit of current `main` (`84cf5bbe`, v3.0.0-beta.3). Original package identifies 55 findings (0 P0, 13 P1, 20 P2, 22 P3). Same-day remediation closed all 13 P1s and the confirmed P2/P3s listed in `REMEDIATION_STATUS.md` (re-verified at `c6d9bed3` by the `c6d9bed` audit, except its SEC-P3-004 claim superseded by that package's P1). See `EXECUTIVE_SUMMARY.md`, `FINDINGS.md`, `VALIDATION_RESULTS.md`, and `summary_of_work.md`.
- [audits/Records/venice-forge-exhaustive-audit-2026-09-11/README.md](audits/Records/venice-forge-exhaustive-audit-2026-09-11/README.md) — 2026-09-11 current-worktree audit, six resolved follow-up findings, and local/package validation evidence for baseline SHA `c3ae21af`. External acceptance remains in `ROADMAP.md`.
- [audits/Records/venice-forge-exhaustive-audit-2026-09-10/README.md](audits/Records/venice-forge-exhaustive-audit-2026-09-10/README.md) — 2026-09-10 exhaustive current-`main` audit package (SHA `c3ae21af`). Evidence only; remaining work is in `ROADMAP.md`.
- [audits/Records/repository-hygiene-audit.md](audits/Records/repository-hygiene-audit.md) — 2026-09-01 repository hygiene inventory and keep/remove rationale.
- [audits/Records/repository-hygiene-final-report.md](audits/Records/repository-hygiene-final-report.md) — 2026-09-01 hygiene execution report.
- [audits/Records/Function_calling_todo.md](audits/Records/Function_calling_todo.md) — Implementation/acceptance specification referenced by roadmap; not a checkbox ledger.
- [audits/Records/Venice_Forge_Video_Research_Browser_Remediation_Work_Order.md](audits/Records/Venice_Forge_Video_Research_Browser_Remediation_Work_Order.md) — Historical work order for the inactive research-browser feature.
- [audits/repo-management/README.md](audits/repo-management/README.md) — Historical repository hygiene and reorganization handoffs.
- [audits/repo-management/2026-08-22-exhaustive-repository-audit-plan.md](audits/repo-management/2026-08-22-exhaustive-repository-audit-plan.md) — August 2026 repository-wide audit plan and execution method.
- [audits/repo-management/2026-08-22-repository-hygiene-handoff.md](audits/repo-management/2026-08-22-repository-hygiene-handoff.md) — August 2026 repository reorganization and hygiene handoff.

### Repository Maintenance & Hygiene

- [repository-maintenance/README.md](repository-maintenance/README.md) — Current repository organization, hygiene report, and move/deletion manifests; the latest revalidation is anchored to the checked-out `main` state.
- [repository-maintenance/REPOSITORY_HYGIENE_REPORT.md](repository-maintenance/REPOSITORY_HYGIENE_REPORT.md) — Comprehensive repository hygiene audit, policy enforcement, and validation evidence.
- [repository-maintenance/FILE_MOVE_MANIFEST.md](repository-maintenance/FILE_MOVE_MANIFEST.md) — Complete file move and rename manifest with backwards-compatibility notes.
- [repository-maintenance/DELETION_MANIFEST.md](repository-maintenance/DELETION_MANIFEST.md) — Exhaustive deletion and un-tracking manifest with rationale.

### Historical Reports

- [reports/README.md](reports/README.md) — Validation and audit report policy and governance.
- [reports/historical/README.md](reports/historical/README.md) — Guideline for audit history and historical report rules.
- [reports/historical/remediation-report-2026-09-01.md](reports/historical/remediation-report-2026-09-01.md) — 2026-09-01 Code Health, Performance & Security Remediation Report.
- [reports/historical/CANONICAL_REPORT_INDEX.md](reports/historical/CANONICAL_REPORT_INDEX.md) — Navigator for past validation audits.
- [reports/historical/VENICE_FORGE_POST_AUGUST_24_AUDIT_REPORT.md](reports/historical/VENICE_FORGE_POST_AUGUST_24_AUDIT_REPORT.md) — 2026-08-25 Post-August-24 provider-update audit and remediation report.
- [reports/historical/FINAL_AUDIT_REMEDIATION_REPORT_2026-08-26.md](reports/historical/FINAL_AUDIT_REMEDIATION_REPORT_2026-08-26.md) — 2026-08-26 Current-main CI repair, exhaustive repository audit, and remediation report.
- [reports/historical/MEDIA_PREVIEW_TRAFFIC_INSPECTOR_REMEDIATION_REPORT_2026-07-26.md](reports/historical/MEDIA_PREVIEW_TRAFFIC_INSPECTOR_REMEDIATION_REPORT_2026-07-26.md) — 2026-07-26 Traffic Inspector emitter wiring remediation report.
- [reports/historical/MEDIA_SAVE_PIPELINE_AUDIT_2026-07-28.md](reports/historical/MEDIA_SAVE_PIPELINE_AUDIT_2026-07-28.md) — 2026-07-28 Media Studio Save As pipeline audit report.
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
