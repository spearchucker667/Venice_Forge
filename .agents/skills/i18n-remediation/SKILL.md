---
name: i18n-remediation
description: >-
  Step-by-step procedures for localizing Venice Forge namespaces, maintaining
  placeholder integrity, updating allowlisted cognates, and verifying i18n catalogs without regressions.
---

# i18n Remediation and Quality Assurance Runbook

This runbook defines the standard operating procedure for updating, translating, and verifying localization catalogs across Venice Forge's 12 namespaces and 11 non-English supported locales.

## Canonical Matrix
- **Base Locale:** `en-US` (`src/i18n/resources/en-US/`)
- **11 Target Locales:** `es`, `fr`, `de`, `pt-BR`, `ru`, `zh-CN`, `ja`, `hi`, `ar`, `ko`, `sv-SE`
- **12 Namespaces:** `common`, `chat`, `media`, `roleplay`, `personas`, `tools`, `system`, `prompts`, `privacy`, `settings`, `sync`, `models`

## Quality Invariants
1. **Placeholder Preservation:** Never alter or remove interpolation tokens like `{{rating}}`, `{{model}}`, `{{token}}`, `{{count}}`, `{{date}}`, `{{name}}`, `{{section}}`.
2. **Brand & Industry Tokens:** Preserve tokens such as `Venice`, `Venice Forge`, `API`, `URL`, `JSON`, `CSS`, `Markdown`, `ID` unless translated conventionally in the target locale script.
3. **Allowlisted Loanwords / Cognates:** When a key's translation in a target language is genuinely identical to English (e.g., `Surface`, `Accent`, `Danger`, `Link`, `Info`, `no`), register the key or value in `ALLOWLISTED_IDENTICAL` in `scripts/verify-i18n.cjs` instead of leaving unverified discrepancies.

## Execution Workflow

### 1. Catalog Updates
Edit the target locale JSON files in `src/i18n/resources/<locale>/<namespace>.json`.

### 2. Verify Namespace Completeness & Identical Checks
Run the i18n validator:
```bash
npm run verify:i18n
```
If identical-to-English strings are reported:
- If translation is missing: provide the appropriate translation.
- If identical is legitimate: add the key or value to `ALLOWLISTED_IDENTICAL` in `scripts/verify-i18n.cjs`.

### 3. Scan for Hardcoded UI Regressions
Ensure components do not contain untranslated JSX text:
```bash
npm run i18n:verify-hardcoded
```

### 4. Regenerate Review Inventory & Sync Review Status
Update the placeholder inventory and per-locale markdown tables:
```bash
node scripts/review-pack-inventory.cjs
npm run verify:i18n-review-status
```
Verify that `docs/i18n/review-pack/PLACEHOLDER-INVENTORY.json` and `docs/i18n/review-pack/PER-LOCALE/*.md` reflect updated metrics.
