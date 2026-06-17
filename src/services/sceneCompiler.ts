/** @fileoverview Phase 2E — Scene-to-recipe compiler.
 *
 * Turns a SceneVersion into a GenerationRecipe for Image Studio. The
 * compiler combines component content in a canonical order (subject →
 * character → location → mood → style → camera → lighting → composition
 * → note), extracts negative prompt from "negative" components, and
 * maps scene defaults (model, dimensions, aspect ratio) onto the recipe.
 *
 * Prompt Library references (ScenePromptRef) are resolved via a caller-
 * supplied lookup function so the compiler stays pure and testable.
 * Media references (SceneMediaRef) are passed through as metadata so
 * the UI can pre-fill style references or background references.
 *
 * Safety:
 *  - All prompt content passes through the same redactSecrets
 *    helper used by the data model, so a scene that was sanitised
 *    at write time is also safe at compile time.
 *  - The compiler is deterministic and pure — it does not mutate
 *    the input scene or version.
 */

import {
  type SceneComposerItem,
  type SceneVersion,
  type SceneComponent,
  type SceneMediaRef,
  type ScenePromptRef,
} from "../types/scene";
import type { GenerationRecipe } from "../types/project";
import { redactSecrets } from "../shared/redaction";

const MAX_PROMPT_CHARS = 32_000;
const MAX_NEGATIVE_CHARS = 8_000;

const COMPONENT_ORDER: SceneComponent["kind"][] = [
  "subject",
  "character",
  "location",
  "mood",
  "style",
  "camera",
  "lighting",
  "composition",
  "note",
];

/** Resolved prompt content from a Prompt Library reference. */
export interface ResolvedPromptRef {
  promptId: string;
  versionId?: string;
  title: string;
  content: string;
  negativeContent?: string;
}

/** Lookup function signature — consumers supply their own (e.g. from usePromptLibraryStore). */
export type PromptLookupFn = (
  ref: ScenePromptRef,
) => ResolvedPromptRef | null;

export interface SceneCompilerOptions {
  /** Resolve Prompt Library refs to their content. */
  resolvePrompt?: PromptLookupFn;
  /** Override the scene's default model (e.g. from capability selector). */
  modelOverride?: string;
  /** Override dimensions (e.g. from live model constraints). */
  widthOverride?: number;
  heightOverride?: number;
  aspectRatioOverride?: string;
}

export interface SceneCompileResult {
  recipe: GenerationRecipe;
  /** Resolved prompt refs used in the final prompt. */
  resolvedPrompts: ResolvedPromptRef[];
  /** Unresolved refs (prompt not found in library). */
  unresolvedPrompts: ScenePromptRef[];
  /** Media refs carried as metadata (for UI pre-fill). */
  mediaRefs: SceneMediaRef[];
  /** Total combined prompt character count. */
  promptCharCount: number;
}

function componentText(c: SceneComponent): string {
  if (!c.enabled) return "";
  const text = redactSecrets(c.content.trim());
  if (!text) return "";
  return text;
}

function joinComponents(
  components: readonly SceneComponent[],
  kinds: readonly SceneComponent["kind"][],
): string {
  const parts: string[] = [];
  for (const kind of kinds) {
    for (const c of components) {
      if (c.kind !== kind) continue;
      const text = componentText(c);
      if (text) parts.push(text);
    }
  }
  return parts.join(", ");
}

export function compileSceneToRecipe(
  item: SceneComposerItem,
  version: SceneVersion,
  options: SceneCompilerOptions = {},
): SceneCompileResult {
  const { resolvePrompt, modelOverride, widthOverride, heightOverride, aspectRatioOverride } = options;

  const components = version.components;
  const mediaRefs = version.mediaRefs;
  const promptRefs = version.promptRefs;

  const resolvedPrompts: ResolvedPromptRef[] = [];
  const unresolvedPrompts: ScenePromptRef[] = [];

  // -----------------------------------------------------------------------
  // 1. Resolve Prompt Library references
  // -----------------------------------------------------------------------
  const promptParts: string[] = [];
  if (resolvePrompt) {
    for (const ref of promptRefs) {
      const resolved = resolvePrompt(ref);
      if (resolved) {
        const content = resolved.content ? redactSecrets(resolved.content.trim()) : "";
        const negativeContent = resolved.negativeContent ? redactSecrets(resolved.negativeContent.trim()) : "";
        resolvedPrompts.push({ ...resolved, content, negativeContent });
        if (content) {
          promptParts.push(content);
        }
      } else {
        unresolvedPrompts.push(ref);
      }
    }
  }

  // -----------------------------------------------------------------------
  // 2. Combine components in canonical order
  // -----------------------------------------------------------------------
  const mainPrompt = joinComponents(components, COMPONENT_ORDER);

  // -----------------------------------------------------------------------
  // 3. Extract negative prompt from "negative" components
  // -----------------------------------------------------------------------
  const negativeParts = components
    .filter((c) => c.kind === "negative")
    .map((c) => componentText(c))
    .filter((t) => t.length > 0);
  const negativePrompt = negativeParts.length > 0 ? negativeParts.join(", ") : undefined;

  // -----------------------------------------------------------------------
  // 4. Extract style from "style" components
  // -----------------------------------------------------------------------
  const styleParts = components
    .filter((c) => c.kind === "style")
    .map((c) => componentText(c))
    .filter((t) => t.length > 0);
  const style = styleParts.length > 0 ? styleParts.join(", ") : undefined;

  // -----------------------------------------------------------------------
  // 5. Assemble final prompt
  // -----------------------------------------------------------------------
  const allParts = [...promptParts, mainPrompt].filter((p) => p.length > 0);
  let prompt = allParts.join(", ");
  if (prompt.length > MAX_PROMPT_CHARS) {
    prompt = prompt.slice(0, MAX_PROMPT_CHARS);
  }
  const negative = negativePrompt && negativePrompt.length > MAX_NEGATIVE_CHARS
    ? negativePrompt.slice(0, MAX_NEGATIVE_CHARS)
    : negativePrompt;

  // -----------------------------------------------------------------------
  // 6. Dimensions and model
  // -----------------------------------------------------------------------
  const model = modelOverride ?? item.defaultModel ?? "";
  const width = widthOverride ?? item.defaultWidth;
  const height = heightOverride ?? item.defaultHeight;
  const aspectRatio = aspectRatioOverride ?? item.defaultAspectRatio;

  const recipe: GenerationRecipe = {
    prompt,
    negativePrompt: negative ?? undefined,
    model,
    width: width ?? undefined,
    height: height ?? undefined,
    aspectRatio: aspectRatio ?? undefined,
    style: style ?? undefined,
    createdAt: new Date().toISOString(),
    metadata: {
      sourceSceneId: item.id,
      sourceSceneVersionId: version.id,
      sourceSceneVersion: version.version,
      sourceSceneTitle: item.title,
      mediaRefCount: mediaRefs.length,
      promptRefCount: promptRefs.length,
      resolvedPromptCount: resolvedPrompts.length,
      unresolvedPromptCount: unresolvedPrompts.length,
    },
  };

  return {
    recipe,
    resolvedPrompts,
    unresolvedPrompts,
    mediaRefs,
    promptCharCount: prompt.length,
  };
}