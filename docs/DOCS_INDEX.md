# Venice Forge Documentation Index

This is the canonical source-of-truth navigation map for all documentation in this repository.

---

## 1. Start Here

- [README.md](../README.md) — The main user-facing repository landing page and setup guide.
- [ABOUT.md](ABOUT.md) — Product goals, architecture, data flow, and overview of tabs.
- [FAQ.md](FAQ.md) — Frequently asked questions about privacy, credentials, safety, storage, and character-card compatibility.
- [SUPPORT.md](SUPPORT.md) — Where to get help, how to request features, and what info to provide.

---

## 2. User Docs

- [ABOUT.md](ABOUT.md) — Comprehensive overview of features, tabs, and local-first goals.
- [FAQ.md](FAQ.md) — Answers on local key custody, safety modes, storage, and ST Card Studio import/export behavior.
- [SUPPORT.md](SUPPORT.md) — User support guidelines.
- [LEGAL.md](../LEGAL.md) — Root legal notice, copyright statement, and trademark disclaimers.
- [PRIVACY.md](../PRIVACY.md) — User privacy model summary.

---

## 3. Developer Docs

- [CONTRIBUTING.md](../CONTRIBUTING.md) — Branch conventions, validation commands, and PR checklist.
- [AGENTS.md](../AGENTS.md) — Crucial guidance for AI coding agents and session handoffs.
- [CLAUDE.md](../CLAUDE.md) — Pointer to AGENTS.md for Anthropic agents.
- [GEMINI.md](../GEMINI.md) — Pointer to AGENTS.md for Gemini agents.
- [DEVELOPMENT/building.md](DEVELOPMENT/building.md) — Local building, compilation, and packaging.
- [DEVELOPMENT/troubleshooting.md](DEVELOPMENT/troubleshooting.md) — Solutions for common dev environment or build failures.
- [DEVELOPMENT/platform-support.md](DEVELOPMENT/platform-support.md) — Desktop OS compatibility matrices.
- [DEVELOPMENT/macos.md](DEVELOPMENT/macos.md) — macOS-specific development, permissions, signing, and troubleshooting notes.
- [DEVELOPMENT/CONFIG.md](DEVELOPMENT/CONFIG.md) — Local YAML configuration options and secure key import.
- [DEVELOPMENT/storage-policy.md](DEVELOPMENT/storage-policy.md) — IndexedDB storage configuration, encryption, and folder layouts.
- [DEVELOPMENT/BRIDGE.md](DEVELOPMENT/BRIDGE.md) — Headless loopback bridge specifications.
- [DEVELOPMENT/JINA_PROVIDER.md](DEVELOPMENT/JINA_PROVIDER.md) — Jina-backed search and scrape integrations.
- [DEVELOPMENT/research-browser.md](DEVELOPMENT/research-browser.md) — Electron WebContentsView boundary model, CSPs, and headed smoke checklist.
- [chat-model-selection.md](chat-model-selection.md) — Per-conversation model precedence, provider defaults, and fallback reconciliation.
- [memory-isolation.md](memory-isolation.md) — Conversation-scoped memory retrieval, exclusions, and preview lifecycle.
- [rp-token-counting.md](rp-token-counting.md) — Compiled prompt estimates and over-budget save behavior.
- [DEVELOPMENT/image-model-capabilities.md](DEVELOPMENT/image-model-capabilities.md) — Image model capability registry, Seedream model reference, and guide for adding future models.
- [developer/CHARACTER_CARD_CODEC.md](developer/CHARACTER_CARD_CODEC.md) — Trusted Character Card V2 PNG codec, limits, and verification contract.
- [developer/CHARACTER_CARD_MAPPINGS.md](developer/CHARACTER_CARD_MAPPINGS.md) — Tavern/V2 DTO, internal card, and character-book mappings.
- [data-export-format.md](data-export-format.md) — Authenticated `.vfbackup` envelope, portability, and compatibility contract.
- [../scripts/dev-tools/README.md](../scripts/dev-tools/README.md) — Internal development-tool inventory; non-user-facing and noncanonical for product behavior.

---

## 4. Architecture / Design Docs

