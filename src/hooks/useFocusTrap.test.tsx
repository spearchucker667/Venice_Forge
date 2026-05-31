import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React, { useRef } from "react";
import { useFocusTrap } from "./useFocusTrap";

function TestComponent({ active, onClose }: { active: boolean; onClose?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, active, onClose);
  return (
    <div ref={ref} data-testid="trap">
      <button data-testid="first">First</button>
      <button data-testid="second">Second</button>
    </div>
  );
}

describe("useFocusTrap", () => {
  it("focuses the first focusable element when active", () => {
    render(<TestComponent active={true} />);
    expect(document.activeElement).toBe(screen.getByTestId("first"));
  });

  it("does not interfere when inactive", () => {
    render(<TestComponent active={false} />);
    expect(document.activeElement).not.toBe(screen.getByTestId("first"));
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
