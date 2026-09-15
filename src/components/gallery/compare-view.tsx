import { translateRuntime } from "../../i18n/runtimeTranslator";
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
import {
  extractGenerationRecipe,
  type GenerationRecipe,
} from "../../types/project";
import { MEDIA_COMPARE_MAX } from "../../stores/media-selection-store";
import { Trans, useTranslation } from "react-i18next";

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
  {
    key: "model",
    get label() {
      return translateRuntime(
        "runtimeGenerated.components.gallery.compareView.metadata.model",
        "Model",
      );
    },
  },
  {
    key: "prompt",
    get label() {
      return translateRuntime(
        "runtimeGenerated.components.gallery.compareView.metadata.prompt",
        "Prompt",
      );
    },
  },
  {
    key: "negative",
    get label() {
      return translateRuntime(
        "runtimeGenerated.components.gallery.compareView.metadata.negative",
        "Negative",
      );
    },
  },
  {
    key: "width",
    get label() {
      return translateRuntime(
        "runtimeGenerated.components.gallery.compareView.metadata.width",
        "Width",
      );
    },
  },
  {
    key: "height",
    get label() {
      return translateRuntime(
        "runtimeGenerated.components.gallery.compareView.metadata.height",
        "Height",
      );
    },
  },
  {
    key: "aspectRatio",
    get label() {
      return translateRuntime(
        "runtimeGenerated.components.gallery.compareView.metadata.aspect",
        "Aspect",
      );
    },
  },
  {
    key: "resolution",
    get label() {
      return translateRuntime(
        "runtimeGenerated.components.gallery.compareView.metadata.resolution",
        "Resolution",
      );
    },
  },
  {
    key: "quality",
    get label() {
      return translateRuntime(
        "runtimeGenerated.components.gallery.compareView.metadata.quality",
        "Quality",
      );
    },
  },
  {
    key: "seed",
    get label() {
      return translateRuntime(
        "runtimeGenerated.components.gallery.compareView.metadata.seed",
        "Seed",
      );
    },
  },
  {
    key: "steps",
    get label() {
      return translateRuntime(
        "runtimeGenerated.components.gallery.compareView.metadata.steps",
        "Steps",
      );
    },
  },
  {
    key: "cfg",
    get label() {
      return translateRuntime(
        "runtimeGenerated.components.gallery.compareView.metadata.cfg",
        "CFG",
      );
    },
  },
  {
    key: "style",
    get label() {
      return translateRuntime(
        "runtimeGenerated.components.gallery.compareView.metadata.style",
        "Style",
      );
    },
  },
  {
    key: "projectId",
    get label() {
      return translateRuntime(
        "runtimeGenerated.components.gallery.compareView.metadata.project",
        "Project",
      );
    },
  },
  {
    key: "operation",
    get label() {
      return translateRuntime(
        "runtimeGenerated.components.gallery.compareView.metadata.operation",
        "Operation",
      );
    },
  },
  {
    key: "mediaType",
    get label() {
      return translateRuntime(
        "runtimeGenerated.components.gallery.compareView.metadata.type",
        "Type",
      );
    },
  },
  {
    key: "favorite",
    get label() {
      return translateRuntime(
        "runtimeGenerated.components.gallery.compareView.metadata.favorite",
        "Favorite",
      );
    },
  },
  {
    key: "tags",
    get label() {
      return translateRuntime(
        "runtimeGenerated.components.gallery.compareView.metadata.tags",
        "Tags",
      );
    },
  },
  {
    key: "timestamp",
    get label() {
      return translateRuntime(
        "runtimeGenerated.components.gallery.compareView.metadata.created",
        "Created",
      );
    },
  },
];

const RECIPE_FIELDS: Array<{
  key: keyof RecipeCompare | string;
  label: string;
}> = [
  {
    key: "model",
    get label() {
      return translateRuntime(
        "runtimeGenerated.components.gallery.compareView.metadata.rModel",
        "R: Model",
      );
    },
  },
  {
    key: "prompt",
    get label() {
      return translateRuntime(
        "runtimeGenerated.components.gallery.compareView.metadata.rPrompt",
        "R: Prompt",
      );
    },
  },
  {
    key: "negativePrompt",
    get label() {
      return translateRuntime(
        "runtimeGenerated.components.gallery.compareView.metadata.rNegative",
        "R: Negative",
      );
    },
  },
  {
    key: "width",
    get label() {
      return translateRuntime(
        "runtimeGenerated.components.gallery.compareView.metadata.rWidth",
        "R: Width",
      );
    },
  },
  {
    key: "height",
    get label() {
      return translateRuntime(
        "runtimeGenerated.components.gallery.compareView.metadata.rHeight",
        "R: Height",
      );
    },
  },
  {
    key: "aspectRatio",
    get label() {
      return translateRuntime(
        "runtimeGenerated.components.gallery.compareView.metadata.rAspect",
        "R: Aspect",
      );
    },
  },
  {
    key: "resolution",
    get label() {
      return translateRuntime(
        "runtimeGenerated.components.gallery.compareView.metadata.rResolution",
        "R: Resolution",
      );
    },
  },
  {
    key: "seed",
    get label() {
      return translateRuntime(
        "runtimeGenerated.components.gallery.compareView.metadata.rSeed",
        "R: Seed",
      );
    },
  },
  {
    key: "steps",
    get label() {
      return translateRuntime(
        "runtimeGenerated.components.gallery.compareView.metadata.rSteps",
        "R: Steps",
      );
    },
  },
  {
    key: "cfgScale",
    get label() {
      return translateRuntime(
        "runtimeGenerated.components.gallery.compareView.metadata.rCfg",
        "R: CFG",
      );
    },
  },
  {
    key: "variants",
    get label() {
      return translateRuntime(
        "runtimeGenerated.components.gallery.compareView.metadata.rVariants",
        "R: Variants",
      );
    },
  },
  {
    key: "style",
    get label() {
      return translateRuntime(
        "runtimeGenerated.components.gallery.compareView.metadata.rStyle",
        "R: Style",
      );
    },
  },
  {
    key: "quality",
    get label() {
      return translateRuntime(
        "runtimeGenerated.components.gallery.compareView.metadata.rQuality",
        "R: Quality",
      );
    },
  },
];

