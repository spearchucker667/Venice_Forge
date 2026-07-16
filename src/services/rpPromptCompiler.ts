/**
 * @fileoverview Phase 2F — RP Prompt Stack Compiler.
 *
 * Wraps the pure `buildRpPrompt` from `services/rp/promptBuilderService.ts`
 * and **adds** the Phase 2F-only blocks that the original builder does
 * not include:
 *
 *   - Optional prompt-library refs (each resolved into a system block)
 *   - Optional scene-composer context (single compiled system block)
 *   - Optional character first-message (rendered as a starter
 *     assistant/character turn so the model can pattern-match it)
 *   - Optional example dialogues (rendered as a `<START>` few-shot block)
 *   - Deterministic token estimates (chars/4 — the same heuristic the
 *     rest of the renderer uses for budget reasoning)
 *
 * **Pure**: no I/O, no fetch, no React. Inputs and outputs are plain
 * data — easy to unit-test.
 *
 * **Order (canonical, matches the existing builder order)**:
 *
 *   1. Safety preamble (from the inner builder)
 *   2. Model identity
 *   3. Persona
 *   4. Characters (one block per active character)
 *   5. Scenario
 *   6. Prompt-library refs (Phase 2F) — newest first
 *   7. Scene-composer ref (Phase 2F) — at most one
 *   8. Lorebook entries
 *   9. Memory
 *  10. Example dialogues (Phase 2F) — `<START>`-style few-shot
 *  11. Recent messages
 *  12. First-message greeting (Phase 2F) — only if no recent messages
 *  13. Active turn instruction
 *  14. User message
 *
 * **Safety:** the safety guard is **not** invoked here. The caller
 * (e.g. `rpChatService`) is responsible for assessing the assembled
 * messages. The compiler never logs raw prompt text.
 */

import { buildRpPrompt } from "./rp/promptBuilderService";
import type {
  CharacterCardV1,
  LorebookV1,
  RpChatV1,
  RpMemoryV1,
  UserPersonaV1,
} from "../types/rp";
import { RP_PROMPT_COMPILE_VERSION } from "../types/rp";

/** Deterministic 1-token-per-4-character estimate (matches the rest of the renderer). */
export const CHARS_PER_TOKEN = 4;

function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / CHARS_PER_TOKEN));
}

export type RpSectionKind =
  | "safety-preamble"
  | "model-identity"
  | "persona"
  | "character"
  | "scenario"
  | "prompt-library"
  | "scene-compiler"
  | "lorebook-entry"
  | "memory"
  | "example-dialogue"
  | "recent-message"
  | "post-history-instruction"
  | "first-message"
  | "active-turn-instruction"
  | "user-message";

/** A single visible section in the final compiled prompt. */
export interface RpCompileSection {
  /** Stable id (kind:sourceId or kind:index). */
  id: string;
  kind: RpSectionKind;
  /** Human-friendly label, never contains raw user content. */
  label: string;
  /** Section content as it will be sent to the model. */
  content: string;
  /** Source entity id (character id, lorebook entry id, etc.) when applicable. */
  sourceId?: string;
  /** Section character length. */
  chars: number;
  /** Section token estimate. */
  tokens: number;
  /** Included after budget enforcement. */
  included: boolean;
  /** Why it was excluded, when applicable. */
  reason?: "budget-exceeded" | "disabled" | "no-trigger" | "empty";
}

export interface RpPromptLibraryRef {
  /** Source id, for trace / section id. */
  id: string;
  /** Human label, never user-content. */
  label: string;
  /** Resolved content (already-sanitised). */
  content: string;
}

export interface RpSceneComposerRef {
  /** Source scene id. */
  id: string;
  /** Human label. */
  label: string;
  /** Compiled recipe prose, pre-built. */
  content: string;
}

export interface RpCompileInput {
  rpChat: RpChatV1;
  persona?: UserPersonaV1;
  characters: CharacterCardV1[];
  lorebooks: LorebookV1[];
  memories: RpMemoryV1[];
  modelSystemPrompt?: string;
  globalPostHistoryInstruction?: string;
  characterSystemPromptBehavior?: "respect-card" | "prefer-global" | "append-global" | "prepend-global";
  currentUserMessage: string;
  /** Soft cap on the total system block (chars). Defaults to 16_000. */
  systemBlockBudget?: number;
  /** Max number of recent messages. Defaults to 8. */
  recentMessageBudget?: number;
  expectedCharacterId?: string;
  /** Phase 2F additions. All optional. */
  promptLibraryRefs?: readonly RpPromptLibraryRef[];
  sceneComposerRef?: RpSceneComposerRef;
}

