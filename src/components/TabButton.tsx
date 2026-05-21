import React from "react";

export function TabButton({
  id,
  label,
  active,
  onClick,
  className = "",
  iconOnly = false,
}: {
  key?: React.Key;
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
  return (
    <button
      className={`nav-button ${active ? "active" : ""} ${className}`}
      onClick={() => onClick(id)}
      aria-current={active ? "page" : undefined}
      title={label}
    >
      <span className="nav-icon" aria-hidden="true">
        {icons[id] || "•"}
      </span>
      {!iconOnly && (
        <span className="nav-copy">
          <span className="nav-title">{label}</span>
        </span>
      )}
    </button>
  );
}
