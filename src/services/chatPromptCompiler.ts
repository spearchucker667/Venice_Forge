import { translateRuntime } from "../i18n/runtimeTranslator";
import type { Conversation } from "../types/conversation";
import type { ChatMessage, ModelInfo, ContentPart } from "../types/venice";
import {
  calculateChatContextBudget,
  estimateMessageTokens,
  estimateTokenCount,
} from "./chatContextBudget";
import { notify } from "./notification-service";
import { parseCharacterSceneRequest } from "./characterSceneRequestParser";
import { resolveEffectiveChatPromptContext } from "./effectiveChatPrompt";

export type ChatPromptSegment = {
  id: string;
  role: "system" | "user" | "assistant";
  content: string;
  priority: number; // lower is higher priority (kept first)
};

const TRUNCATION_MARKER = "\n\n[... content truncated to fit the context window]";
const MIN_PRESERVED_MESSAGE_TOKENS = 16;

function shrinkTextToTokenTarget(text: string, targetTokens: number): string {
  if (estimateTokenCount(text).count <= targetTokens) return text;
  // estimateTokenCount approximates ceil(codePoints / 4); cut with headroom.
  const keepChars = Math.max(
    0,
    Math.floor(targetTokens * 4) - TRUNCATION_MARKER.length,
  );
  if (keepChars <= 0) return TRUNCATION_MARKER.trim();
  return text.slice(0, keepChars) + TRUNCATION_MARKER;
}

/**
 * Shorten a user/assistant message's text content toward a token target,
 * trimming the tail of the last text part first (attachment/provider context
 * trails the visible message). Array content is COPIED before mutation so the
 * conversation's persisted message objects are never modified. Returns true
 * when the message was actually shrunk.
 */
function shrinkMessageContent(msg: ChatMessage, excessTokens: number): boolean {
  const currentTokens = estimateMessageTokens(msg);
  const target = Math.max(
    MIN_PRESERVED_MESSAGE_TOKENS,
    currentTokens - Math.ceil(excessTokens * 1.15) - 1,
  );
  if (currentTokens <= MIN_PRESERVED_MESSAGE_TOKENS) return false;

  if (typeof msg.content === "string") {
    const shrunk = shrinkTextToTokenTarget(msg.content, target);
    if (shrunk === msg.content) return false;
    msg.content = shrunk;
    return true;
  }

  const parts = (msg.content as ContentPart[]).map((part) =>
    part.type === "text" ? { ...part } : part,
  );
  let allowance = target;
  let changed = false;
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i];
    if (part.type !== "text" || !part.text) continue;
    const partTokens = estimateTokenCount(part.text).count;
    if (partTokens <= allowance) {
      allowance -= partTokens;
      continue;
    }
    const shrunk = shrinkTextToTokenTarget(
      part.text,
      Math.max(MIN_PRESERVED_MESSAGE_TOKENS, allowance),
    );
    changed = shrunk !== part.text;
    part.text = shrunk;
    break;
  }
  if (changed) msg.content = parts;
  return changed;
}

