# File Audit Ledger

Generated from tracked files at audit commit `bc5c1737` on 2026-08-15. This ledger distinguishes semantic source review from mechanical/generated or binary inspection; it does not represent binary assets as line-reviewable source.

## Coverage summary

| Metric | Count |
|---|---:|
| Tracked files | 1685 |
| Substantive tracked artifacts | 1434 |
| Non-substantive generated/reference/binary artifacts | 251 |

| Category | Files |
|---|---:|
| asset/binary | 30 |
| configuration/CI | 62 |
| documentation | 164 |
| generated/reference | 146 |
| historical evidence | 75 |
| repository support | 66 |
| source | 678 |
| test | 464 |

## Method

All tracked artifacts were enumerated. Substantive code was covered by syntax-aware compiler/lint execution, full unit/integration/UI test execution, high-risk-pattern searches, and semantic call-path tracing for API, IPC, persistence, security, streaming, retry, media, and job boundaries. Tests and broad gates are supporting evidence, not substitutes for the semantic traces recorded in the findings. Generated catalogs, the OpenAPI snapshot, and lockfiles were validated through their canonical generators/verifiers; binary assets received inventory and metadata review.

## Per-file ledger

| Path | Category | Substantive | Review method | Disposition |
|---|---|---|---|---|
| `.config/config.example.yaml` | repository support | yes | inventory + semantic/config review | Tracked non-binary repository artifact |
| `.config/themes.example.yaml` | repository support | yes | inventory + semantic/config review | Tracked non-binary repository artifact |
| `.cursorrules` | repository support | yes | inventory + semantic/config review | Tracked non-binary repository artifact |
| `.env.example` | repository support | yes | inventory + semantic/config review | Tracked non-binary repository artifact |
| `.gitattributes` | repository support | yes | inventory + semantic/config review | Tracked non-binary repository artifact |
| `.github/CODEOWNERS` | configuration/CI | yes | semantic configuration review + repository gates | Checked against scripts, runtime, and release boundaries |
| `.github/ISSUE_TEMPLATE/bug_report.md` | configuration/CI | yes | semantic configuration review + repository gates | Checked against scripts, runtime, and release boundaries |
| `.github/ISSUE_TEMPLATE/config.yml` | configuration/CI | yes | semantic configuration review + repository gates | Checked against scripts, runtime, and release boundaries |
| `.github/ISSUE_TEMPLATE/feature_request.md` | configuration/CI | yes | semantic configuration review + repository gates | Checked against scripts, runtime, and release boundaries |
| `.github/copilot-instructions.md` | configuration/CI | yes | semantic configuration review + repository gates | Checked against scripts, runtime, and release boundaries |
| `.github/dependabot.yml` | configuration/CI | yes | semantic configuration review + repository gates | Checked against scripts, runtime, and release boundaries |
| `.github/pull_request_template.md` | configuration/CI | yes | semantic configuration review + repository gates | Checked against scripts, runtime, and release boundaries |
| `.github/workflows/ci.yml` | configuration/CI | yes | semantic configuration review + repository gates | Checked against scripts, runtime, and release boundaries |
| `.github/workflows/codeql.yml` | configuration/CI | yes | semantic configuration review + repository gates | Checked against scripts, runtime, and release boundaries |
| `.github/workflows/dependency-review.yml` | configuration/CI | yes | semantic configuration review + repository gates | Checked against scripts, runtime, and release boundaries |
| `.github/workflows/release.yml` | configuration/CI | yes | semantic configuration review + repository gates | Checked against scripts, runtime, and release boundaries |
| `.gitignore` | repository support | yes | inventory + semantic/config review | Tracked non-binary repository artifact |
| `.nvmrc` | repository support | yes | inventory + semantic/config review | Tracked non-binary repository artifact |
| `.vscode/settings.json` | repository support | yes | inventory + semantic/config review | Tracked non-binary repository artifact |
| `.windsurfrules` | repository support | yes | inventory + semantic/config review | Tracked non-binary repository artifact |
| `AGENTS.md` | repository support | yes | inventory + semantic/config review | Tracked non-binary repository artifact |
| `AGENT_REINITIALIZATION.md` | repository support | yes | inventory + semantic/config review | Tracked non-binary repository artifact |
| `CLAUDE.md` | repository support | yes | inventory + semantic/config review | Tracked non-binary repository artifact |
| `CODE_OF_CONDUCT.md` | repository support | yes | inventory + semantic/config review | Tracked non-binary repository artifact |
| `CONTRIBUTING.md` | repository support | yes | inventory + semantic/config review | Tracked non-binary repository artifact |
| `GEMINI.md` | repository support | yes | inventory + semantic/config review | Tracked non-binary repository artifact |
| `LEGAL.md` | repository support | yes | inventory + semantic/config review | Tracked non-binary repository artifact |
| `LICENSE` | repository support | yes | inventory + semantic/config review | Tracked non-binary repository artifact |
| `PRIVACY.md` | repository support | yes | inventory + semantic/config review | Tracked non-binary repository artifact |
| `PRODUCT.md` | repository support | yes | inventory + semantic/config review | Tracked non-binary repository artifact |
| `README.md` | repository support | yes | inventory + semantic/config review | Tracked non-binary repository artifact |
| `SECURITY.md` | repository support | yes | inventory + semantic/config review | Tracked non-binary repository artifact |
| `SUPPORT.md` | repository support | yes | inventory + semantic/config review | Tracked non-binary repository artifact |
| `assets/ReadMe_Preview.png` | asset/binary | no | inventory + metadata review | Binary content; semantic line review not applicable |
| `assets/branding/NOTICE.md` | repository support | yes | inventory + semantic/config review | Tracked non-binary repository artifact |
| `assets/branding/venice-keys-black.svg` | repository support | yes | inventory + semantic/config review | Tracked non-binary repository artifact |
| `assets/branding/venice-keys-red.svg` | repository support | yes | inventory + semantic/config review | Tracked non-binary repository artifact |
| `assets/branding/venice-keys-white.svg` | repository support | yes | inventory + semantic/config review | Tracked non-binary repository artifact |
| `assets/branding/venice-logo-lockup-black.svg` | repository support | yes | inventory + semantic/config review | Tracked non-binary repository artifact |
| `assets/branding/venice-logo-lockup-red.svg` | repository support | yes | inventory + semantic/config review | Tracked non-binary repository artifact |
| `assets/branding/venice-logo-lockup-white.svg` | repository support | yes | inventory + semantic/config review | Tracked non-binary repository artifact |
| `assets/branding/venice-seal-red-fill.svg` | repository support | yes | inventory + semantic/config review | Tracked non-binary repository artifact |
| `assets/branding/venice-wordmark-black.svg` | repository support | yes | inventory + semantic/config review | Tracked non-binary repository artifact |
| `assets/branding/venice-wordmark-red.svg` | repository support | yes | inventory + semantic/config review | Tracked non-binary repository artifact |
| `assets/branding/venice-wordmark-white.svg` | repository support | yes | inventory + semantic/config review | Tracked non-binary repository artifact |
| `assets/mio-xc3-nerdprofeta-gifs/mio-xc3-nerdprofeta-failed-static.png` | asset/binary | no | inventory + metadata review | Binary content; semantic line review not applicable |
| `assets/mio-xc3-nerdprofeta-gifs/mio-xc3-nerdprofeta-failed.gif` | asset/binary | no | inventory + metadata review | Binary content; semantic line review not applicable |
| `assets/mio-xc3-nerdprofeta-gifs/mio-xc3-nerdprofeta-idle-static.png` | asset/binary | no | inventory + metadata review | Binary content; semantic line review not applicable |
| `assets/mio-xc3-nerdprofeta-gifs/mio-xc3-nerdprofeta-idle.gif` | asset/binary | no | inventory + metadata review | Binary content; semantic line review not applicable |
| `assets/mio-xc3-nerdprofeta-gifs/mio-xc3-nerdprofeta-jumping-static.png` | asset/binary | no | inventory + metadata review | Binary content; semantic line review not applicable |
| `assets/mio-xc3-nerdprofeta-gifs/mio-xc3-nerdprofeta-jumping.gif` | asset/binary | no | inventory + metadata review | Binary content; semantic line review not applicable |
| `assets/mio-xc3-nerdprofeta-gifs/mio-xc3-nerdprofeta-look-left-side-static.png` | asset/binary | no | inventory + metadata review | Binary content; semantic line review not applicable |
| `assets/mio-xc3-nerdprofeta-gifs/mio-xc3-nerdprofeta-look-left-side.gif` | asset/binary | no | inventory + metadata review | Binary content; semantic line review not applicable |
| `assets/mio-xc3-nerdprofeta-gifs/mio-xc3-nerdprofeta-look-right-side-static.png` | asset/binary | no | inventory + metadata review | Binary content; semantic line review not applicable |
| `assets/mio-xc3-nerdprofeta-gifs/mio-xc3-nerdprofeta-look-right-side.gif` | asset/binary | no | inventory + metadata review | Binary content; semantic line review not applicable |
| `assets/mio-xc3-nerdprofeta-gifs/mio-xc3-nerdprofeta-review-static.png` | asset/binary | no | inventory + metadata review | Binary content; semantic line review not applicable |
| `assets/mio-xc3-nerdprofeta-gifs/mio-xc3-nerdprofeta-review.gif` | asset/binary | no | inventory + metadata review | Binary content; semantic line review not applicable |
| `assets/mio-xc3-nerdprofeta-gifs/mio-xc3-nerdprofeta-running-left-static.png` | asset/binary | no | inventory + metadata review | Binary content; semantic line review not applicable |
| `assets/mio-xc3-nerdprofeta-gifs/mio-xc3-nerdprofeta-running-left.gif` | asset/binary | no | inventory + metadata review | Binary content; semantic line review not applicable |
| `assets/mio-xc3-nerdprofeta-gifs/mio-xc3-nerdprofeta-running-right-static.png` | asset/binary | no | inventory + metadata review | Binary content; semantic line review not applicable |
| `assets/mio-xc3-nerdprofeta-gifs/mio-xc3-nerdprofeta-running-right.gif` | asset/binary | no | inventory + metadata review | Binary content; semantic line review not applicable |
| `assets/mio-xc3-nerdprofeta-gifs/mio-xc3-nerdprofeta-running-static.png` | asset/binary | no | inventory + metadata review | Binary content; semantic line review not applicable |
| `assets/mio-xc3-nerdprofeta-gifs/mio-xc3-nerdprofeta-running.gif` | asset/binary | no | inventory + metadata review | Binary content; semantic line review not applicable |
| `assets/mio-xc3-nerdprofeta-gifs/mio-xc3-nerdprofeta-waiting-static.png` | asset/binary | no | inventory + metadata review | Binary content; semantic line review not applicable |
| `assets/mio-xc3-nerdprofeta-gifs/mio-xc3-nerdprofeta-waiting.gif` | asset/binary | no | inventory + metadata review | Binary content; semantic line review not applicable |
| `assets/mio-xc3-nerdprofeta-gifs/mio-xc3-nerdprofeta-waving-static.png` | asset/binary | no | inventory + metadata review | Binary content; semantic line review not applicable |
| `assets/mio-xc3-nerdprofeta-gifs/mio-xc3-nerdprofeta-waving.gif` | asset/binary | no | inventory + metadata review | Binary content; semantic line review not applicable |
| `build/icon.icns` | asset/binary | no | inventory + metadata review | Binary content; semantic line review not applicable |
| `build/icon.ico` | asset/binary | no | inventory + metadata review | Binary content; semantic line review not applicable |
| `build/icon.png` | asset/binary | no | inventory + metadata review | Binary content; semantic line review not applicable |
| `config/i18n-hardcoded-baseline.json` | configuration/CI | yes | semantic configuration review + repository gates | Checked against scripts, runtime, and release boundaries |
| `config/prompt-language-audit.json` | configuration/CI | yes | semantic configuration review + repository gates | Checked against scripts, runtime, and release boundaries |
| `config/themes/amber-archive.yaml` | configuration/CI | yes | semantic configuration review + repository gates | Checked against scripts, runtime, and release boundaries |
| `config/themes/arctic-glass.yaml` | configuration/CI | yes | semantic configuration review + repository gates | Checked against scripts, runtime, and release boundaries |
| `config/themes/aurora-boreal.yaml` | configuration/CI | yes | semantic configuration review + repository gates | Checked against scripts, runtime, and release boundaries |
| `config/themes/basalt-noir.yaml` | configuration/CI | yes | semantic configuration review + repository gates | Checked against scripts, runtime, and release boundaries |
| `config/themes/catppuccin.yaml` | configuration/CI | yes | semantic configuration review + repository gates | Checked against scripts, runtime, and release boundaries |
| `config/themes/circuit-mint.yaml` | configuration/CI | yes | semantic configuration review + repository gates | Checked against scripts, runtime, and release boundaries |
| `config/themes/copper.yaml` | configuration/CI | yes | semantic configuration review + repository gates | Checked against scripts, runtime, and release boundaries |
| `config/themes/cotton-candy-console.yaml` | configuration/CI | yes | semantic configuration review + repository gates | Checked against scripts, runtime, and release boundaries |
| `config/themes/cyber-orchid.yaml` | configuration/CI | yes | semantic configuration review + repository gates | Checked against scripts, runtime, and release boundaries |
| `config/themes/dark.yaml` | configuration/CI | yes | semantic configuration review + repository gates | Checked against scripts, runtime, and release boundaries |
| `config/themes/desert-copperfield.yaml` | configuration/CI | yes | semantic configuration review + repository gates | Checked against scripts, runtime, and release boundaries |
| `config/themes/dracula.yaml` | configuration/CI | yes | semantic configuration review + repository gates | Checked against scripts, runtime, and release boundaries |
| `config/themes/dual-persona.yaml` | configuration/CI | yes | semantic configuration review + repository gates | Checked against scripts, runtime, and release boundaries |
| `config/themes/ember-monastery.yaml` | configuration/CI | yes | semantic configuration review + repository gates | Checked against scripts, runtime, and release boundaries |
| `config/themes/example.theme.yaml` | configuration/CI | yes | semantic configuration review + repository gates | Checked against scripts, runtime, and release boundaries |
| `config/themes/github_light.yaml` | configuration/CI | yes | semantic configuration review + repository gates | Checked against scripts, runtime, and release boundaries |
| `config/themes/glacial-ink.yaml` | configuration/CI | yes | semantic configuration review + repository gates | Checked against scripts, runtime, and release boundaries |
| `config/themes/gruvbox_dark.yaml` | configuration/CI | yes | semantic configuration review + repository gates | Checked against scripts, runtime, and release boundaries |
| `config/themes/harbor-fog.yaml` | configuration/CI | yes | semantic configuration review + repository gates | Checked against scripts, runtime, and release boundaries |
| `config/themes/light.yaml` | configuration/CI | yes | semantic configuration review + repository gates | Checked against scripts, runtime, and release boundaries |
| `config/themes/midnight-velvet.yaml` | configuration/CI | yes | semantic configuration review + repository gates | Checked against scripts, runtime, and release boundaries |
| `config/themes/monokai.yaml` | configuration/CI | yes | semantic configuration review + repository gates | Checked against scripts, runtime, and release boundaries |
| `config/themes/moss-circuit.yaml` | configuration/CI | yes | semantic configuration review + repository gates | Checked against scripts, runtime, and release boundaries |
| `config/themes/neon-dusk.yaml` | configuration/CI | yes | semantic configuration review + repository gates | Checked against scripts, runtime, and release boundaries |
| `config/themes/nord.yaml` | configuration/CI | yes | semantic configuration review + repository gates | Checked against scripts, runtime, and release boundaries |
| `config/themes/obsidian-bloom.yaml` | configuration/CI | yes | semantic configuration review + repository gates | Checked against scripts, runtime, and release boundaries |
| `config/themes/one_dark.yaml` | configuration/CI | yes | semantic configuration review + repository gates | Checked against scripts, runtime, and release boundaries |
| `config/themes/polaroid-board.yaml` | configuration/CI | yes | semantic configuration review + repository gates | Checked against scripts, runtime, and release boundaries |
| `config/themes/porcelain-daybreak.yaml` | configuration/CI | yes | semantic configuration review + repository gates | Checked against scripts, runtime, and release boundaries |
| `config/themes/rosepine.yaml` | configuration/CI | yes | semantic configuration review + repository gates | Checked against scripts, runtime, and release boundaries |
| `config/themes/sakura-terminal.yaml` | configuration/CI | yes | semantic configuration review + repository gates | Checked against scripts, runtime, and release boundaries |
| `config/themes/solar-ash.yaml` | configuration/CI | yes | semantic configuration review + repository gates | Checked against scripts, runtime, and release boundaries |
| `config/themes/solarized_dark.yaml` | configuration/CI | yes | semantic configuration review + repository gates | Checked against scripts, runtime, and release boundaries |
| `config/themes/solarized_light.yaml` | configuration/CI | yes | semantic configuration review + repository gates | Checked against scripts, runtime, and release boundaries |
| `config/themes/sweet-nightmare.yaml` | configuration/CI | yes | semantic configuration review + repository gates | Checked against scripts, runtime, and release boundaries |
| `config/themes/synthwave-harbor.yaml` | configuration/CI | yes | semantic configuration review + repository gates | Checked against scripts, runtime, and release boundaries |
| `config/themes/tokyo_night.yaml` | configuration/CI | yes | semantic configuration review + repository gates | Checked against scripts, runtime, and release boundaries |
| `config/themes/toxic-limewire.yaml` | configuration/CI | yes | semantic configuration review + repository gates | Checked against scripts, runtime, and release boundaries |
| `config/themes/ultraviolet-rain.yaml` | configuration/CI | yes | semantic configuration review + repository gates | Checked against scripts, runtime, and release boundaries |
| `config/themes/venice.yaml` | configuration/CI | yes | semantic configuration review + repository gates | Checked against scripts, runtime, and release boundaries |
| `docs/ABOUT.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/BUG_HUNTING_AGENT_PROMPT.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/DEVELOPMENT/BRIDGE.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/DEVELOPMENT/CONFIG.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/DEVELOPMENT/JINA_PROVIDER.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/DEVELOPMENT/building.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/DEVELOPMENT/i18n-tooling.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/DEVELOPMENT/image-model-capabilities.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/DEVELOPMENT/macos.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/DEVELOPMENT/performance-baselines.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/DEVELOPMENT/platform-support.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/DEVELOPMENT/storage-policy.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/DEVELOPMENT/sync-architecture.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/DEVELOPMENT/sync-provider-interface.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/DEVELOPMENT/sync-testing.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/DEVELOPMENT/testing.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/DEVELOPMENT/troubleshooting.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/DOCS_INDEX.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/FAQ.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/FILE_TREE.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/RELEASE/SIGNED_ARTIFACT_EVIDENCE.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/RELEASE/ST_CARD_STUDIO_MIGRATION.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/RELEASE/release.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/RELEASE/repository-settings.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/RELEASE/signing-and-notarization.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/ROADMAP.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/SUPPORT.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/archives/README.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/archives/session-history-pre-2026-07-11.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/audits/Records/CHANGELOG.md` | historical evidence | no | inventory + authority reconciliation | Immutable historical evidence; not current product behavior |
| `docs/audits/Records/Function_calling_todo.md` | historical evidence | no | inventory + authority reconciliation | Immutable historical evidence; not current product behavior |
| `docs/audits/Records/MULTILINGUAL_PROMPT_LANGUAGE_AUDIT.md` | historical evidence | no | inventory + authority reconciliation | Immutable historical evidence; not current product behavior |
| `docs/audits/Records/RESEARCH_PROVIDERS.md` | historical evidence | no | inventory + authority reconciliation | Immutable historical evidence; not current product behavior |
| `docs/audits/Records/VENICE_FORGE_FULL_IMPLEMENTATION_AUDIT_2026-07-25.md` | historical evidence | no | inventory + authority reconciliation | Immutable historical evidence; not current product behavior |
| `docs/audits/Records/VENICE_FORGE_FULL_IMPLEMENTATION_FINDINGS_2026-07-25.json` | historical evidence | no | inventory + authority reconciliation | Immutable historical evidence; not current product behavior |
| `docs/audits/Records/VENICE_FORGE_MASTER_COMPLETION_WORK_ORDER_2026-07-25.md` | historical evidence | no | inventory + authority reconciliation | Immutable historical evidence; not current product behavior |
| `docs/audits/Records/VF-I18N-REMEDIATION-FOUNDATION-2026-07-26.md` | historical evidence | no | inventory + authority reconciliation | Immutable historical evidence; not current product behavior |
| `docs/audits/Records/Venice_Forge-audit-evidence-20260717-031029/EVIDENCE_MANIFEST.md` | historical evidence | no | inventory + authority reconciliation | Immutable historical evidence; not current product behavior |
| `docs/audits/Records/Venice_Forge_Deep_Scan_2026-07-16.md` | historical evidence | no | inventory + authority reconciliation | Immutable historical evidence; not current product behavior |
| `docs/audits/Records/Venice_Forge_Deep_Scan_2026-07-16_IMPLEMENTATION_TODO.md` | historical evidence | no | inventory + authority reconciliation | Immutable historical evidence; not current product behavior |
| `docs/audits/Records/Venice_Forge_Deep_Scan_2026-07-16_REMEDIATION_REPORT.md` | historical evidence | no | inventory + authority reconciliation | Immutable historical evidence; not current product behavior |
| `docs/audits/Records/Venice_Forge_Extensive_Scan_2026-07-22.md` | historical evidence | no | inventory + authority reconciliation | Immutable historical evidence; not current product behavior |
| `docs/audits/Records/Venice_Forge_Findings_2026-07-22.json` | historical evidence | no | inventory + authority reconciliation | Immutable historical evidence; not current product behavior |
| `docs/audits/Records/Venice_Forge_Full_Repository_Audit_2026-07-18/00-repository-state.md` | historical evidence | no | inventory + authority reconciliation | Immutable historical evidence; not current product behavior |
| `docs/audits/Records/Venice_Forge_Full_Repository_Audit_2026-07-18/01-file-inventory.md` | historical evidence | no | inventory + authority reconciliation | Immutable historical evidence; not current product behavior |
| `docs/audits/Records/Venice_Forge_Full_Repository_Audit_2026-07-18/02-documentation-audit.md` | historical evidence | no | inventory + authority reconciliation | Immutable historical evidence; not current product behavior |
| `docs/audits/Records/Venice_Forge_Full_Repository_Audit_2026-07-18/03-duplicate-and-stale-artifact-audit.md` | historical evidence | no | inventory + authority reconciliation | Immutable historical evidence; not current product behavior |
| `docs/audits/Records/Venice_Forge_Full_Repository_Audit_2026-07-18/04-feature-implementation-matrix.md` | historical evidence | no | inventory + authority reconciliation | Immutable historical evidence; not current product behavior |
| `docs/audits/Records/Venice_Forge_Full_Repository_Audit_2026-07-18/05-bug-findings.md` | historical evidence | no | inventory + authority reconciliation | Immutable historical evidence; not current product behavior |
| `docs/audits/Records/Venice_Forge_Full_Repository_Audit_2026-07-18/06-api-contract-audit.md` | historical evidence | no | inventory + authority reconciliation | Immutable historical evidence; not current product behavior |
| `docs/audits/Records/Venice_Forge_Full_Repository_Audit_2026-07-18/07-security-boundary-audit.md` | historical evidence | no | inventory + authority reconciliation | Immutable historical evidence; not current product behavior |
| `docs/audits/Records/Venice_Forge_Full_Repository_Audit_2026-07-18/08-test-and-ci-audit.md` | historical evidence | no | inventory + authority reconciliation | Immutable historical evidence; not current product behavior |
| `docs/audits/Records/Venice_Forge_Full_Repository_Audit_2026-07-18/09-packaging-and-release-audit.md` | historical evidence | no | inventory + authority reconciliation | Immutable historical evidence; not current product behavior |
| `docs/audits/Records/Venice_Forge_Full_Repository_Audit_2026-07-18/10-remediation-backlog.md` | historical evidence | no | inventory + authority reconciliation | Immutable historical evidence; not current product behavior |
| `docs/audits/Records/Venice_Forge_Full_Repository_Audit_2026-07-18/11-implementation-log.md` | historical evidence | no | inventory + authority reconciliation | Immutable historical evidence; not current product behavior |
| `docs/audits/Records/Venice_Forge_Full_Repository_Audit_2026-07-18/12-final-report.md` | historical evidence | no | inventory + authority reconciliation | Immutable historical evidence; not current product behavior |
| `docs/audits/Records/Venice_Forge_Most_Recent_Change_Audit_2026-07-20/00-scope-and-methodology.md` | historical evidence | no | inventory + authority reconciliation | Immutable historical evidence; not current product behavior |
| `docs/audits/Records/Venice_Forge_Most_Recent_Change_Audit_2026-07-20/01-repository-state.md` | historical evidence | no | inventory + authority reconciliation | Immutable historical evidence; not current product behavior |
| `docs/audits/Records/Venice_Forge_Most_Recent_Change_Audit_2026-07-20/02-most-recent-change-map.md` | historical evidence | no | inventory + authority reconciliation | Immutable historical evidence; not current product behavior |
| `docs/audits/Records/Venice_Forge_Most_Recent_Change_Audit_2026-07-20/03-agent-file-audit.md` | historical evidence | no | inventory + authority reconciliation | Immutable historical evidence; not current product behavior |
| `docs/audits/Records/Venice_Forge_Most_Recent_Change_Audit_2026-07-20/04-work-order-reconciliation.md` | historical evidence | no | inventory + authority reconciliation | Immutable historical evidence; not current product behavior |
| `docs/audits/Records/Venice_Forge_Most_Recent_Change_Audit_2026-07-20/05-feature-status-matrix.md` | historical evidence | no | inventory + authority reconciliation | Immutable historical evidence; not current product behavior |
| `docs/audits/Records/Venice_Forge_Most_Recent_Change_Audit_2026-07-20/06-findings.md` | historical evidence | no | inventory + authority reconciliation | Immutable historical evidence; not current product behavior |
| `docs/audits/Records/Venice_Forge_Most_Recent_Change_Audit_2026-07-20/07-validation-results.md` | historical evidence | no | inventory + authority reconciliation | Immutable historical evidence; not current product behavior |
| `docs/audits/Records/Venice_Forge_Most_Recent_Change_Audit_2026-07-20/08-document-and-archive-integrity.md` | historical evidence | no | inventory + authority reconciliation | Immutable historical evidence; not current product behavior |
| `docs/audits/Records/Venice_Forge_Most_Recent_Change_Audit_2026-07-20/09-final-report.md` | historical evidence | no | inventory + authority reconciliation | Immutable historical evidence; not current product behavior |
| `docs/audits/Records/Venice_Forge_Most_Recent_Change_Audit_2026-07-20/EVIDENCE_MANIFEST.json` | historical evidence | no | inventory + authority reconciliation | Immutable historical evidence; not current product behavior |
| `docs/audits/Records/Venice_Forge_Video_Research_Browser_Remediation_Work_Order.md` | historical evidence | no | inventory + authority reconciliation | Immutable historical evidence; not current product behavior |
| `docs/audits/Records/agent-repair-status-2026-06-16.yaml` | historical evidence | no | inventory + authority reconciliation | Immutable historical evidence; not current product behavior |
| `docs/audits/Records/bug-cross-reference-v2.1.0.md` | historical evidence | no | inventory + authority reconciliation | Immutable historical evidence; not current product behavior |
| `docs/audits/Records/cross-check-T001-T030-2026-06-15.yaml` | historical evidence | no | inventory + authority reconciliation | Immutable historical evidence; not current product behavior |
| `docs/audits/Records/docstrings-and-coverage-baseline.md` | historical evidence | no | inventory + authority reconciliation | Immutable historical evidence; not current product behavior |
| `docs/audits/Records/docstrings-and-coverage-final.md` | historical evidence | no | inventory + authority reconciliation | Immutable historical evidence; not current product behavior |
| `docs/audits/Records/document-ingestion-plan.md` | historical evidence | no | inventory + authority reconciliation | Immutable historical evidence; not current product behavior |
| `docs/audits/Records/exhaustive-bug-hunt-2026-06-19.md` | historical evidence | no | inventory + authority reconciliation | Immutable historical evidence; not current product behavior |
| `docs/audits/Records/exhaustive_repository_file_audit_2026-07-14.yaml` | historical evidence | no | inventory + authority reconciliation | Immutable historical evidence; not current product behavior |
| `docs/audits/Records/kimi-batch-evidence-2026-06-16.yaml` | historical evidence | no | inventory + authority reconciliation | Immutable historical evidence; not current product behavior |
| `docs/audits/Records/p0-closure-evidence-2026-06-16.yaml` | historical evidence | no | inventory + authority reconciliation | Immutable historical evidence; not current product behavior |
| `docs/audits/Records/release_safety_gate_2026-06-19.md` | historical evidence | no | inventory + authority reconciliation | Immutable historical evidence; not current product behavior |
| `docs/audits/Records/security-quality-static-audit-2026-06-19.md` | historical evidence | no | inventory + authority reconciliation | Immutable historical evidence; not current product behavior |
| `docs/audits/Records/work-orders-2026-06-15.yaml` | historical evidence | no | inventory + authority reconciliation | Immutable historical evidence; not current product behavior |
| `docs/backup-and-sync.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/chat-model-selection.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/data-export-format.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/design/CHARACTER_RP.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/design/DESIGN.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/design/LOADING_AND_SURFACE_CONTRACT.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/design/LOREBOOKS.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/design/MEDIA_STUDIO.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/design/MEMORY.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/design/PUBLIC_PROFILE_DISCOVERY.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/design/REPOSITORY_TREE.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/design/SCENE_GENERATION.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/design/ST_CARD_STUDIO.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/design/THEME_SYSTEM.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/design/VENICE_UI_EXTRACTION.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/developer/CHARACTER_CARD_CODEC.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/developer/CHARACTER_CARD_MAPPINGS.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/developer/image-inspector-architecture.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/discovery/DISCOVERY_DOCUMENT_AGENT.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/features/DOCUMENT_AGENT.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/i18n/GLOSSARY.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/i18n/TRANSLATION_GUIDE.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/i18n/ar/ABOUT.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/i18n/ar/CONTRIBUTING.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/i18n/ar/FAQ.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/i18n/ar/PRIVACY.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/i18n/ar/README.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/i18n/ar/SECURITY.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/i18n/ar/SUPPORT.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/i18n/de/ABOUT.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/i18n/de/CONTRIBUTING.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/i18n/de/FAQ.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/i18n/de/PRIVACY.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/i18n/de/README.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/i18n/de/SECURITY.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/i18n/de/SUPPORT.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/i18n/es/ABOUT.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/i18n/es/CONTRIBUTING.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/i18n/es/FAQ.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/i18n/es/PRIVACY.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/i18n/es/README.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/i18n/es/SECURITY.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/i18n/es/SUPPORT.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/i18n/fr/ABOUT.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/i18n/fr/CONTRIBUTING.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/i18n/fr/FAQ.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/i18n/fr/PRIVACY.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/i18n/fr/README.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/i18n/fr/SECURITY.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/i18n/fr/SUPPORT.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/i18n/hi/ABOUT.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/i18n/hi/CONTRIBUTING.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/i18n/hi/FAQ.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/i18n/hi/PRIVACY.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/i18n/hi/README.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/i18n/hi/SECURITY.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/i18n/hi/SUPPORT.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/i18n/identical-value-allowlist.json` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/i18n/ja/ABOUT.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/i18n/ja/CONTRIBUTING.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/i18n/ja/FAQ.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/i18n/ja/PRIVACY.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/i18n/ja/README.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/i18n/ja/SECURITY.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/i18n/ja/SUPPORT.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/i18n/ko/ABOUT.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/i18n/ko/CONTRIBUTING.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/i18n/ko/FAQ.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/i18n/ko/PRIVACY.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/i18n/ko/README.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/i18n/ko/SECURITY.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/i18n/ko/SUPPORT.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/i18n/native-review-status.json` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/i18n/pt-BR/ABOUT.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/i18n/pt-BR/CONTRIBUTING.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/i18n/pt-BR/FAQ.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/i18n/pt-BR/PRIVACY.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/i18n/pt-BR/README.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/i18n/pt-BR/SECURITY.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/i18n/pt-BR/SUPPORT.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/i18n/ru/ABOUT.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/i18n/ru/CONTRIBUTING.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/i18n/ru/FAQ.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/i18n/ru/PRIVACY.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/i18n/ru/README.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/i18n/ru/SECURITY.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/i18n/ru/SUPPORT.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/i18n/sv-SE/ABOUT.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/i18n/sv-SE/CONTRIBUTING.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/i18n/sv-SE/FAQ.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/i18n/sv-SE/PRIVACY.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/i18n/sv-SE/README.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/i18n/sv-SE/SECURITY.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/i18n/sv-SE/SUPPORT.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/i18n/translation-status.json` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/i18n/zh-CN/ABOUT.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/i18n/zh-CN/CONTRIBUTING.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/i18n/zh-CN/FAQ.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/i18n/zh-CN/PRIVACY.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/i18n/zh-CN/README.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/i18n/zh-CN/SECURITY.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/i18n/zh-CN/SUPPORT.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/legal/DISCLAIMER.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/legal/NOTICE.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/legal/PRIVACY.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/legal/THIRD_PARTY_NOTICES.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/legal/TRADEMARKS.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/memory-isolation.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/pastel-theme-pack-report.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/privacy.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/reference/CHARACTER_CARD_V2_COMPATIBILITY.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/reference/VENICE_API_SOURCE_MANIFEST.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/reference/VENICE_API_SYSTEM_PROMPT.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/reference/Venice_api_LLM_info.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/reference/Venice_swagger_api.yaml` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `docs/reference/seedance-2-0-api-guide.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/reference/seedance-face-consent-api-guide.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/reports/MEDIA_PREVIEW_TRAFFIC_INSPECTOR_REMEDIATION_REPORT_2026-07-26.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/reports/MEDIA_SAVE_PIPELINE_AUDIT_2026-07-28.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/reports/historical/AUDIT-006-021_VALIDATION_REPORT.md` | historical evidence | no | inventory + authority reconciliation | Immutable historical evidence; not current product behavior |
| `docs/reports/historical/BUG_HUNTING_AGENT_PROMPT.md` | historical evidence | no | inventory + authority reconciliation | Immutable historical evidence; not current product behavior |
| `docs/reports/historical/BUG_HUNT_SUMMARY.md` | historical evidence | no | inventory + authority reconciliation | Immutable historical evidence; not current product behavior |
| `docs/reports/historical/CANONICAL_REPORT_INDEX.md` | historical evidence | no | inventory + authority reconciliation | Immutable historical evidence; not current product behavior |
| `docs/reports/historical/INTENDED_FEATURE_VERIFICATION_2026-07-15.md` | historical evidence | no | inventory + authority reconciliation | Immutable historical evidence; not current product behavior |
| `docs/reports/historical/MEDIA_CHARACTER_REMEDIATION_REPORT.md` | historical evidence | no | inventory + authority reconciliation | Immutable historical evidence; not current product behavior |
| `docs/reports/historical/MINIMAX_M3_I18N_FULL_APP_REMEDIATION_REPORT_2026-07-26.md` | historical evidence | no | inventory + authority reconciliation | Immutable historical evidence; not current product behavior |
| `docs/reports/historical/README.md` | historical evidence | no | inventory + authority reconciliation | Immutable historical evidence; not current product behavior |
| `docs/reports/historical/ROUND2_POST_FIX_BUG_HUNT_WITH_PROOF.md` | historical evidence | no | inventory + authority reconciliation | Immutable historical evidence; not current product behavior |
| `docs/reports/historical/RUNTIME_I18N_FULL_UI_REMEDIATION_REPORT_2026-07-26.md` | historical evidence | no | inventory + authority reconciliation | Immutable historical evidence; not current product behavior |
| `docs/reports/historical/VALIDATION_REPORT_AUDIT_001_080.md` | historical evidence | no | inventory + authority reconciliation | Immutable historical evidence; not current product behavior |
| `docs/reports/historical/VENICE_FORGE_2026-07-20_REMEDIATION_REPORT.md` | historical evidence | no | inventory + authority reconciliation | Immutable historical evidence; not current product behavior |
| `docs/reports/historical/VENICE_FORGE_CHAT_FOLDERS_MEDIA_DOCUMENTS_REPORT_2026-07-19.md` | historical evidence | no | inventory + authority reconciliation | Immutable historical evidence; not current product behavior |
| `docs/reports/historical/VENICE_FORGE_COMPLETION_EXECUTION_2026-07-25.md` | historical evidence | no | inventory + authority reconciliation | Immutable historical evidence; not current product behavior |
| `docs/reports/historical/VENICE_FORGE_IMAGE_REMEDIATION_REPORT_2026-07-25.md` | historical evidence | no | inventory + authority reconciliation | Immutable historical evidence; not current product behavior |
| `docs/reports/historical/VENICE_FORGE_THEME_ENGINE_BORDER_AND_PORTABILITY_AUDIT_2026-07-21.md` | historical evidence | no | inventory + authority reconciliation | Immutable historical evidence; not current product behavior |
| `docs/reports/historical/VENICE_UI_PARITY_REFERENCE.md` | historical evidence | no | inventory + authority reconciliation | Immutable historical evidence; not current product behavior |
| `docs/reports/historical/VIDEO_GALLERY_CHARACTER_CHATS_UI_SURFACE_REMEDIATION_REPORT.md` | historical evidence | no | inventory + authority reconciliation | Immutable historical evidence; not current product behavior |
| `docs/reports/historical/VIDEO_PIPELINE_AND_RESEARCH_BROWSER_DEACTIVATION_2026-07-18.md` | historical evidence | no | inventory + authority reconciliation | Immutable historical evidence; not current product behavior |
| `docs/reports/historical/audit-validation-report-022-051.md` | historical evidence | no | inventory + authority reconciliation | Immutable historical evidence; not current product behavior |
| `docs/reports/historical/audit_report.yaml` | historical evidence | no | inventory + authority reconciliation | Immutable historical evidence; not current product behavior |
| `docs/reports/historical/character-creator-implementation-report.md` | historical evidence | no | inventory + authority reconciliation | Immutable historical evidence; not current product behavior |
| `docs/reports/historical/final-massive-bug-hunt-with-proof.md` | historical evidence | no | inventory + authority reconciliation | Immutable historical evidence; not current product behavior |
| `docs/rp-token-counting.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/security-model.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/security/ST_CARD_IMPORT_THREAT_MODEL.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/summary_of_work.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/superpowers/plans/2026-06-14-character-scene-generation.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/superpowers/plans/2026-06-16-rp-studio-chat-ui-repair.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/superpowers/plans/2026-07-11-release-readiness-work-order.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/superpowers/specs/2026-06-14-add-built-in-themes-design.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/superpowers/specs/2026-06-14-character-scene-generation-design.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/sync-threat-model.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/sync-troubleshooting.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/testing/CHARACTER_CARD_FIXTURES.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/user/IMAGE_INSPECTOR.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/user/ST_CARD_STUDIO.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/work-orders/VENICE_FORGE_CHAT_FOLDERS_MEDIA_DOCUMENTS_2026-07-19.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/work-orders/VF-CHAT-FOLDERS-MEDIA-DOCUMENTS-001-REOPENED.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `docs/work-orders/gamora-black-bolt-power-girl.md` | documentation | yes | semantic documentation review + link validation | Checked for authority, drift, and discoverability |
| `electron-builder.config.cjs` | configuration/CI | yes | semantic configuration review + repository gates | Checked against scripts, runtime, and release boundaries |
| `electron/agent/approvals/approval-coordinator.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `electron/agent/approvals/approval-coordinator.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/agent/audit/document-agent-audit-service.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/agent/documents/attachment-import-service.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `electron/agent/documents/attachment-import-service.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/agent/documents/document-patch-engine.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `electron/agent/documents/document-patch-engine.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/agent/documents/document-serializer-service.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `electron/agent/documents/document-serializer-service.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/agent/documents/managed-document-service.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `electron/agent/documents/managed-document-service.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/agent/policy/workspace-grant-service.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/agent/runtime/agent-services.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/agent/runtime/agent-tool-executor.documents.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `electron/agent/runtime/agent-tool-executor.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `electron/agent/runtime/agent-tool-executor.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/agent/runtime/chat-agent-runner.multiturn.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `electron/agent/runtime/chat-agent-runner.telemetry.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `electron/agent/runtime/chat-agent-runner.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `electron/agent/runtime/chat-agent-runner.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/agent/runtime/trusted-agent-request.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `electron/agent/runtime/trusted-agent-request.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/agent/workspace/path-policy.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `electron/agent/workspace/path-policy.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/agent/workspace/workspace-filesystem-service.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `electron/agent/workspace/workspace-filesystem-service.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/agent/workspace/workspace-mutation-service.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `electron/agent/workspace/workspace-mutation-service.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/ipc/characterCardFileHandlers.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `electron/ipc/characterCardFileHandlers.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/ipc/characterCreatorHandlers.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `electron/ipc/characterCreatorHandlers.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/ipc/configHandlers.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `electron/ipc/configHandlers.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/ipc/handlers.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `electron/ipc/handlers.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/ipc/handlers/apiKeyHandlers.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/ipc/handlers/backgroundTaskHandlers.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `electron/ipc/handlers/backgroundTaskHandlers.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/ipc/handlers/chatFolderHandlers.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `electron/ipc/handlers/chatFolderHandlers.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/ipc/handlers/chatTtsHandlers.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `electron/ipc/handlers/chatTtsHandlers.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/ipc/handlers/common.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/ipc/handlers/documentAgentHandlers.attachments.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `electron/ipc/handlers/documentAgentHandlers.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/ipc/handlers/fileHandlers.generatedMediaExport.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `electron/ipc/handlers/fileHandlers.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/ipc/handlers/imageInspectorHandlers.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `electron/ipc/handlers/imageInspectorHandlers.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/ipc/handlers/index.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/ipc/handlers/inspectorTelemetryHandlers.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `electron/ipc/handlers/inspectorTelemetryHandlers.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/ipc/handlers/jinaHandlers.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `electron/ipc/handlers/jinaHandlers.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/ipc/handlers/registration.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `electron/ipc/handlers/syncHandlers.profile.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `electron/ipc/handlers/syncHandlers.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/ipc/handlers/systemHandlers.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/ipc/handlers/veniceHandlers.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/ipc/rpHandlers.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `electron/ipc/rpHandlers.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/ipc/updates.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `electron/ipc/updates.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/ipc/validation.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `electron/ipc/validation.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/main.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `electron/main.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/preload.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/services/appShutdownCoordinator.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `electron/services/appShutdownCoordinator.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/services/backgroundTaskManager.paidQueue.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `electron/services/backgroundTaskManager.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `electron/services/backgroundTaskManager.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/services/backupCrypto.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `electron/services/backupCrypto.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/services/bridgeServer.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `electron/services/bridgeServer.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/services/characterCardPngCodec.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `electron/services/characterCardPngCodec.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/services/characterCardStorage.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `electron/services/characterCardStorage.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/services/characterImageCache.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `electron/services/characterImageCache.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/services/chatFolderBackupService.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `electron/services/chatFolderBackupService.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/services/chatFolderLockService.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `electron/services/chatFolderLockService.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/services/chatFolderOperationJournal.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `electron/services/chatFolderOperationJournal.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/services/chatFolderService.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `electron/services/chatFolderService.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/services/chatFolderStorage.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `electron/services/chatFolderStorage.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/services/chatStorage.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `electron/services/chatStorage.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/services/chatTtsBridge.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `electron/services/chatTtsBridge.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/services/configService.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `electron/services/configService.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/services/conversationVault.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `electron/services/conversationVault.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/services/conversationWriteQueue.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/services/generatedMediaExport.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `electron/services/generatedMediaExport.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/services/generatedMediaRecoveryQueue.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `electron/services/generatedMediaRecoveryQueue.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/services/generatedMediaStore.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `electron/services/generatedMediaStore.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/services/generatedMediaStream.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `electron/services/generatedMediaStream.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/services/generatedVideoDownload.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `electron/services/generatedVideoDownload.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/services/guardPipeline.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `electron/services/guardPipeline.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/services/imageInspectorInput.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `electron/services/imageInspectorInput.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/services/inspectorTelemetry.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `electron/services/inspectorTelemetry.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/services/logger.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `electron/services/logger.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/services/mediaFormat.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `electron/services/mediaFormat.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/services/mediaService.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `electron/services/mediaService.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/services/memoryPuller.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/services/profilePurge.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `electron/services/profilePurge.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/services/profileSession.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `electron/services/profileSession.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/services/providerAdapters.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `electron/services/providerAdapters.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/services/providerSettingsStore.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `electron/services/providerSettingsStore.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/services/remoteApplyAuthority.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `electron/services/remoteApplyAuthority.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/services/replaceImportRecovery.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `electron/services/replaceImportRecovery.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/services/rpChatStorage.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `electron/services/rpChatStorage.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/services/rpSingleFileStore.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `electron/services/rpSingleFileStore.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/services/rpStores.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/services/runtimeSafetySettings.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/services/secureStore.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `electron/services/secureStore.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/services/syncApplyQueue.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `electron/services/syncApplyQueue.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/services/syncBridge.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `electron/services/syncBridge.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/services/syncCheckpoint.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `electron/services/syncCheckpoint.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/services/syncConfig.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/services/syncFolderWatcher.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `electron/services/syncFolderWatcher.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/services/syncIdentity.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `electron/services/syncIdentity.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/services/syncOutbox.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `electron/services/syncOutbox.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/services/syncRetryQueue.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/services/themeService.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/services/timezoneService.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/services/vaultMigration.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/services/veniceClient.adapters.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `electron/services/veniceClient.error.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `electron/services/veniceClient.multipart.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `electron/services/veniceClient.sseParser.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `electron/services/veniceClient.stream.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `electron/services/veniceClient.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/services/videoRetrieveService.telemetry.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `electron/services/videoRetrieveService.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `electron/services/videoRetrieveService.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/services/windowsCredentialStore.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `electron/services/windowsCredentialStore.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/utils/bridgeHost.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/utils/characterImageCacheProtocol.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `electron/utils/characterImageCacheProtocol.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/utils/customProtocolAccess.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `electron/utils/customProtocolAccess.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/utils/externalLinks.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/utils/navigation.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `electron/utils/navigation.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/utils/rateLimit.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/utils/rendererCsp.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `electron/utils/rendererCsp.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/utils/secureFile.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `electron/utils/secureFile.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `electron/utils/urlSecurity.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `eslint.config.mjs` | configuration/CI | yes | semantic configuration review + repository gates | Checked against scripts, runtime, and release boundaries |
| `inactive-features/research-browser/README.md` | repository support | yes | inventory + semantic/config review | Tracked non-binary repository artifact |
| `inactive-features/research-browser/docs/research-browser.md` | repository support | yes | inventory + semantic/config review | Tracked non-binary repository artifact |
| `inactive-features/research-browser/electron/security/researchBrowserNetworkPolicy.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `inactive-features/research-browser/electron/security/researchBrowserNetworkPolicy.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `inactive-features/research-browser/electron/services/researchBrowserHome.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `inactive-features/research-browser/electron/services/researchBrowserServer.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `inactive-features/research-browser/electron/services/researchBrowserServer.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `inactive-features/research-browser/renderer/components/ResearchBrowserView.test.tsx` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `inactive-features/research-browser/renderer/components/ResearchBrowserView.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `inactive-features/research-browser/renderer/services/researchBrowserBridge.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `inactive-features/research-browser/renderer/shared/urlSecurity.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `inactive-features/research-browser/renderer/types/researchBrowser.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `inactive-features/research-browser/scripts/verify-browser-traffic-contained.cjs` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `inactive-features/research-browser/scripts/verify-research-browser.cjs` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `inactive-features/research-browser/scripts/verify-web-contents-view.cjs` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `inactive-features/research-browser/tests/smoke/research-browser.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `index.html` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `package-lock.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `package-scripts.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `package.json` | configuration/CI | yes | semantic configuration review + repository gates | Checked against scripts, runtime, and release boundaries |
| `public/assets/branding/NOTICE.md` | repository support | yes | inventory + semantic/config review | Tracked non-binary repository artifact |
| `public/assets/branding/venice-keys-black.svg` | repository support | yes | inventory + semantic/config review | Tracked non-binary repository artifact |
| `public/assets/branding/venice-keys-red.svg` | repository support | yes | inventory + semantic/config review | Tracked non-binary repository artifact |
| `public/assets/branding/venice-keys-white.svg` | repository support | yes | inventory + semantic/config review | Tracked non-binary repository artifact |
| `public/assets/branding/venice-logo-lockup-black.svg` | repository support | yes | inventory + semantic/config review | Tracked non-binary repository artifact |
| `public/assets/branding/venice-logo-lockup-red.svg` | repository support | yes | inventory + semantic/config review | Tracked non-binary repository artifact |
| `public/assets/branding/venice-logo-lockup-white.svg` | repository support | yes | inventory + semantic/config review | Tracked non-binary repository artifact |
| `public/assets/branding/venice-seal-red-fill.svg` | repository support | yes | inventory + semantic/config review | Tracked non-binary repository artifact |
| `public/assets/branding/venice-wordmark-black.svg` | repository support | yes | inventory + semantic/config review | Tracked non-binary repository artifact |
| `public/assets/branding/venice-wordmark-red.svg` | repository support | yes | inventory + semantic/config review | Tracked non-binary repository artifact |
| `public/assets/branding/venice-wordmark-white.svg` | repository support | yes | inventory + semantic/config review | Tracked non-binary repository artifact |
| `public/audio/ui/glass/primary-click.ogg` | repository support | yes | inventory + semantic/config review | Tracked non-binary repository artifact |
| `public/audio/ui/glass/secondary-click.ogg` | repository support | yes | inventory + semantic/config review | Tracked non-binary repository artifact |
| `public/audio/ui/glass/toggle-off.ogg` | repository support | yes | inventory + semantic/config review | Tracked non-binary repository artifact |
| `public/audio/ui/glass/toggle-on.ogg` | repository support | yes | inventory + semantic/config review | Tracked non-binary repository artifact |
| `public/audio/ui/minimal/primary-click.ogg` | repository support | yes | inventory + semantic/config review | Tracked non-binary repository artifact |
| `public/audio/ui/minimal/secondary-click.ogg` | repository support | yes | inventory + semantic/config review | Tracked non-binary repository artifact |
| `public/audio/ui/minimal/toggle-off.ogg` | repository support | yes | inventory + semantic/config review | Tracked non-binary repository artifact |
| `public/audio/ui/minimal/toggle-on.ogg` | repository support | yes | inventory + semantic/config review | Tracked non-binary repository artifact |
| `public/audio/ui/retro/primary-click.ogg` | repository support | yes | inventory + semantic/config review | Tracked non-binary repository artifact |
| `public/audio/ui/retro/secondary-click.ogg` | repository support | yes | inventory + semantic/config review | Tracked non-binary repository artifact |
| `public/audio/ui/retro/toggle-off.ogg` | repository support | yes | inventory + semantic/config review | Tracked non-binary repository artifact |
| `public/audio/ui/retro/toggle-on.ogg` | repository support | yes | inventory + semantic/config review | Tracked non-binary repository artifact |
| `public/audio/ui/soft/primary-click.ogg` | repository support | yes | inventory + semantic/config review | Tracked non-binary repository artifact |
| `public/audio/ui/soft/secondary-click.ogg` | repository support | yes | inventory + semantic/config review | Tracked non-binary repository artifact |
| `public/audio/ui/soft/toggle-off.ogg` | repository support | yes | inventory + semantic/config review | Tracked non-binary repository artifact |
| `public/audio/ui/soft/toggle-on.ogg` | repository support | yes | inventory + semantic/config review | Tracked non-binary repository artifact |
| `public/audio/ui/tactile/primary-click.ogg` | repository support | yes | inventory + semantic/config review | Tracked non-binary repository artifact |
| `public/audio/ui/tactile/secondary-click.ogg` | repository support | yes | inventory + semantic/config review | Tracked non-binary repository artifact |
| `public/audio/ui/tactile/toggle-off.ogg` | repository support | yes | inventory + semantic/config review | Tracked non-binary repository artifact |
| `public/audio/ui/tactile/toggle-on.ogg` | repository support | yes | inventory + semantic/config review | Tracked non-binary repository artifact |
| `public/bootstrap-theme.js` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `scripts/bootstrap-theme.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `scripts/build-electron.cjs` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `scripts/capture-release-qa-snapshots.mjs` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `scripts/checksum-release.cjs` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `scripts/checksum-release.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `scripts/clean-repo-zip.sh` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `scripts/create-cjs-package.cjs` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `scripts/dev-tools/README.md` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `scripts/dev-tools/capture-venice-design.mjs` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `scripts/dev-tools/capture-venice-styles.cjs` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `scripts/dynamic-key-manifest.json` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `scripts/extract-i18n-keys.cjs` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `scripts/generate-character-card-fixtures.mjs` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `scripts/generate-docs-i18n.cjs` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `scripts/generate-exhaustive-audit-ledger.cjs` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `scripts/generate-locales.cjs` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `scripts/generate-placeholder-icon.cjs` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `scripts/i18n-locale-status.cjs` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `scripts/i18n-status-isolation.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `scripts/i18n-tooling.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `scripts/init-config.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `scripts/populate-en-us-catalogs.cjs` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `scripts/print-config.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `scripts/profile-media-studio.mjs` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `scripts/profile-media-studio.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `scripts/run-bounded-test-shards.cjs` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `scripts/start-production.cjs` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `scripts/sync-catalogs.cjs` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `scripts/sync-venice-api-docs.cjs` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `scripts/translate-missing.cjs` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `scripts/translate-missing.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `scripts/validate-config.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `scripts/verify-agent-docs.cjs` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `scripts/verify-agent-docs.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `scripts/verify-archive-clean.cjs` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `scripts/verify-archive-clean.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `scripts/verify-backup-sync.cjs` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `scripts/verify-backup-sync.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `scripts/verify-bundle-budget.cjs` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `scripts/verify-character-card-png.cjs` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `scripts/verify-character-card-security.cjs` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `scripts/verify-character-card-v2.cjs` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `scripts/verify-ci-contract.cjs` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `scripts/verify-ci-contract.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `scripts/verify-custom-protocol-privileges.cjs` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `scripts/verify-custom-protocol-privileges.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `scripts/verify-dist.cjs` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `scripts/verify-dist.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `scripts/verify-document-agent.cjs` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `scripts/verify-document-ingestion.cjs` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `scripts/verify-document-ingestion.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `scripts/verify-hardcoded-strings.cjs` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `scripts/verify-hardcoded-strings.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `scripts/verify-i18n.cjs` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `scripts/verify-icon.cjs` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `scripts/verify-image-policy.cjs` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `scripts/verify-inactive-feature-archive.cjs` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `scripts/verify-lockfile.cjs` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `scripts/verify-markdown-links.cjs` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `scripts/verify-markdown-links.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `scripts/verify-media-studio-power-tools.cjs` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `scripts/verify-model-aware-recipes.cjs` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `scripts/verify-network-boundaries.cjs` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `scripts/verify-no-native-dialogs.cjs` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `scripts/verify-prompt-language.cjs` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `scripts/verify-prompt-library.cjs` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `scripts/verify-provider-adapters.cjs` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `scripts/verify-provider-adapters.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `scripts/verify-release-metadata.cjs` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `scripts/verify-release-metadata.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `scripts/verify-release-packaging-hardening.cjs` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `scripts/verify-release-packaging-hardening.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `scripts/verify-repo-handoff-hygiene.cjs` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `scripts/verify-repository-identity.cjs` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `scripts/verify-repository-identity.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `scripts/verify-research-workspace.cjs` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `scripts/verify-roadmap-current.cjs` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `scripts/verify-roadmap-current.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `scripts/verify-rp-studio-polish.cjs` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `scripts/verify-safety-guard.cjs` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `scripts/verify-safety-guard.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `scripts/verify-scene-composer.cjs` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `scripts/verify-scene-references.cjs` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `scripts/verify-stack-facts.cjs` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `scripts/verify-status-diagnostics.cjs` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `scripts/verify-storage-policy.cjs` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `scripts/verify-storage-privacy.cjs` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `scripts/verify-storage-privacy.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `scripts/verify-theme-tokens.cjs` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `scripts/verify-theme-tokens.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `scripts/verify-venice-api-docs.cjs` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `scripts/verify-venice-api-docs.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `scripts/verify-venice-contract-drift.cjs` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `scripts/verify-work-orders.cjs` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `scripts/verify-workflow-templates.cjs` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `server.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `server.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/App.lazy.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/App.navigation.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/App.onboarding.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/App.skip-link.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/App.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/agent/contracts/capabilities.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/agent/contracts/documents.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/agent/contracts/proposals.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/agent/contracts/tool-results.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/agent/contracts/workspace.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/agent/documents/document-source.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/agent/documents/document-source.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/agent/model-capabilities/model-capability-service.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/agent/model-capabilities/model-capability-service.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/agent/policy/capability-policy-engine.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/agent/registry/tool-name-map.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/agent/registry/tool-registry.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/agent/registry/tool-registry.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/assets.d.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/CharactersView.test.tsx` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/components/CharactersView.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/Chip.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/ConfirmModal.test.tsx` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/components/ConfirmModal.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/DiagnosticsPreview.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/ErrorBoundary.test.tsx` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/components/ErrorBoundary.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/Field.test.tsx` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/components/Field.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/FirstRunModal.test.tsx` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/components/FirstRunModal.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/ModelSelect.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/OnboardingSplash.test.tsx` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/components/OnboardingSplash.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/SearchScrapeView.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/SettingsView.test.tsx` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/components/SettingsView.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/StatusView.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/ThemeMaker.custom.test.tsx` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/components/ThemeMaker.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/components/ThemeMaker.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/ThemeMaker.ui.test.tsx` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/components/ThemePreview.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/audio/audio-view.test.tsx` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/components/audio/audio-view.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/character-creator/CharacterCreatorCompleted.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/character-creator/CharacterCreatorDraftEditor.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/character-creator/CharacterCreatorError.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/character-creator/CharacterCreatorGenerating.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/character-creator/CharacterCreatorLocalPickerModal.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/character-creator/CharacterCreatorMascot.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/character-creator/CharacterCreatorProcessPanel.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/character-creator/CharacterCreatorReady.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/character-creator/CharacterCreatorView.test.tsx` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/components/character-creator/CharacterCreatorView.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/character-creator/CharacterCreatorWelcome.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/characters/CharacterAvatar.test.tsx` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/components/characters/CharacterAvatar.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/chat/CharacterChatsView.test.tsx` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/components/chat/CharacterChatsView.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/chat/CharacterSceneCard.test.tsx` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/components/chat/CharacterSceneCard.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/chat/ChatTtsPlayer.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/chat/HistoryView.multiSelect.test.tsx` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/components/chat/HistoryView.test.tsx` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/components/chat/HistoryView.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/chat/StandardChatView.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/chat/chat-input.test.tsx` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/components/chat/chat-input.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/chat/chat-view.test.tsx` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/components/chat/chat-view.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/chat/message-bubble.test.tsx` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/components/chat/message-bubble.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/chat/message-bubble.unicode-copy.test.tsx` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/components/chat/venice-params.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/command-palette/CommandPalette.test.tsx` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/components/command-palette/CommandPalette.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/documents/DocumentAgentView.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/documents/DocumentRenderer.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/documents/ManagedDocumentAttachmentCard.test.tsx` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/components/documents/ManagedDocumentAttachmentCard.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/documents/documentViewHelpers.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/components/documents/documentViewHelpers.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/embeddings/embeddings-view.test.tsx` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/components/embeddings/embeddings-view.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/gallery/compare-view.test.tsx` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/components/gallery/compare-view.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/gallery/gallery-view.test.tsx` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/components/gallery/gallery-view.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/gallery/lineage-viewer.test.tsx` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/components/gallery/lineage-viewer.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/gallery/media-card.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/gallery/media-detail-dialog.test.tsx` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/components/gallery/media-detail-dialog.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/gallery/media-inspector.test.tsx` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/components/gallery/media-inspector.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/gallery/media-toolbar.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/gallery/recipe-comparison.test.tsx` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/components/gallery/recipe-comparison.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/gallery/recipe-compatibility-card.test.tsx` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/components/gallery/recipe-compatibility-card.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/generation/GenerationLoadingIndicator.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/generation/generation-animation-preloader.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/generation/generation-animation-registry.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/generation/generation-animation-state.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/image-inspector/ImageInspectorView.test.tsx` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/components/image-inspector/ImageInspectorView.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/image/image-page.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/image/image-tools.test.tsx` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/components/image/image-tools.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/image/image-view.test.tsx` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/components/image/image-view.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/layout/AppMeshOverlay.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/layout/api-key-dialog.test.tsx` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/components/layout/api-key-dialog.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/layout/header.test.tsx` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/components/layout/header.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/layout/inspector-pane.test.tsx` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/components/layout/inspector-pane.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/layout/memory-panel.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/layout/sidebar.test.tsx` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/components/layout/sidebar.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/media/ManagedVideoPlayer.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/music/music-view.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/components/music/music-view.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/notifications/ProgressToast.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/notifications/ToastItem.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/notifications/ToastProvider.test.tsx` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/components/notifications/ToastProvider.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/notifications/ToastViewport.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/playground/agent-model-picker.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/playground/playground-chat.test.tsx` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/components/playground/playground-chat.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/playground/playground-view.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/playground/preview-node.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/playground/workflow-preview.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/privacy/StoragePrivacyDashboard.test.tsx` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/components/privacy/StoragePrivacyDashboard.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/prompts/PromptCreateModal.test.tsx` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/components/prompts/PromptCreateModal.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/prompts/PromptLibrarySelection.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/components/prompts/PromptLibraryView.test.tsx` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/components/prompts/PromptLibraryView.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/research/ResearchWorkspaceView.test.tsx` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/components/research/ResearchWorkspaceView.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/rp-studio/AssetGallery.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/rp-studio/CharacterBookEditor.test.tsx` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/components/rp-studio/CharacterBookEditor.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/rp-studio/CharacterEditor.test.tsx` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/components/rp-studio/CharacterEditor.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/rp-studio/CharacterLibrary.test.tsx` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/components/rp-studio/CharacterLibrary.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/rp-studio/LorebookManager.test.tsx` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/components/rp-studio/LorebookManager.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/rp-studio/PersonaManager.test.tsx` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/components/rp-studio/PersonaManager.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/rp-studio/PromptDebugDrawer.test.tsx` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/components/rp-studio/PromptDebugDrawer.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/rp-studio/RpChatList.test.tsx` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/components/rp-studio/RpChatList.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/rp-studio/RpChatView.test.tsx` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/components/rp-studio/RpChatView.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/rp-studio/RpStudioView.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/rp-studio/SceneGenerator.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/rp-studio/_shared.test.tsx` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/components/rp-studio/_shared.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/rp-studio/index.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/scenes/SceneComposerView.test.tsx` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/components/scenes/SceneComposerView.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/search/AiResearchTab.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/search/ProfileDiscoveryTab.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/search/ResearchProviderStatus.test.tsx` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/components/search/ResearchProviderStatus.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/search/ResearchWorkspacePanel.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/search/ScrapeTab.test.tsx` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/components/search/ScrapeTab.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/search/SearchScrapeView.test.tsx` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/components/search/SearchScrapeView.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/search/SearchTab.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/search/TextParserTab.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/search/searchScrapeTypes.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/search/searchScrapeUtils.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/settings/AboutPanel.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/settings/ApiKeysPanel.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/settings/AudioSpeechPanel.test.tsx` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/components/settings/AudioSpeechPanel.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/settings/BackupSyncPanel.test.tsx` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/components/settings/BackupSyncPanel.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/settings/ConfigPanel.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/settings/DataStoragePanel.test.tsx` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/components/settings/DataStoragePanel.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/settings/DefaultsPanel.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/settings/ImportPlanModal.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/settings/LanguageRegionPanel.test.tsx` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/components/settings/LanguageRegionPanel.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/settings/MasterPasswordDialog.test.tsx` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/components/settings/MasterPasswordDialog.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/settings/ProfilePanel.test.tsx` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/components/settings/ProfilePanel.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/settings/ProvidersPanel.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/settings/SafetyPanel.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/settings/SettingsView.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/settings/UpdatesPanel.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/settings/types.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/status/DiagnosticsDrawer.test.tsx` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/components/status/DiagnosticsDrawer.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/status/HeaderStatusCluster.test.tsx` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/components/status/HeaderStatusCluster.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/status/StatusIndicator.test.tsx` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/components/status/StatusIndicator.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/status/TaskCenterDrawer.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/ui/AccessibleDialog.test.tsx` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/components/ui/AccessibleDialog.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/ui/ContextMenu.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/ui/Meteocon.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/ui/error-boundary.test.tsx` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/components/ui/error-boundary.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/ui/generation-view.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/ui/logo.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/ui/modal-requests.test.tsx` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/components/ui/modal-requests.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/ui/select.test.tsx` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/components/ui/select.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/ui/shared.i18n.test.tsx` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/components/ui/shared.test.tsx` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/components/ui/shared.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/ui/spinner.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/ui/toaster.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/video/video-view.test.tsx` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/components/video/video-view.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/components/workflows/WorkflowTemplatesView.test.tsx` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/components/workflows/WorkflowTemplatesView.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/config/configSchema.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/config/configSchema.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/config/image-model-capabilities.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/config/image-model-capabilities.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/config/provider-models.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/config/provider-models.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/config/tabs.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/config/tabs.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/constants/character-creator.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/constants/character-creator.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/constants/promptTemplates.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/constants/tts.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/constants/venice.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/constants/venice.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/data/promptStarters.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/hooks/use-agent-models.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/hooks/use-audio.test.tsx` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/hooks/use-audio.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/hooks/use-blob-url.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/hooks/use-chat.attachments.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/hooks/use-chat.character-scene.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/hooks/use-chat.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/hooks/use-chat.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/hooks/use-conflicts.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/hooks/use-conflicts.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/hooks/use-data-storage-actions.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/hooks/use-data-storage-actions.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/hooks/use-embeddings.test.tsx` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/hooks/use-embeddings.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/hooks/use-image-tools.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/hooks/use-image-tools.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/hooks/use-image.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/hooks/use-model-catalog.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/hooks/use-models.test.tsx` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/hooks/use-models.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/hooks/use-music.test.tsx` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/hooks/use-music.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/hooks/use-styles.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/hooks/use-video.test.tsx` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/hooks/use-video.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/hooks/useCharacterImage.test.tsx` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/hooks/useCharacterImage.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/hooks/useFocusTrap.test.tsx` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/hooks/useFocusTrap.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/hooks/useKatexCss.test.tsx` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/hooks/useKatexCss.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/hooks/useMediaThumb.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/hooks/usePrefersReducedMotion.test.tsx` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/hooks/usePrefersReducedMotion.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/hooks/useProfileVolatileReset.test.tsx` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/hooks/useProfileVolatileReset.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/i18n/direction.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/i18n/formatters.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/i18n/i18n.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/i18n/index.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/i18n/locale-completion-status.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/i18n/locale-completion-status.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/i18n/locale-types.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/i18n/locales.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/i18n/resourceNormalizer.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/i18n/resourceNormalizer.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/i18n/resources/ar/accessibility.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/ar/characters.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/ar/chat.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/ar/common.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/ar/documents.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/ar/errors.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/ar/media.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/ar/navigation.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/ar/onboarding.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/ar/research.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/ar/settings.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/ar/workflows.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/de/accessibility.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/de/characters.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/de/chat.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/de/common.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/de/documents.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/de/errors.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/de/media.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/de/navigation.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/de/onboarding.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/de/research.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/de/settings.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/de/workflows.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/en-US/accessibility.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/en-US/characters.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/en-US/chat.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/en-US/common.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/en-US/documents.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/en-US/errors.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/en-US/media.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/en-US/navigation.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/en-US/onboarding.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/en-US/research.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/en-US/settings.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/en-US/workflows.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/es/accessibility.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/es/characters.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/es/chat.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/es/common.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/es/documents.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/es/errors.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/es/media.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/es/navigation.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/es/onboarding.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/es/research.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/es/settings.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/es/workflows.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/fr/accessibility.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/fr/characters.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/fr/chat.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/fr/common.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/fr/documents.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/fr/errors.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/fr/media.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/fr/navigation.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/fr/onboarding.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/fr/research.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/fr/settings.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/fr/workflows.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/hi/accessibility.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/hi/characters.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/hi/chat.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/hi/common.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/hi/documents.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/hi/errors.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/hi/media.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/hi/navigation.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/hi/onboarding.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/hi/research.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/hi/settings.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/hi/workflows.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/ja/accessibility.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/ja/characters.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/ja/chat.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/ja/common.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/ja/documents.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/ja/errors.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/ja/media.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/ja/navigation.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/ja/onboarding.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/ja/research.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/ja/settings.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/ja/workflows.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/ko/accessibility.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/ko/characters.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/ko/chat.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/ko/common.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/ko/documents.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/ko/errors.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/ko/media.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/ko/navigation.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/ko/onboarding.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/ko/research.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/ko/settings.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/ko/workflows.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/pt-BR/accessibility.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/pt-BR/characters.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/pt-BR/chat.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/pt-BR/common.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/pt-BR/documents.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/pt-BR/errors.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/pt-BR/media.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/pt-BR/navigation.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/pt-BR/onboarding.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/pt-BR/research.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/pt-BR/settings.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/pt-BR/workflows.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/ru/accessibility.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/ru/characters.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/ru/chat.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/ru/common.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/ru/documents.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/ru/errors.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/ru/media.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/ru/navigation.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/ru/onboarding.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/ru/research.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/ru/settings.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/ru/workflows.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/sv-SE/accessibility.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/sv-SE/characters.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/sv-SE/chat.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/sv-SE/common.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/sv-SE/documents.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/sv-SE/errors.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/sv-SE/media.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/sv-SE/navigation.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/sv-SE/onboarding.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/sv-SE/research.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/sv-SE/settings.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/sv-SE/workflows.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/zh-CN/accessibility.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/zh-CN/characters.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/zh-CN/chat.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/zh-CN/common.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/zh-CN/documents.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/zh-CN/errors.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/zh-CN/media.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/zh-CN/navigation.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/zh-CN/onboarding.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/zh-CN/research.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/zh-CN/settings.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/resources/zh-CN/workflows.json` | generated/reference | no | schema/catalog/tool validation | Mechanically generated or authoritative reference snapshot |
| `src/i18n/runtimeTranslator.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/index.css` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/lib/playground-agent-tools.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/lib/playground-agent-tools.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/lib/playground-agent.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/lib/playground-agent.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/lib/safe-storage.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/lib/safe-storage.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/lib/utils.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/lib/utils.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/lib/venice-client.dual.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/lib/venice-client.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/lib/venice-client.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/lib/venice-client.web-guard.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/lib/workflow-engine.mediaContract.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/lib/workflow-engine.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/lib/workflow-engine.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/lib/workflow-errors.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/lib/workflow-mutations.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/lib/workflow-mutations.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/lib/workflow-schema.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/lib/workflow-schema.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/lib/workflow-validator.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/lib/workflow-validator.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/main.tsx` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/research/agent/evidenceStore.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/research/agent/evidenceStore.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/research/agent/researchRunner.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/research/agent/researchRunner.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/research/agent/researchSynthesis.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/research/agent/researchSynthesis.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/research/agent/socialDiscovery.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/research/agent/socialDiscovery.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/research/providerTypes.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/research/providerTypes.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/research/providers/genericHttpScrapeProvider.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/research/providers/genericHttpScrapeProvider.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/research/providers/jinaResearchProvider.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/research/providers/jinaResearchProvider.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/research/providers/veniceResearchProvider.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/research/providers/veniceResearchProvider.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/safetyHydration.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/activeProfile.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/services/activeProfile.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/attachmentService.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/services/attachmentService.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/audio-retrieve-normalizer.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/services/audio-retrieve-normalizer.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/backgroundTaskToastBridge.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/services/backgroundTaskToastBridge.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/backupCryptoWeb.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/backupExportService.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/services/backupExportService.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/backupImportPreparation.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/services/backupImportService.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/services/backupImportService.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/backupManifest.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/services/backupManifest.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/characterCardImportExport.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/services/characterCardImportExport.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/characterCards/characterBookAdapter.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/services/characterCards/characterBookAdapter.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/characterCards/characterCardAdapter.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/services/characterCards/characterCardAdapter.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/characterCards/characterCardAiService.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/services/characterCards/characterCardAiService.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/characterCards/characterCardDraftService.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/characterCards/characterCardGenerationService.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/services/characterCards/characterCardGenerationService.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/characterCards/characterCardStudioHandoff.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/characterCards/characterCardSyncMerge.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/services/characterCards/characterCardSyncMerge.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/characterCreatorAiService.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/services/characterCreatorAiService.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/characterCreatorDraftService.integration.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/services/characterCreatorDraftService.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/services/characterCreatorDraftService.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/characterCreatorImportService.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/services/characterCreatorImportService.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/characterImageDiagnostics.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/characterImageFallback.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/characterSceneContext.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/services/characterSceneContext.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/characterSceneGenerationService.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/services/characterSceneGenerationService.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/characterScenePromptCompiler.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/services/characterScenePromptCompiler.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/characterSceneRateLimiter.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/services/characterSceneRateLimiter.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/characterSceneRequestParser.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/services/characterSceneRequestParser.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/characterService.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/services/characterService.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/chatContextBudget.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/chatPromptCompiler.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/chatStorage.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/services/chatStorage.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/chatTtsController.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/services/chatTtsController.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/cryptoService.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/services/cryptoService.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/dbMigrations.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/services/dbMigrations.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/defaultModelResolver.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/services/defaultModelResolver.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/desktopBridge.media-save.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/services/desktopBridge.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/services/desktopBridge.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/diagnosticsService.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/services/diagnosticsService.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/envPermissionsService.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/services/envPermissionsService.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/exportImport.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/services/exportImport.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/imageInspectorAnalysis.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/services/imageInspectorAnalysis.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/ingestion/attachmentAssembler.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/services/ingestion/attachmentAssembler.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/ingestion/codeIngestion.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/services/ingestion/codeIngestion.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/ingestion/docxIngestion.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/services/ingestion/docxIngestion.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/ingestion/fileClassifier.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/services/ingestion/fileClassifier.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/ingestion/imageIngestion.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/services/ingestion/imageIngestion.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/ingestion/ingestionErrors.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/ingestion/ingestionLimits.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/ingestion/pdfIngestion.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/services/ingestion/pdfIngestion.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/ingestion/textIngestion.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/services/ingestion/textIngestion.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/ingestion/veniceTextParserIngestion.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/services/ingestion/veniceTextParserIngestion.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/ingestion/xmlEscape.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/services/ingestion/xmlEscape.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/inspectorTelemetry.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/services/inspectorTelemetry.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/media-request-adapter.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/services/media-request-adapter.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/mediaMigration.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/services/mediaMigration.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/memoryService.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/services/memoryService.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/modelCatalogCache.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/services/modelCatalogCache.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/modelClassification.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/services/modelClassification.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/modelQueryCoordinator.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/modelService.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/services/modelService.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/notification-service.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/pdfParserService.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/services/pdfParserService.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/profilePurge.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/services/profilePurge.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/prompt-enhancer-service.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/services/prompt-enhancer-service.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/promptStarterService.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/services/promptStarterService.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/replaceImportService.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/services/replaceImportService.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/researchService.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/services/researchService.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/researchSummaries.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/services/researchSummaries.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/rp/assetService.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/services/rp/assetService.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/rp/characterCardService.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/services/rp/characterCardService.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/rp/index.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/rp/lorebookRendererService.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/services/rp/lorebookRendererService.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/rp/lorebookService.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/rp/personaImage.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/services/rp/personaPreferenceService.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/services/rp/personaPreferenceService.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/rp/personaService.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/services/rp/personaService.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/rp/promptBuilderService.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/rp/rpChatService.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/services/rp/rpChatService.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/rp/rpMemoryService.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/rp/scenarioService.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/services/rp/scenarioService.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/rp/sceneGenerationService.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/services/rp/sceneGenerationService.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/rpHelpers.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/rpPromptCompiler.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/services/rpPromptCompiler.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/rpTokenCounter.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/services/rpTokenCounter.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/sceneCompiler.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/services/sceneCompiler.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/sceneReferencePlanner.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/services/sceneReferencePlanner.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/sceneReferenceResolver.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/services/sceneReferenceResolver.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/storageMaintenance.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/services/storageMaintenance.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/storagePrivacyService.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/services/storagePrivacyService.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/storageService.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/services/storageService.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/syncDataSanitizer.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/services/syncDataSanitizer.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/syncDeleteCoordinator.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/services/syncDeleteCoordinator.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/syncEngine.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/services/syncEngine.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/syncPacketImporter.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/services/syncPacketImporter.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/task-errors.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/taskMediaCatalog.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/services/taskMediaCatalog.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/tombstoneService.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/services/tombstoneService.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/uiSoundController.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/services/uiSoundController.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/veniceClient.desktop.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/services/veniceClient.edge.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/services/veniceClient.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/services/veniceClient.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/veniceClient.web.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/services/veniceClient/diagnostics.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/veniceClient/errors.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/veniceClient/fetch.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/veniceClient/index.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/veniceClient/retry.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/veniceClient/safety.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/veniceClient/serialization.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/veniceClient/stream.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/veniceClient/transcription.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/services/veniceClient/transcription.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/veniceClient/venice.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/video-retrieve-normalizer.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/services/video-retrieve-normalizer.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/workflow-background-task.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/workflowCompiler.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/services/workflowCompiler.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/services/workflowRunner.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/services/workflowRunner.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/shared/agentRuntimeContracts.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/shared/apiConfig.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/shared/apiConfig.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/shared/backupProfile.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/shared/characterCardCompatibility.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/shared/chatFolderContracts.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/shared/chatMediaReferenceContracts.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/shared/chatMediaReferenceContracts.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/shared/configSchema.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/shared/configSchema.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/shared/inspectorTelemetryContracts.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/shared/legal.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/shared/limits.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/shared/logger.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/shared/logger.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/shared/promptLimits.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/shared/promptLimits.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/shared/readBoundedFetchBody.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/shared/redaction.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/shared/redaction.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/shared/safety/characterImportSafety.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/shared/safety/childExploitationGuard.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/shared/safety/childExploitationGuard.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/shared/safety/guardAudit.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/shared/safety/index.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/shared/safety/localFamilyGuardRules.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/shared/safety/localFamilySafeGuard.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/shared/safety/localFamilySafeGuard.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/shared/safety/matchTables.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/shared/safety/normalization.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/shared/safety/promptPayloadExtractor.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/shared/safety/promptPayloadExtractor.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/shared/syncConflictIdentity.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/shared/syncConflictIdentity.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/shared/syncConvergence.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/shared/syncConvergence.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/shared/syncProtocol.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/shared/syncTimestamp.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/shared/syncTimestamp.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/shared/urlSecurity.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/shared/validation.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/shared/validation.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/shared/venice-media-contract/__tests__/canonicalize.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/shared/venice-media-contract/__tests__/capabilities.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/shared/venice-media-contract/__tests__/payload-builders.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/shared/venice-media-contract/__tests__/response-normalizers.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/shared/venice-media-contract/canonicalize.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/shared/venice-media-contract/capabilities.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/shared/venice-media-contract/errors.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/shared/venice-media-contract/index.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/shared/venice-media-contract/operations.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/shared/venice-media-contract/payload-builders.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/shared/venice-media-contract/payload-hash.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/shared/venice-media-contract/response-normalizers.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/shared/venice-media-contract/types.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/shared/veniceSafeMode.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/stores/asset-store.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/stores/auth-store.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/stores/auth-store.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/stores/background-task-store.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/stores/background-task-store.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/stores/character-card-store.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/stores/character-card-store.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/stores/character-creator-launch-store.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/stores/character-creator-launch-store.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/stores/character-store.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/stores/character-store.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/stores/chat-folder-store.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/stores/chat-folder-store.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/stores/chat-media-reference.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/stores/chat-store-helpers.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/stores/chat-store.character.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/stores/chat-store.dirty.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/stores/chat-store.flush.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/stores/chat-store.message-operations.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/stores/chat-store.multimodal.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/stores/chat-store.performance.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/stores/chat-store.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/stores/chat-store.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/stores/chat-store.web.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/stores/chat-stream-manager.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/stores/chat-stream-manager.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/stores/config-store.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/stores/config-store.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/stores/document-agent-store.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/stores/image-inspector-store.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/stores/image-inspector-store.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/stores/image-workspace-store.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/stores/image-workspace-store.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/stores/inspector-store.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/stores/inspector-store.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/stores/lorebook-store.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/stores/lorebook-store.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/stores/media-bulk-actions.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/stores/media-bulk-actions.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/stores/media-command-handlers.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/stores/media-export-bundle.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/stores/media-export-bundle.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/stores/media-selection-store.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/stores/media-selection-store.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/stores/media-send-to.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/stores/media-send-to.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/stores/media-store.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/stores/media-store.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/stores/model-catalog-runtime-store.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/stores/model-catalog-runtime-store.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/stores/persona-store.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/stores/persona-store.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/stores/playground-store.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/stores/profile-store.broadcast.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/stores/profile-store.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/stores/profile-store.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/stores/project-store.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/stores/project-store.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/stores/prompt-library-store.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/stores/prompt-library-store.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/stores/research-store.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/stores/research-store.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/stores/rp-chat-store.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/stores/rp-chat-store.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/stores/scenario-store.errors.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/stores/scenario-store.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/stores/scenario-store.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/stores/scene-asset-store.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/stores/scene-asset-store.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/stores/scene-composer-store.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/stores/scene-composer-store.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/stores/settings-store.character-scene.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/stores/settings-store.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/stores/settings-store.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/stores/status-store.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/stores/status-store.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/stores/storage-privacy-store.mappers.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/stores/storage-privacy-store.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/stores/storage-privacy-store.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/stores/task-ui-store.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/stores/toast-store.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/stores/toast-store.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/stores/workflow-store.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/stores/workflow-template-store.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/stores/workflow-template-store.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/styles/accessibility.css` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/styles/components.css` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/styles/theme.css` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/theme/applyTheme.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/theme/applyTheme.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/theme/builtins/amberArchive.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/theme/builtins/arcticGlass.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/theme/builtins/auroraBoreal.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/theme/builtins/basaltNoir.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/theme/builtins/catppuccin.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/theme/builtins/circuitMint.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/theme/builtins/copper.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/theme/builtins/cottonCandyConsole.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/theme/builtins/cyberOrchid.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/theme/builtins/dark.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/theme/builtins/desertCopperfield.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/theme/builtins/dracula.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/theme/builtins/dualPersona.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/theme/builtins/emberMonastery.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/theme/builtins/githubLight.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/theme/builtins/glacialInk.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/theme/builtins/gruvboxDark.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/theme/builtins/harborFog.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/theme/builtins/index.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/theme/builtins/light.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/theme/builtins/midnightVelvet.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/theme/builtins/monokai.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/theme/builtins/mossCircuit.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/theme/builtins/neonDusk.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/theme/builtins/nord.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/theme/builtins/obsidianBloom.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/theme/builtins/oneDark.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/theme/builtins/polaroidBoard.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/theme/builtins/porcelainDaybreak.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/theme/builtins/rosepine.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/theme/builtins/sakuraTerminal.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/theme/builtins/solarAsh.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/theme/builtins/solarizedDark.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/theme/builtins/solarizedLight.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/theme/builtins/sweetNightmare.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/theme/builtins/synthwaveHarbor.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/theme/builtins/tokyoNight.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/theme/builtins/toxicLimewire.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/theme/builtins/ultravioletRain.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/theme/builtins/venice.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/theme/contrast.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/theme/contrast.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/theme/fallbacks.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/theme/fallbacks.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/theme/index.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/theme/themeTypes.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/theme/themes.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/theme/themes.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/theme/validateColor.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/theme/validateColor.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/theme/yamlTheme.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/theme/yamlTheme.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/types/api-connectivity.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/types/app.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/types/attachment.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/types/background-task.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/types/character-card-ai.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/types/character-card-files.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/types/character-card-spec.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/types/character-creator.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/types/characterSceneGeneration.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/types/characters.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/types/chatAttachment.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/types/chatDocument.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/types/chatFolder.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/types/conversation.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/types/conversationVault.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/types/desktop.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/types/imageInspector.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/types/ingestion.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/types/media.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/types/notifications.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/types/project.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/types/project.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/types/prompt-library.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/types/prompt-library.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/types/provider.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/types/research.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/types/research.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/types/rp.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/types/scene.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/types/scene.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/types/status.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/types/storage-privacy.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/types/storage-privacy.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/types/storage.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/types/sync.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/types/venice.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/types/vite-env.d.ts` | configuration/CI | yes | semantic configuration review + repository gates | Checked against scripts, runtime, and release boundaries |
| `src/types/workflow.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/types/workflow.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/utils/characterImageResolver.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/utils/characterImageResolver.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/utils/chatPayloadContext.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/utils/chatPayloadContext.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/utils/conversationDisplayTitle.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/utils/conversationDisplayTitle.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/utils/conversationKind.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/utils/conversationKind.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/utils/download.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/utils/download.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/utils/file-reader.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/utils/file-reader.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/utils/idValidation.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/utils/idValidation.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/utils/image.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/utils/image.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/utils/imageProcessor.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/utils/imageProcessor.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/utils/mediaItem.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/utils/mediaItem.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/utils/messageContent.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/utils/messageContent.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/utils/payloadBuilders.modelAware.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/utils/payloadBuilders.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/utils/payloadBuilders.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/utils/pricing.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/utils/profileIdValidation.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/utils/profileIdValidation.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/utils/researchError.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/utils/researchError.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/utils/themeOptions.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/utils/themeOptions.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/utils/timeout.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/utils/timeout.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `src/utils/veniceValidation.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `src/utils/veniceValidation.ts` | source | yes | static/pattern review + compiler/lint/tests; high-risk paths semantically traced | Included in substantive source coverage |
| `tests/accessibility/reduced-motion.test.tsx` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `tests/accessibility/theme-focus.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `tests/backup/cross-runtime-backup.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `tests/character-creator/characterCreatorWorkOrderAcceptance.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `tests/character-creator/independentAuditProbe.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `tests/character-creator/p0P1Remediation.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `tests/character-creator/verificationProbe.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `tests/csp/inlineStyleInvariant.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `tests/electron/productionStartupInvariant.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `tests/fixtures/character-cards/png/basic-v2.png` | asset/binary | no | inventory + metadata review | Binary content; semantic line review not applicable |
| `tests/fixtures/character-cards/png/malformed-chunk.png` | asset/binary | no | inventory + metadata review | Binary content; semantic line review not applicable |
| `tests/fixtures/character-cards/png/non-ascii-v2.png` | asset/binary | no | inventory + metadata review | Binary content; semantic line review not applicable |
| `tests/fixtures/character-cards/png/oversized-metadata.png` | asset/binary | no | inventory + metadata review | Binary content; semantic line review not applicable |
| `tests/fixtures/character-cards/v1/basic.json` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `tests/fixtures/character-cards/v2/character-book.json` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `tests/fixtures/character-cards/v2/extensions.json` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `tests/fixtures/character-cards/v2/full.json` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `tests/fixtures/character-cards/v2/minimal.json` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `tests/rp/characterCardService.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `tests/rp/lorebook.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `tests/rp/promptBuilder.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `tests/rp/rpMemory.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `tests/safety/characterImportSafety.routing.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `tests/safety/characterImportSafety.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `tests/safety/enforcementBoundaries.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `tests/safety/fixtureBuilders.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `tests/safety/guardPipeline.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `tests/safety/hydrationGate.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `tests/safety/inspectorPreview.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `tests/safety/sceneGeneration.regression.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `tests/safety/veniceSafeMode.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `tests/setup.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `tests/smoke/electron-smoke.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `tests/storage/characterCardStorage.regression.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `tests/storage/rpChatStorage.regression.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `tests/theme/inlineColorInvariant.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `tests/theme/meshSurfaceInvariant.test.ts` | test | yes | test-quality review + executed suite | Reviewed for assertions, mocks, skipped paths, and false confidence |
| `tsconfig.electron.json` | configuration/CI | yes | semantic configuration review + repository gates | Checked against scripts, runtime, and release boundaries |
| `tsconfig.electron.test.json` | configuration/CI | yes | semantic configuration review + repository gates | Checked against scripts, runtime, and release boundaries |
| `tsconfig.json` | configuration/CI | yes | semantic configuration review + repository gates | Checked against scripts, runtime, and release boundaries |
| `vite.config.ts` | configuration/CI | yes | semantic configuration review + repository gates | Checked against scripts, runtime, and release boundaries |
| `vitest.config.ts` | configuration/CI | yes | semantic configuration review + repository gates | Checked against scripts, runtime, and release boundaries |
