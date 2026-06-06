import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React, { useRef } from "react";
import { useFocusTrap } from "./useFocusTrap";

function TestComponent({ active, onClose, initialFocus = false }: { active: boolean; onClose?: () => void; initialFocus?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const secondRef = useRef<HTMLButtonElement>(null);
  useFocusTrap(ref, active, onClose, initialFocus ? secondRef : undefined);
  return (
    <div ref={ref} data-testid="trap">
      <button data-testid="first">First</button>
      <button ref={secondRef} data-testid="second">Second</button>
    </div>
  );
}

describe("useFocusTrap", () => {
  // VERIFY-026: modal focus enters the dialog, stays trapped, and returns to its trigger.
  it("focuses the first focusable element when active", () => {
    render(<TestComponent active={true} />);
    expect(document.activeElement).toBe(screen.getByTestId("first"));
  });

  it("does not interfere when inactive", () => {
    render(<TestComponent active={false} />);
    expect(document.activeElement).not.toBe(screen.getByTestId("first"));
  });

  it("focuses an explicit initial target when provided", () => {
    render(<TestComponent active={true} initialFocus />);
    expect(document.activeElement).toBe(screen.getByTestId("second"));
  });

  it("restores focus to the previously focused element on unmount", () => {
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    trigger.focus();
    const { unmount } = render(<TestComponent active={true} />);

    unmount();

    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it("calls onClose when Escape is pressed", () => {
    const onClose = vi.fn();
    render(<TestComponent active={true} onClose={onClose} />);
    fireEvent.keyDown(screen.getByTestId("trap"), { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("cycles focus forward on Tab from last element", () => {
    render(<TestComponent active={true} />);
    screen.getByTestId("second").focus();
    fireEvent.keyDown(screen.getByTestId("trap"), { key: "Tab" });
    expect(document.activeElement).toBe(screen.getByTestId("first"));
  });

  it("cycles focus backward on Shift+Tab from first element", () => {
    render(<TestComponent active={true} />);
    screen.getByTestId("first").focus();
    fireEvent.keyDown(screen.getByTestId("trap"), { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(screen.getByTestId("second"));
  });
});
