import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
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

type MenuPosition = { x: number; y: number; trigger?: HTMLElement | null };

type UseContextMenuResult = {
  menu: MenuPosition | null;
  openAt: (event: { clientX: number; clientY: number; currentTarget?: EventTarget | null; preventDefault?: () => void }) => void;
  close: () => void;
};

export function useContextMenu(): UseContextMenuResult {
  const [menu, setMenu] = useState<MenuPosition | null>(null);

  const openAt = useCallback(
    (event: { clientX: number; clientY: number; currentTarget?: EventTarget | null; preventDefault?: () => void }) => {
      event.preventDefault?.();
      setMenu({
        x: event.clientX,
        y: event.clientY,
        trigger: event.currentTarget instanceof HTMLElement
          ? event.currentTarget
          : document.activeElement instanceof HTMLElement ? document.activeElement : null,
      });
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

interface ContextMenuProps {
  position: MenuPosition | null;
  items: ContextMenuItem[];
  onClose: () => void;
  ariaLabel?: string;
  minWidth?: number;
}

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

function restoreMenuFocus(target: HTMLElement | null, fallback: HTMLElement | null): void {
  const destination = target?.isConnected ? target : fallback;
  if (!destination?.isConnected) return;
  const previousTabIndex = destination.getAttribute("tabindex");
  if (destination.tabIndex < 0) destination.setAttribute("tabindex", "-1");
  destination.focus({ preventScroll: true });
  if (previousTabIndex === null) destination.removeAttribute("tabindex");
}

export function ContextMenu({
  position,
  items,
  onClose,
  ariaLabel,
  minWidth = 200,
}: ContextMenuProps): React.ReactNode {
  const ref = useRef<HTMLDivElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const enabledItems = items.filter((item) => item.kind !== "separator" && !item.hidden && !item.disabled);
  const enabledKeys = enabledItems.map((item) => item.key);

  useLayoutEffect(() => {
    if (!position || !ref.current) return;
    const el = ref.current;
    const place = () => {
      const padding = 8;
      const availableWidth = Math.max(0, window.innerWidth - padding * 2);
      el.style.minWidth = `${Math.min(minWidth, availableWidth)}px`;
      el.style.maxWidth = `${availableWidth}px`;
      el.style.maxHeight = `${Math.max(0, window.innerHeight - padding * 2)}px`;
      const rect = el.getBoundingClientRect();
      const rtl = document.documentElement.dir === "rtl";
      const preferredX = rtl ? position.x - rect.width : position.x;
      const next = clampPosition(preferredX, position.y, rect.width, rect.height, padding);
      el.style.left = `${next.x}px`;
      el.style.top = `${next.y}px`;
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [position, minWidth, items]);

  useEffect(() => {
    if (!position) return;
    const menuElement = ref.current;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    returnFocusRef.current = position.trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    const first = enabledKeys[0] ?? null;
    setActiveKey(first);
    if (first) {
      Array.from(ref.current?.querySelectorAll<HTMLButtonElement>("[data-menu-key]") ?? [])
        .find((button) => button.dataset.menuKey === first)?.focus();
    } else {
      ref.current?.focus();
    }
    return () => {
      const active = document.activeElement;
      if (active instanceof HTMLElement && active !== document.body && !menuElement?.contains(active)) {
        return;
      }
      restoreMenuFocus(returnFocusRef.current, previousFocusRef.current);
    };
    // A new position represents a new opening; item changes are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position]);

  useEffect(() => {
    if (!position || enabledKeys.length === 0) return;
    if (activeKey && enabledKeys.includes(activeKey)) return;
    const first = enabledKeys[0];
    setActiveKey(first);
    Array.from(ref.current?.querySelectorAll<HTMLButtonElement>("[data-menu-key]") ?? [])
      .find((button) => button.dataset.menuKey === first)?.focus();
  }, [position, activeKey, enabledKeys]);

  const focusKey = (key: string) => {
    setActiveKey(key);
    Array.from(ref.current?.querySelectorAll<HTMLButtonElement>("[data-menu-key]") ?? [])
      .find((button) => button.dataset.menuKey === key)?.focus();
  };

  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" || event.key === "Tab") {
      event.preventDefault();
      event.stopPropagation();
      restoreMenuFocus(returnFocusRef.current, previousFocusRef.current);
      onClose();
      return;
    }
    if (!enabledKeys.length) return;
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const current = Math.max(0, enabledKeys.indexOf(activeKey ?? ""));
    const next = event.key === "Home" ? 0
      : event.key === "End" ? enabledKeys.length - 1
        : event.key === "ArrowDown" ? (current + 1) % enabledKeys.length
          : (current - 1 + enabledKeys.length) % enabledKeys.length;
    focusKey(enabledKeys[next]);
  };

  if (!position || typeof document === "undefined") return null;

  const visibleItems = items;

  return createPortal(
    <div
      ref={ref}
      role="menu"
      tabIndex={-1}
      aria-label={ariaLabel}
      data-context-menu-root="true"
      onKeyDown={onMenuKeyDown}
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      className="mesh-panel fixed z-[var(--vf-z-context-menu)] overflow-x-hidden overflow-y-auto overscroll-contain rounded-lg border border-vf-panel-border bg-vf-panel-bg-raised py-1 text-sm text-text shadow-xl animate-in fade-in-0 zoom-in-95"
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
            data-menu-key={item.key}
            tabIndex={item.key === activeKey ? 0 : -1}
            disabled={item.disabled}
            onMouseEnter={() => {
              if (!item.disabled) setActiveKey(item.key);
            }}
            onClick={(event) => {
              event.stopPropagation();
              if (item.disabled) return;
              try {
                item.onSelect();
              } finally {
                const active = document.activeElement;
                if (!(active instanceof HTMLElement) || active === document.body || ref.current?.contains(active)) {
                  restoreMenuFocus(returnFocusRef.current, previousFocusRef.current);
                }
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
