import type { ChatMessage, ContentPart, ModelInfo } from "../types/venice";
import { estimateSystemPromptTokens } from "../shared/promptLimits";

const FALLBACK_CONTEXT_LIMIT = 8192;
const FALLBACK_MAX_OUTPUT = 4096;

export interface TokenCountResult {
  count: number;
  method: 'approximation';
  isEstimate: boolean;
}

export function estimateTokenCount(text: string): TokenCountResult {
  return estimateSystemPromptTokens(text);
}

export function estimateMessageTokens(msg: ChatMessage): number {
  if (typeof msg.content === 'string') {
    return estimateTokenCount(msg.content).count;
  }
  let count = 0;
  for (const part of msg.content as ContentPart[]) {
    if (part.type === 'text' && part.text) count += estimateTokenCount(part.text).count;
    if (part.type === 'image_url') count += 250; // rough image estimate
    if (part.type === 'input_audio') count += 500; // rough audio estimate
  }
  return count;
}

export interface ChatBudget {
  contextLimit: number;
  reservedOutputTokens: number;
  systemPromptTokens: number;
  characterPromptTokens: number;
  venicePromptEstimate: number;
  attachmentTokens: number;
  memoryTokens: number;
  conversationTokens: number;
  totalEstimatedInput: number;
  remainingInputBudget: number;
  percentUsed: number;
}

export function calculateChatContextBudget(
  messages: ChatMessage[],
  systemPrompt: string,
  modelInfo: ModelInfo | undefined,
  requestedMaxTokens: number,
  includeVeniceSystemPrompt = true,
): ChatBudget {
  const contextLimit = modelInfo?.contextLength ?? FALLBACK_CONTEXT_LIMIT;
  const maxOutput = modelInfo?.maxOutputTokens ?? FALLBACK_MAX_OUTPUT;
  const reservedOutputTokens = Math.min(requestedMaxTokens, maxOutput);

  let memoryTokens = 0;
  const attachmentTokens = 0;
  let conversationTokens = 0;
  let systemPromptTokens = 0;

  for (const msg of messages) {
    if (msg.role === 'system') {
      systemPromptTokens += estimateMessageTokens(msg);
      continue;
    }

    if (msg.metadata?.injectedContext) {
      memoryTokens += estimateTokenCount(msg.metadata.injectedContext).count;
    }

    conversationTokens += estimateMessageTokens(msg);
  }

  if (systemPrompt) {
    systemPromptTokens += estimateTokenCount(systemPrompt).count;
  }

  const characterPromptTokens = 0;
  const venicePromptEstimate = includeVeniceSystemPrompt ? 200 : 0;

  const totalEstimatedInput =
    systemPromptTokens +
    characterPromptTokens +
    venicePromptEstimate +
    attachmentTokens +
    memoryTokens +
    conversationTokens;

  const remainingInputBudget = contextLimit - reservedOutputTokens - totalEstimatedInput;
  const percentUsed = contextLimit > 0 ? (totalEstimatedInput + reservedOutputTokens) / contextLimit : 0;

  return {
    contextLimit,
    reservedOutputTokens,
    systemPromptTokens,
    characterPromptTokens,
    venicePromptEstimate,
    attachmentTokens,
    memoryTokens,
    conversationTokens,
    totalEstimatedInput,
    remainingInputBudget,
    percentUsed: Math.max(0, Math.min(1, percentUsed))
  };
}

export interface AttachmentTextAllowance {
  /** "tokens": admission is governed by the selected model's remaining token
   *  budget. "bytes": model context metadata is unknown, so the legacy fixed
   *  byte ceiling applies (preserves pre-model-aware behavior). */
  mode: "tokens" | "bytes";
  allowanceTokens: number;
  allowanceBytes: number;
}

const DEFAULT_ATTACHMENT_SAFETY_MARGIN_TOKENS = 512;

/** Computes how much extracted attachment text may be admitted into the next
 *  request, based on the SELECTED MODEL's remaining context window:
 *
 *    context window − output reserve − system prompt − Venice runtime prompt −
 *    conversation history − current message − injected memory context −
 *    safety margin
 *
 * A 1M-token model therefore admits materially more attachment text than a
 * 128K model. When the model's context length is unknown, falls back to the
 *  legacy fixed byte ceiling so behavior never regresses below today's floor. */
export function computeAttachmentTextAllowance(params: {
  modelInfo: ModelInfo | undefined;
  maxTokens: number;
  systemPrompt: string;
  messages: Array<{
    role: string;
    content: string | ContentPart[];
    metadata?: { injectedContext?: string };
  }>;
  userMessage: string;
  injectedContext?: string;
  safetyMarginTokens?: number;
  fallbackBytes?: number;
}): AttachmentTextAllowance {
  const fallbackBytes = params.fallbackBytes ?? 1024 * 1024;
  const contextLimit = params.modelInfo?.contextLength;
  if (!contextLimit || contextLimit <= 0) {
    return { mode: "bytes", allowanceTokens: 0, allowanceBytes: fallbackBytes };
  }

  // Shape history as fresh literals so the minimal input type is assignable
  // to ChatMessage[] (persisted conversation records are interfaces and carry
  // no implicit index signature).
  const shaped = params.messages.map((m) => ({
    role: m.role,
    content: m.content,
    ...(m.metadata?.injectedContext
      ? { metadata: { injectedContext: m.metadata.injectedContext } }
      : {}),
  })) as ChatMessage[];

  const budget = calculateChatContextBudget(
    [...shaped, { role: "user", content: params.userMessage } as ChatMessage],
    params.systemPrompt,
    params.modelInfo,
    params.maxTokens,
  );

  const injectedTokens = params.injectedContext?.trim()
    ? estimateTokenCount(params.injectedContext).count
    : 0;
  const margin = params.safetyMarginTokens ?? DEFAULT_ATTACHMENT_SAFETY_MARGIN_TOKENS;
  const allowanceTokens = Math.max(
    0,
    Math.floor(budget.remainingInputBudget - injectedTokens - margin),
  );

  return { mode: "tokens", allowanceTokens, allowanceBytes: 0 };
}
