/** @fileoverview Maps structured `ContentPartValidationError` reasons to
 *  localized, user-visible text (FEAT-006).
 *
 *  The canonical validator deliberately carries no English text (see
 *  `contentPartValidation.ts`) — presentation belongs to the renderer/i18n
 *  layer. This helper is the single translation point shared by the composer
 *  (`chat-input.tsx`, `useTranslation("chat")`) and the send path
 *  (`use-chat.ts`, `translateRuntime`), so both surfaces produce identical
 *  copy for the same reason code. */

import type { ContentPart } from "../types/venice";
import type { ContentPartValidationError } from "./contentPartValidation";

export type ContentPartErrorTranslator = (
  key: string,
  defaultValue: string,
  values?: Record<string, unknown>,
) => string;

/** Returns the localized description for a validation error. `partType` is
 *  the type of the offending part (omitted for aggregate errors such as
 *  `too-many-video-urls`) so format guidance can be specific. */
export function describeContentPartValidationError(
  error: ContentPartValidationError,
  partType: ContentPart["type"] | undefined,
  translate: ContentPartErrorTranslator,
  keyPrefix: string,
): string {
  switch (error.reason) {
    case "unsupported-type":
      return translate(
        `${keyPrefix}.unsupportedType`,
        "This attachment type can't be sent as a native input.",
      );
    case "missing-payload":
      return translate(
        `${keyPrefix}.missingPayload`,
        "This attachment is missing its content.",
      );
    case "raw-local-path":
      return translate(
        `${keyPrefix}.rawLocalPath`,
        "Local file paths can't be sent. Attach the file itself or use a public https:// URL.",
      );
    case "unsupported-format":
      return partType === "video_url"
        ? translate(
            `${keyPrefix}.unsupportedVideoFormat`,
            "Unsupported video URL. Use a direct mp4/mpeg/mov/webm link or a YouTube URL.",
          )
        : translate(
            `${keyPrefix}.unsupportedFileFormat`,
            "Unsupported file type for native input. Allowed: PDF, EPUB, DOCX, PPTX, XLSX, XLS, TXT, Markdown, CSV, or JSON. Choose “Local context” instead.",
          );
    case "too-many-video-urls":
      return translate(
        `${keyPrefix}.tooManyVideoUrls`,
        "At most {{max}} video inputs per message (this message has {{actual}}).",
        { max: error.params?.max ?? 3, actual: error.params?.actual ?? 0 },
      );
    default:
      return translate(
        `${keyPrefix}.unknown`,
        "This attachment couldn't be validated.",
      );
  }
}
