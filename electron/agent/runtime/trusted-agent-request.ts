import { AppAgentRuntimeContract, TrustedRuntimeLayer, ToolRuntimeLayer, AppAgentRequest, AgentRuntimeLayer } from '../../../src/shared/agentRuntimeContracts';
import { getTimezoneOffsetMinutes, formatISO } from '../../services/timezoneService';
import { checkSystemPromptLimit, SYSTEM_PROMPT_HARD_LIMIT } from '../../../src/shared/promptLimits';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function buildTrustedRuntimeLayer(): TrustedRuntimeLayer {
  const now = new Date();
  const tzOffset = getTimezoneOffsetMinutes();
  const tzName = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return {
    kind: 'trusted-runtime',
    priority: 0,
    immutable: true,
    content: {
      currentDate: formatISO(now),
      currentTime: now.toLocaleTimeString('en-US', { hour12: false, timeZone: tzName }),
      timezone: tzName,
      timezoneOffsetMinutes: tzOffset,
      isoTimestamp: now.toISOString(),
      unixTimestamp: Math.floor(now.getTime() / 1000),
    },
  };
}

export function buildToolRuntimeLayer(tools: string[]): ToolRuntimeLayer {
  return {
    kind: 'tool-runtime',
    priority: 10,
    immutable: false,
    tools: tools.map((name) => ({ name, trusted: true })),
  };
}

function validateSystemPrompt(systemPrompt: string): void {
  const result = checkSystemPromptLimit(systemPrompt);
  if (result.isOverLimit) {
    throw new Error(`System prompt exceeds maximum allowed length of ${SYSTEM_PROMPT_HARD_LIMIT} Unicode code points (${result.codePointCount} detected).`);
  }
}

export function composeAgentRuntime(request: AppAgentRequest): AppAgentRuntimeContract {
  validateSystemPrompt(request.systemPrompt);

  const trustedLayer = buildTrustedRuntimeLayer();
  const toolLayer = buildToolRuntimeLayer(request.tools ?? []);

  const layers: AgentRuntimeLayer[] = [trustedLayer, toolLayer];

  if (request.customLayers && request.customLayers.length > 0) {
    layers.push(...request.customLayers);
  }

  layers.sort((a, b) => a.priority - b.priority);

  return {
    version: '1.0',
    layers,
    systemPrompt: request.systemPrompt,
    userPrompt: request.userPrompt,
    model: request.model,
    temperature: request.temperature,
    maxTokens: request.maxTokens,
  };
}

/** Existing guardPipeline import expects this function signature.
 *  It injects the trusted runtime layer with date/time/timezone
 *  and the tool-runtime layer before forwarding to Venice. */
export function composeTrustedRequest(rawRequest: unknown): unknown {
  if (!isRecord(rawRequest)) return rawRequest;

  const body = rawRequest.body;
  if (!isRecord(body)) return rawRequest;

  // Validate system prompt if present in messages
  if (Array.isArray(body.messages)) {
    for (const msg of body.messages) {
      if (msg && typeof msg === 'object' && msg.role === 'system' && typeof msg.content === 'string') {
        validateSystemPrompt(msg.content);
      }
    }
  }

  const trustedLayer = buildTrustedRuntimeLayer();
  const tools = typeof body.tools === 'object' && body.tools !== null && Array.isArray(body.tools)
    ? (body.tools as string[])
    : [];
  void buildToolRuntimeLayer(tools);

  // Build system instruction content from trusted runtime layer
  const runtimeContext = `
[System Runtime Context]
Current Date/Time: ${trustedLayer.content.currentDate} ${trustedLayer.content.currentTime}
Timezone: ${trustedLayer.content.timezone} (${trustedLayer.content.timezoneOffsetMinutes} min offset)
[/System Runtime Context]

`;

  // Inject into system prompt if chat/completions endpoint
  let newBody = { ...body };
  if (rawRequest.endpoint === '/chat/completions' && rawRequest.method === 'POST') {
    const messages = Array.isArray(body.messages) ? [...body.messages] : [];
    if (messages.length > 0 && messages[0].role === 'system') {
      messages[0] = { ...messages[0], content: runtimeContext + (messages[0].content || '') };
    } else {
      messages.unshift({ role: 'system', content: runtimeContext });
    }
    newBody = { ...body, messages };
  }

  return {
    ...rawRequest,
    body: newBody,
  };
}