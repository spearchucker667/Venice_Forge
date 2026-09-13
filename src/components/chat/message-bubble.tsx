import {
  useState,
  useRef,
  useEffect,
  memo,
  useMemo,
  lazy,
  Suspense,

} from "react";
import type { ChatMessage, ContentPart } from "../../types/venice";
import type { ConversationMessage } from "../../types/conversation";
import type { ChatAttachmentRef } from "../../types/chatAttachment";
import type { ChatMediaReference, ConversationCharacterMeta } from "../../types/conversationVault";
import { cn } from "../../lib/utils";
import { isImeCompositionEvent } from "../../lib/keyboard";
import { CharacterAvatar } from "../characters/CharacterAvatar";
import { useSettingsStore } from "../../stores/settings-store";
import { GenerationLoadingIndicator } from "../generation/GenerationLoadingIndicator";
import { maybeRunLocalFamilyGuard } from "../../shared/safety";
import { copyText } from "../../stores/media-send-to";
import { useKatexCss } from "../../hooks/useKatexCss";
import { CharacterSceneCard } from "./CharacterSceneCard";
import type { CharacterSceneGenerationResult } from "../../types/characterSceneGeneration";
import type { ChatDocumentRef } from "../../types/chatDocument";
import { ManagedDocumentAttachmentCard } from "../documents/ManagedDocumentAttachmentCard";
import { Trans, useTranslation } from "react-i18next";
import { safeVeniceMediaUrl } from "../../utils/mediaItem";
import { ContextMenu, useContextMenu } from "../ui/ContextMenu";
import type { ContextMenuItem } from "../ui/ContextMenu";
import { IconButton } from "../ui/primitives";
;

const ChatTtsPlayer = lazy(async () => {
  const module = await import("./ChatTtsPlayer");
  return { default: module.ChatTtsPlayer };
});

// Vite owns the emitted URL so it remains valid for both HTTP development and
// packaged file:// execution.
export const DEFAULT_AI_AVATAR_SRC = "assets/branding/venice-seal-red-fill.svg";
import { ChatMarkdown } from "./ChatMarkdown";

type InjectedContextSource = NonNullable<
  ChatMessage["metadata"]
>["injectedContextSource"];

function formatInjectedContextSource(
  source: InjectedContextSource | undefined,
): string {
  switch (source) {
    case "memory":
      return "Memory";
    case "prior_context":
      return "Prior context";
    case "approved_context":
      return "Approved context";
    case "mixed":
      return "Mixed context";
    default:
      return "Injected context";
  }
}

// Extract text and images from multimodal content
function extractContent(content: string | ContentPart[]): {
  text: string;
  images: string[];
} {
  if (!content) return { text: "", images: [] };
  if (typeof content === "string") return { text: content, images: [] };
  let text = "";
  const images: string[] = [];
  for (const part of content) {
    if (part.type === "text" && part.text) text += part.text;
    if (part.type === "image_url" && part.image_url?.url)
      images.push(part.image_url.url);
  }
  return { text, images };
}

interface MessageBubbleProps {
  message: ChatMessage;
  index: number;
  onCopy: () => void;
  onDelete: () => void;
  onEdit?: (content: ChatMessage["content"]) => void;
  onDeleteFromHere?: () => void;
  onRegenerateFromHere?: () => void;
  onForkFromHere?: () => void;
  onRegenerate?: () => void;
  onGenerateScene?: () => void;
  onRemoveMedia?: (messageId: string, refId: string) => void;
  isCharacterBound?: boolean;
  assistantAvatarUrl?: string;
  assistantCharacter?: ConversationCharacterMeta;
  assistantCharacterCacheKey?: string;
}

