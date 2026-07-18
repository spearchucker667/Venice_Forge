import type { ChatMessage, ContentPart, ModelInfo } from "../types/venice";

const FALLBACK_CONTEXT_LIMIT = 8192;
const FALLBACK_MAX_OUTPUT = 4096;

export interface TokenCountResult {
  count: number;
  method: 'approximation';
  isEstimate: boolean;
}

export function estimateTokenCount(text: string): TokenCountResult {
  return {
    count: text.length === 0 ? 0 : Math.max(1, Math.ceil(text.length / 4)),
    method: 'approximation',
    isEstimate: true,
  };
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
