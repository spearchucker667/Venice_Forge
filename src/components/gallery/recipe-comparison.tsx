import { translateRuntime } from "../../i18n/runtimeTranslator";
/** @fileoverview Side-by-side diff of an original recipe and its
 *  sanitized-for-current-model counterpart. Used in the Media Inspector
 *  and in `RecipeCompatibilityCard` to explain what would change if a
 *  recipe from another model is used with the active target model. */

import { Fragment } from "react";
import type { GenerationRecipe } from "../../types/project";
import { Trans, useTranslation } from "react-i18next";

export interface RecipeComparisonField {
  /** Stable field key, e.g. `width`, `height`, `aspectRatio`. */
  field: string;
  /** Pretty human label, e.g. `Dimensions`. */
  label: string;
  /** Value in the original recipe (or undefined). */
  original: unknown;
  /** Value after sanitization for the target model (or undefined). */
  sanitized: unknown;
  /** True when the values differ. */
  changed: boolean;
}

const RECIPE_FIELDS: Array<{
  field: keyof GenerationRecipe | string;
  label: string;
}> = [
  {
    field: "model",
    get label() {
      return translateRuntime(
        "runtimeGenerated.components.gallery.recipeComparison.metadata.model",
        "Model",
      );
    },
  },
  {
    field: "prompt",
    get label() {
      return translateRuntime(
        "runtimeGenerated.components.gallery.recipeComparison.metadata.prompt",
        "Prompt",
      );
    },
  },
  {
    field: "negativePrompt",
    get label() {
      return translateRuntime(
        "runtimeGenerated.components.gallery.recipeComparison.metadata.negativePrompt",
        "Negative prompt",
      );
    },
  },
  {
    field: "width",
    get label() {
      return translateRuntime(
        "runtimeGenerated.components.gallery.recipeComparison.metadata.width",
        "Width",
      );
    },
  },
  {
    field: "height",
    get label() {
      return translateRuntime(
        "runtimeGenerated.components.gallery.recipeComparison.metadata.height",
        "Height",
      );
    },
  },
  {
    field: "aspectRatio",
    get label() {
      return translateRuntime(
        "runtimeGenerated.components.gallery.recipeComparison.metadata.aspectRatio",
        "Aspect ratio",
      );
    },
  },
  {
    field: "resolution",
    get label() {
      return translateRuntime(
        "runtimeGenerated.components.gallery.recipeComparison.metadata.resolution",
        "Resolution",
      );
    },
  },
  {
    field: "quality",
    get label() {
      return translateRuntime(
        "runtimeGenerated.components.gallery.recipeComparison.metadata.quality",
        "Quality",
      );
    },
  },
  {
    field: "style",
    get label() {
      return translateRuntime(
        "runtimeGenerated.components.gallery.recipeComparison.metadata.style",
        "Style",
      );
    },
  },
  {
    field: "steps",
    get label() {
      return translateRuntime(
        "runtimeGenerated.components.gallery.recipeComparison.metadata.steps",
        "Steps",
      );
    },
  },
  {
    field: "cfgScale",
    get label() {
      return translateRuntime(
        "runtimeGenerated.components.gallery.recipeComparison.metadata.cfgScale",
        "CFG scale",
      );
    },
  },
  {
    field: "variants",
    get label() {
      return translateRuntime(
        "runtimeGenerated.components.gallery.recipeComparison.metadata.variants",
        "Variants",
      );
    },
  },
  {
    field: "seed",
    get label() {
      return translateRuntime(
        "runtimeGenerated.components.gallery.recipeComparison.metadata.seed",
        "Seed",
      );
    },
  },
];

/** Pure helper: builds a list of comparison fields between two recipes. */
export function buildRecipeComparison(
  original: GenerationRecipe,
  sanitized: GenerationRecipe,
): RecipeComparisonField[] {
  return RECIPE_FIELDS.map(({ field, label }) => {
    const o = (original as unknown as Record<string, unknown>)[field as string];
    const s = (sanitized as unknown as Record<string, unknown>)[
      field as string
    ];
    return {
      field: field as string,
      label,
      original: o,
      sanitized: s,
      changed: !valueEquals(o, s),
    };
  });
}

function valueEquals(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a == null && b == null;
  return false;
}

export interface RecipeComparisonProps {
  original: GenerationRecipe;
  sanitized: GenerationRecipe;
  className?: string;
}

/** Renders a two-column table of fields. Unchanged rows are dimmed; rows
 *  that changed are highlighted with an "→" arrow. Designed to fit inside
 *  the Media Inspector without scrolling. */
export function RecipeComparison({
  original,
  sanitized,
  className,
}: RecipeComparisonProps) {
  const { t: tRuntime } = useTranslation("common");
  const rows = buildRecipeComparison(original, sanitized);
  const changedCount = rows.filter((r) => r.changed).length;
  return (
    <div
      className={className}
      data-testid="recipe-comparison"
      aria-label={tRuntime(
        "runtimeGenerated.components.gallery.recipeComparison.attribute.recipeComparison",
      )}
    >
      <div className="flex items-center justify-between text-[12px] uppercase tracking-wide text-text-secondary">
        <span>
          <Trans i18nKey="common:surface.componentsGalleryRecipeComparison.text.recipeComparison" />
        </span>
        <span aria-live="polite">
          {changedCount === 0
            ? tRuntime(
                "runtimeGenerated.components.gallery.recipeComparison.text.identical",
              )
            : tRuntime(
                "runtimeGenerated.components.gallery.recipeComparison.text.changedcountFieldValue2WillChange",
                {
                  changedCount: changedCount,
                  value2: changedCount === 1 ? "" : "s",
                },
              )}
        </span>
      </div>
      <div className="mt-1.5 rounded-md border border-vf-panel-border overflow-hidden">
        <table className="w-full text-[12px]">
          <thead className="bg-vf-panel-bg/60 text-text-secondary">
            <tr>
              <th className="text-left px-2 py-1 font-medium">
                <Trans i18nKey="common:surface.componentsGalleryRecipeComparison.column.field" />
              </th>
              <th className="text-left px-2 py-1 font-medium">
                <Trans i18nKey="common:surface.componentsGalleryRecipeComparison.column.original" />
              </th>
              <th className="text-left px-2 py-1 font-medium">
                <Trans i18nKey="common:surface.componentsGalleryRecipeComparison.column.sanitized" />
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.field}
                className={row.changed ? "bg-warning/5" : ""}
                data-testid={`recipe-comparison-row-${row.field}`}
              >
                <td className="px-2 py-1 text-text-secondary whitespace-nowrap">
                  {row.label}
                </td>
                <td
                  className={`px-2 py-1 break-words ${row.changed ? "text-text-secondary" : "text-text-primary/70"}`}
                >
                  {row.changed ? (
                    <Fragment>
                      <span>{formatValue(row.original)}</span>
                      <span className="mx-1 text-warning" aria-hidden="true">
                        →
                      </span>
                    </Fragment>
                  ) : (
                    formatValue(row.original)
                  )}
                </td>
                <td
                  className={`px-2 py-1 break-words ${row.changed ? "text-text-primary" : "text-text-primary/70"}`}
                >
                  {formatValue(row.sanitized)}
                </td>
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
  if (typeof v === "string") return v.length > 60 ? `${v.slice(0, 57)}…` : v;
  return String(v);
}
