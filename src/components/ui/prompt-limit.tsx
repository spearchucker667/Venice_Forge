import { useTranslation } from "react-i18next";
import { cn } from "../../lib/utils";

/** VF-20260916-P2-006 — prompt character-limit meter for the interactive
 *  generation studios (image / video / music).
 *
 *  Renders the current character count against the effective per-model limit
 *  resolved by `resolvePromptCharacterLimit()`. Interactive input is never
 *  silently truncated: studios let the user type/paste freely, show this
 *  meter, and block Generate (disabled button + message) while over limit.
 *  Legacy imported/stored drafts keep the payload builders' compatibility
 *  slice — this meter governs new interactive input only. */

export function PromptLimitMeter({
  current,
  limit,
  testId,
}: {
  current: number;
  limit: number;
  testId?: string;
}) {
  const { t } = useTranslation("media");
  const over = current > limit;
  return (
    <div
      className={cn(
        "vf-tag text-right tabular-nums",
        over ? "text-danger font-medium" : "text-text-muted",
      )}
      role={over ? "alert" : "status"}
      aria-live="polite"
      data-testid={testId ?? "prompt-limit-meter"}
      data-over-limit={over ? "true" : undefined}
    >
      {t("promptLimit.count", {
        current: current.toLocaleString(),
        limit: limit.toLocaleString(),
        defaultValue: "{{current}}/{{limit}}",
      })}
    </div>
  );
}
