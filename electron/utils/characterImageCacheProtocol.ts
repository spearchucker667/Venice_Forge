/** @fileoverview Strict allow-list for `<img src="venice-character-cache://…">` requests.
 *
 *  This module is a thin façade over the shared
 *  {@link evaluateCustomProtocolAccess} helper so the character-image scheme
 *  and the durable schemes (`venice-media`, `venice-tts`) keep the same origin
 *  policy.
 */

import {
  evaluateCustomProtocolAccess,
  type CustomProtocolAccessInput,
} from "./customProtocolAccess";

export type CharacterImageCacheProtocolAccessInput = CustomProtocolAccessInput;

export function isAllowedCharacterImageCacheProtocolAccess(
  input: CharacterImageCacheProtocolAccessInput,
): boolean {
  return evaluateCustomProtocolAccess(input).allowed;
}
