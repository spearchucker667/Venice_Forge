/** @fileoverview Phase 2B Media Studio compare mode.
 *
 * Side-by-side field diff for 2-4 selected media items. Pure, non-mutating
 * consumer of `MediaItem` records. Recipes are extracted via the
 * canonical `extractGenerationRecipe` helper so the comparison is
 * consistent with the Media Inspector compatibility card (Phase 2A).
 *
 * Same/different field marking uses strict equality for primitives and
 * reference equality for objects; missing fields render as "—".
 */

import { useMemo } from "react";
import type { MediaItem } from "../../types/media";
import { extractGenerationRecipe, type GenerationRecipe } from "../../types/project";
import { MEDIA_SELECTION_MAX } from "../../stores/media-selection-store";

export interface CompareField {
  /** Canonical field key, e.g. `model`, `prompt`, `seed`. */
  field: string;
  /** Human label, e.g. `Model`. */
  label: string;
  /** Per-item value (string, number, boolean, or undefined for missing). */
  values: Array<string | number | boolean | null | undefined>;
  /** True iff all non-missing values are strictly equal. */
  same: boolean;
  /** True iff at least one item has a value for this field. */
  hasValue: boolean;
}

interface RecipeCompare {
  prompt: string;
  model: string;
  width?: number;
  height?: number;
  aspectRatio?: string;
  resolution?: string;
  seed?: number | null;
  steps?: number;
  cfgScale?: number;
  variants?: number;
  negativePrompt?: string;
  style?: string;
  quality?: string;
  projectId?: string;
  createdAt?: string;
}

/** Internal fields. The order here is the column order in the table. */
const ITEM_FIELDS: Array<{ key: keyof MediaItem | string; label: string }> = [
  { key: "model", label: "Model" },
  { key: "prompt", label: "Prompt" },
  { key: "negative", label: "Negative" },
  { key: "width", label: "Width" },
  { key: "height", label: "Height" },
  { key: "aspectRatio", label: "Aspect" },
  { key: "resolution", label: "Resolution" },
  { key: "quality", label: "Quality" },
  { key: "seed", label: "Seed" },
  { key: "steps", label: "Steps" },
  { key: "cfg", label: "CFG" },
  { key: "style", label: "Style" },
  { key: "projectId", label: "Project" },
  { key: "operation", label: "Operation" },
  { key: "mediaType", label: "Type" },
  { key: "favorite", label: "Favorite" },
  { key: "tags", label: "Tags" },
  { key: "timestamp", label: "Created" },
];

const RECIPE_FIELDS: Array<{ key: keyof RecipeCompare | string; label: string }> = [
  { key: "model", label: "R: Model" },
  { key: "prompt", label: "R: Prompt" },
  { key: "negativePrompt", label: "R: Negative" },
  { key: "width", label: "R: Width" },
  { key: "height", label: "R: Height" },
  { key: "aspectRatio", label: "R: Aspect" },
  { key: "resolution", label: "R: Resolution" },
  { key: "seed", label: "R: Seed" },
  { key: "steps", label: "R: Steps" },
  { key: "cfgScale", label: "R: CFG" },
  { key: "variants", label: "R: Variants" },
  { key: "style", label: "R: Style" },
  { key: "quality", label: "R: Quality" },
];

function normalise(value: unknown): string | number | boolean | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === "string") {
    if (value.length === 0) return undefined;
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return undefined;
    return value.map((v) => String(v)).join(", ");
  }
  return String(value);
}

function buildCompareRows(
  items: MediaItem[],
  recipes: Array<GenerationRecipe | null>,
): CompareField[] {
  const rows: CompareField[] = [];
  for (const { key, label } of ITEM_FIELDS) {
    const values = items.map((it) => normalise((it as unknown as Record<string, unknown>)[key as string]));
    rows.push(buildRow(key, label, values));
  }
  for (const { key, label } of RECIPE_FIELDS) {
    const values = recipes.map((recipe) => {
      if (!recipe) return undefined;
      return normalise((recipe as unknown as Record<string, unknown>)[key as string]);
    });
    rows.push(buildRow(`r_${String(key)}`, label, values));
  }
  return rows;
}

