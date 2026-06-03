import React from "react";

export function TabButton({
  id,
  label,
  active,
  onClick,
  className = "",
  iconOnly = false,
}: {
  id: string;
  label: string;
  active: boolean;
  onClick: (id: string) => void;
  className?: string;
  iconOnly?: boolean;
}) {
  const icons: Record<string, string> = {
    chat: "✦",
    image: "▧",
    batch: "▤",
    search: "⌕",
    models: "◎",
    gallery: "◫",
    settings: "⚙",
    diagnostics: "◈",
  };

  const baseClasses = "group relative flex items-center gap-3.5 rounded-xl border border-transparent bg-transparent text-sm font-medium transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] focus:outline-none w-full overflow-hidden";
  const layoutClasses = iconOnly
    ? "flex-col justify-center h-16 p-3 text-[11px] font-bold uppercase tracking-wider"
    : "px-5 py-3.5 text-left";

  const stateClasses = active
    ? "text-text-primary bg-surface-elevated font-semibold"
    : "text-text-secondary hover:text-text-primary hover:bg-surface-elevated/50";

  const iconBase = "grid place-items-center w-5 text-base transition-all duration-300";
  const iconState = active
    ? "text-text-primary"
    : "group-hover:text-text-primary";

  return (
    <button
      className={`${baseClasses} ${layoutClasses} ${stateClasses} ${className}`.trim()}
      onClick={() => onClick(id)}
      aria-current={active ? "page" : undefined}
      aria-label={iconOnly ? label : undefined}
      title={label}
    >
      <span className={`${iconBase} ${iconState}`} aria-hidden="true">
        {icons[id] || "•"}
      </span>
      {!iconOnly && (
        <span className="truncate">
          {label}
        </span>
      )}
    </button>
  );
}
