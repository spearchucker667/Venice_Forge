import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { cn } from "../../lib/utils";
import { isImeCompositionEvent } from "../../lib/keyboard";
import { toast } from "../../stores/toast-store";
import { redactErrorMessage } from "../../shared/redaction";
import { IngestedAttachment } from "../../types/ingestion";
import { processFileAttachment } from "../../services/ingestion/attachmentAssembler";
import { registerAttachment } from "../../services/attachmentService";
import { MAX_ATTACHMENTS_PER_MESSAGE } from "../../services/ingestion/ingestionLimits";
import { desktopDocumentAgent } from "../../services/desktopBridge";
import { useProjectStore } from "../../stores/project-store";
import type { ChatMemoryStatus } from "../../hooks/use-chat";
import { Trans, useTranslation } from "react-i18next";
import { IconButton } from "../ui/primitives";

interface ChatInputProps {
  onSend: (message: string, attachments?: IngestedAttachment[]) => void;
  onStop: () => void;
  isStreaming: boolean;
  disabled?: boolean;
  disableImageAttach?: boolean;
  visionUnsupportedModelId?: string;
  memoryStatus?: ChatMemoryStatus;
  settingsControl?: ReactNode | ((draft: string) => ReactNode);
}

const SUPPORTED_ATTACHMENT_ACCEPT = [
  ".pdf",
  ".docx",
  ".doc",
  ".md",
  ".markdown",
  ".txt",
  ".json",
  ".jsonl",
  ".yaml",
  ".yml",
  ".csv",
  ".xls",
  ".xlsx",
  ".xml",
  ".html",
  ".htm",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".go",
  ".rs",
  ".rb",
  ".php",
  ".cs",
  ".c",
  ".cpp",
  ".cc",
  ".cxx",
  ".h",
  ".hpp",
  ".java",
  ".kt",
  ".kts",
  ".swift",
  ".scala",
  ".sh",
  ".bash",
  ".zsh",
  ".fish",
  ".ps1",
  ".bat",
  ".cmd",
  ".sql",
  ".toml",
  ".ini",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".avif",
  ".bmp",
  ".svg",
  ".tif",
  ".tiff",
  ".heic",
  ".heif",
  "text/plain",
  "application/pdf",
  "application/json",
  "image/*",
].join(",");

