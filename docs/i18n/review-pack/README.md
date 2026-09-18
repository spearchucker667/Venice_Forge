# i18n Native-Language Review Pack — Scaffold (VF-20260918-P3-020)

> **Status (2026-09-18):** Scaffold + tooling only. **No locale has been promoted.**
>
> The `VF-20260918-P3-020` finding requires 11 qualified native-language
> reviewers (one per non-English locale) to translate the catalog entries
> that currently carry `__MISSING__:` placeholders. This directory provides
> the machine-readable inventory and per-locale checklists that a reviewer
> uses; the actual translations must be performed by qualified humans and
> applied to `src/i18n/resources/<locale>/<namespace>.json` directly.

## What is in this pack

| Artifact | Purpose | Generator |
|---|---|---|
| `PLACEHOLDER-INVENTORY.json` | Machine-readable: 11 non-English locales × 12 namespaces, with every `__MISSING__:` key + marker. | `scripts/generate-i18n-review-pack.cjs` |
| `PER-LOCALE/<locale>.md` | Human-readable per-locale review instructions + checklist. | `scripts/generate-i18n-review-pack.cjs` |
| `scripts/generate-i18n-review-pack.cjs` | Regenerator. Run after any new placeholder is added to the catalogs. | n/a |
| `scripts/verify-i18n-review-status.cjs` | Verifier: checks `native-review-status.json` is consistent with the actual catalogs (no spurious human-reviewed, no unregistered locales). | n/a |

## Coverage as of 2026-09-18

- 11 non-English locales registered: `es`, `fr`, `de`, `pt-BR`, `ru`, `zh-CN`, `ja`, `hi`, `ar`, `ko`, `sv-SE`.
- 1 canonical locale: `en-US` (not subject to native review).
- 3,916 outstanding `__MISSING__:` placeholders in total.
- All 11 locales carry `status: first-pass-machine`, `reviewer: null`, `reviewedAt: null` in `docs/i18n/native-review-status.json`.

The handoff mentioned "12 non-English catalogs" — the authoritative count from the catalogs themselves is **11**. This is recorded for transparency rather than treated as a count discrepancy.

## Per-namespace placeholder counts

| Namespace | Placeholders per non-English locale (× 11 locales) |
|---|---|
| `accessibility` | 0 |
| `characters` | 0 |
| `chat` | 44 |
| `common` | 102 |
| `documents` | 0 |
| `errors` | 0 |
| `media` | 7 |
| `navigation` | 0 |
| `onboarding` | 0 |
| `research` | 0 |
| `settings` | 203 |
| `workflows` | 0 |
| **Total per locale** | **356** |
| **Total overall** | **3,916** |

(`chat`, `common`, `media`, `settings` are the only namespaces with placeholders; the rest are already complete.)

## How a qualified translator uses this pack

1. Pick the locale file: `PER-LOCALE/<locale>.md`.
2. For every namespace listed in that file, edit the corresponding catalog at `src/i18n/resources/<locale>/<namespace>.json`.
3. Replace each `__MISSING__:<key>` value with the qualified native translation. **Preserve every interpolation variable** (`{{name}}`, `{{limit}}`, etc.) verbatim.
4. Do **not** rely on machine-translation services — the existing `__MISSING__:` values are already first-pass machine translations and the project policy (see `docs/i18n/native-review-status.json`) explicitly forbids promoting machine translation to "human-reviewed".
5. Update `docs/i18n/native-review-status.json`:
   - Set this locale's `status` to `"human-reviewed"`.
   - Set `reviewer` to your name + contact.
   - Set `reviewedAt` to today's ISO-8601 date.
6. Run `npm run verify:i18n-review-status`. It must exit 0 with zero `__MISSING__:` placeholders remaining in the locale's catalogs.
7. Open a PR; once merged, `P3-020` for this locale is closed. Repeat for the remaining locales.

## What the scaffold guarantees

- The inventory + per-locale files are regenerated from the catalogs, so the source of truth is always `src/i18n/resources/`.
- The verifier prevents accidentally promoting a locale that still has placeholders, and prevents registering a locale without a catalog (or vice versa).
- The status file's `schemaVersion` and per-locale shape are stable, so reviewer tooling can be written against it.

## What the scaffold does NOT do

- It does **not** translate anything. There is no machine-translation fallback.
- It does **not** modify `src/i18n/resources/`. Any translation that lands in the catalogs must come from a qualified human reviewer.
- It does **not** promote any locale. Only a qualified translator may flip `first-pass-machine` to `human-reviewed`.
