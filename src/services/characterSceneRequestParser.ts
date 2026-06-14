/** @fileoverview Parses the strict assistant marker for automatic scene generation. */

const MARKER_OPEN = '<venice_forge_scene_request>';
const MARKER_CLOSE = '</venice_forge_scene_request>';
const ASPECT_RATIOS = new Set(['1:1', '4:3', '3:4', '16:9', '9:16']);
const MAX_FOCUS_LENGTH = 1000;
const MAX_NEGATIVE_LENGTH = 1000;

export interface CharacterSceneRequest {
  intent: 'create_scene';
  focus?: string;
  aspect_ratio?: string;
  negative_prompt?: string;
}

export interface CharacterSceneParseResult {
  request: CharacterSceneRequest | null;
  displayText: string;
  diagnostics?: string;
}

export function parseCharacterSceneRequest(text: string): CharacterSceneParseResult {
  const indices: Array<{ start: number; end: number }> = [];
  let pos = 0;

  while (true) {
    const start = text.indexOf(MARKER_OPEN, pos);
    if (start === -1) break;
    const end = text.indexOf(MARKER_CLOSE, start + MARKER_OPEN.length);
    if (end === -1) break;
    indices.push({ start, end: end + MARKER_CLOSE.length });
    pos = end + MARKER_CLOSE.length;
  }

  if (indices.length === 0) {
    return { request: null, displayText: text };
  }

  let displayText = text;
  for (let i = indices.length - 1; i >= 0; i--) {
    const { start, end } = indices[i];
    displayText = displayText.slice(0, start) + displayText.slice(end);
  }
  displayText = displayText.replace(/\s+/g, ' ').trim();

  if (indices.length !== 1) {
    return { request: null, displayText, diagnostics: 'multiple_markers_rejected' };
  }

  const payloadText = text
    .slice(indices[0].start + MARKER_OPEN.length, indices[0].end - MARKER_CLOSE.length)
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(payloadText);
  } catch {
    return { request: null, displayText, diagnostics: 'malformed_json_rejected' };
  }

  if (!isValidRequest(parsed)) {
    return { request: null, displayText, diagnostics: 'invalid_shape_rejected' };
  }

  return { request: parsed, displayText };
}

function isValidRequest(value: unknown): value is CharacterSceneRequest {
  if (!value || typeof value !== 'object') return false;
  const r = value as Record<string, unknown>;
  if (r.intent !== 'create_scene') return false;

  if (r.focus !== undefined && (typeof r.focus !== 'string' || r.focus.length > MAX_FOCUS_LENGTH)) {
    return false;
  }
  if (
    r.negative_prompt !== undefined &&
    (typeof r.negative_prompt !== 'string' || r.negative_prompt.length > MAX_NEGATIVE_LENGTH)
  ) {
    return false;
  }
  if (
    r.aspect_ratio !== undefined &&
    (typeof r.aspect_ratio !== 'string' || !ASPECT_RATIOS.has(r.aspect_ratio))
  ) {
    return false;
  }
  return true;
}
