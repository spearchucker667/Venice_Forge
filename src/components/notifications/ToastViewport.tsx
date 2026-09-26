import { useTranslation } from "react-i18next";
import { ReactNode } from "react";

export function ToastViewport({ children }: { children: ReactNode }) {
  const { t: tRuntime } = useTranslation("common");
  return (
    <div
      className="pointer-events-none fixed inset-x-4 bottom-4 z-[var(--vf-z-toast)] flex flex-col gap-2 sm:left-auto sm:right-4 sm:w-full sm:max-w-sm"
      role="region"
      aria-live="polite"
      aria-label={tRuntime(
        "runtimeGenerated.components.notifications.toastviewport.attribute.notifications",
      )}
    >
      {children}
    </div>
  );
}