export interface RpCompileResult {
  /** Envelope version. */
  version: typeof RP_PROMPT_COMPILE_VERSION;
  /** Sections in canonical order, with `included` flags. */
  sections: RpCompileSection[];
  /** Sections that survived the system block budget, concatenated with
   *  double newlines — this is the value to send as the system role. */
  systemPrompt: string;
  /** User/assistant/character/narrator messages for the recent turn
   *  history. Empty when there is no recent turn. */
  recentMessages: { role: "user" | "assistant" | "character" | "narrator" | "tool"; content: string; characterId?: string; name?: string }[];
  postHistoryMessages: { role: "system"; content: string; characterId?: string }[];
  /** The user message (verbatim). */
  userMessage: { role: "user"; content: string };
  /** Optional first message from the expected character. Rendered as
   *  an assistant/character turn only when `recentMessages` is empty. */
  firstMessage?: { role: "character"; content: string; characterId: string; name: string };
  /** Optional example-dialogues block (rendered as a single section). */
  exampleDialogue?: { content: string; characterId?: string; name?: string };
  /** Non-fatal warnings (over budget, missing refs, etc.). */
  warnings: string[];
  /** Total characters across all included system sections. */
  totalSystemChars: number;
  /** Total tokens across all included system sections. */
  totalSystemTokens: number;
  /** Whether the system block dropped sections to fit the budget. */
  budgetExceeded: boolean;
}

const DEFAULT_SYSTEM_BUDGET = 16_000;
const DEFAULT_RECENT_BUDGET = 8;

/** Stable section id factory. */
function sid(kind: string, key: string | number): string {
  return `${kind}:${key}`;
}

/** Joins non-empty lines with single newlines. */
function block(...lines: (string | undefined | null | false)[]): string {
  return lines.filter((l): l is string => typeof l === "string" && l.length > 0).join("\n");
}

/** Build the deterministic example-dialogues block for the expected
 *  character (or the first active character when not set). */
function buildExampleDialoguesBlock(
  characters: CharacterCardV1[],
  expectedId: string | undefined,
): { content: string; characterId?: string; name?: string } | undefined {
  const target = characters.find((c) => c.id === expectedId) ?? characters[0];
  if (!target) return undefined;
  const dialogues = target.exampleDialogues ?? [];
  if (dialogues.length === 0) return undefined;
  const lines = dialogues
    .map((d) => `${d.speaker || target.name}: ${d.text}`)
    .join("\n");
  return {
    content: block(
      "### Example dialogues (few-shot, deterministic; do not invent new ones) ###",
      lines,
    ),
    characterId: target.id,
    name: target.name,
  };
}

/** Build the first-message turn, if any. */
function buildFirstMessageTurn(
  characters: CharacterCardV1[],
  expectedId: string | undefined,
): { role: "character"; content: string; characterId: string; name: string } | undefined {
  const target = characters.find((c) => c.id === expectedId) ?? characters[0];
  if (!target || !target.firstMessage) return undefined;
  return {
    role: "character",
    content: target.firstMessage,
    characterId: target.id,
    name: target.name,
  };
}

