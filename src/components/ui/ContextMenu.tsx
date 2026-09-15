import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type ContextMenuItem =
  | {
      kind?: "item";
      key: string;
      label: string;
      icon?: React.ReactNode;
      disabled?: boolean;
      destructive?: boolean;
      hidden?: boolean;
      separatorAfter?: boolean;
      onSelect: () => void;
    }
  | {
      kind: "separator";
      key: string;
    };

type MenuPosition = { x: number; y: number };

type UseContextMenuResult = {
  menu: MenuPosition | null;
  openAt: (event: { clientX: number; clientY: number; preventDefault?: () => void }) => void;
  close: () => void;
};

export function useContextMenu(): UseContextMenuResult {
  const [menu, setMenu] = useState<MenuPosition | null>(null);

  const openAt = useCallback(
    (event: { clientX: number; clientY: number; preventDefault?: () => void }) => {
      event.preventDefault?.();
      setMenu({ x: event.clientX, y: event.clientY });
    },
    [],
  );

  const close = useCallback(() => setMenu(null), []);

  useEffect(() => {
    if (!menu) return;
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-context-menu-root='true']")) return;
      setMenu(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenu(null);
    };
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  return { menu, openAt, close };
}

type ContextMenuProps = {
  position: MenuPosition | null;
  items: ContextMenuItem[];
  onClose: () => void;
  ariaLabel?: string;
  minWidth?: number;
};

function clampPosition(
  x: number,
  y: number,
  width: number,
  height: number,
  padding = 8,
): MenuPosition {
  if (typeof window === "undefined") return { x, y };
  const maxX = Math.max(padding, window.innerWidth - width - padding);
  const maxY = Math.max(padding, window.innerHeight - height - padding);
  return {
    x: Math.min(Math.max(padding, x), maxX),
    y: Math.min(Math.max(padding, y), maxY),
  };
}

export function ContextMenu({
  position,
  items,
  onClose,
  ariaLabel,
  minWidth = 200,
}: ContextMenuProps): React.ReactNode {
  const ref = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  useLayoutEffect(() => {
    if (!position || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    setSize({ width: rect.width, height: rect.height });
  }, [position, items]);

  useLayoutEffect(() => {
    if (!position || !ref.current) return;
    const el = ref.current;
    const finalX = size ? clampPosition(position.x, position.y, size.width, size.height).x : position.x;
    const finalY = size ? clampPosition(position.x, position.y, size.width, size.height).y : position.y;
    el.style.setProperty("--context-menu-min-width", `${minWidth}px`);
    el.style.setProperty("top", `${finalY}px`);
    el.style.setProperty("left", `${finalX}px`);
    if (!size) {
      el.style.setProperty("visibility", "hidden");
    } else {
      el.style.removeProperty("visibility");
    }
  }, [position, size, minWidth]);

  if (!position || typeof document === "undefined") return null;

  const visibleItems = items;

  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label={ariaLabel}
      data-context-menu-root="true"
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      className="fixed z-[1000] min-w-[var(--context-menu-min-width)] rounded-lg border border-vf-panel-border bg-vf-panel-bg-raised py-1 text-sm text-text shadow-xl animate-in fade-in-0 zoom-in-95"
    >
      {visibleItems.map((item) => {
        if (item.kind === "separator") {
          return (
            <div
              key={item.key}
              role="separator"
              className="my-1 h-px bg-border/60"
            />
          );
        }
        if (item.hidden) return null;
        const labelClass = item.destructive
          ? "text-error hover:bg-error/10"
          : "text-text hover:bg-vf-panel-bg-hover";
        return (
          <button
            key={item.key}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            onClick={(event) => {
              event.stopPropagation();
              if (item.disabled) return;
              try {
                item.onSelect();
              } finally {
                onClose();
              }
            }}
            className={`flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${labelClass}`}
          >
            {item.icon ? (
              <span aria-hidden="true" className="flex h-4 w-4 items-center justify-center">
                {item.icon}
              </span>
            ) : null}
            <span className="flex-1 truncate">{item.label}</span>
          </button>
        );
      })}
    </div>,
    document.body,
  );
}