- [design/THEME_SYSTEM.md](design/THEME_SYSTEM.md) — Theme variables, contrast checking, and custom YAML palette integration.
- [design/DESIGN.md](design/DESIGN.md) — Current product design principles and interaction guidance.
- [design/VENICE_UI_EXTRACTION.md](design/VENICE_UI_EXTRACTION.md) — Internal UI extraction/reference notes; implementation remains authoritative.
- [design/LOADING_AND_SURFACE_CONTRACT.md](design/LOADING_AND_SURFACE_CONTRACT.md) — Semantic loading, reduced-motion, mesh structure, and interactive-border rules.
- [design/CHARACTER_RP.md](design/CHARACTER_RP.md) — Local Character RP architecture and memory boundaries.
- [design/ST_CARD_STUDIO.md](design/ST_CARD_STUDIO.md) — ST Card Studio compatibility decisions, trust boundaries, integration inventory, and phase gates.
- [reference/CHARACTER_CARD_V2_COMPATIBILITY.md](reference/CHARACTER_CARD_V2_COMPATIBILITY.md) — Supported formats, mappings, limits, and runtime semantics.
- [security/ST_CARD_IMPORT_THREAT_MODEL.md](security/ST_CARD_IMPORT_THREAT_MODEL.md) — Card/PNG/IPC/AI trust boundaries and logging rules.
- [user/ST_CARD_STUDIO.md](user/ST_CARD_STUDIO.md) — Import, editing, draft, chat, and export guide.
- [developer/CHARACTER_CARD_CODEC.md](developer/CHARACTER_CARD_CODEC.md) — Main-process PNG codec contract.
- [developer/CHARACTER_CARD_MAPPINGS.md](developer/CHARACTER_CARD_MAPPINGS.md) — External/internal and character-book mappings.
- [testing/CHARACTER_CARD_FIXTURES.md](testing/CHARACTER_CARD_FIXTURES.md) — Synthetic fixture policy and validation commands.
- [design/MEDIA_STUDIO.md](design/MEDIA_STUDIO.md) — Media Studio command center actions, visual diffs, and lineage trees.
- [design/MEMORY.md](design/MEMORY.md) — Semantic memory store structure and injection disclosures.
- [design/LOREBOOKS.md](design/LOREBOOKS.md) — Lorebook JSON formats and key trigger injection.
- [design/SCENE_GENERATION.md](design/SCENE_GENERATION.md) — Dynamic scene-generation rules and background asset maps.
- [design/PUBLIC_PROFILE_DISCOVERY.md](design/PUBLIC_PROFILE_DISCOVERY.md) — platform-specific site query logic.
- [design/REPOSITORY_TREE.md](design/REPOSITORY_TREE.md) — Detailed codebase design layout.
- [backup-and-sync.md](backup-and-sync.md) — Manual encrypted backups and encrypted sync-folder operation.
- [FILE_TREE.md](FILE_TREE.md) — Practical file tree of the actual directories.
- [reference/Venice_api_LLM_info.md](reference/Venice_api_LLM_info.md) — Venice-provided LLM integration reference.
- [reference/seedance-2-0-api-guide.md](reference/seedance-2-0-api-guide.md) — Seedance video API reference.
- [reference/seedance-face-consent-api-guide.md](reference/seedance-face-consent-api-guide.md) — Seedance face-consent API reference and boundary notes.

---

## 5. Security / Privacy / Legal Docs

- [SECURITY.md](../SECURITY.md) — Vulnerability reporting policy, encryption algorithms, and suppression lists.
- [PRIVACY.md](../PRIVACY.md) — User-facing privacy summary.
- [LEGAL.md](../LEGAL.md) — Public legal notices and unofficial client disclaimers.
- [legal/PRIVACY.md](legal/PRIVACY.md) — Detailed technical privacy and local credential storage model.
- [legal/DISCLAIMER.md](legal/DISCLAIMER.md) — Liability exclusions and warranty waivers.
- [legal/NOTICE.md](legal/NOTICE.md) — Copyright attributions and third-party notices.
- [legal/THIRD_PARTY_NOTICES.md](legal/THIRD_PARTY_NOTICES.md) — Dependency licenses and brand attributions.
- [legal/TRADEMARKS.md](legal/TRADEMARKS.md) — Venice.ai and external trademark nominative-use notices.
- [security-model.md](security-model.md) — Credential, IPC, safety, and portable-data boundaries.
- [sync-threat-model.md](sync-threat-model.md) — Attacker model and mitigations for untrusted sync folders.
- [privacy.md](privacy.md) — User privacy implications of encrypted backup and third-party-managed sync folders.
- [sync-troubleshooting.md](sync-troubleshooting.md) — Safe recovery, passphrase-loss, conflict, and two-device troubleshooting.
- [DEVELOPMENT/sync-architecture.md](DEVELOPMENT/sync-architecture.md) — Main/renderer trust boundary, packet lifecycle, conflicts, tombstones, and recovery.
- [DEVELOPMENT/sync-testing.md](DEVELOPMENT/sync-testing.md) — Automated fixtures and two-device manual QA protocol.
- [DEVELOPMENT/sync-provider-interface.md](DEVELOPMENT/sync-provider-interface.md) — Fail-closed contract for deferred WebDAV/S3-compatible transports.
- [DEVELOPMENT/testing.md](DEVELOPMENT/testing.md) — Named test shards, measured durations, and regression escalation bounds.
- [DEVELOPMENT/performance-baselines.md](DEVELOPMENT/performance-baselines.md) — Bundle/render profiling matrix required before monolith refactors.

---

## 6. Release Docs