export function compileRpPrompt(input: RpCompileInput): RpCompileResult {
  const systemBudget = input.systemBlockBudget ?? DEFAULT_SYSTEM_BUDGET;
  const recentBudget = input.recentMessageBudget ?? DEFAULT_RECENT_BUDGET;
  const warnings: string[] = [];

  // 1) Run the inner pure builder to get the canonical system stack +
  //    recent messages + trace. This is the single source of truth for
  //    the safety-preamble + model-identity + persona + characters +
  //    scenario + lorebook + memory + recent + user-message order.
  const inner: ReturnType<typeof buildRpPrompt> = buildRpPrompt({
    rpChat: input.rpChat,
    persona: input.persona,
    characters: input.characters,
    lorebooks: input.lorebooks,
    memories: input.memories,
    modelSystemPrompt: input.modelSystemPrompt,
    globalPostHistoryInstruction: input.globalPostHistoryInstruction,
    characterSystemPromptBehavior: input.characterSystemPromptBehavior,
    currentUserMessage: input.currentUserMessage,
    systemBlockBudget: systemBudget,
    recentMessageBudget: recentBudget,
    expectedCharacterId: input.expectedCharacterId,
  });

  // 2) Lift the inner trace into the new section shape. We keep the
  //    same `kind` labels for backwards-compatibility with existing
  //    tests / inspector views.
  const sections: RpCompileSection[] = inner.trace.map((t) => ({
    id: t.id,
    kind: mapTraceKind(t.kind),
    label: t.label,
    content: traceKindContent(inner, t),
    sourceId: t.sourceId,
    chars: t.chars,
    tokens: estimateTokens(traceKindContent(inner, t)),
    included: t.included,
    reason: t.reason,
  }));

  // 3) Inject Phase 2F prompt-library refs (newest first, in caller
  //    order). The caller is expected to have already sanitised content
  //    and re-redacted secrets.
  if (input.promptLibraryRefs && input.promptLibraryRefs.length > 0) {
    for (const ref of input.promptLibraryRefs) {
      if (!ref || !ref.content) {
        continue;
      }
      sections.push({
        id: sid("prompt-library", ref.id),
        kind: "prompt-library",
        label: ref.label,
        content: ref.content,
        sourceId: ref.id,
        chars: ref.content.length,
        tokens: estimateTokens(ref.content),
        included: true,
      });
    }
  }

  // 4) Inject the optional scene-composer ref.
  if (input.sceneComposerRef && input.sceneComposerRef.content) {
    const sc = input.sceneComposerRef;
    sections.push({
      id: sid("scene-compiler", sc.id),
      kind: "scene-compiler",
      label: sc.label,
      content: sc.content,
      sourceId: sc.id,
      chars: sc.content.length,
      tokens: estimateTokens(sc.content),
      included: true,
    });
  }

  // 5) Insert the example-dialogues block after memory, before recent
  //    messages. We splice it into the trace just before the first
  //    recent-message entry (or at the end if there is none).
  const exampleBlock = buildExampleDialoguesBlock(input.characters, input.expectedCharacterId);
  if (exampleBlock) {
    const ex: RpCompileSection = {
      id: sid("example-dialogue", exampleBlock.characterId ?? "default"),
      kind: "example-dialogue",
      label: `Example dialogues (${exampleBlock.name ?? "character"})`,
      content: exampleBlock.content,
      sourceId: exampleBlock.characterId,
      chars: exampleBlock.content.length,
      tokens: estimateTokens(exampleBlock.content),
      included: true,
    };
    const insertAt = sections.findIndex((s) => s.kind === "recent-message");
    if (insertAt >= 0) sections.splice(insertAt, 0, ex);
    else sections.push(ex);
  }

  // 6) Budget enforcement — the inner builder has already done a budget
  //    pass for its own sections. We extend it for the Phase 2F additions
  //    by walking the merged list in order and dropping the lowest-priority
  //    sections first when over budget. Priority: inner-system > prompt-library
  //    refs (newer first) > scene-compiler > example-dialogues.
  let running = sections
    .filter((s) => s.included && s.kind !== "user-message" && s.kind !== "recent-message")
    .reduce((acc, s) => acc + s.chars, 0);
  const systemSections = sections.filter(
    (s) => s.included && s.kind !== "user-message" && s.kind !== "recent-message",
  );
  let budgetExceeded = inner.budgetExceeded;
  if (running > systemBudget) {
    // Walk backwards: drop the lowest-priority Phase 2F additions first.
    const droppable = ["scene-compiler", "example-dialogue", "prompt-library"];
    for (const kind of droppable) {
      for (let i = sections.length - 1; i >= 0; i--) {
        if (running <= systemBudget) break;
        const s = sections[i];
        if (s.kind !== kind || !s.included) continue;
        s.included = false;
        s.reason = "budget-exceeded";
        running -= s.chars;
        warnings.push(`Dropped section "${s.label}" — system block budget exceeded.`);
      }
    }
    budgetExceeded = true;
  }

  const includedSystemSections = sections.filter(
    (s) => s.included && s.kind !== "user-message" && s.kind !== "recent-message",
  );
  const addedSystemSections = includedSystemSections.filter((section) =>
    section.kind === "prompt-library" || section.kind === "scene-compiler" || section.kind === "example-dialogue",
  );
  const systemPrompt = [
    inner.systemMessages.map((message) => message.content).filter(Boolean).join("\n\n"),
    ...addedSystemSections.map((section) => section.content),
  ].filter(Boolean).join("\n\n");
  const totalSystemChars = includedSystemSections.reduce((acc, s) => acc + s.chars, 0);
  const totalSystemTokens = includedSystemSections.reduce((acc, s) => acc + s.tokens, 0);

  // 7) Resolve the optional first-message greeting. We only inject it
  //    when there is no recent history (so it does not duplicate the
  //    model's last turn). The caller can override this by passing
  //    `recentMessageBudget: 0` and providing no messages.
  const firstMessageTurn = inner.recentMessages.length === 0
    ? buildFirstMessageTurn(input.characters, input.expectedCharacterId)
    : undefined;

  // 8) Compose the result. The first message is delivered to the caller
  //    as a separate field — it can choose to render it before the user
  //    turn (e.g. on the chat history) or skip it.
  const result: RpCompileResult = {
    version: RP_PROMPT_COMPILE_VERSION,
    sections,
    systemPrompt,
    recentMessages: inner.recentMessages,
    postHistoryMessages: inner.postHistoryMessages,
    userMessage: inner.userMessage,
    warnings,
    totalSystemChars,
    totalSystemTokens,
    budgetExceeded,
  };
  if (firstMessageTurn) result.firstMessage = firstMessageTurn;
  if (exampleBlock) {
    result.exampleDialogue = {
      content: exampleBlock.content,
      characterId: exampleBlock.characterId,
      name: exampleBlock.name,
    };
  }
  if (systemSections.length !== includedSystemSections.length) {
    // Budget enforcement actually dropped something; the caller can
    // surface this in the inspector / status cluster.
  }
  return result;
}

