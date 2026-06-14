import type { CharacterSceneGenerationStatus } from '../../types/characterSceneGeneration';

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
  queued: 'Scene queued',
  compiling: 'Compiling scene',
  generating: 'Generating scene',
  complete: 'Scene complete',
  failed: 'Scene failed',
  blocked: 'Scene blocked',
  rate_limited: 'Scene generation paused',
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
  const isRunning = status === 'queued' || status === 'compiling' || status === 'generating';
  const isError = status === 'failed' || status === 'blocked' || status === 'rate_limited';

  return (
    <div className="my-3 rounded-xl border border-border bg-surface-elevated p-4 shadow-sm max-w-md">
      <div className="flex items-center gap-2 mb-2">
        <span
          className={`inline-block w-2 h-2 rounded-full ${
            status === 'complete'
              ? 'bg-success'
              : isError
                ? 'bg-danger'
                : isRunning
                  ? 'bg-accent animate-pulse'
                  : 'bg-text-muted'
          }`}
        />
        <span className="text-[13.5px] font-medium text-text-primary">{statusLabels[status]}</span>
      </div>

      {prompt && (
        <div className="mb-3">
          <p className="text-[12px] text-text-muted uppercase tracking-wide mb-1">Scene prompt</p>
          <p className="text-[13.5px] text-text-secondary leading-relaxed line-clamp-4">{prompt}</p>
        </div>
      )}

      {isError && (
        <div className="mb-3 text-[13px] text-danger bg-danger/5 border border-danger/10 rounded-lg px-3 py-2">
          {rateLimitReason || error || 'Unable to generate scene.'}
        </div>
      )}

      {imageUrl && status === 'complete' && (
        <div className="mb-3 rounded-lg border border-border overflow-hidden">
          <img src={imageUrl} alt="Generated scene" className="w-full h-auto object-cover" />
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {status === 'complete' && onOpenInMediaStudio && (
          <button
            onClick={onOpenInMediaStudio}
            className="px-3 py-1.5 rounded-lg text-[12.5px] font-medium bg-accent text-accent-fg hover:bg-accent-hover transition-colors cursor-pointer"
          >
            Open in Media Studio
          </button>
        )}
        {prompt && onCopyPrompt && (
          <button
            onClick={onCopyPrompt}
            className="px-3 py-1.5 rounded-lg text-[12.5px] font-medium bg-surface border border-border text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors cursor-pointer"
          >
            Copy prompt
          </button>
        )}
        {(status === 'failed' || status === 'rate_limited') && onRetry && (
          <button
            onClick={onRetry}
            className="px-3 py-1.5 rounded-lg text-[12.5px] font-medium bg-surface border border-border text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors cursor-pointer"
          >
            Retry
          </button>
        )}
        {status === 'complete' && onRegenerate && (
          <button
            onClick={onRegenerate}
            className="px-3 py-1.5 rounded-lg text-[12.5px] font-medium bg-surface border border-border text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors cursor-pointer"
          >
            Regenerate
          </button>
        )}
        {isRunning && onCancel && (
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded-lg text-[12.5px] font-medium bg-surface border border-border text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors cursor-pointer"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