- [RELEASE/release.md](RELEASE/release.md) — Release requirements, versioning, and publishing checklist.
- [RELEASE/signing-and-notarization.md](RELEASE/signing-and-notarization.md) — Certificate setups and macOS app quarantine workarounds.
- [RELEASE/repository-settings.md](RELEASE/repository-settings.md) — GitHub environments and branch protections.
- [RELEASE/SIGNED_ARTIFACT_EVIDENCE.md](RELEASE/SIGNED_ARTIFACT_EVIDENCE.md) — Cryptographic verification hashes of released binaries.
- [RELEASE/ST_CARD_STUDIO_MIGRATION.md](RELEASE/ST_CARD_STUDIO_MIGRATION.md) — Character schema, draft, import/export, sync, and compatibility migration notes.

---

## 7. Roadmap / Current Work

- [ROADMAP.md](ROADMAP.md) — Canonical current-work-only task ledger; closed work and historical validation stay in the session ledger and historical reports.
- [summary_of_work.md](summary_of_work.md) — Active session ledger (recent sessions only).
- [audits/Venice_Forge-audit-results-20260716-224749/AUDIT_REPORT.md](audits/Venice_Forge-audit-results-20260716-224749/AUDIT_REPORT.md) — July 16 22:47 snapshot audit input; remediated live status remains in `ROADMAP.md` and `summary_of_work.md`.

---

## 8. Historical Reports

- [reports/README.md](reports/README.md) — Guideline explaining audit history and historical report rules.
- [reports/CANONICAL_REPORT_INDEX.md](reports/CANONICAL_REPORT_INDEX.md) — Navigator for past validation audits.
- [archives/README.md](archives/README.md) — Archive policy and non-authoritative historical-material boundary.
- [reports/INTENDED_FEATURE_VERIFICATION_2026-07-15.md](reports/INTENDED_FEATURE_VERIFICATION_2026-07-15.md) — Historical snapshot reconciliation of the supplied intended-feature checklist.
- [reports/MEDIA_CHARACTER_REMEDIATION_REPORT.md](reports/MEDIA_CHARACTER_REMEDIATION_REPORT.md) — Historical 2026-07-12/13 media/character implementation evidence.
- [reports/VIDEO_GALLERY_CHARACTER_CHATS_UI_SURFACE_REMEDIATION_REPORT.md](reports/VIDEO_GALLERY_CHARACTER_CHATS_UI_SURFACE_REMEDIATION_REPORT.md) — Historical 2026-07-15 video, Character Chats, and UI evidence.
- [reports/historical/final-massive-bug-hunt-with-proof.md](reports/historical/final-massive-bug-hunt-with-proof.md) — Historical audit log of closed validation checks from the v2.1.0 release boundary.

---

## 9. Retired / Deleted During Hygiene

Internal-only agent material such as `docs/BUG_HUNTING_AGENT_PROMPT.md` is intentionally excluded from the canonical user/developer graph; it is not an instruction authority and must not override `AGENTS.md`, `ROADMAP.md`, or this index.

The following files were removed, merged, or archived during the repository-wide documentation hygiene pass:
- `docs/audits/repository-todo-roadmap-current.md` — Merged into the clean [ROADMAP.md](ROADMAP.md).
- `docs/audits/research-browser-plan.md` — Merged into [DEVELOPMENT/research-browser.md](DEVELOPMENT/research-browser.md).
- `docs/audits/CHANGELOG.md` — Removed as a duplicate history ledger; current work is recorded in [summary_of_work.md](summary_of_work.md).
- `docs/audits/exhaustive-bug-hunt-2026-06-19.md` — Removed as superseded historical evidence; current findings remain in the canonical roadmap and audit index.
- `docs/LEGAL.md` — Deleted as a duplicate of the root [LEGAL.md](../LEGAL.md).
- `docs/archives/VENICE_FORGE_TODO.md` — Superseded by the new [ROADMAP.md](ROADMAP.md).
- `docs/archives/VENICE_FORGE_ZIP_AUDIT_HANDOFF.md` — Superseded by [summary_of_work.md](summary_of_work.md).
- `scratch/` — Directory added to `.gitignore` and all transient agent notes removed.
- Historical stub files under `docs/reports/historical/` (including `AUDIT_FOLLOWUP_2026_06_05.md`, `BUG_HUNT_REVIEW.md`, `CI_FAILURE_AND_BUG_HUNT_2026_06_09.md`, `DOCS_CANONICALIZATION_AND_STALE_PRUNE.md`, `EXHAUSTIVE_REPO_SCAN_TODO.md`, `FINAL_MASSIVE_BUG_HUNT_WITH_PROOF.md`, `HQE_AUDIT_REPORT.md`, `POST_VENICE_JINA_AUDIT_2026_06_06.md`, `SWARM_AUDIT_2026_06_09.md`) — Deleted as they were redundant 207-byte redirect stubs.
