/**
 * @fileoverview Safe error display component for Character Creator preserving user work.
 */

import { AlertCircle, RotateCcw, ArrowLeft, Copy } from "lucide-react";
import { toast } from "../../stores/toast-store";
import { Trans, useTranslation } from "react-i18next";
import { copyText } from "../../utils/download";

interface Props {
  error: string;
  onRetry: () => void;
  onReturnToDraft: () => void;
  hasDraftWork?: boolean;
}

export function CharacterCreatorError({
  error,
  onRetry,
  onReturnToDraft,
  hasDraftWork = false,
}: Props) {
  const { t: tRuntime } = useTranslation("common");
  const handleCopyError = async () => {
    // copyText never rejects and reports success — a denied clipboard write
    // must surface as a toast, not an unhandled rejection.
    const ok = await copyText(error);
    if (ok) {
      toast.success(
        tRuntime(
          "runtimeGenerated.components.characterCreator.charactercreatorerror.notification.errorDetailsCopiedToClipboard",
        ),
      );
    } else {
      toast.error(
        tRuntime(
          "runtimeGenerated.components.characterCreator.charactercreatorerror.notification.couldNotCopyToClipboard",
        ),
      );
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] h-full p-6 text-center max-w-lg mx-auto">
      <div className="w-16 h-16 rounded-full bg-danger/10 border border-danger/30 flex items-center justify-center text-danger mb-4">
        <AlertCircle className="w-8 h-8" />
      </div>

      <h2 className="text-lg font-bold text-text-primary mb-2">
        <Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatorerror.heading.characterCreatorError" />
      </h2>
      <p className="text-xs text-text-muted mb-4 max-w-md">
        <Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatorerror.description.anErrorOccurredDuringGenerationOrCard" />
      </p>

      {/* Error Details Box */}
      <div className="w-full bg-vf-panel-bg/60 rounded-lg border border-danger/20 p-4 mb-6 text-left">
        <div className="flex items-center justify-between text-xs text-danger font-bold mb-1">
          <span>
            <Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatorerror.text.diagnosticMessage" />
          </span>
          <button
            type="button"
            onClick={handleCopyError}
            className="hover:underline flex items-center gap-1 text-[11px] font-medium"
          >
            <Copy className="w-3 h-3" />
            <span>
              <Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatorerror.text.copy" />
            </span>
          </button>
        </div>
        <p className="text-xs text-text-secondary font-mono break-all line-clamp-4 whitespace-pre-line">
          {error}
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 w-full justify-center">
        {hasDraftWork && (
          <button
            type="button"
            onClick={onReturnToDraft}
            className="px-4 py-2 rounded-lg bg-vf-panel-bg border border-vf-panel-border hover:bg-vf-control-hover text-xs font-medium text-text-secondary flex items-center gap-1.5 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>
              <Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatorerror.text.returnToDraft" />
            </span>
          </button>
        )}
        <button
          type="button"
          onClick={onRetry}
          className="px-5 py-2 rounded-lg bg-accent text-accent-fg font-medium text-xs flex items-center gap-1.5 hover:opacity-90 transition-opacity"
        >
          <RotateCcw className="w-4 h-4" />
          <span>
            <Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatorerror.text.retryOperation" />
          </span>
        </button>
      </div>
    </div>
  );
}
