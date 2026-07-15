# Venice Forge Documentation Index

This is the canonical source-of-truth navigation map for all documentation in this repository.

---

## 1. Start Here

- [README.md](../README.md) — The main user-facing repository landing page and setup guide.
- [ABOUT.md](ABOUT.md) — Product goals, architecture, data flow, and overview of tabs.
- [FAQ.md](FAQ.md) — Frequently asked questions about privacy, credentials, safety, and compatibility.
- [SUPPORT.md](SUPPORT.md) — Where to get help, how to request features, and what info to provide.

---

## 2. User Docs

- [ABOUT.md](ABOUT.md) — Comprehensive overview of features, tabs, and local-first goals.
- [FAQ.md](FAQ.md) — Answers to questions on local key custody, safety modes, and configurations.
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
- [DEVELOPMENT/CONFIG.md](DEVELOPMENT/CONFIG.md) — Local YAML configuration options and secure key import.
- [DEVELOPMENT/storage-policy.md](DEVELOPMENT/storage-policy.md) — IndexedDB storage configuration, encryption, and folder layouts.
- [DEVELOPMENT/BRIDGE.md](DEVELOPMENT/BRIDGE.md) — Headless loopback bridge specifications.
- [DEVELOPMENT/JINA_PROVIDER.md](DEVELOPMENT/JINA_PROVIDER.md) — Jina-backed search and scrape integrations.
- [DEVELOPMENT/research-browser.md](DEVELOPMENT/research-browser.md) — Electron WebContentsView boundary model, CSPs, and headed smoke checklist.
- [chat-model-selection.md](chat-model-selection.md) — Per-conversation model precedence, provider defaults, and fallback reconciliation.
- [memory-isolation.md](memory-isolation.md) — Conversation-scoped memory retrieval, exclusions, and preview lifecycle.
- [rp-token-counting.md](rp-token-counting.md) — Compiled prompt estimates and over-budget save behavior.
- [DEVELOPMENT/image-model-capabilities.md](DEVELOPMENT/image-model-capabilities.md) — Image model capability registry, Seedream model reference, and guide for adding future models.

---

## 4. Architecture / Design Docs

- [design/THEME_SYSTEM.md](design/THEME_SYSTEM.md) — Theme variables, contrast checking, and custom YAML palette integration.
- [design/CHARACTER_RP.md](design/CHARACTER_RP.md) — Local Character RP architecture and memory boundaries.
- [design/MEDIA_STUDIO.md](design/MEDIA_STUDIO.md) — Media Studio command center actions, visual diffs, and lineage trees.
- [design/MEMORY.md](design/MEMORY.md) — Semantic memory store structure and injection disclosures.
- [design/LOREBOOKS.md](design/LOREBOOKS.md) — Lorebook JSON formats and key trigger injection.
- [design/SCENE_GENERATION.md](design/SCENE_GENERATION.md) — Dynamic scene-generation rules and background asset maps.
- [design/PUBLIC_PROFILE_DISCOVERY.md](design/PUBLIC_PROFILE_DISCOVERY.md) — platform-specific site query logic.
- [design/REPOSITORY_TREE.md](design/REPOSITORY_TREE.md) — Detailed codebase design layout.
- [backup-and-sync.md](backup-and-sync.md) — Manual encrypted backups and encrypted sync-folder operation.
- [FILE_TREE.md](FILE_TREE.md) — Practical file tree of the actual directories.

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

---

## 6. Release Docs

- [RELEASE/release.md](RELEASE/release.md) — Release requirements, versioning, and publishing checklist.
- [RELEASE/signing-and-notarization.md](RELEASE/signing-and-notarization.md) — Certificate setups and macOS app quarantine workarounds.
- [RELEASE/repository-settings.md](RELEASE/repository-settings.md) — GitHub environments and branch protections.
- [RELEASE/SIGNED_ARTIFACT_EVIDENCE.md](RELEASE/SIGNED_ARTIFACT_EVIDENCE.md) — Cryptographic verification hashes of released binaries.

---

## 7. Roadmap / Current Work

- [ROADMAP.md](ROADMAP.md) — Canonical current-work-only task ledger; closed work and historical validation stay in the session ledger and historical reports.
- [summary_of_work.md](summary_of_work.md) — Active session ledger (recent sessions only).
- [audits/VENICE_FORGE_SCAN_EVIDENCE_2026-07-14/VENICE_FORGE_EXTENSIVE_SCAN_2026-07-14.md](audits/VENICE_FORGE_SCAN_EVIDENCE_2026-07-14/VENICE_FORGE_EXTENSIVE_SCAN_2026-07-14.md) — Retained scan of the July 14 clean ZIP; snapshot evidence only. Live unfinished work is reconciled into `ROADMAP.md`.
- [audits/VENICE_FORGE_REPOSITORY_AUDIT_2026-07-15/00-executive-summary.md](audits/VENICE_FORGE_REPOSITORY_AUDIT_2026-07-15/00-executive-summary.md) — Current comprehensive repository-audit evidence package; open work is reconciled into `ROADMAP.md`, not maintained independently here.
- [archives/session-history-pre-2026-07-11.md](archives/session-history-pre-2026-07-11.md) — Archived dated session records.

---

## 8. Historical Reports

- [reports/README.md](reports/README.md) — Guideline explaining audit history and historical report rules.
- [reports/CANONICAL_REPORT_INDEX.md](reports/CANONICAL_REPORT_INDEX.md) — Navigator for past validation audits.
- [reports/INTENDED_FEATURE_VERIFICATION_2026-07-15.md](reports/INTENDED_FEATURE_VERIFICATION_2026-07-15.md) — Current evidence-backed reconciliation of the supplied 2,719-item intended-feature checklist; authoritative for the open verification findings in `ROADMAP.md`.
- [reports/MEDIA_CHARACTER_REMEDIATION_REPORT.md](reports/MEDIA_CHARACTER_REMEDIATION_REPORT.md) — Current implementation evidence, validation results, and explicit follow-up risks for the 2026-07-12 media/character remediation.
- [reports/VIDEO_GALLERY_CHARACTER_CHATS_UI_SURFACE_REMEDIATION_REPORT.md](reports/VIDEO_GALLERY_CHARACTER_CHATS_UI_SURFACE_REMEDIATION_REPORT.md) — Current evidence for signed-video download hardening, dedicated Character Chats navigation, and mesh-surface validation.
- [reports/historical/final-massive-bug-hunt-with-proof.md](reports/historical/final-massive-bug-hunt-with-proof.md) — Historical audit log of closed validation checks from the v2.1.0 release boundary.

---

## 9. Retired / Deleted During Hygiene

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
