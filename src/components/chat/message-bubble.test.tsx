// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ChatMessage } from "../../types/venice";
import { MessageBubble } from "./message-bubble";

vi.mock("../../stores/settings-store", () => ({
  useSettingsStore: (selector: (s: { redTeamMode: boolean; localFamilySafeModeEnabled: boolean }) => unknown) =>
    selector({ redTeamMode: false, localFamilySafeModeEnabled: false }),
}));

vi.mock("../../shared/safety", () => ({
  maybeRunLocalFamilyGuard: vi.fn(),
}));

beforeEach(() => {
  Object.assign(navigator, {
    clipboard: { writeText: vi.fn() },
  });
});

describe("MessageBubble accessibility", () => {
  it("exposes aria-label on action buttons", () => {
    const message: ChatMessage = { role: "user", content: "Hello" };
    render(<MessageBubble message={message} index={0} onCopy={() => {}} onDelete={() => {}} />);

    expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("renders Regenerate button with aria-label when provided for assistant messages", () => {
    const message: ChatMessage = { role: "assistant", content: "Hi there" };
    render(
      <MessageBubble
        message={message}
        index={0}
        onCopy={() => {}}
        onDelete={() => {}}
        onRegenerate={() => {}}
      />,
    );

    expect(screen.getByRole("button", { name: "Regenerate" })).toBeInTheDocument();
  });

  it("marks every decorative SVG as aria-hidden and focusable=false", () => {
    const message: ChatMessage = { role: "assistant", content: "Hi there" };
    const { container } = render(
      <MessageBubble
        message={message}
        index={0}
        onCopy={() => {}}
        onDelete={() => {}}
        onRegenerate={() => {}}
      />,
    );

    container.querySelectorAll("svg").forEach((svg) => {
      expect(svg).toHaveAttribute("aria-hidden", "true");
      expect(svg).toHaveAttribute("focusable", "false");
    });
  });

  it("toggles Copy to Copied after clicking without throwing on unmount", () => {
    const message: ChatMessage = { role: "user", content: "Copy me" };
    const { unmount } = render(<MessageBubble message={message} index={0} onCopy={() => {}} onDelete={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();

    unmount();
  });

  it("sanitizes image URLs using safeMediaPreviewUrl in user messages", () => {
    const message: ChatMessage = {
      role: "user",
      content: [
        { type: "text", text: "Look at these images" },
        { type: "image_url", image_url: { url: "https://example.com/pic.png" } },
        { type: "image_url", image_url: { url: "javascript:alert(1)" } },
      ],
    };
    const { container } = render(
      <MessageBubble message={message} index={0} onCopy={() => {}} onDelete={() => {}} />
    );

    const imgs = container.querySelectorAll("img");
    expect(imgs).toHaveLength(1);
    expect(imgs[0]).toHaveAttribute("src", "https://example.com/pic.png");
  });
});
