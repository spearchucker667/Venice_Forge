import type { Conversation } from "../types/conversation";
import type { ChatMessage, ModelInfo, ContentPart } from "../types/venice";
import { calculateChatContextBudget } from "./chatContextBudget";
import { notify } from "./notification-service";

export type ChatPromptSegment = {
  id: string;
  role: "system" | "user" | "assistant";
  content: string;
  priority: number; // lower is higher priority (kept first)
};

export function compileChatPrompt(
  conv: Conversation,
  globalSystemPrompt: string,
  modelInfo: ModelInfo | undefined,
  maxTokens: number
): { messages: ChatMessage[]; systemPrompt: string } {
  // 1. Compile System Prompt Segments
  const mode = conv.metadata?.systemPromptMode ?? "inherit";
  const characterSystemPrompt = conv.metadata?.character?.systemPrompt;
  const isHostedCharacter = !!conv.metadata?.character?.slug;

  const systemSegments: string[] = [];
  let effectiveSystemPrompt = "";

  if (mode === "override") {
    if (conv.systemPrompt) systemSegments.push(conv.systemPrompt.trim());
  } else if (mode === "inherit") {
    if (conv.metadata?.character) {
      if (conv.systemPrompt) systemSegments.push(conv.systemPrompt.trim());
      else if (characterSystemPrompt) systemSegments.push(characterSystemPrompt.trim());
    } else {
      if (conv.systemPrompt) systemSegments.push(conv.systemPrompt.trim());
      else if (globalSystemPrompt) systemSegments.push(globalSystemPrompt.trim());
    }
  }

  // Precedence: just join them with double newlines
  effectiveSystemPrompt = systemSegments.filter(Boolean).join("\n\n");

  // 2. Build Messages
  const requestMessages: ChatMessage[] = conv.messages
    .filter((m: ChatMessage) => m.content !== "")
    .map((m: ChatMessage) => {
      // Inline prependInjectedContext equivalent
      let content = m.content;
      if (m.role === "user" && m.metadata?.injectedContext) {
        if (typeof content === "string") {
          content = `${m.metadata.injectedContext.trim()}\n\n${content}`;
        } else if (Array.isArray(content)) {
          const parts = content as ContentPart[];
          const textPartIndex = parts.findIndex((p: ContentPart) => p.type === "text");

          if (textPartIndex === -1) {
            content = [
              { type: "text", text: m.metadata.injectedContext.trim() },
              ...parts
            ];
          } else {
            content = parts.map((part: ContentPart, index: number) => {
              return index === textPartIndex && part.type === "text"
                ? { ...part, text: `${m.metadata!.injectedContext!.trim()}\n\n${part.text}` }
                : part;
            });
          }
        }
      }
      return { role: m.role, content };
    });

  if (effectiveSystemPrompt && !isHostedCharacter) {
    requestMessages.unshift({ role: "system", content: effectiveSystemPrompt });
  }

  // 3. Enforce Budget constraints (Auto-compaction)
  let budget = calculateChatContextBudget(
    requestMessages,
    isHostedCharacter ? effectiveSystemPrompt : "",
    modelInfo,
    maxTokens
  );

  let compacted = false;
  let compactionId: string | null = null;
  const initialMessagesCount = requestMessages.length;

  if (budget.remainingInputBudget < 0 && requestMessages.length > 2) {
    compactionId = notify.loading("Compacting context...", { dedupeKey: "compaction" });
  }

  while (budget.remainingInputBudget < 0 && requestMessages.length > 2) {
    compacted = true;
    const firstNonSystemIndex = requestMessages.findIndex((m) => m.role !== "system");
    if (firstNonSystemIndex === -1) break;
    requestMessages.splice(firstNonSystemIndex, 1);
    budget = calculateChatContextBudget(
      requestMessages,
      isHostedCharacter ? effectiveSystemPrompt : "",
      modelInfo,
      maxTokens
    );
  }

  if (compacted && compactionId) {
    const removedCount = initialMessagesCount - requestMessages.length;
    notify.update(compactionId, {
      severity: "info",
      title: "Context compacted",
      message: `Removed ${removedCount} old message${removedCount !== 1 ? 's' : ''} to fit within context limits.`,
      durationMs: 4500
    });
  }

  if (budget.remainingInputBudget < 0) {
    if (compactionId) notify.dismiss(compactionId);
    notify.error("Context limit exceeded", {
      message: `The conversation requires ~${budget.totalEstimatedInput.toLocaleString()} tokens, but only ${budget.contextLimit.toLocaleString()} are available after reserving output tokens.`
    });
    throw new Error(
      `Context budget exceeded. The conversation requires ~${budget.totalEstimatedInput.toLocaleString()} tokens, but only ${budget.contextLimit.toLocaleString()} are available after reserving output tokens. Try starting a new chat or reducing max_tokens.`
    );
  } else if (budget.percentUsed >= 0.8) {
    const usageStr = Math.round(budget.percentUsed * 100);
    const estK = Math.round((budget.totalEstimatedInput + budget.reservedOutputTokens) / 1000);
    const totalK = Math.round(budget.contextLimit / 1000);
    notify.warning(`Context usage is at ${usageStr}%`, {
      message: `${estK}K of ${totalK}K estimated tokens are in use.`,
      dedupeKey: 'context-warning',
    });
  }

  return {
    messages: requestMessages,
    systemPrompt: effectiveSystemPrompt,
  };
}
