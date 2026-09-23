---
name: per-tab-acceptance
description: >-
  Runbook and automation procedures for executing headed visual and accessibility
  audits across Venice Forge's 15 canonical tabs, capturing screenshots, and managing evidence without repo bloat.
---

# Per-Tab Visual & Accessibility Acceptance Runbook

This runbook defines the procedures for executing and automating visual, layout, and accessibility verification across Venice Forge's canonical UI tabs.

## Matrix Structure
- **15 Canonical Tabs:** `chat`, `roleplay`, `personas`, `image-studio`, `video-studio`, `audio-studio`, `memory`, `code-agent`, `research`, `workflows`, `prompt-lab`, `data-privacy`, `sync`, `logs`, `settings`.
- **12 Locales:** `en-US`, `es`, `fr`, `de`, `pt-BR`, `ru`, `zh-CN`, `ja`, `hi`, `ar` (RTL), `ko`, `sv-SE`.
- **5 Themes:** `system`, `dark`, `light`, `neon`, `venice-classic`.
- **3 Zoom Levels:** `80%`, `100%`, `125%`.
- **Viewports:** Desktop (`1280x720`, `1920x1080`), Mobile (`390x844`).

Total combinatorial tuples: 15 tabs × 12 locales × 5 themes × 3 zoom levels = **2,700 acceptance tuples**.

## Automated Execution Tools

### 1. Scaffolding Acceptance Tuples
To scaffold all 2,700 tuple directories and manifests in seconds using optimized shell generation:
```bash
./scripts/per-tab-acceptance/runner.sh --stubs-only
```
Specific subsets can be targeted using flags:
```bash
./scripts/per-tab-acceptance/runner.sh --tabs chat,settings --locales en-US,ar --stubs-only
```

### 2. Automated Visual & A11y Capture
Run the Chrome capture tool across the tabs:
```bash
npm run capture:per-tab-acceptance
```
This tool:
- Launches the local Vite dev server.
- Connects via Google Chrome (`--headless=new`).
- Iterates over the canonical tabs and viewports.
- Audits accessibility landmarks (`main`, `nav`, `banner`, `complementary`).
- Saves visual screenshots to `docs/design/per-tab-acceptance/evidence/`.

## Repository Hygiene Rule
- **Never Commit Raw Evidence PNGs:** All files generated under `docs/design/per-tab-acceptance/evidence/` are strictly ignored by `.gitignore` (`/docs/design/per-tab-acceptance/evidence/**`).
- Only commit the documentation, schemas, templates, and scripts (`CHECKLIST.md`, `EVIDENCE_MANIFEST.template.json`, `README.md`, `runner.sh`, `capture-per-tab-acceptance.mjs`).
