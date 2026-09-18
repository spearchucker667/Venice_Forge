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
});
