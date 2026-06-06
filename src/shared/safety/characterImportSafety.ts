/**
 * @fileoverview Safety wrappers for the Character RP Studio.
 *
 * Thin adapters that route user-supplied RP payloads into the existing
 * `assessChildExploitationSafety` rule engine via the conditional
 * `maybeRunLocalFamilyGuard` pipeline. Each wrapper supplies the correct
 * `source` / `endpoint` for the audit trail.
 *
 * Toggle semantics:
 *   - When `localFamilySafeModeEnabled === true` (Family Safe Mode):
 *     `assessChildExploitationSafety` runs and `recordDecision` is called
 *     automatically by `maybeRunLocalFamilyGuard`. The wrapper returns the
 *     real `SafetyGuardDecision` produced by the rule engine.
 *   - When `localFamilySafeModeEnabled === false` (Adult Mode):
 *     `maybeRunLocalFamilyGuard` returns a synthetic allow decision with
 *     `reasonCode: "LOCAL_FAMILY_SAFE_MODE_DISABLED"` and the rule engine
 *     is intentionally NOT invoked. The wrapper returns this synthetic
 *     decision; the renderer must surface it as "Adult Mode" and never as
 *     "rule-engine-allowed".
 *
 * All wrappers:
 *   1. Build a payload object the existing extractor understands.
 *   2. Route through `maybeRunLocalFamilyGuard` (NOT direct
 *      `assessChildExploitationSafety`).
 *   3. NEVER log raw prompt text.
 *   4. Surface only the user-facing message when blocking.
 *
 * IMPORTANT: Adult Mode bypasses ONLY the local rule engine. The
 * provider-side `safe_mode` parameter (Venice API Safe Mode) is a
 * separate control and is not affected by this toggle. See
 * `src/shared/veniceSafeMode.ts` for the provider-side helper.
 */

import {
  type SafetyGuardDecision,
  type SafetyGuardInput,
} from "./childExploitationGuard";
import { maybeRunLocalFamilyGuard } from "./localFamilySafeGuard";
import type { CharacterCardV1, RpChatV1, UserPersonaV1 } from "../../types/rp";

/** Default source for character-card and persona import paths (renderer-side). */
const CARD_IMPORT_SOURCE: SafetyGuardInput["source"] = "venice-client";
/** Default source for RP chat-completion contexts (renderer-side). */
const RP_CONTEXT_SOURCE: SafetyGuardInput["source"] = "venice-client";
/** Default source for scene image prompts. */
const SCENE_PROMPT_SOURCE: SafetyGuardInput["source"] = "image";

function assess(input: SafetyGuardInput, enabled: boolean): SafetyGuardDecision {
  const result = maybeRunLocalFamilyGuard(input, enabled);
  if (result.guardDecision) {
    return result.allowed
      ? result.guardDecision
      : { ...result.guardDecision, userMessage: result.userMessage };
  }
  return {
    allow: true,
    action: "allow",
    severity: "none",
    category: "none",
    reasonCode: "LOCAL_FAMILY_SAFE_MODE_DISABLED",
    userMessage: "",
    developerMessage: "Local Family Safe Mode disabled; rule evaluation skipped.",
    normalizedChanged: false,
    signals: [],
    audit: {
      decisionId: "local-family-safe-mode-disabled",
      createdAt: new Date().toISOString(),
      promptHash: "00000000",
      promptLength: 0,
      matchedFieldPaths: [],
    },
  };
}

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
export function assessCharacterImport(card: CharacterCardV1, enabled = true): SafetyGuardDecision {
  const payload = collectCharacterText(card);
  return assess({
    endpoint: "/character-card/import",
    method: "POST",
    payload,
    text: card.systemPrompt || card.description,
    source: CARD_IMPORT_SOURCE,
  }, enabled);
}

/** Assesses a batch of character cards in aggregate (e.g. on import-many). */
export function assessCharacterBatchImport(cards: CharacterCardV1[], enabled = true): SafetyGuardDecision {
  if (cards.length === 0) {
    return assess({ endpoint: "/character-card/import", method: "POST", payload: {}, source: CARD_IMPORT_SOURCE }, enabled);
  }
  const payload = cards.map(collectCharacterText);
  return assess({
    endpoint: "/character-card/import",
    method: "POST",
    payload: { batch: payload },
    text: cards.map((c) => c.systemPrompt || c.description).join("\n"),
    source: CARD_IMPORT_SOURCE,
  }, enabled);
}

/** Assesses a user persona before save. */
export function assessPersonaImport(persona: UserPersonaV1, enabled = true): SafetyGuardDecision {
  const payload = { name: persona.name, description: persona.description, reference: persona.reference ?? "" };
  // Concatenate all user-controlled text fields so the guard sees the full content
  // surface (description and reference are both free-form user text).
  const combinedText = [persona.description, persona.reference ?? ""].filter(Boolean).join("\n");
  return assess({
    endpoint: "/persona/import",
    method: "POST",
    payload,
    text: combinedText,
    source: CARD_IMPORT_SOURCE,
  }, enabled);
}

/** Assesses the full RP context for a chat-completion call. */
export function assessRpContext(args: {
  rpChat: RpChatV1;
  characters: CharacterCardV1[];
  persona?: UserPersonaV1;
  userMessage: string;
}, enabled = true): SafetyGuardDecision {
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
  // The user message is already in the `messages` array above; do NOT pass it as
  // `text` again to avoid double-counting in scoring (M3 fix).
  return assess({
    endpoint: "/chat/completions",
    method: "POST",
    payload,
    source: RP_CONTEXT_SOURCE,
  }, enabled);
}

/** Assesses an image prompt before scene generation. */
export function assessScenePrompt(prompt: string, negativePrompt?: string, enabled = true): SafetyGuardDecision {
  const payload = { prompt, negative_prompt: negativePrompt ?? "" };
  return assess({
    endpoint: "/image/generate",
    method: "POST",
    payload,
    text: prompt,
    source: SCENE_PROMPT_SOURCE,
  }, enabled);
}