function normalise(
  value: unknown,
): string | number | boolean | null | undefined {
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
    const values = items.map((it) =>
      normalise((it as unknown as Record<string, unknown>)[key as string]),
    );
    rows.push(buildRow(key, label, values));
  }
  for (const { key, label } of RECIPE_FIELDS) {
    const values = recipes.map((recipe) => {
      if (!recipe) return undefined;
      return normalise(
        (recipe as unknown as Record<string, unknown>)[key as string],
      );
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
  const present = values.filter(
    (v) => v !== undefined && v !== null && v !== "",
  );
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
  const { t: tRuntime } = useTranslation("common");
  const recipes = useMemo(
    () => items.map((it) => extractGenerationRecipe(it)),
    [items],
  );
  const rows = useMemo(
    () => {
      void tRuntime;
      return buildCompareRows(items, recipes);
    },
    [items, recipes, tRuntime],
  );

  if (items.length < 2 || items.length > MEDIA_COMPARE_MAX) {
    return (
      <div className={className} data-testid="compare-view-disabled">
        <p className="text-[12px] text-text-muted">
          <Trans i18nKey="common:surface.componentsGalleryCompareView.description.select2To" />{" "}
          {MEDIA_COMPARE_MAX}{" "}
          <Trans i18nKey="common:surface.componentsGalleryCompareView.description.itemsToCompare" />
          {items.length}{" "}
          <Trans i18nKey="common:surface.componentsGalleryCompareView.description.selected" />
        </p>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="mt-1.5 rounded-md border border-vf-panel-border px-2 py-1 text-[12px] text-text-secondary hover:border-accent hover:text-accent"
          >
            <Trans i18nKey="common:surface.componentsGalleryCompareView.action.close" />
          </button>
        )}
      </div>
    );
  }

  const headerLabels = items.map(
    (it) => it.prompt?.slice(0, 40) || it.id.slice(0, 8),
  );
  const changedCount = rows.filter((r) => !r.same).length;

  return (
    <div
      className={className}
      data-testid="compare-view"
      data-changed={changedCount}
    >
      <div className="flex items-center justify-between text-[12px] uppercase tracking-wide text-text-secondary">
        <span>
          <Trans i18nKey="common:surface.componentsGalleryCompareView.text.compare" />{" "}
          {items.length}{" "}
          <Trans i18nKey="common:surface.componentsGalleryCompareView.text.items" />
        </span>
        <span aria-live="polite">
          {changedCount === 0
            ? tRuntime(
                "runtimeGenerated.components.gallery.compareView.text.allSharedFieldsMatch",
              )
            : tRuntime(
                "runtimeGenerated.components.gallery.compareView.text.changedcountFieldValue2Differ",
                {
                  changedCount: changedCount,
                  value2: changedCount === 1 ? "" : "s",
                },
              )}
        </span>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="ml-2 rounded-md border border-vf-panel-border px-2 py-1.5 min-h-[32px] text-[12px] text-text-secondary hover:border-accent hover:text-accent"
            aria-label={tRuntime(
              "runtimeGenerated.components.gallery.compareView.attribute.closeCompareView",
            )}
          >
            <Trans i18nKey="common:surface.componentsGalleryCompareView.action.close" />
          </button>
        )}
      </div>
      <div className="mt-1.5 overflow-auto rounded-md border border-vf-panel-border max-h-[60vh]">
        <table className="w-full text-[12px]">
          <thead className="bg-vf-panel-bg/60 sticky top-0 z-10">
            <tr>
              <th className="text-left px-2 py-1 font-medium">
                <Trans i18nKey="common:surface.componentsGalleryCompareView.column.field" />
              </th>
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
                    key={items[idx]?.id ?? idx}
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
