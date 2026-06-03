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
  function renderTabIcon(iconId: string): React.ReactNode {
    const iconClass = "block h-4 w-4";
    switch (iconId) {
      case "chat": return <span className={iconClass}>✦</span>;
      case "image": return <span className={iconClass}>▧</span>;
      case "video": return <span className={iconClass}>▶</span>;
      case "batch": return <span className={iconClass}>▤</span>;
      case "search": return <span className={iconClass}>⌕</span>;
      case "models": return <span className={iconClass}>◎</span>;
      case "gallery": return <span className={iconClass}>◫</span>;
      case "settings": return <span className={iconClass}>⚙</span>;
      case "diagnostics": return <span className={iconClass}>◈</span>;
      default: return <span className={iconClass}>•</span>;
    }
  }

  const baseClasses = "group relative flex items-center gap-3 rounded-lg border border-transparent bg-transparent text-sm font-medium transition-colors duration-150 focus:outline-none w-full overflow-hidden";
  const layoutClasses = iconOnly
    ? "flex-col justify-center h-16 p-3 text-[11px] font-bold uppercase tracking-wider"
    : "px-3 py-[7px] text-left";

  const stateClasses = active
    ? "text-text-primary bg-surface-elevated font-medium"
    : "text-text-muted hover:text-text-secondary hover:bg-surface-elevated";

  const iconBase = "grid place-items-center w-5 text-base transition-colors duration-150";
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
        {renderTabIcon(id)}
      </span>
      {!iconOnly && (
        <span className="truncate">
          {label}
        </span>
      )}
    </button>
  );
}
