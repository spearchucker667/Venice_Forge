/**
 * @fileoverview Validation preview and explicit approval screen before character card creation.
 */

import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  MessageSquare,
  ArrowLeft,
} from "lucide-react";
import type { CharacterCreatorDraft } from "../../types/character-creator";
import { Trans, useTranslation } from "react-i18next";

interface Props {
  draft: CharacterCreatorDraft;
  validationResults: {
    valid: boolean;
    errors: string[];
    warnings: string[];
    recommendations: string[];
  };
  onApproveAndCreate: (
    startChatImmediately?: boolean,
    saveAsCopy?: boolean,
  ) => void;
  onReturnToDraft: () => void;
}

export function CharacterCreatorReady({
  draft,
  validationResults,
  onApproveAndCreate,
  onReturnToDraft,
}: Props) {
  const { t: tRuntime } = useTranslation("common");
  const cardData = draft.card.data;
  const isEditingExisting = Boolean(draft.sourceCharacterId);

  return (
    <div className="flex flex-col items-center justify-start min-h-full p-6 md:p-10 max-w-2xl mx-auto overflow-y-auto">
      <div className="w-full bg-vf-panel-bg/60 p-6 rounded-xl border border-vf-panel-border flex flex-col gap-6 shadow-sm">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-vf-panel-border pb-4">
          <div
            className={`p-3 rounded-lg ${validationResults.valid ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}
          >
            {validationResults.valid ? (
              <CheckCircle2 className="w-6 h-6" />
            ) : (
              <XCircle className="w-6 h-6" />
            )}
          </div>
          <div>
            <h2 className="text-lg font-bold text-text-primary">
              {validationResults.valid
                ? tRuntime(
                    "runtimeGenerated.components.characterCreator.charactercreatorready.text.characterReadyForApproval",
                  )
                : tRuntime(
                    "runtimeGenerated.components.characterCreator.charactercreatorready.text.validationIssuesDetected",
                  )}
            </h2>
            <p className="text-xs text-text-muted">
              {validationResults.valid
                ? tRuntime(
                    "runtimeGenerated.components.characterCreator.charactercreatorready.text.reviewTheValidationPreviewAndExplicitlyApproveCreationToAdd",
                  )
                : tRuntime(
                    "runtimeGenerated.components.characterCreator.charactercreatorready.text.resolveValidationErrorsBeforeApprovingCharacterCardCreation",
                  )}
            </p>
          </div>
        </div>

        {/* Character Card Preview Summary */}
        <div className="flex flex-col gap-2 p-4 rounded-lg bg-vf-panel-bg-raised/50 border border-vf-panel-border text-xs">
          <div className="flex justify-between items-center">
            <span className="font-bold text-text-primary text-sm">
              {cardData.name}
            </span>
            <span className="text-[11px] px-2 py-0.5 rounded bg-accent/15 text-accent font-mono">
              <Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatorready.text.charaCardV2" />
            </span>
          </div>
          <p className="text-text-secondary line-clamp-2 italic">
            {cardData.description ||
              tRuntime(
                "runtimeGenerated.components.characterCreator.charactercreatorready.text.noDescriptionSpecified",
              )}
          </p>
        </div>

        {/* Validation Output */}
        <div className="flex flex-col gap-3">
          {validationResults.errors.length > 0 && (
            <div className="p-3.5 rounded-lg bg-danger/10 border border-danger/20 text-xs flex flex-col gap-1.5">
              <span className="font-bold text-danger flex items-center gap-1.5">
                <XCircle className="w-4 h-4" />{" "}
                <Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatorready.text.errorsMustResolve" />
              </span>
              <ul className="list-disc list-inside text-danger/90 gap-1 flex flex-col pl-1">
                {validationResults.errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          {validationResults.warnings.length > 0 && (
            <div className="p-3.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs flex flex-col gap-1.5">
              <span className="font-bold text-amber-300 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4" />{" "}
                <Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatorready.text.warningsOptional" />
              </span>
              <ul className="list-disc list-inside text-amber-200/90 gap-1 flex flex-col pl-1">
                {validationResults.warnings.map((warn, i) => (
                  <li key={i}>{warn}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Explicit Approval Notice */}
        <div className="p-3 rounded-lg bg-vf-panel-bg border border-vf-panel-border text-[11px] text-text-muted italic">
          {isEditingExisting
            ? tRuntime(
                "runtimeGenerated.components.characterCreator.charactercreatorready.text.thisDraftWasLoadedFromAnExistingCharacterYouCan",
              )
            : tRuntime(
                "runtimeGenerated.components.characterCreator.charactercreatorready.text.thisWillCreateANewLocalCharacterFromTheCurrent",
              )}
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
          <button
            type="button"
            onClick={onReturnToDraft}
            className="w-full sm:w-auto px-4 py-2 rounded-lg bg-vf-panel-bg border border-vf-panel-border hover:bg-vf-control-hover text-xs font-medium text-text-secondary flex items-center justify-center gap-1.5 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>
              <Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatorready.text.returnToDraft" />
            </span>
          </button>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            {isEditingExisting && (
              <button
                type="button"
                disabled={!validationResults.valid}
                onClick={() => onApproveAndCreate(false, true)}
                className="flex-1 sm:flex-initial px-3 py-2 rounded-lg bg-vf-panel-bg border border-vf-panel-border hover:bg-vf-control-hover text-text-secondary text-xs font-medium flex items-center justify-center gap-1 disabled:opacity-50 transition-colors"
              >
                <span>
                  <Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatorready.text.saveAsCopy" />
                </span>
              </button>
            )}
            <button
              type="button"
              disabled={!validationResults.valid}
              onClick={() => onApproveAndCreate(false, false)}
              className="flex-1 sm:flex-initial px-4 py-2 rounded-lg bg-vf-panel-bg border border-accent/40 hover:bg-accent/10 text-accent font-medium text-xs flex items-center justify-center gap-1.5 disabled:opacity-50 transition-colors"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {isEditingExisting
                  ? tRuntime(
                      "runtimeGenerated.components.characterCreator.charactercreatorready.text.updateCharacter",
                    )
                  : tRuntime(
                      "runtimeGenerated.components.characterCreator.charactercreatorready.text.createCharacter",
                    )}
              </span>
            </button>
            <button
              type="button"
              disabled={!validationResults.valid}
              onClick={() => onApproveAndCreate(true, false)}
              className="flex-1 sm:flex-initial px-5 py-2 rounded-lg bg-accent text-accent-contrast font-medium text-xs flex items-center justify-center gap-1.5 hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              <MessageSquare className="w-4 h-4" />
              <span>
                {isEditingExisting
                  ? tRuntime(
                      "runtimeGenerated.components.characterCreator.charactercreatorready.text.updateStartChat",
                    )
                  : tRuntime(
                      "runtimeGenerated.components.characterCreator.charactercreatorready.text.createStartChat",
                    )}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