export function ChatInput({
  onSend,
  onStop,
  isStreaming,
  disabled,
  disableImageAttach,
  visionUnsupportedModelId = "Selected model",
  memoryStatus = "idle",
  settingsControl,
}: ChatInputProps) {
  const { t } = useTranslation("chat");
  const [value, setValue] = useState("");
  const [attachments, setAttachments] = useState<IngestedAttachment[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const previousDisableImageAttach = useRef(disableImageAttach);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const warnVisionUnsupported = useCallback(() => {
    toast.warn(
      t("composer.visionUnsupportedTitle"),
      t("composer.visionUnsupportedDetail", {
        model: visionUnsupportedModelId,
      }),
    );
  }, [t, visionUnsupportedModelId]);

  const handlePromoteAttachment = useCallback(async (att: IngestedAttachment) => {
    if (!att.attachmentId) {
      toast.error(t("composer.attachmentFailed"), t("composer.attachmentNotRegistered"));
      return;
    }
    const projectId = useProjectStore.getState().getActiveProjectId() ?? "default";
    const relativePath = att.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const result = await desktopDocumentAgent.attachments.promote({
      attachmentId: att.attachmentId,
      projectId,
      relativePath,
      displayName: att.name,
      mimeType: att.mimeType,
    });
    if (result.ok) {
      toast.success(t("composer.promotedToDocuments"), att.name);
    } else {
      toast.error(t("composer.attachmentFailed"), result.error || t("composer.promotionFailed"));
    }
  }, [t]);

  useEffect(() => {
    const switchedToNonVision =
      !previousDisableImageAttach.current && disableImageAttach;
    previousDisableImageAttach.current = disableImageAttach;
    if (
      switchedToNonVision &&
      attachments.some((att) => att.modelRequirements.requiresVision)
    ) {
      warnVisionUnsupported();
    }
  }, [attachments, disableImageAttach, warnVisionUnsupported]);

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (disabled) return;
    if (!trimmed && attachments.length === 0) return;
    onSend(trimmed, attachments.length > 0 ? attachments : undefined);
    setValue("");
    setAttachments([]);
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  };

  const attachDisabled = disabled;
  const attachTitle = t("composer.attachTitle");

  const handleFileUpload = async (files: FileList | File[] | null) => {
    if (!files) return;
    const list = Array.from(files);
    const remainingSlots = Math.max(
      0,
      MAX_ATTACHMENTS_PER_MESSAGE - attachments.length,
    );

    if (remainingSlots === 0) {
      toast.warn(
        t("composer.attachmentLimitTitle"),
        t("composer.attachmentLimitDetail", {
          max: MAX_ATTACHMENTS_PER_MESSAGE,
        }),
      );
      return;
    }

    if (list.length > remainingSlots) {
      toast.warn(
        t("composer.tooManyAttachmentsTitle"),
        t("composer.tooManyAttachmentsDetail", {
          added: remainingSlots,
          requested: list.length,
          max: MAX_ATTACHMENTS_PER_MESSAGE,
        }),
      );
    }

    const toProcess = list.slice(0, remainingSlots);
    for (const file of toProcess) {
      try {
        const attachment = await processFileAttachment(file, {
          providerSupportsVision: !disableImageAttach,
        });
        // Register the raw file with the main-process attachment registry so
        // the Document Agent can promote it later. Failures are non-fatal for
        // chat use; promotion simply won't be offered.
        try {
          const attachmentId = await registerAttachment(file);
          if (attachmentId) attachment.attachmentId = attachmentId;
        } catch {
          // Non-fatal: chat ingestion still works without main registration.
        }
        if (disableImageAttach && attachment.modelRequirements.requiresVision) {
          warnVisionUnsupported();
        }
        setAttachments((prev) => [...prev, attachment]);
        if (attachment.extraction.warnings.length > 0) {
          attachment.extraction.warnings.forEach((w) =>
            toast.warn(t("composer.attachmentNote"), w),
          );
        }
      } catch (err) {
        toast.error(t("composer.attachmentFailed"), redactErrorMessage(err));
      }
    }
  };

  return (
    <div className="px-4 sm:px-6 pb-5 pt-2">
      <div className="w-full max-w-vf-comfort mx-auto">
        {attachments.length > 0 && (
          <div className="flex gap-2 mb-2 overflow-x-auto pb-1 pt-2 pr-2">
            {attachments.map((att, i) => {
              if (att.kind === "image" && att.dataUrl) {
                const isSafe = [
                  "data:image/png;base64,",
                  "data:image/jpeg;base64,",
                  "data:image/webp;base64,",
                  "blob:",
                ].some((prefix) => att.dataUrl!.startsWith(prefix));
                const safeImg = isSafe
                  ? att.dataUrl!.replace(/[<>"']/g, "")
                  : "";
                return (
                  <div
                    key={att.id}
                    className="relative group shrink-0"
                    title={att.name}
                  >
                    <img
                      src={safeImg}
                      alt={t("composer.attachmentAlt", { number: i + 1 })}
                      className="h-16 w-16 object-cover rounded-lg border border-vf-panel-border"
                    />
                    <IconButton
                      size="sm"
                      tone="danger"
                      onClick={() =>
                        setAttachments((prev) => prev.filter((_, j) => j !== i))
                      }
                      ariaLabel={t("composer.removeAttachment", {
                        name: att.name,
                      })}
                      className="absolute -top-2 -right-2 rounded-full shadow-sm bg-danger hover:bg-danger/90 text-danger-fg border border-danger p-0"
                      icon={
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="3"
                          strokeLinecap="round"
                        >
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      }
                    />
                  </div>
                );
              }
              // Document/text attachment card
              return (
                <div
                  key={att.id}
                  className="relative group shrink-0 flex items-center gap-2 h-16 px-3 bg-vf-panel-bg border border-vf-panel-border rounded-lg max-w-vf-narrow"
                  title={att.name}
                >
                  <div className="flex flex-col flex-1 min-w-0">
                    <span className="vf-meta font-medium text-text-primary truncate">
                      {att.name}
                    </span>
                    <span className="vf-tag text-text-muted">
                      {att.kind}
                    </span>
                  </div>
                  {att.attachmentId && (
                    <IconButton
                      size="sm"
                      tone="accent"
                      onClick={() => handlePromoteAttachment(att)}
                      ariaLabel={t("composer.saveToDocuments", { name: att.name })}
                      title={t("composer.saveToDocuments", { name: att.name })}
                      className="shrink-0"
                      icon={
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.75"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                          <polyline points="17 21 17 13 7 13 7 21" />
                          <polyline points="7 3 7 8 15 8" />
                        </svg>
                      }
                    />
                  )}
                  <IconButton
                    size="sm"
                    tone="danger"
                    onClick={() =>
                      setAttachments((prev) => prev.filter((_, j) => j !== i))
                    }
                    ariaLabel={t("composer.removeAttachment", {
                      name: att.name,
                    })}
                    className="shrink-0 -mr-1"
                    icon={
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.75"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    }
                  />
                </div>
              );
            })}
          </div>
        )}

        <div
          className={cn("vf-composer relative overflow-hidden")}
          data-drag-over={dragOver ? "true" : undefined}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!disabled) setDragOver(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDragOver(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDragOver(false);
            if (!disabled) void handleFileUpload(e.dataTransfer.files);
          }}
        >
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (isImeCompositionEvent(e)) return;
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            onPaste={(e) => {
              if (disabled) return;
              const items = e.clipboardData?.items;
              if (!items) return;
              const files: File[] = [];
              for (const item of items) {
                if (item.kind === "file") {
                  const file = item.getAsFile();
                  if (file) files.push(file);
                }
              }
              if (files.length > 0) {
                void handleFileUpload(files);
              }
            }}
            placeholder={
              disabled
                ? t("composer.disabledPlaceholder")
                : dragOver
                  ? t("composer.dropPlaceholder")
                  : t("composer.placeholder")
            }
            rows={1}
            aria-label={t("composer.messageInput")}
            className="w-full bg-transparent px-5 pt-4 pb-1 vf-body text-text-primary outline-none resize-none max-h-48 placeholder:text-text-muted leading-relaxed"
            disabled={disabled}
          />
          <div className="flex items-center justify-between px-3 pb-2.5">
            <div className="flex items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                multiple
                accept={SUPPORTED_ATTACHMENT_ACCEPT}
                className="hidden"
                onChange={(e) => handleFileUpload(e.target.files)}
              />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={attachDisabled}
                aria-label={t("composer.attachFile")}
                className="flex items-center gap-1.5 px-2 py-1.5 vf-meta text-text-muted hover:text-text-primary transition-colors rounded-md hover:bg-vf-control-hover disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                title={attachTitle}
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
                </svg>
              </button>
              <MemoryStatusIndicator status={memoryStatus} />
              {typeof settingsControl === "function"
                ? settingsControl(value)
                : settingsControl}
            </div>
            {isStreaming ? (
              <button
                onClick={onStop}
                aria-label={t("composer.stopGenerating")}
                className="flex items-center gap-1.5 px-3 py-1.5 vf-meta font-medium text-text-primary bg-vf-panel-bg-raised hover:bg-vf-control-hover border border-vf-panel-border rounded-lg transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
              >
                <svg
                  width="9"
                  height="9"
                  viewBox="0 0 8 8"
                  fill="currentColor"
                  strokeWidth="1.75"
                >
                  <rect width="8" height="8" rx="1" />
                </svg>
                <Trans i18nKey="common:surface.componentsChatChatInput.action.stop" />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={
                  (!value.trim() && attachments.length === 0) || disabled
                }
                aria-label={t("composer.sendMessage")}
                className={cn(
                  "w-10 h-10 flex items-center justify-center rounded-md transition-all duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2",
                  (value.trim() || attachments.length > 0) && !disabled
                    ? "bg-accent text-accent-fg hover:bg-accent-hover active:scale-95 shadow-[0_0_8px_var(--color-vf-accent-glow)]"
                    : "bg-vf-panel-bg-inset text-text-muted border border-vf-panel-border",
                )}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MemoryStatusIndicator({ status }: { status: ChatMemoryStatus }) {
  const { t } = useTranslation("chat");
  if (status === "idle") return null;
  const config: Record<
    ChatMemoryStatus,
    { label: string; dot: string; title: string }
  > = {
    disabled: {
      label: t("memory.disabledLabel"),
      dot: "bg-text-muted/40",
      title: t("memory.disabledTitle"),
    },
    idle: { label: "", dot: "", title: "" },
    loading: {
      label: t("memory.loadingLabel"),
      dot: "bg-accent animate-pulse",
      title: t("memory.loadingTitle"),
    },
    injected: {
      label: t("memory.activeLabel"),
      dot: "bg-success",
      title: t("memory.activeTitle"),
    },
    failed: {
      label: t("memory.failedLabel"),
      dot: "bg-warning",
      title: t("memory.failedTitle"),
    },
  };
  const { label, dot, title } = config[status];
  return (
    <div
      className="flex items-center gap-1.5 vf-tag text-text-muted"
      title={title}
    >
      <span className={cn("w-1.5 h-1.5 rounded-full", dot)} />
      <span>{label}</span>
    </div>
  );
}
