# Per-Tab Headed Visual & Accessibility Acceptance (VF-20260918-P2-016 / VF-20260922-P2-011)

> **Status (2026-09-22):** Scaffolding and verification tooling active.  
> **Acceptance Mode:** Requires qualified human reviewer in headed desktop/browser mode.  
> **Target Scope:** 15 canonical tabs without direct dedicated surface evidence.

---

## 1. Objective

Provide verifiable, auditable visual and accessibility acceptance proof across all 15 Venice Forge surface tabs that lack dedicated per-tab captures:
1. `character-chats`
2. `history`
3. `image-inspector`
4. `prompts`
5. `scenes`
6. `audio`
7. `music`
8. `video`
9. `embeddings`
10. `search`
11. `characters`
12. `character-creator`
13. `rp-studio`
14. `privacy`
15. `playground`

This acceptance cannot be claimed by headless test runs or artificial automated signatures alone; it requires a qualified human reviewer conducting headed visual inspection, screen-reader validation, keyboard navigation testing, and responsive layout verification.

---

## 2. Evidence Dimensions

Each tab is evaluated across a 5-dimensional matrix:

| Dimension | Values | Count |
|---|---|:---:|
| **Tabs** | `character-chats`, `history`, `image-inspector`, `prompts`, `scenes`, `audio`, `music`, `video`, `embeddings`, `search`, `characters`, `character-creator`, `rp-studio`, `privacy`, `playground` | 15 |
| **Viewports** | `1280x720`, `1440x900`, `1920x1080`, `2560x1440`, `mobile-390x844` | 5 |
| **Themes** | `venice-dark`, `venice-light`, `nord-dark`, `venice-rtl` | 4 |
| **Locales** | `en-US` (canonical), `ar` (RTL bidi), `zh-CN` (multibyte script) | 3 |
| **States** | `initial` (default render), `keyboard` (focused action), `overflow` (content stress) | 3 |

**Total required evaluation tuples per tab:** 5 viewports × 4 themes × 3 locales × 3 states = 180 tuples per tab.  
**Total required evaluations:** 15 tabs × 180 = 2,700 tuples.

---

## 3. Directory Layout

Evidence files are stored under:

```text
docs/design/per-tab-acceptance/
├── README.md                           # This specification
├── CHECKLIST.md                        # Verification criteria per tab
├── EVIDENCE_MANIFEST.template.json     # Schema and template for manifest.json
└── evidence/
    └── <tab>/
        └── <viewport>__<theme>__<locale>/
            ├── manifest.json           # Tuple manifest (signed by reviewer)
            ├── notes.md                # Reviewer notes and observations
            ├── screenshot.png          # Initial state capture
            ├── screenshot-tab.png      # Keyboard focus state capture
            └── screenshot-overflow.png # Content stress overflow capture
```

---

## 4. Runner & Verification Tooling

### A. Scaffold Tuple Directories

Launch Venice Forge locally:
```bash
npm run dev:web -- --host 127.0.0.1
```

In a separate terminal, execute the scaffold runner:
```bash
export VENICE_FORGE_DEV_URL="http://127.0.0.1:5173"
bash scripts/per-tab-acceptance/runner.sh --tabs all
```

The runner:
- Inspects `scripts/per-tab-acceptance/tab-routes.json` for tab routes and selectors.
- Generates stub directories under `docs/design/per-tab-acceptance/evidence/<tab>/<tuple>/`.
- Populates `manifest.json` stubs and `notes.md` templates.
- **Never overwrites signed manifests** (preserves reviewer work).

### B. Verify Acceptance Coverage

Run the validator script:
```bash
npm run verify:per-tab-acceptance
```

The verifier confirms:
1. Every required tuple directory exists.
2. `manifest.json` matches `EVIDENCE_MANIFEST.template.json` schema.
3. `reviewer.signature` and `reviewer.contact` are non-empty.
4. `notes.md` exists, is non-empty, references the tuple header, and includes the reviewer signature.
5. Exit code is 0 only when all required tuples are signed and valid.

---

## 5. Reviewer Guardrails (What Reviewers MUST NOT Do)

1. **Do NOT falsify signatures:** Automated scripts or AI agents must not generate fake reviewer names or claim human screen-reader review.
2. **Do NOT bypass failing contrast:** If text fails WCAG AA 4.5:1 contrast, log the defect in `notes.md` and `manifest.json` under `defects`.
3. **Do NOT ignore clipping or overlap:** If localized text (e.g. German, Russian, Arabic) clips, wraps unexpectedly, or overlaps controls, record the issue.
4. **Do NOT skip RTL inspection:** Verify that Arabic (`ar`) correctly mirrors layouts, aligns context menus, and reverses directional navigation icons.