function mapTraceKind(kind: string): RpSectionKind {
  switch (kind) {
    case "safety-preamble":
    case "model-identity":
    case "persona":
    case "character":
    case "scenario":
    case "lorebook-entry":
    case "memory":
    case "recent-message":
    case "post-history-instruction":
    case "active-turn-instruction":
    case "user-message":
      return kind;
    default:
      return "user-message";
  }
}

/** Returns the section content for a given trace entry by re-reading
 *  the inner builder's outputs. The inner builder stores the rendered
 *  text inside its `systemMessages` / `recentMessages` arrays; the
 *  trace does not carry the content directly. We re-derive it from the
 *  trace's `sourceId` (when present) and the inner result. */
function traceKindContent(
  inner: ReturnType<typeof buildRpPrompt>,
  t: { id: string; kind: string; sourceId?: string },
): string {
  if (t.kind === "user-message") {
    return inner.userMessage?.content ?? "";
  }
  if (t.kind === "post-history-instruction") return inner.postHistoryMessages[0]?.content ?? "";
  if (t.kind === "recent-message") {
    const idx = Number(t.id.split(":").pop() ?? "-1");
    if (Number.isFinite(idx) && idx >= 0 && idx < inner.recentMessages.length) {
      return inner.recentMessages[idx].content;
    }
    return "";
  }
  if (t.kind === "active-turn-instruction") {
    // The active-turn-instruction is the final system entry in the
    // inner builder's system block. We pick it out by `id` prefix
    // "active-turn-instruction".
    const last = inner.systemMessages[inner.systemMessages.length - 1];
    if (last) return last.content;
    return "";
  }
  if (t.kind === "memory" || t.kind === "lorebook-entry") {
    // Inner system messages are ordered identically to the trace
    // (excluding user/recent/active). Match by sourceId on the trace.
    const sys = inner.systemMessages.find((m) => {
      const id = m.name ?? "";
      return id === t.sourceId;
    });
    if (sys) return sys.content;
    // Fallback: try matching the trace id prefix against a system message
    // whose `name` is empty and whose content is non-empty.
    return "";
  }
  // safety-preamble / model-identity / persona / character / scenario:
  // the inner builder stores these in the same order as the trace, with
  // the same `name` for the system message.
  const sys = inner.systemMessages.find((m) => (m.name ?? "") === t.sourceId);
  if (sys) return sys.content;
  return "";
}

/** Convenience: compile and return the systemPrompt only. */
export function compileSystemPrompt(input: RpCompileInput): string {
  return compileRpPrompt(input).systemPrompt;
}

/**
 * Compiles a character system prompt by replacing %%CHARACTER_INSTRUCTIONS%%
 * or prepending the instructions if the template is not found.
 */
export function compileCharacterSystemPrompt(
  systemPrompt: string,
  instructions?: string,
): string {
  const userInst = instructions?.trim() ?? "";
  if (!userInst) return systemPrompt;
  if (systemPrompt.includes("%%CHARACTER_INSTRUCTIONS%%")) {
    return systemPrompt.replace("%%CHARACTER_INSTRUCTIONS%%", userInst);
  }
  return `${userInst}\n\n${systemPrompt}`;
}
