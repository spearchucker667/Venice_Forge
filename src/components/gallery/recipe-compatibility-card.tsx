/** @fileoverview Media Inspector card that surfaces a recipe-vs-current-model
 *  compatibility report. Tells the user whether the recipe is fully
 *  compatible, partially compatible (with one or more field changes), or
 *  incompatible, and offers the model-aware action buttons. */

import { useMemo } from "react";
import {
  getRecipeCompatibilityReport,
  type GenerationRecipe,
  type RecipeCompatibilityReport,
} from "../../types/project";
import {
  getImageModelCapabilities,
} from "../../config/image-model-capabilities";
import { RecipeComparison } from "./recipe-comparison";

const STATUS_TONE: Record<RecipeCompatibilityReport["status"], string> = {
  compatible: "bg-success/10 text-success border-success/30",
  partial: "bg-warning/10 text-warning border-warning/30",
  incompatible: "bg-error/10 text-error border-error/30",
};

const STATUS_LABEL: Record<RecipeCompatibilityReport["status"], string> = {
  compatible: "Compatible",
  partial: "Will be adjusted",
  incompatible: "Incompatible",
};

export interface RecipeCompatibilityCardProps {
  recipe: GenerationRecipe | null;
  /** Model id of the currently selected target model. */
  currentModel: string;
  /** Optional callback when user picks "Use with current model" — sanitizes
   *  the recipe for `currentModel` and feeds it to the parent action. */
  onUseWithCurrentModel?: (sanitized: GenerationRecipe) => void;
  /** Optional callback when user picks "Use original" — uses the raw
   *  recipe without any sanitization. */
  onUseOriginal?: (original: GenerationRecipe) => void;
  /** Optional callback to expand/collapse the detailed comparison. */
  showComparison?: boolean;
  onToggleComparison?: () => void;
  className?: string;
}

export function RecipeCompatibilityCard({
  recipe,
  currentModel,
  onUseWithCurrentModel,
  onUseOriginal,
  showComparison = false,
  onToggleComparison,
  className,
}: RecipeCompatibilityCardProps) {
  const caps = useMemo(() => getImageModelCapabilities(currentModel), [currentModel]);
  const report = useMemo<RecipeCompatibilityReport | null>(() => {
    if (!recipe) return null;
    return getRecipeCompatibilityReport(recipe, caps, true);
  }, [recipe, caps]);

  if (!recipe || !report) {
    return (
      <div className={className} data-testid="recipe-compatibility-empty">
        <div className="text-[11.5px] text-text-secondary">
          This item has no recipe to compare against the current model.
        </div>
      </div>
    );
  }

  return (
    <div className={className} data-testid="recipe-compatibility-card">
      <div
        className={`flex flex-wrap items-center justify-between gap-2 px-2.5 py-1.5 rounded-md border text-[12px] ${STATUS_TONE[report.status]}`}
        data-testid="recipe-compatibility-status"
        data-status={report.status}
        role="status"
        aria-live="polite"
      >
        <div className="flex items-center gap-2">
          <span className="font-medium">{STATUS_LABEL[report.status]}</span>
          <span className="opacity-90">
            for <span className="font-medium">{caps.label}</span>
          </span>
        </div>
        {report.unsupportedFields.length > 0 && (
          <span className="text-[10.5px] opacity-80" title={report.unsupportedFields.join(", ")}>
            {report.unsupportedFields.length} unsupported field{report.unsupportedFields.length === 1 ? "" : "s"}
          </span>
        )}
      </div>
      {report.issues.length > 0 && (
        <ul className="mt-1.5 space-y-0.5" data-testid="recipe-compatibility-issues">
          {report.issues.map((issue, idx) => (
            <li
              key={`${issue.field}-${idx}`}
              className={`text-[11px] ${
                issue.severity === "blocker"
                  ? "text-error"
                  : issue.severity === "warn"
                    ? "text-warning"
                    : "text-text-secondary"
              }`}
            >
              <span className="font-medium">{issue.field}:</span> {issue.message}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {onUseWithCurrentModel && (
          <button
            type="button"
            onClick={() => onUseWithCurrentModel(report.sanitizedRecipe)}
            className="px-2 py-1 text-[11.5px] rounded-md bg-accent text-accent-fg hover:bg-accent-hover transition-colors cursor-pointer"
            data-testid="recipe-use-with-current-model"
          >
            Use with {caps.label}
          </button>
        )}
        {onUseOriginal && (
          <button
            type="button"
            onClick={() => onUseOriginal(recipe)}
            className="px-2 py-1 text-[11.5px] rounded-md bg-surface border border-border text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
            data-testid="recipe-use-original"
            title="Send the original recipe to Image Studio without sanitization"
          >
            Use original
          </button>
        )}
        {onToggleComparison && (
          <button
            type="button"
            onClick={onToggleComparison}
            className="px-2 py-1 text-[11.5px] rounded-md bg-surface border border-border text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
            data-testid="recipe-toggle-comparison"
            aria-expanded={showComparison}
          >
            {showComparison ? "Hide comparison" : "Show comparison"}
          </button>
        )}
      </div>
      {showComparison && (
        <div className="mt-2">
          <RecipeComparison original={recipe} sanitized={report.sanitizedRecipe} />
        </div>
      )}
    </div>
  );
}
