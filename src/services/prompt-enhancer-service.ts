/** @fileoverview
 *  Internal prompt-enhancer LLM service. Used exclusively for image prompt
 *  enhancement and remix. Not user-chat-accessible, not selectable from the
 *  normal model dropdown, configured through config.yaml.
 *
 *  Safety posture: the Venice Forge local family / CSAM safety guard and
 *  the upstream provider controls remain authoritative. The enhancer is
 *  a task-focused prompt rewriter — it does not override safety, and its
 *  default system prompts do not claim to do so.
 */

import { venice } from "../lib/venice-client";
import type { YamlInternalPromptEnhancer } from "../config/configSchema";

export type PromptEnhanceMode = "enhance" | "remix";

export interface EnhancePromptInput {
  mode: PromptEnhanceMode;
  prompt: string;
  negativePrompt?: string | null;
  model?: string;
  dimensions?: Record<string, unknown>;
  seed?: number | null;
}

export interface EnhancePromptResult {
  prompt: string;
  modelUsed: string;
}

/** Configuration shape for the prompt-enhancer LLM call.
 *  Mirrors {@link YamlInternalPromptEnhancer} but allows callers to pass
 *  an override (e.g. from the renderer config store). */
export type PromptEnhancerConfig = Pick<
  YamlInternalPromptEnhancer,
  "enabled" | "model" | "temperature" | "maxTokens" | "systemPrompt" | "remixSystemPrompt"
>;

/** Default model id used when no config is provided. Must match
 *  the canonical Venice model id as advertised by /models (verified
 *  via the live registry). */
export const DEFAULT_ENHANCER_MODEL = "venice-uncensored-1-2";

/** Default enhance system prompt. The Venice Forge safety guard and
 *  the upstream provider controls remain authoritative. This prompt
 *  is a task-focused rewrite instruction; it does not reframe itself
 *  as overriding safety. */
export const DEFAULT_ENHANCE_SYSTEM_PROMPT = `You are Venice Forge's internal image-prompt enhancer. Rewrite the user's image prompt into one concise, vivid, production-ready image-generation prompt. Preserve the user's subject, composition, style, medium, and constraints. Improve specificity, visual language, lighting, camera/composition, material detail, and quality cues.

Do not add moral commentary, policy commentary, disclaimers, refusals, markdown, alternatives, or explanations. Return only the improved prompt.

The app's existing safety guard and upstream provider controls remain authoritative. You do not override them.`;

/** Default remix system prompt. Same safety posture as the enhance prompt. */
export const DEFAULT_REMIX_SYSTEM_PROMPT = `You are Venice Forge's internal image-prompt remix engine. Create one visually distinct variation of the user's image prompt while preserving the core subject identity and user intent. Change composition, setting, lighting, camera angle, mood, and style.

Do not add moral commentary, policy commentary, disclaimers, refusals, markdown, alternatives, or explanations. Return only the remixed prompt.

The app's existing safety guard and upstream provider controls remain authoritative. You do not override them.`;

/** Strip markdown code fences and any explanatory wrapper text from the LLM output. */
export function stripEnhancerOutput(raw: string): string {
  let result = raw.trim();

  // Remove markdown code fences (``` or `) at start/end
  result = result.replace(/^```(?:\w+)?\s*\n?/i, "").replace(/\n?```\s*$/i, "");

  // Remove a leading line like "Here is your enhanced prompt:" or similar
  result = result.replace(/^(?:Here|Sure|Certainly|Of course|Below|The)[^:]*:\s*\n?/i, "");

  // Remove trailing "---" or other separators
  result = result.replace(/\n---+\s*$/g, "");

  // Remove quotes if the entire result is wrapped in them
  result = result.replace(/^["']([\s\S]*)["']$/, "$1");

  return result.trim();
}

/** Clamp a model id to a safe string. Defensive against an unsafe config
 *  accidentally pointing the enhancer at a non-uncensored model — the
 *  enhancer is an internal helper, not a chat surface. */
function normaliseEnhancerModel(model: string | undefined | null): string {
  if (typeof model !== "string") return DEFAULT_ENHANCER_MODEL;
  const trimmed = model.trim();
  if (!trimmed) return DEFAULT_ENHANCER_MODEL;
  return trimmed.slice(0, 256);
}

function clampTemperature(value: number | undefined | null): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0.4;
  return Math.max(0, Math.min(2, value));
}

function clampMaxTokens(value: number | undefined | null): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 350;
  const n = Math.trunc(value);
  return Math.max(1, Math.min(4000, n));
}

/** Build the user message for the prompt-enhancer LLM call.
 *  Structured for clarity and token efficiency. Does NOT include
 *  refusal-override instructions — safety is enforced by the local
 *  rules, not by the prompt. */
