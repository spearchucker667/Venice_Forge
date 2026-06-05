/**
 * @fileoverview Safety wrappers for the Character RP Studio. Thin adapters that
 * route user-supplied RP payloads into the existing
 * `assessChildExploitationSafety` guard with the correct `source` / `endpoint`
 * and category surface. The guard logic itself is unchanged.
 *
 * All wrappers:
 *   1. Build a payload object the existing extractor understands
 *   2. Call `assessChildExploitationSafety` and return the decision
 *   3. NEVER log raw prompt text
 *   4. Surface only the user-facing message when blocking
 *
 * Caller responsibilities:
 *   - At every enforcement boundary, call `recordDecision(decision)`
 *   - On `!decision.allow`, throw or refuse the user-visible action
 */

import {
  assessChildExploitationSafety,
  type SafetyGuardDecision,
  type SafetyGuardInput,
} from "./childExploitationGuard";
import { recordDecision } from "./guardAudit";
import type { CharacterCardV1, RpChatV1, UserPersonaV1 } from "../../types/rp";

/** Default source for character-card import paths. */
const CARD_IMPORT_SOURCE: SafetyGuardInput["source"] = "ipc";
/** Default source for RP chat-completion contexts. */
const RP_CONTEXT_SOURCE: SafetyGuardInput["source"] = "ipc";
/** Default source for scene image prompts. */
const SCENE_PROMPT_SOURCE: SafetyGuardInput["source"] = "image";

/** Assembles a payload object for the safety extractor. Joins only the prompt-relevant
 *  text fields, never any metadata that does not represent user content. */
function collectCharacterText(card: CharacterCardV1): Record<string, unknown> {
  return {
    name: card.name,
    description: card.description,
    systemPrompt: card.systemPrompt,
    scenario: card.scenario ?? "",
    exampleDialogues: card.exampleDialogues.map((d) => `${d.speaker}: ${d.text}`),
  };
}

/** Assesses a single character card for save/import safety. */
export function assessCharacterImport(card: CharacterCardV1): SafetyGuardDecision {
  const payload = collectCharacterText(card);
  const decision = assessChildExploitationSafety({
    endpoint: "/character-card/import",
    method: "POST",
    payload,
    text: card.systemPrompt || card.description,
    source: CARD_IMPORT_SOURCE,
  });
  recordDecision(decision);
  return decision;
}

/** Assesses a batch of character cards in aggregate (e.g. on import-many). */
export function assessCharacterBatchImport(cards: CharacterCardV1[]): SafetyGuardDecision {
  if (cards.length === 0) {
    const allow = assessChildExploitationSafety({ endpoint: "/character-card/import", method: "POST", payload: {}, source: CARD_IMPORT_SOURCE });
    recordDecision(allow);
    return allow;
  }
  const payload = cards.map(collectCharacterText);
  const decision = assessChildExploitationSafety({
    endpoint: "/character-card/import",
    method: "POST",
    payload: { batch: payload },
    text: cards.map((c) => c.systemPrompt || c.description).join("\n"),
    source: CARD_IMPORT_SOURCE,
  });
  recordDecision(decision);
  return decision;
}

/** Assesses a user persona before save. */
export function assessPersonaImport(persona: UserPersonaV1): SafetyGuardDecision {
  const payload = { name: persona.name, description: persona.description, reference: persona.reference ?? "" };
  const decision = assessChildExploitationSafety({
    endpoint: "/persona/import",
    method: "POST",
    payload,
    text: persona.description,
    source: CARD_IMPORT_SOURCE,
  });
  recordDecision(decision);
  return decision;
}

/** Assesses the full RP context for a chat-completion call. */
export function assessRpContext(args: {
  rpChat: RpChatV1;
  characters: CharacterCardV1[];
  persona?: UserPersonaV1;
  userMessage: string;
}): SafetyGuardDecision {
  const payload = {
    model: args.rpChat.modelId,
    messages: [
      ...args.rpChat.messages.map((m) => ({ role: m.role, content: m.content, characterId: m.characterId })),
      { role: "user", content: args.userMessage },
    ],
    characters: args.characters.map(collectCharacterText),
    persona: args.persona
      ? { name: args.persona.name, description: args.persona.description }
      : undefined,
  };
  const decision = assessChildExploitationSafety({
    endpoint: "/chat/completions",
    method: "POST",
    payload,
    text: args.userMessage,
    source: RP_CONTEXT_SOURCE,
  });
  recordDecision(decision);
  return decision;
}

/** Assesses an image prompt before scene generation. */
export function assessScenePrompt(prompt: string, negativePrompt?: string): SafetyGuardDecision {
  const payload = { prompt, negative_prompt: negativePrompt ?? "" };
  const decision = assessChildExploitationSafety({
    endpoint: "/image/generate",
    method: "POST",
    payload,
    text: prompt,
    source: SCENE_PROMPT_SOURCE,
  });
  recordDecision(decision);
  return decision;
}