export function compileChatPrompt(
  conv: Conversation,
  globalSystemPrompt: string,
  modelInfo: ModelInfo | undefined,
  maxTokens: number,
  includeVeniceSystemPrompt = true,
): { messages: ChatMessage[]; systemPrompt: string; maxTokens: number } {
  // 1. Compile System Prompt Segments (shared resolver)
  const promptCtx = resolveEffectiveChatPromptContext(conv, globalSystemPrompt);
  const isHostedCharacter = promptCtx.hostedCharacter;
  const effectiveSystemPrompt = promptCtx.effectiveSystemPrompt;

  // 2. Build Messages
  const requestMessages: ChatMessage[] = conv.messages
    .filter(
      (m: ChatMessage) =>
        m.content !== "" ||
        (m.tool_calls && m.tool_calls.length > 0) ||
        m.tool_call_id,
    )
    .map((m: ChatMessage) => {
      // Inline prependInjectedContext equivalent
      let content = m.content;
      if (m.role === "user" && m.metadata?.injectedContext) {
        if (typeof content === "string") {
          content = `${m.metadata.injectedContext.trim()}\n\n${content}`;
        } else if (Array.isArray(content)) {
          const parts = content as ContentPart[];
          const textPartIndex = parts.findIndex(
            (p: ContentPart) => p.type === "text",
          );

          if (textPartIndex === -1) {
            content = [
              { type: "text", text: m.metadata.injectedContext.trim() },
              ...parts,
            ];
          } else {
            content = parts.map((part: ContentPart, index: number) => {
              return index === textPartIndex && part.type === "text"
                ? {
                    ...part,
                    text: `${m.metadata!.injectedContext!.trim()}\n\n${part.text}`,
                  }
                : part;
            });
          }
        }
      }
      // Phase 1 attachment separation: inject provider-only attachment context.
      // `providerContext` carries extracted attachment text wrapped in an
      // untrusted-data envelope. It is NOT part of the persisted visible content
      // and is only appended here, in the provider-facing compiled message.
      if (
        m.role === "user" &&
        typeof m.metadata?.providerContext === "string" &&
        m.metadata.providerContext.trim()
      ) {
        if (typeof content === "string") {
          content = `${content}${m.metadata.providerContext}`;
        } else if (Array.isArray(content)) {
          const parts = content as ContentPart[];
          const textPartIndex = parts.findIndex(
            (p: ContentPart) => p.type === "text",
          );
          if (textPartIndex === -1) {
            content = [
              { type: "text", text: m.metadata.providerContext.trim() },
              ...parts,
            ];
          } else {
            content = parts.map((part: ContentPart, index: number) => {
              return index === textPartIndex && part.type === "text"
                ? {
                    ...part,
                    text: `${part.text}${m.metadata!.providerContext}`,
                  }
                : part;
            });
          }
        }
      }
      if (m.role === "assistant" && typeof content === "string") {
        // Automatic character-scene markers are an app-to-app protocol, not
        // conversational context. Strip both valid and malformed historical
        // markers so later model turns cannot detect or imitate the helper.
        content = parseCharacterSceneRequest(content).displayText;
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
    maxTokens,
    includeVeniceSystemPrompt,
  );

  let compacted = false;
  let compactionId: string | null = null;
  const initialMessagesCount = requestMessages.length;

  if (budget.remainingInputBudget < 0 && requestMessages.length > 2) {
    compactionId = notify.loading("Compacting context...", {
      dedupeKey: "compaction",
    });
  }

  const minimumUsefulOutputTokens = Math.min(256, Math.max(1, maxTokens));
  let minimumOutputBudget = calculateChatContextBudget(
    requestMessages,
    isHostedCharacter ? effectiveSystemPrompt : "",
    modelInfo,
    minimumUsefulOutputTokens,
    includeVeniceSystemPrompt,
  );

  while (
    minimumOutputBudget.remainingInputBudget < 0 &&
    requestMessages.length > 2
  ) {
    compacted = true;
    const firstNonSystemIndex = requestMessages.findIndex(
      (m) => m.role !== "system",
    );
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
    const afterSpliceIdx = requestMessages.findIndex(
      (m) => m.role !== "system",
    );
    if (
      afterSpliceIdx !== -1 &&
      requestMessages[afterSpliceIdx].role === "assistant"
    ) {
      requestMessages.splice(afterSpliceIdx, 1);
    }

    budget = calculateChatContextBudget(
      requestMessages,
      isHostedCharacter ? effectiveSystemPrompt : "",
      modelInfo,
      maxTokens,
      includeVeniceSystemPrompt,
    );
    minimumOutputBudget = calculateChatContextBudget(
      requestMessages,
      isHostedCharacter ? effectiveSystemPrompt : "",
      modelInfo,
      minimumUsefulOutputTokens,
      includeVeniceSystemPrompt,
    );
  }

  // 3b. Content-truncation fallback. The turn-dropping loop above stops at
  // system + newest message; when that remaining content alone still exceeds
  // the budget (e.g. a large attachment), shorten message text, oldest
  // non-system message first, until the request fits. The system prompt is
  // never modified — it carries the runtime/safety layer.
  let truncated = false;
  if (minimumOutputBudget.remainingInputBudget < 0) {
    let guard = 0;
    while (minimumOutputBudget.remainingInputBudget < 0 && guard++ < 64) {
      const excess = -minimumOutputBudget.remainingInputBudget;
      const idx = requestMessages.findIndex(
        (m) =>
          (m.role === "user" || m.role === "assistant") &&
          estimateMessageTokens(m) > MIN_PRESERVED_MESSAGE_TOKENS,
      );
      if (idx === -1) break;
      const before = estimateMessageTokens(requestMessages[idx]);
      if (!shrinkMessageContent(requestMessages[idx], excess)) break;
      const after = estimateMessageTokens(requestMessages[idx]);
      if (after >= before) break; // no progress; avoid looping
      truncated = true;
      budget = calculateChatContextBudget(
        requestMessages,
        isHostedCharacter ? effectiveSystemPrompt : "",
        modelInfo,
        maxTokens,
        includeVeniceSystemPrompt,
      );
      minimumOutputBudget = calculateChatContextBudget(
        requestMessages,
        isHostedCharacter ? effectiveSystemPrompt : "",
        modelInfo,
        minimumUsefulOutputTokens,
        includeVeniceSystemPrompt,
      );
    }
  }

  if (compacted && compactionId) {
    const removedCount = initialMessagesCount - requestMessages.length;
    const turnWord = removedCount === 1 ? "message" : "messages";
    const shortenedSuffix = truncated
      ? " " +
        translateRuntime(
          "runtimeGenerated.services.chatpromptcompiler.metadata.longMessageContentWasShortenedToFit",
          "Long message content was shortened to fit within context limits. Start a new chat or use a model with a larger context window to preserve full content.",
        )
      : "";
    notify.update(compactionId, {
      severity: "info",
      title: translateRuntime(
        "runtimeGenerated.services.chatpromptcompiler.metadata.contextTruncated",
        "Context truncated",
      ),
      message:
        translateRuntime(
          "runtimeGenerated.services.chatpromptcompiler.metadata.removedRemovedcountOldTurnwordToFitWithinContextLimitsStart",
          "Removed {{removedCount}} old {{turnWord}} to fit within context limits. Start a new chat or use a model with a larger context window to preserve full history.",
          { removedCount: removedCount, turnWord: turnWord },
        ) + shortenedSuffix,
      durationMs: 5500,
    });
  } else if (truncated) {
    notify.info(
      translateRuntime(
        "runtimeGenerated.services.chatpromptcompiler.metadata.contextTruncated",
        "Context truncated",
      ),
      {
        message: translateRuntime(
          "runtimeGenerated.services.chatpromptcompiler.metadata.longMessageContentWasShortenedToFit",
          "Long message content was shortened to fit within context limits. Start a new chat or use a model with a larger context window to preserve full content.",
        ),
        durationMs: 5500,
      },
    );
  }

  if (minimumOutputBudget.remainingInputBudget < 0) {
    if (compactionId) notify.dismiss(compactionId);
    notify.error("Context limit exceeded", {
      message: translateRuntime(
        "runtimeGenerated.services.chatpromptcompiler.metadata.theConversationRequiresValue1TokensButOnlyValue2AreAvailable",
        "The conversation requires ~{{value1}} tokens, but only {{value2}} are available after reserving output tokens.",
        {
          value1: budget.totalEstimatedInput.toLocaleString(),
          value2: budget.contextLimit.toLocaleString(),
        },
      ),
    });
    throw new Error(
      `Context budget exceeded. The conversation requires ~${budget.totalEstimatedInput.toLocaleString()} tokens, but only ${budget.contextLimit.toLocaleString()} are available after reserving output tokens. Try starting a new chat or reducing max_tokens.`,
    );
  }

  const providerMaxOutput = modelInfo?.maxOutputTokens ?? 4096;
  const availableOutputTokens = Math.max(
    1,
    budget.contextLimit - budget.totalEstimatedInput,
  );
  const effectiveMaxTokens = Math.min(
    maxTokens,
    providerMaxOutput,
    availableOutputTokens,
  );
  if (effectiveMaxTokens < Math.min(maxTokens, providerMaxOutput)) {
    notify.warning("Max output reduced to fit context", {
      message: translateRuntime(
        "runtimeGenerated.services.chatpromptcompiler.metadata.thisRequestReservesValue1OutputTokensSoTheCustomPrompt",
        "This request reserves {{value1}} output tokens so the custom prompt and current conversation fit the selected model.",
        { value1: effectiveMaxTokens.toLocaleString() },
      ),
      dedupeKey: "context-output-clamp",
    });
    budget = calculateChatContextBudget(
      requestMessages,
      isHostedCharacter ? effectiveSystemPrompt : "",
      modelInfo,
      effectiveMaxTokens,
      includeVeniceSystemPrompt,
    );
  }

  if (budget.percentUsed >= 0.8) {
    const usageStr = Math.round(budget.percentUsed * 100);
    const estK = Math.round(
      (budget.totalEstimatedInput + budget.reservedOutputTokens) / 1000,
    );
    const totalK = Math.round(budget.contextLimit / 1000);
    notify.warning(`Context usage is at ${usageStr}%`, {
      message: translateRuntime(
        "runtimeGenerated.services.chatpromptcompiler.metadata.estkKOfTotalkKEstimatedTokensAreInUse",
        "{{estK}}K of {{totalK}}K estimated tokens are in use.",
        { estK: estK, totalK: totalK },
      ),
      dedupeKey: "context-warning",
    });
  }

  return {
    messages: requestMessages,
    systemPrompt: effectiveSystemPrompt,
    maxTokens: effectiveMaxTokens,
  };
}