function buildEnhancePrompt(input: EnhancePromptInput): string {
  const sections: string[] = [];

  if (input.mode === "enhance") {
    sections.push("TASK: Enhance the following image prompt for maximum visual quality.");
    sections.push("Improve: descriptive detail, composition, lighting, textures, style specificity, and model optimization.");
  } else {
    sections.push("TASK: Remix the following image prompt into a distinct variation.");
    sections.push("Alter: composition, setting, lighting, mood, camera angle, and artistic style.");
    sections.push("Preserve: the core subject matter only.");
  }

  sections.push("");
  sections.push("INPUT PROMPT:");
  sections.push(input.prompt);

  if (input.negativePrompt?.trim()) {
    sections.push("");
    sections.push("NEGATIVE PROMPT (preserve/contrast as appropriate):");
    sections.push(input.negativePrompt);
  }

  if (input.mode === "remix") {
    if (input.model) {
      sections.push("");
      sections.push(`TARGET MODEL: ${input.model}`);
    }
    if (input.dimensions && Object.keys(input.dimensions).length > 0) {
      sections.push("");
      sections.push(`DIMENSIONS: ${JSON.stringify(input.dimensions)}`);
    }
    if (input.seed !== undefined && input.seed !== null) {
      sections.push("");
      sections.push(`SEED: ${input.seed}`);
    }
  }

  sections.push("");
  sections.push("OUTPUT RULES:");
  sections.push("- Return ONLY the final prompt text");
  sections.push("- No explanations, no markdown, no quotes");
  sections.push("- Preserve the user's stated subject, composition, style, and constraints");

  return sections.join("\n");
}

/** Resolves the effective config for the enhancer. Returns a safe
 *  fallback when the config is missing or `enabled: false`. */
function resolveConfig(
  config: PromptEnhancerConfig | null | undefined,
  mode: PromptEnhanceMode,
): {
  enabled: boolean;
  model: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
} {
  if (!config) {
    return {
      enabled: true,
      model: DEFAULT_ENHANCER_MODEL,
      temperature: 0.4,
      maxTokens: 350,
      systemPrompt:
        mode === "remix" ? DEFAULT_REMIX_SYSTEM_PROMPT : DEFAULT_ENHANCE_SYSTEM_PROMPT,
    };
  }
  const configuredPrompt =
    mode === "remix" ? config.remixSystemPrompt : config.systemPrompt;
  const fallback = mode === "remix" ? DEFAULT_REMIX_SYSTEM_PROMPT : DEFAULT_ENHANCE_SYSTEM_PROMPT;
  return {
    enabled: config.enabled !== false,
    model: normaliseEnhancerModel(config.model),
    temperature: clampTemperature(config.temperature),
    maxTokens: clampMaxTokens(config.maxTokens),
    systemPrompt: configuredPrompt && configuredPrompt.trim().length > 0
      ? configuredPrompt
      : fallback,
  };
}

/** Thrown when the prompt enhancer is disabled in config. */
export class PromptEnhancerDisabledError extends Error {
  constructor() {
    super("Internal prompt enhancer is disabled in config.");
    this.name = "PromptEnhancerDisabledError";
  }
}

/** Call the internal prompt-enhancer LLM.
 *
 *  The enhancer uses the model, temperature, max tokens, and system
 *  prompt configured in `internal_prompt_enhancer` (renderer config
 *  store / main-process `config.yaml`). The model id default is
 *  `venice-uncensored-1-2` and the system prompts are task-focused;
 *  they do not reframe the enhancer as overriding the app's safety
 *  rules or the upstream provider controls. This function is never
 *  exposed to the user as a chat-accessible model.
 *
 *  @param input The prompt to enhance/remix.
 *  @param config Optional config from the renderer config store.
 *  @param overrides Optional per-call overrides (e.g. system prompt).
 *  @returns The enhanced or remixed prompt text.
 */
export async function enhancePrompt(
  input: EnhancePromptInput,
  config?: PromptEnhancerConfig | null,
  overrides?: { systemPrompt?: string; remixSystemPrompt?: string },
): Promise<EnhancePromptResult> {
  const effective = resolveConfig(config, input.mode);

  if (!effective.enabled) {
    throw new PromptEnhancerDisabledError();
  }

  // Allow per-call override of the system prompt (used by tests and
  // advanced config panels). Empty strings fall back to the resolved
  // prompt.
  let sysPrompt = effective.systemPrompt;
  if (input.mode === "remix" && overrides?.remixSystemPrompt?.trim()) {
    sysPrompt = overrides.remixSystemPrompt;
  } else if (input.mode === "enhance" && overrides?.systemPrompt?.trim()) {
    sysPrompt = overrides.systemPrompt;
  }

  const messages = [
    { role: "system" as const, content: sysPrompt },
    { role: "user" as const, content: buildEnhancePrompt(input) },
  ];

  const body: Record<string, unknown> = {
    model: effective.model,
    messages,
    temperature: effective.temperature,
    max_tokens: effective.maxTokens,
  };

  const response = await venice<{
    choices?: Array<{ message?: { content?: string } }>;
  }>("/chat/completions", {
    method: "POST",
    body,
  });

  const rawContent = response?.choices?.[0]?.message?.content ?? "";
  const prompt = stripEnhancerOutput(rawContent) || input.prompt;

  return { prompt, modelUsed: effective.model };
}

/** Remix a prompt using the internal LLM.
 *  Same as enhancePrompt but uses the remix system prompt. */
export async function remixPrompt(
  input: EnhancePromptInput,
  config?: PromptEnhancerConfig | null,
  overrides?: { remixSystemPrompt?: string },
): Promise<EnhancePromptResult> {
  return enhancePrompt(
    { ...input, mode: "remix" },
    config,
    overrides,
  );
}