function buildRow(
  field: string,
  label: string,
  values: Array<string | number | boolean | null | undefined>,
): CompareField {
  const present = values.filter((v) => v !== undefined && v !== null && v !== "");
  // A row is "same" only when:
  //   - at least one item has a value, AND
  //   - every item has a value, AND
  //   - all present values are strictly equal.
  // A row with a mix of present + absent is "different" so the user
  // can see the gap in coverage at a glance.
  const allPresent = present.length === values.length;
  const allSame = allPresent && present.every((v) => v === present[0]);
  return {
    field,
    label,
    values,
    same: allSame,
    hasValue: present.length > 0,
  };
}

/** Pure helper exported for tests. Re-extracts recipes and flattens
 *  MediaItem + recipe fields into a single row list. */
export function buildCompareRowsForTest(items: MediaItem[]): CompareField[] {
  const recipes = items.map((it) => extractGenerationRecipe(it));
  return buildCompareRows(items, recipes);
}

export interface CompareViewProps {
  items: MediaItem[];
  className?: string;
  onClose?: () => void;
}

/** Renders the side-by-side comparison table. Returns null when `items`
 *  is outside the 2..4 range. */
export function CompareView({ items, className, onClose }: CompareViewProps) {
  const recipes = useMemo(
    () => items.map((it) => extractGenerationRecipe(it)),
    [items],
  );
  const rows = useMemo(() => buildCompareRows(items, recipes), [items, recipes]);

  if (items.length < 2 || items.length > MEDIA_SELECTION_MAX) {
    return (
      <div className={className} data-testid="compare-view-disabled">
        <p className="text-[12px] text-text-muted">
          Select 2 to {MEDIA_SELECTION_MAX} items to compare. ({items.length} selected)
        </p>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="mt-1.5 rounded-md border border-border px-2 py-1 text-[12px] text-text-secondary hover:border-accent hover:text-accent"
          >
            Close
          </button>
        )}
      </div>
    );
  }

  const headerLabels = items.map((it) => it.prompt?.slice(0, 40) || it.id.slice(0, 8));
  const changedCount = rows.filter((r) => !r.same).length;

  return (
    <div className={className} data-testid="compare-view" data-changed={changedCount}>
      <div className="flex items-center justify-between text-[12px] uppercase tracking-wide text-text-secondary">
        <span>Compare {items.length} items</span>
        <span aria-live="polite">
          {changedCount === 0
            ? "All shared fields match"
            : `${changedCount} field${changedCount === 1 ? "" : "s"} differ`}
        </span>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="ml-2 rounded-md border border-border px-2 py-1.5 min-h-[32px] text-[12px] text-text-secondary hover:border-accent hover:text-accent"
            aria-label="Close compare view"
          >
            Close
          </button>
        )}
      </div>
      <div className="mt-1.5 overflow-auto rounded-md border border-border/60 max-h-[60vh]">
        <table className="w-full text-[12px]">
          <thead className="bg-surface/60 sticky top-0 z-10">
            <tr>
              <th className="text-left px-2 py-1 font-medium">Field</th>
              {headerLabels.map((label, idx) => (
                <th
                  key={items[idx]?.id ?? idx}
                  className="text-left px-2 py-1 font-medium max-w-[180px] truncate"
                  title={label ?? ""}
                >
                  {label || "—"}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.field}
                className={row.same ? "" : "bg-warning/5"}
                data-testid={`compare-row-${row.field}`}
                data-same={row.same}
              >
                <td className="px-2 py-1 text-text-secondary whitespace-nowrap align-top">
                  {row.label}
                </td>
                {row.values.map((v, idx) => (
                  <td
                    key={idx}
                    className={`px-2 py-1 break-words align-top ${
                      row.same ? "text-text-primary/80" : "text-text-primary"
                    }`}
                  >
                    {row.hasValue ? formatValue(v) : "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatValue(v: unknown): string {
  if (v === undefined || v === null || v === "") return "—";
  if (typeof v === "string") return v.length > 80 ? `${v.slice(0, 77)}…` : v;
  return String(v);
}