function MessageBubbleImpl({
  message,
  index,
  onCopy,
  onDelete,
  onEdit,
  onDeleteFromHere,
  onRegenerateFromHere,
  onForkFromHere,
  onRegenerate,
  onGenerateScene,
  onRemoveMedia,
  isCharacterBound,
  assistantAvatarUrl,
  assistantCharacter,
  assistantCharacterCacheKey,
}: MessageBubbleProps) {
  const { t: tRuntime } = useTranslation("common");
  const bubbleMenu = useContextMenu();
  useKatexCss();

  const [hovering, setHovering] = useState(false);
  const [copied, setCopied] = useState(false);
  const [reasoningOpen, setReasoningOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";
  const isTool = message.role === "tool";
  const { text: content, images } = extractContent(message.content);
  const redTeamMode = useSettingsStore((s) => s.redTeamMode);
  const localFamilySafeModeEnabled = useSettingsStore(
    (s) => s.localFamilySafeModeEnabled,
  );
  const characterSceneGenerationEnabled = useSettingsStore(
    (s) => s.characterSceneGenerationEnabled,
  );
  const showTtsControls = useSettingsStore(
    (s) => s.audioPreferences?.chatTts.showMessageControls ?? true,
  );
  const sceneGeneration = message.metadata?.sceneGeneration as
    CharacterSceneGenerationResult | undefined;
  const injectedContext =
    typeof message.metadata?.injectedContext === "string"
      ? message.metadata.injectedContext.trim()
      : "";
  const injectedContextLabel = formatInjectedContextSource(
    message.metadata?.injectedContextSource,
  );

  const localSafetyDecision = useMemo(() => {
    // BUG-React#3 regression guard: only run the safety guard in Traffic Inspector AND
    // when Family Safe Mode is enabled; non-redteam users should never pay the
    // regex/lookup cost on every render.
    if (!redTeamMode || !content || !localFamilySafeModeEnabled) return null;
    try {
      return (
        maybeRunLocalFamilyGuard(
          {
            endpoint: "/chat/completions",
            method: "POST",
            text: content,
            source: "chat",
          },
          true,
        ).guardDecision ?? null
      );
    } catch {
      return null;
    }
  }, [content, localFamilySafeModeEnabled, redTeamMode]);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  const handleCopy = () => {
    void copyText(content);
    setCopied(true);
    onCopy();
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    copyTimeoutRef.current = setTimeout(() => setCopied(false), 1500);
  };

  const beginEdit = () => {
    setEditText(content);
    setIsEditing(true);
  };

  const saveEdit = () => {
    const nextContent: ChatMessage["content"] =
      typeof message.content === "string"
        ? editText
        : message.content.map((part) =>
            part.type === "text" ? { ...part, text: editText } : { ...part },
          );
    onEdit?.(nextContent);
    setIsEditing(false);
  };

  const injectedContextDisclosure = injectedContext ? (
    <details className="mt-3 rounded-lg border border-border-soft bg-surface-elevated/30 text-left vf-meta text-text-secondary">
      <summary className="cursor-pointer select-none px-3 py-2 font-medium text-text-primary">
        {injectedContextLabel}{" "}
        <Trans i18nKey="common:surface.componentsChatMessageBubble.text.attachedToThisMessage" />
      </summary>
      <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words soft-separator-y px-3 py-2 font-mono vf-meta leading-relaxed text-text-muted">
        {injectedContext}
      </pre>
    </details>
  ) : null;

  const actions = (
    <div
      className={`flex items-center gap-0.5 h-7 transition-opacity duration-150 focus-within:opacity-100 ${hovering ? "opacity-100" : "opacity-90 sm:opacity-0"}`}
    >
      <ActionBtn
        label={
          copied
            ? tRuntime(
                "runtimeGenerated.components.chat.messageBubble.attribute.copied",
              )
            : tRuntime(
                "runtimeGenerated.components.chat.messageBubble.attribute.copy",
              )
        }
        onClick={handleCopy}
      >
        {copied ? (
          <svg
            aria-hidden="true"
            focusable="false"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <svg
            aria-hidden="true"
            focusable="false"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="9" y="9" width="13" height="13" rx="2" />
            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
          </svg>
        )}
      </ActionBtn>
      {onEdit && (
        <ActionBtn
          label={tRuntime(
            "runtimeGenerated.components.chat.messageBubble.attribute.editMessage",
          )}
          onClick={beginEdit}
        >
          <svg
            aria-hidden="true"
            focusable="false"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4 16.5-16.5z" />
          </svg>
        </ActionBtn>
      )}
      {onForkFromHere && (
        <ActionBtn
          label={tRuntime(
            "runtimeGenerated.components.chat.messageBubble.attribute.forkChatFromHere",
          )}
          onClick={onForkFromHere}
        >
          <svg
            aria-hidden="true"
            focusable="false"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="18" r="3" />
            <circle cx="6" cy="6" r="3" />
            <circle cx="18" cy="6" r="3" />
            <path d="M18 9v1a2 2 0 01-2 2H8a2 2 0 01-2-2V9" />
            <path d="M12 12v3" />
          </svg>
        </ActionBtn>
      )}
      {onDeleteFromHere && (
        <ActionBtn
          label={tRuntime(
            "runtimeGenerated.components.chat.messageBubble.attribute.deleteFromHere",
          )}
          onClick={onDeleteFromHere}
        >
          <svg
            aria-hidden="true"
            focusable="false"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 6h18" />
            <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6" />
            <line x1="10" y1="11" x2="10" y2="17" />
            <line x1="14" y1="11" x2="14" y2="17" />
            <path d="M12 2v4" />
          </svg>
        </ActionBtn>
      )}
      {onRegenerateFromHere && (
        <ActionBtn
          label={tRuntime(
            "runtimeGenerated.components.chat.messageBubble.attribute.regenerateFromHere",
          )}
          onClick={onRegenerateFromHere}
        >
          <svg
            aria-hidden="true"
            focusable="false"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M1 4v6h6" />
            <path d="M3.51 15a9 9 0 102.13-9.36L1 10" />
          </svg>
        </ActionBtn>
      )}
      {!isUser && onRegenerate && (
        <ActionBtn
          label={tRuntime(
            "runtimeGenerated.components.chat.messageBubble.attribute.regenerate",
          )}
          onClick={onRegenerate}
        >
          <svg
            aria-hidden="true"
            focusable="false"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M1 4v6h6" />
            <path d="M3.51 15a9 9 0 102.13-9.36L1 10" />
          </svg>
        </ActionBtn>
      )}
      {!isUser &&
        isAssistant &&
        characterSceneGenerationEnabled &&
        isCharacterBound &&
        onGenerateScene && (
          <ActionBtn
            label={tRuntime(
              "runtimeGenerated.components.chat.messageBubble.attribute.createScene",
            )}
            onClick={onGenerateScene}
          >
            <svg
              aria-hidden="true"
              focusable="false"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
          </ActionBtn>
        )}
      <ActionBtn
        label={tRuntime(
          "runtimeGenerated.components.chat.messageBubble.attribute.delete",
        )}
        onClick={onDelete}
        destructive
      >
        <svg
          aria-hidden="true"
          focusable="false"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
        </svg>
      </ActionBtn>
    </div>
  );

  const bubbleMenuItems: ContextMenuItem[] = [
    {
      key: "copy",
      label: tRuntime(
        "runtimeGenerated.components.chat.messageBubble.attribute.copy",
      ),
      onSelect: () => {
        handleCopy();
      },
      separatorAfter: !isUser && !!onRegenerate,
    },
    ...(onEdit
      ? [
          {
            key: "edit",
            label: tRuntime(
              "runtimeGenerated.components.chat.messageBubble.attribute.editMessage",
            ),
            hidden: !isUser,
            onSelect: () => {
              beginEdit();
            },
          } satisfies ContextMenuItem,
        ]
      : []),
    ...(onForkFromHere
      ? [
          {
            key: "fork",
            label: tRuntime(
              "runtimeGenerated.components.chat.messageBubble.attribute.forkChatFromHere",
            ),
            onSelect: () => {
              onForkFromHere();
            },
          } satisfies ContextMenuItem,
        ]
      : []),
    ...(onDeleteFromHere
      ? [
          {
            key: "deleteFromHere",
            label: tRuntime(
              "runtimeGenerated.components.chat.messageBubble.attribute.deleteFromHere",
            ),
            destructive: true,
            onSelect: () => {
              onDeleteFromHere();
            },
          } satisfies ContextMenuItem,
        ]
      : []),
    ...(onRegenerateFromHere
      ? [
          {
            key: "regenerateFromHere",
            label: tRuntime(
              "runtimeGenerated.components.chat.messageBubble.attribute.regenerateFromHere",
            ),
            onSelect: () => {
              onRegenerateFromHere();
            },
          } satisfies ContextMenuItem,
        ]
      : []),
    ...(onRegenerate && !isUser
      ? [
          {
            key: "regenerate",
            label: tRuntime(
              "runtimeGenerated.components.chat.messageBubble.attribute.regenerate",
            ),
            onSelect: () => {
              onRegenerate();
            },
          } satisfies ContextMenuItem,
        ]
      : []),
    ...(onGenerateScene && !isUser && isCharacterBound
      ? [
          {
            key: "createScene",
            label: tRuntime(
              "runtimeGenerated.components.chat.messageBubble.attribute.createScene",
            ),
            onSelect: () => {
              onGenerateScene();
            },
          } satisfies ContextMenuItem,
        ]
      : []),
    { kind: "separator", key: "sep-end" },
    {
      key: "delete",
      label: tRuntime(
        "runtimeGenerated.components.chat.messageBubble.attribute.delete",
      ),
      destructive: true,
      onSelect: () => {
        onDelete();
      },
    },
  ];

  if (isUser) {
    // Resolve structured attachment refs from message metadata.
    // Historical records may use the legacy `attachments: string[]` shape;
    // new records carry `attachmentRefs: ChatAttachmentRef[]`.
    const attachmentRefs: ChatAttachmentRef[] = Array.isArray(
      message.metadata?.attachmentRefs,
    )
      ? (message.metadata!.attachmentRefs as ChatAttachmentRef[])
      : [];

    return (
      <>
        <div
          className="flex justify-end"
          onContextMenu={bubbleMenu.openAt}
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => setHovering(false)}
        >
        <div className="flex items-end gap-1.5 max-w-[78%]">
          {actions}
          <div className="bg-surface-elevated border border-border rounded-2xl rounded-br-md px-4 py-2.5 shadow-sm">
            {images.length > 0 && (
              <div className="flex gap-1.5 mb-2">
                {images.map((img, i) => {
                  const allowedPrefixes = [
                    "data:image/png;base64,",
                    "data:image/jpeg;base64,",
                    "data:image/webp;base64,",
                    "blob:",
                    "https://",
                    "http://",
                  ];
                  const isSafe = allowedPrefixes.some((prefix) =>
                    img.startsWith(prefix),
                  );
                  const safeImg = isSafe ? img.replace(/[<>"']/g, "") : "";
                  if (safeImg) {
                    return (
                      <img
                        key={i}
                        src={safeImg}
                        alt={tRuntime(
                          "runtimeGenerated.components.chat.messageBubble.attribute.attachmentValue1",
                          { value1: i + 1 },
                        )}
                        className="h-24 rounded-lg border border-border"
                      />
                    );
                  }
                  return null;
                })}
              </div>
            )}
            {isEditing ? (
              <div className="space-y-2">
                <textarea
                  aria-label={tRuntime(
                    "runtimeGenerated.components.chat.messageBubble.attribute.editMessageText",
                  )}
                  autoFocus
                  value={editText}
                  onChange={(event) => setEditText(event.target.value)}
                  onKeyDown={(event) => {
                    if (isImeCompositionEvent(event)) return;
                    if (event.key === "Escape") setIsEditing(false);
                    if (
                      event.key === "Enter" &&
                      (event.metaKey || event.ctrlKey)
                    )
                      saveEdit();
                  }}
                  className="min-h-24 w-full resize-y rounded-md border border-border bg-surface p-2 text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="rounded-md px-2 py-1 text-sm text-text-secondary hover:bg-surface"
                  >
                    <Trans i18nKey="common:surface.componentsChatMessageBubble.action.cancel" />
                  </button>
                  <button
                    type="button"
                    onClick={saveEdit}
                    className="rounded-md bg-accent px-2 py-1 text-sm text-accent-fg"
                  >
                    <Trans i18nKey="common:surface.componentsChatMessageBubble.action.save" />
                  </button>
                </div>
              </div>
            ) : (
              <ChatMarkdown content={content} />
            )}
            {/* Structured attachment cards — rendered below visible text, never dumping extracted content */}
            {attachmentRefs.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {attachmentRefs.map((ref) => (
                  <div
                    key={ref.id}
                    className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2 py-1.5 vf-meta text-text-secondary"
                    title={tRuntime(
                      "runtimeGenerated.components.chat.messageBubble.attribute.value1Value2",
                      { value1: ref.name, value2: ref.mimeType },
                    )}
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                    <span className="max-w-[140px] truncate font-medium text-text-primary">
                      {ref.name}
                    </span>
                    <span className="vf-tag text-text-muted">
                      {ref.kind}
                    </span>
                    {ref.truncated && (
                      <span
                        className="ml-0.5 rounded bg-warning/15 px-1 vf-tag text-warning"
                        title={tRuntime(
                          "runtimeGenerated.components.chat.messageBubble.attribute.attachmentWasPartiallyOmittedDueToContextBudget",
                        )}
                      >
                        <Trans i18nKey="common:surface.componentsChatMessageBubble.text.truncated" />
                      </span>
                    )}
                    {ref.requiresVision && (
                      <span className="ml-0.5 rounded bg-accent/15 px-1 vf-tag text-accent">
                        <Trans i18nKey="common:surface.componentsChatMessageBubble.text.vision" />
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
            {redTeamMode && localSafetyDecision && (
              <div className="mt-2 vf-meta font-mono p-2 bg-surface border border-border-soft rounded-md text-left text-text-secondary select-text space-y-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-text-muted">
                    <Trans i18nKey="common:surface.componentsChatMessageBubble.text.safety" />
                  </span>
                  <span
                    className={
                      localSafetyDecision.allow
                        ? "text-accent font-semibold"
                        : "text-danger font-semibold"
                    }
                  >
                    {localSafetyDecision.allow
                      ? tRuntime(
                          "runtimeGenerated.components.chat.messageBubble.text.allow",
                        )
                      : tRuntime(
                          "runtimeGenerated.components.chat.messageBubble.text.blocked",
                        )}
                  </span>
                </div>
                {localSafetyDecision.reasonCode && (
                  <div>
                    <span className="font-semibold text-text-muted">
                      <Trans i18nKey="common:surface.componentsChatMessageBubble.text.code" />
                    </span>{" "}
                    {localSafetyDecision.reasonCode}
                  </div>
                )}
                {localSafetyDecision.signals &&
                  localSafetyDecision.signals.length > 0 && (
                    <div>
                      <span className="font-semibold text-text-muted">
                        <Trans i18nKey="common:surface.componentsChatMessageBubble.text.signals" />
                      </span>{" "}
                      {localSafetyDecision.signals
                        .map((s) => `${s.category}:${s.source}`)
                        .join(", ")}
                    </div>
                  )}
              </div>
            )}
            {injectedContextDisclosure}
          </div>
        </div>
      </div>
        <ContextMenu
          position={bubbleMenu.menu}
          items={bubbleMenuItems}
          onClose={bubbleMenu.close}
          ariaLabel="Message actions"
        />
      </>
    );
  }

  return (
    <>
      <div
        className="flex gap-3"
        onContextMenu={bubbleMenu.openAt}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
      >
      <div className="w-8 h-8 rounded-lg bg-surface-elevated border border-border flex items-center justify-center shrink-0 mt-0.5 shadow-sm overflow-hidden">
        {assistantCharacter && assistantCharacterCacheKey ? (
          <CharacterAvatar
            character={assistantCharacter}
            cacheKey={assistantCharacterCacheKey}
            size="lg"
            className="h-full w-full rounded-lg"
          />
        ) : (
          <img
            src={assistantAvatarUrl || DEFAULT_AI_AVATAR_SRC}
            alt={tRuntime(
              "runtimeGenerated.components.chat.messageBubble.attribute.aiAvatar",
            )}
            width={32}
            height={32}
            loading="lazy"
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover"
          />
        )}
      </div>
      <div className="min-w-0 flex-1">
        {/* Reasoning content (thinking) */}
        {message.reasoning_content && (
          <div className="mb-2">
            <button
              onClick={() => setReasoningOpen(!reasoningOpen)}
              className="flex items-center gap-1.5 vf-meta text-text-muted hover:text-text-secondary transition-colors mb-1 cursor-pointer"
            >
              <svg
                aria-hidden="true"
                focusable="false"
                width="10"
                height="10"
                viewBox="0 0 10 10"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                className={cn(
                  "transition-transform duration-150",
                  reasoningOpen && "rotate-90",
                )}
              >
                <path d="M3.5 2L6.5 5L3.5 8" />
              </svg>
              <Trans i18nKey="common:surface.componentsChatMessageBubble.action.thinking" />
            </button>
            {reasoningOpen && (
              <div className="bg-surface border border-border rounded-lg px-3 py-2 vf-body text-text-muted leading-relaxed whitespace-pre-wrap animate-fade-in max-h-60 overflow-y-auto">
                {message.reasoning_content}
              </div>
            )}
          </div>
        )}

        {isEditing ? (
          <div className="space-y-2">
            <textarea
              aria-label={tRuntime(
                "runtimeGenerated.components.chat.messageBubble.attribute.editMessageText",
              )}
              autoFocus
              value={editText}
              onChange={(event) => setEditText(event.target.value)}
              onKeyDown={(event) => {
                if (isImeCompositionEvent(event)) return;
                if (event.key === "Escape") setIsEditing(false);
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey))
                  saveEdit();
              }}
              className="min-h-28 w-full resize-y rounded-md border border-border bg-surface p-2 text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="rounded-md px-2 py-1 text-sm text-text-secondary hover:bg-surface-elevated"
              >
                <Trans i18nKey="common:surface.componentsChatMessageBubble.action.cancel" />
              </button>
              <button
                type="button"
                onClick={saveEdit}
                className="rounded-md bg-accent px-2 py-1 text-sm text-accent-fg"
              >
                <Trans i18nKey="common:surface.componentsChatMessageBubble.action.save" />
              </button>
            </div>
          </div>
        ) : content && !isTool ? (
          <div className="space-y-2">
            <ChatMarkdown content={content} />
            {redTeamMode && localSafetyDecision && (
              <div className="vf-meta font-mono p-2 bg-surface border border-border-soft rounded-md text-text-secondary select-text space-y-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-text-muted">
                    <Trans i18nKey="common:surface.componentsChatMessageBubble.text.safety" />
                  </span>
                  <span
                    className={
                      localSafetyDecision.allow
                        ? "text-accent font-semibold"
                        : "text-danger font-semibold"
                    }
                  >
                    {localSafetyDecision.allow
                      ? tRuntime(
                          "runtimeGenerated.components.chat.messageBubble.text.allow",
                        )
                      : tRuntime(
                          "runtimeGenerated.components.chat.messageBubble.text.blocked",
                        )}
                  </span>
                </div>
                {localSafetyDecision.reasonCode && (
                  <div>
                    <span className="font-semibold text-text-muted">
                      <Trans i18nKey="common:surface.componentsChatMessageBubble.text.code" />
                    </span>{" "}
                    {localSafetyDecision.reasonCode}
                  </div>
                )}
                {localSafetyDecision.signals &&
                  localSafetyDecision.signals.length > 0 && (
                    <div>
                      <span className="font-semibold text-text-muted">
                        <Trans i18nKey="common:surface.componentsChatMessageBubble.text.signals" />
                      </span>{" "}
                      {localSafetyDecision.signals
                        .map((s) => `${s.category}:${s.source}`)
                        .join(", ")}
                    </div>
                  )}
              </div>
            )}
          </div>
        ) : !isTool &&
          (!message.tool_calls || message.tool_calls.length === 0) ? (
          <div className="py-1">
            <GenerationLoadingIndicator
              size="sm"
              state="generating"
              label={tRuntime(
                "runtimeGenerated.components.chat.messageBubble.attribute.thinking",
              )}
            />
          </div>
        ) : null}

        {message.tool_calls && message.tool_calls.length > 0 && (
          <div className="mt-2 space-y-2">
            {message.tool_calls.map((tc, idx) => (
              <div
                key={idx}
                className="bg-surface-elevated/40 border border-border-soft rounded-md p-2 font-mono vf-meta text-text-secondary"
              >
                <div className="flex items-center gap-1.5 text-accent mb-1">
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
                    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                  </svg>
                  <span className="font-semibold">
                    <Trans i18nKey="common:surface.componentsChatMessageBubble.text.toolUsed" />{" "}
                    {tc.function.name}
                  </span>
                </div>
                <div
                  className="pl-5 truncate max-w-full opacity-80"
                  title={tc.function.arguments}
                >
                  {tc.function.arguments ||
                    tRuntime(
                      "runtimeGenerated.components.chat.messageBubble.text.noArguments",
                    )}
                </div>
              </div>
            ))}
          </div>
        )}

        {isTool && (
          <div className="mt-2">
            <details className="rounded-md border border-border-soft bg-surface-elevated/20 vf-meta text-text-secondary">
              <summary className="cursor-pointer select-none px-3 py-1.5 font-medium flex items-center gap-1.5">
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                >
                  <polyline points="9 18 15 12 9 6"></polyline>
                </svg>
                <Trans i18nKey="common:surface.componentsChatMessageBubble.text.resultFrom" />{" "}
                {message.name || "tool"}
              </summary>
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words soft-separator-y px-3 py-2 font-mono vf-tag leading-relaxed text-text-muted">
                {content}
              </pre>
            </details>
          </div>
        )}
        {injectedContextDisclosure}

        {Array.isArray(message.metadata?.managedDocuments) &&
          (message.metadata.managedDocuments as ChatDocumentRef[]).map(
            (docRef, i) => (
              <ManagedDocumentAttachmentCard
                key={docRef.documentId || i}
                docRef={docRef}
              />
            ),
          )}

        {isAssistant &&
          Array.isArray(message.metadata?.generatedMedia) &&
          (message.metadata.generatedMedia as ChatMediaReference[])
            .filter((r) => !r?.deletedFromChatAt)
            .map((r) => (
              <div
                key={r.id}
                className="relative group mt-2 mb-1 w-full max-w-sm rounded-lg overflow-hidden border border-border bg-surface-sunken"
              >
                <img
                  src={
                    safeVeniceMediaUrl(r.displayUrl) ??
                    safeVeniceMediaUrl(
                      r.mediaId ? `venice-media://${r.mediaId}` : null,
                    ) ??
                    ""
                  }
                  alt={
                    r.altText && r.altText.trim().length > 0
                      ? r.altText
                      : tRuntime(
                          "runtimeGenerated.components.chat.messageBubble.attribute.generatedMedia",
                        )
                  }
                  className="w-full h-auto object-cover"
                />
                <button
                  onClick={() => onRemoveMedia?.((message as ConversationMessage).id ?? "", r.id)}
                  className="absolute top-2 right-2 bg-black/60 text-white rounded p-1.5 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500" // THEME_TOKEN_ALLOW_INTENTIONAL_FIXED_COLOR
                  title={tRuntime(
                    "runtimeGenerated.components.chat.messageBubble.attribute.removeFromChat",
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
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </svg>
                </button>
              </div>
            ))}
        {isAssistant && sceneGeneration && (
          <CharacterSceneCard
            status={sceneGeneration.status}
            prompt={sceneGeneration.prompt}
            imageUrl={sceneGeneration.imageUrl}
            error={sceneGeneration.error}
            rateLimitReason={sceneGeneration.rateLimitReason}
            onRetry={onGenerateScene}
            onRegenerate={onGenerateScene}
            onCopyPrompt={() => {
              if (sceneGeneration.prompt) {
                void copyText(sceneGeneration.prompt);
              }
            }}
          />
        )}
        <div className="mt-0.5 flex items-center gap-2">
          {actions}
          {showTtsControls && isAssistant && content && (
            <Suspense fallback={null}>
              <ChatTtsPlayer messageId={index.toString()} text={content} />
            </Suspense>
          )}
          {isAssistant && !!message.metadata?.usage && (
            <div
              className="ml-auto flex items-center vf-tag font-mono text-text-muted/60"
              title={tRuntime(
                "runtimeGenerated.components.chat.messageBubble.attribute.tokensUsedForThisMessage",
              )}
            >
              <span className="hidden sm:inline">P:</span>
              {String(
                (message.metadata.usage as { promptTokens?: number })
                  .promptTokens || 0,
              )}
              <span className="mx-1">•</span>
              <span className="hidden sm:inline">C:</span>
              {String(
                (message.metadata.usage as { completionTokens?: number })
                  .completionTokens || 0,
              )}
              <span className="mx-1">=</span>
              <span className="font-semibold text-text-muted">
                {String(
                  (message.metadata.usage as { totalTokens?: number })
                    .totalTokens || 0,
                )}
              </span>
            </div>
          )}
        </div>
      </div>
      </div>
      <ContextMenu
        position={bubbleMenu.menu}
        items={bubbleMenuItems}
        onClose={bubbleMenu.close}
        ariaLabel="Message actions"
      />
    </>
  );
}

function ActionBtn({
  label,
  onClick,
  children,
  destructive,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  destructive?: boolean;
}) {
  return (
    <IconButton
      icon={children}
      ariaLabel={label}
      onClick={onClick}
      title={label}
      size="sm"
      tone={destructive ? "danger" : "neutral"}
      className="p-1.5"
    />
  );
}

// BUG-React#2 regression guard
export const MessageBubble = memo(MessageBubbleImpl);
