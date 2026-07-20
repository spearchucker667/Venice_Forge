import { AppAgentRuntimeContract, TrustedRuntimeLayer, ToolRuntimeLayer, AppAgentRequest, AgentRuntimeLayer } from '../../../src/shared/agentRuntimeContracts';
import { getTimezoneOffsetMinutes, formatISO } from '../../services/timezoneService';
import { checkSystemPromptLimit, SYSTEM_PROMPT_HARD_LIMIT } from '../../../src/shared/promptLimits';

/** The trusted layer is priority 0 and immutable. Once it is finalized in
 *  the layer list, the contract forbids any additional layer below the
 *  immutable floor (priority < 0). P0-05 audit finding (2). */
const TRUSTED_PRIORITY_FLOOR = 0;

/** Deterministic content hash for a tool runtime layer (used by
 *  `dedupToolRuntimeLayers`). Plain FNV-1a 64-bit — keeps the module free of
 *  node-only crypto so renderer tests can use it. */
function fnv1a64(str: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const data = Buffer.from(str, 'utf8');
  for (const byte of data) {
    hash = (hash ^ BigInt(byte)) * prime & 0xffffffffffffffffn;
  }
  return hash.toString(16).padStart(16, '0');
}

function dedupToolRuntimeLayers(layers: AgentRuntimeLayer[]): AgentRuntimeLayer[] {
  const seen = new Set<string>();
  const out: AgentRuntimeLayer[] = [];
  for (const layer of layers) {
    if (layer.kind !== 'tool-runtime') {
      out.push(layer);
      continue;
    }
    const fingerprint = fnv1a64(
      layer.tools.map((t) => `${t.name}=${t.trusted ? '1' : '0'}`).sort().join('|'),
    );
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    out.push(layer);
  }
  return out;
}

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

/** Substitutes explicit time/date placeholders inside a system prompt so
 *  user-authored templates can be deterministic without bypassing the
 *  trusted layer. P0-05 audit finding (4) — placeholder substitution must
 *  actually run when called. */
export function substituteTimeAndDatePlaceholders(systemPrompt: string, layer: TrustedRuntimeLayer): string {
  const { currentDate, currentTime, timezone, isoTimestamp } = layer.content;
  return systemPrompt
    .replace(/\{\{\s*time\s*&&\s*date\s*\}\}/gi, `${currentDate} ${currentTime}`)
    .replace(/\{\{\s*date\s*\}\}/gi, currentDate)
    .replace(/\{\{\s*time\s*\}\}/gi, currentTime)
    .replace(/\{\{\s*timezone\s*\}\}/gi, timezone)
    .replace(/\{\{\s*iso\s*\}\}/gi, isoTimestamp);
}

export function composeAgentRuntime(request: AppAgentRequest): AppAgentRuntimeContract {
  validateSystemPrompt(request.systemPrompt);

  const trustedLayer = buildTrustedRuntimeLayer();
  const toolLayer = buildToolRuntimeLayer(request.tools ?? []);

  const layers: AgentRuntimeLayer[] = [trustedLayer, toolLayer];

  if (request.customLayers && request.customLayers.length > 0) {
    layers.push(...request.customLayers);
  }

  const deduplicated = dedupToolRuntimeLayers(layers);

  // P0-05 audit finding (2): once a trusted-runtime layer (priority 0,
  // immutable) is finalized, no other layer may assert priority < 0 — that
  // floor is reserved for the trusted layer itself.
  for (const layer of deduplicated) {
    if (layer === trustedLayer) continue;
    if (layer.priority < TRUSTED_PRIORITY_FLOOR) {
      throw new Error(
        `Agent runtime layer "${layer.kind}" violates immutable priority floor (priority ${layer.priority} < ${TRUSTED_PRIORITY_FLOOR}).`,
      );
    }
  }

  deduplicated.sort((a, b) => a.priority - b.priority);

  return {
    version: '1.0',
    layers: deduplicated,
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
  const rawTools = body.tools;
  const toolNames: string[] = Array.isArray(rawTools)
    ? rawTools
        .map((entry) => {
          if (typeof entry === 'string') return entry;
          if (!isRecord(entry)) return null;
          const fn = entry.function;
          if (!isRecord(fn)) return null;
          const name = fn.name;
          return typeof name === 'string' && name.length > 0 ? name : null;
        })
        .filter((v): v is string => typeof v === 'string')
    : [];
  const toolLayer = buildToolRuntimeLayer(toolNames); // P0-05 (1) — actually used, not void.

  const ledger = toolLayer.tools.length === 0
    ? '  (no tools registered)'
    : toolLayer.tools.map((t) => `  - ${t.name} (trusted=${t.trusted ? 'true' : 'false'})`).join('\n');

  // Build system instruction content from trusted runtime layer + tooltrust ledger
  const runtimeContext = `[System Runtime Context]
Current Date/Time: ${trustedLayer.content.currentDate} ${trustedLayer.content.currentTime}
Timezone: ${trustedLayer.content.timezone} (${trustedLayer.content.timezoneOffsetMinutes} min offset)
ISO timestamp: ${trustedLayer.content.isoTimestamp}
Toolchain Trust Ledger:
${ledger}
[/System Runtime Context]

`;

  const substitutePlaceholders = (input: string): string => {
    const { currentDate, currentTime, timezone, isoTimestamp } = trustedLayer.content;
    return input
      .replace(/\{\{\s*time\s*&&\s*date\s*\}\}/gi, `${currentDate} ${currentTime}`)
      .replace(/\{\{\s*date\s*\}\}/gi, currentDate)
      .replace(/\{\{\s*time\s*\}\}/gi, currentTime)
      .replace(/\{\{\s*timezone\s*\}\}/gi, timezone)
      .replace(/\{\{\s*iso\s*\}\}/gi, isoTimestamp);
  };

  // P0-05 (3) — inject trusted context for ALL POST endpoints, not just
  // /chat/completions. The chat-completions endpoint receives the block
  // through `messages[0]`; non-chat endpoints that carry a `prompt` field
  // (/image/generate, /audio/speech, /augment/text-parser) receive it as a
  // prefix so the model still sees temporal grounding.
  const newBody: Record<string, unknown> = { ...body };
  if (rawRequest.method !== 'POST') {
    return { ...rawRequest, body: newBody };
  }

  if (Array.isArray(body.messages)) {
    const messages = [...body.messages];
    if (messages.length > 0 && messages[0] && typeof messages[0] === 'object' && messages[0].role === 'system' && typeof messages[0].content === 'string') {
      const substituted = substitutePlaceholders(messages[0].content);
      messages[0] = { ...messages[0], content: runtimeContext + substituted };
    } else {
      messages.unshift({ role: 'system', content: runtimeContext });
    }
    newBody.messages = messages;
  } else if (typeof body.prompt === 'string') {
    const substituted = substitutePlaceholders(body.prompt);
    newBody.prompt = runtimeContext + substituted;
  }

  return {
    ...rawRequest,
    body: newBody,
  };
}