import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContextMenu, useContextMenu, type ContextMenuItem } from "./ContextMenu";

const onSelect = vi.fn();
const items: ContextMenuItem[] = [
  { key: "first", label: "First", onSelect },
  { key: "disabled", label: "Disabled", disabled: true, onSelect },
  { kind: "separator", key: "separator" },
  { key: "last", label: "Last", onSelect },
];

function Harness({ menuItems = items }: { menuItems?: ContextMenuItem[] }) {
  const menu = useContextMenu();
  return (
    <>
      <button type="button" onClick={(event) => menu.openAt({ clientX: 900, clientY: 700, currentTarget: event.currentTarget })}>
        Open menu
      </button>
      <button type="button">Outside</button>
      <ContextMenu position={menu.menu} items={menuItems} onClose={menu.close} ariaLabel="Actions" />
    </>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  onSelect.mockReset();
});

describe("ContextMenu", () => {
  it("bounds a tall menu to the viewport and repositions on resize", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Open menu" }));
    const menu = screen.getByRole("menu", { name: "Actions" });
    expect(menu).toHaveStyle({ maxHeight: `${window.innerHeight - 16}px` });
    expect(menu.className).toContain("overflow-y-auto");
    expect(menu.className).toContain("overscroll-contain");
    const originalHeight = window.innerHeight;
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 120 });
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 180 });
    try {
      fireEvent(window, new Event("resize"));
      expect(menu).toHaveStyle({ maxHeight: "104px" });
      expect(menu).toHaveStyle({ maxWidth: "164px", minWidth: "164px" });
    } finally {
      Object.defineProperty(window, "innerHeight", { configurable: true, value: originalHeight });
      Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
    }
  });

  it("moves focus through enabled items and returns it to the opener", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "Open menu" });
    await user.click(opener);
    const first = screen.getByRole("menuitem", { name: "First" });
    const last = screen.getByRole("menuitem", { name: "Last" });
    expect(first).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(last).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(first).toHaveFocus();
    await user.keyboard("{End}");
    expect(last).toHaveFocus();
    await user.keyboard("{Home}");
    expect(first).toHaveFocus();
    await user.keyboard("{ArrowUp}");
    expect(last).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it("closes on Tab and selects only enabled actions", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "Open menu" });
    await user.click(opener);
    expect(screen.getByRole("menuitem", { name: "Disabled" })).toBeDisabled();
    await user.keyboard("{Tab}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
    await user.click(opener);
    await user.click(screen.getByRole("menuitem", { name: "Last" }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it("keeps focus on a new target when clicking outside", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Open menu" }));
    const outside = screen.getByRole("button", { name: "Outside" });
    await user.click(outside);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(outside).toHaveFocus();
  });

  it("flips horizontal placement when the document direction is rtl", async () => {
    const user = userEvent.setup();
    const originalDir = document.documentElement.dir;
    document.documentElement.dir = "rtl";
    try {
      render(<Harness />);
      await user.click(screen.getByRole("button", { name: "Open menu" }));
      const menu = screen.getByRole("menu", { name: "Actions" });
      // jsdom reports zero rects; give the menu a real width so the RTL
      // branch (anchor minus width) is observable on re-placement.
      vi.spyOn(menu, "getBoundingClientRect").mockReturnValue({
        top: 0,
        bottom: 100,
        left: 0,
        right: 200,
        width: 200,
        height: 100,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect);
      fireEvent(window, new Event("resize"));
      // RTL grows leftward from the anchor: 900 - 200 = 700.
      expect(menu.style.left).toBe("700px");
      document.documentElement.dir = "ltr";
      fireEvent(window, new Event("resize"));
      // LTR clamps the right edge into the viewport: min(900, 1024-200-8).
      expect(menu.style.left).toBe("816px");
    } finally {
      document.documentElement.dir = originalDir;
    }
  });
});
