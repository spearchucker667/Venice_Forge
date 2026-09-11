import { useTranslation } from "react-i18next";
import { cn } from "../../lib/utils";

export function VeniceLogo({
  className,
  size = 24,
}: {
  className?: string;
  size?: 20 | 24 | 26 | 32;
}) {
  const { t: tRuntime } = useTranslation("common");
  return (
    <span
      role="img"
      aria-label={tRuntime(
        "runtimeGenerated.components.ui.logo.attribute.veniceForgeLogo",
      )}
      className={cn(
        "venice-logo inline-block shrink-0 bg-current text-text-primary",
        `venice-logo--${size}`,
        className,
      )}
    />
  );
}

export function VeniceWordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "font-semibold tracking-[-0.02em] text-text-primary",
        className,
      )}
    >
      Venice Forge
    </span>
  );
}
