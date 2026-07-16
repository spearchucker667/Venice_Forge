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

    const firstMsg = requestMessages[firstNonSystemIndex];
    const nextMsg = requestMessages[firstNonSystemIndex + 1];

    // Remove a complete conversational turn whenever possible.
    // A turn is a user message followed by its assistant reply. Removing only one
    // side can leave an orphan assistant message at the front of the history,
    // which violates provider role-ordering requirements and makes the context
    // incoherent. Always remove 2 messages when the oldest non-system pair is
    // user→assistant; fall back to removing just one only when the oldest message
    // is an unpaired user request or an isolated assistant message.
    const removeCount =
      firstMsg.role === "user" && nextMsg?.role === "assistant" ? 2 : 1;

    requestMessages.splice(firstNonSystemIndex, removeCount);

    // Post-splice guard: if the oldest remaining non-system message is now an
    // assistant message (e.g. the pair before it was partially removed), strip it
    // so we never send an assistant-first history to the provider.
    const afterSpliceIdx = requestMessages.findIndex((m) => m.role !== "system");
    if (afterSpliceIdx !== -1 && requestMessages[afterSpliceIdx].role === "assistant") {
      requestMessages.splice(afterSpliceIdx, 1);
    }

    budget = calculateChatContextBudget(
      requestMessages,
      isHostedCharacter ? effectiveSystemPrompt : "",
      modelInfo,
      maxTokens
    );
  }

  if (compacted && compactionId) {
    const removedCount = initialMessagesCount - requestMessages.length;
    const turnWord = removedCount === 1 ? "message" : "messages";
    notify.update(compactionId, {
      severity: "info",
      title: "Context truncated",
      message: `Removed ${removedCount} old ${turnWord} to fit within context limits. Start a new chat or use a model with a larger context window to preserve full history.`,
      durationMs: 5500
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
