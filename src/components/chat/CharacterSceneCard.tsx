import type { CharacterSceneGenerationStatus } from "../../types/characterSceneGeneration";
import { Trans, useTranslation } from "react-i18next";

interface CharacterSceneCardProps {
  status: CharacterSceneGenerationStatus;
  prompt?: string;
  imageUrl?: string;
  error?: string;
  rateLimitReason?: string;
  onRetry?: () => void;
  onRegenerate?: () => void;
  onCancel?: () => void;
  onOpenInMediaStudio?: () => void;
  onCopyPrompt?: () => void;
}

const statusLabels: Record<CharacterSceneGenerationStatus, string> = {
  queued: "Scene queued",
  compiling: "Compiling scene",
  generating: "Generating scene",
  complete: "Scene complete",
  failed: "Scene failed",
  blocked: "Scene blocked",
  rate_limited: "Scene generation paused",
};

export function CharacterSceneCard({
  status,
  prompt,
  imageUrl,
  error,
  rateLimitReason,
  onRetry,
  onRegenerate,
  onCancel,
  onOpenInMediaStudio,
  onCopyPrompt,
}: CharacterSceneCardProps) {
  const { t: tRuntime } = useTranslation("common");
  const isRunning =
    status === "queued" || status === "compiling" || status === "generating";
  const isError =
    status === "failed" || status === "blocked" || status === "rate_limited";

  return (
    <div className="my-3 rounded-lg border border-vf-panel-border bg-vf-panel-bg-raised p-4 shadow-sm max-w-md">
      <div className="flex items-center gap-2 mb-2">
        <span
          className={`inline-block w-2 h-2 rounded-full ${
            status === "complete"
              ? "bg-success"
              : isError
                ? "bg-danger"
                : isRunning
                  ? "bg-accent shadow-[0_0_6px_var(--color-vf-accent-glow)] animate-pulse"
                  : "bg-text-muted"
          }`}
        />
        <span className="text-[13.5px] font-medium text-text-primary">
          {statusLabels[status]}
        </span>
      </div>

      {prompt && (
        <div className="mb-3">
          <p className="text-[12px] text-text-muted uppercase tracking-wide mb-1">
            <Trans i18nKey="common:surface.componentsChatCharacterscenecard.description.scenePrompt" />
          </p>
          <p className="text-[13.5px] text-text-secondary leading-relaxed line-clamp-4">
            {prompt}
          </p>
        </div>
      )}

      {isError && (
        <div className="mb-3 text-[13px] text-danger bg-danger/10 border border-danger/20 rounded-md px-3 py-2">
          {rateLimitReason ||
            error ||
            tRuntime(
              "runtimeGenerated.components.chat.characterscenecard.text.unableToGenerateScene",
            )}
        </div>
      )}

      {imageUrl && status === "complete" && (
        <div className="mb-3 rounded-md border border-vf-panel-border overflow-hidden">
          <img
            src={imageUrl}
            alt={tRuntime(
              "runtimeGenerated.components.chat.characterscenecard.attribute.generatedScene",
            )}
            className="w-full h-auto object-cover"
          />
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {status === "complete" && onOpenInMediaStudio && (
          <button
            onClick={onOpenInMediaStudio}
            className="px-3 py-1.5 rounded-md text-[12.5px] font-medium bg-accent text-accent-fg hover:bg-accent-hover shadow-[0_0_8px_var(--color-vf-accent-glow-subtle)] transition-colors cursor-pointer"
          >
            <Trans i18nKey="common:surface.componentsChatCharacterscenecard.action.openInMediaStudio" />
          </button>
        )}
        {prompt && onCopyPrompt && (
          <button
            onClick={onCopyPrompt}
            className="px-3 py-1.5 rounded-md text-[12.5px] font-medium bg-vf-panel-bg border border-vf-panel-border text-text-secondary hover:text-text-primary hover:bg-vf-control-hover transition-colors cursor-pointer"
          >
            <Trans i18nKey="common:surface.componentsChatCharacterscenecard.action.copyPrompt" />
          </button>
        )}
        {(status === "failed" || status === "rate_limited") && onRetry && (
          <button
            onClick={onRetry}
            className="px-3 py-1.5 rounded-md text-[12.5px] font-medium bg-vf-panel-bg border border-vf-panel-border text-text-secondary hover:text-text-primary hover:bg-vf-control-hover transition-colors cursor-pointer"
          >
            <Trans i18nKey="common:surface.componentsChatCharacterscenecard.action.retry" />
          </button>
        )}
        {status === "complete" && onRegenerate && (
          <button
            onClick={onRegenerate}
            className="px-3 py-1.5 rounded-md text-[12.5px] font-medium bg-vf-panel-bg border border-vf-panel-border text-text-secondary hover:text-text-primary hover:bg-vf-control-hover transition-colors cursor-pointer"
          >
            <Trans i18nKey="common:surface.componentsChatCharacterscenecard.action.regenerate" />
          </button>
        )}
        {isRunning && onCancel && (
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded-md text-[12.5px] font-medium bg-vf-panel-bg border border-vf-panel-border text-text-secondary hover:text-text-primary hover:bg-vf-control-hover transition-colors cursor-pointer"
          >
            <Trans i18nKey="common:surface.componentsChatCharacterscenecard.action.cancel" />
          </button>
        )}
      </div>
    </div>
  );
}
