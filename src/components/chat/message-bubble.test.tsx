// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ChatMessage } from "../../types/venice";
import { MessageBubble } from "./message-bubble";

const testSettings = vi.hoisted(() => ({
  redTeamMode: false,
  localFamilySafeModeEnabled: false,
}));

vi.mock("../../stores/settings-store", () => ({
  useSettingsStore: (selector: (s: { redTeamMode: boolean; localFamilySafeModeEnabled: boolean }) => unknown) =>
    selector(testSettings),
}));

vi.mock("../../shared/safety", () => ({
  maybeRunLocalFamilyGuard: vi.fn(() => ({ allowed: true as const })),
}));

import { maybeRunLocalFamilyGuard } from "../../shared/safety";

beforeEach(() => {
  Object.assign(navigator, {
    clipboard: { writeText: vi.fn() },
  });
  testSettings.redTeamMode = false;
  testSettings.localFamilySafeModeEnabled = false;
  vi.mocked(maybeRunLocalFamilyGuard).mockClear();
  vi.mocked(maybeRunLocalFamilyGuard).mockReturnValue({ allowed: true as const });
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

  it("sanitizes assistant markdown HTML and unsafe URLs", () => {
    const message: ChatMessage = {
      role: "assistant",
      content: "safe text\n\n<script>alert('xss')</script><img src=x onerror=alert(1)> [bad](javascript:alert(1))",
    };
    const { container } = render(
      <MessageBubble message={message} index={0} onCopy={() => {}} onDelete={() => {}} />,
    );

    expect(container.querySelector("script")).toBeNull();
    const markdown = container.querySelector(".prose-venice");
    expect(markdown?.querySelector("img")).toBeNull();
    expect(container.querySelector("[onerror]")).toBeNull();
    expect(container.querySelector('a[href^="javascript:"]')).toBeNull();
    expect(screen.getByText("safe text")).toBeInTheDocument();
  });

  it("discloses injected memory context stored on a sent message", () => {
    const message: ChatMessage = {
      role: "user",
      content: "Use the relevant context.",
      metadata: {
        injectedContext: "Memory: prefers local-only storage",
        injectedContextSource: "memory",
      },
    };

    render(<MessageBubble message={message} index={0} onCopy={() => {}} onDelete={() => {}} />);

    expect(screen.getByText("Memory attached to this message")).toBeInTheDocument();
    expect(screen.getByText("Memory: prefers local-only storage")).toBeInTheDocument();
  });

  it("does not render an injected-context disclosure when message metadata has no context", () => {
    const message: ChatMessage = { role: "user", content: "No memory context here." };

    render(<MessageBubble message={message} index={0} onCopy={() => {}} onDelete={() => {}} />);

    expect(screen.queryByText(/attached to this message/i)).toBeNull();
  });

  it("uses the bundled Venice seal for assistant messages without a character avatar", () => {
    const message: ChatMessage = { role: "assistant", content: "Hi there" };

    render(<MessageBubble message={message} index={0} onCopy={() => {}} onDelete={() => {}} />);

    // Relative path is required for packaged Electron (loadFile base URL);
    // an absolute /assets/... path resolves to file:///assets/... and breaks.
    expect(screen.getByAltText("AI avatar")).toHaveAttribute(
      "src",
      "assets/branding/venice-seal-red-fill.svg",
    );
  });

  it("uses the selected character image for assistant messages when provided", () => {
    const message: ChatMessage = { role: "assistant", content: "Hi there" };

    render(
      <MessageBubble
        message={message}
        index={0}
        onCopy={() => {}}
        onDelete={() => {}}
        assistantAvatarUrl="file:///cached/alan.png"
      />,
    );

    expect(screen.getByAltText("AI avatar")).toHaveAttribute("src", "file:///cached/alan.png");
  });
});

describe("MessageBubble local-family-guard gating (BUG-React#3)", () => {
  it("does NOT invoke the safety guard when Traffic Inspector is disabled", () => {
    testSettings.redTeamMode = false;
    testSettings.localFamilySafeModeEnabled = true;
    const message: ChatMessage = { role: "assistant", content: "Hello world" };

    render(<MessageBubble message={message} index={0} onCopy={() => {}} onDelete={() => {}} />);

    expect(maybeRunLocalFamilyGuard).not.toHaveBeenCalled();
  });

  it("memoizes the safety guard across re-renders with identical deps", () => {
    testSettings.redTeamMode = true;
    testSettings.localFamilySafeModeEnabled = true;
    const messageA: ChatMessage = { role: "assistant", content: "Hello world" };
    const messageB: ChatMessage = { role: "assistant", content: "Hello world" };

    const { rerender } = render(<MessageBubble message={messageA} index={0} onCopy={() => {}} onDelete={() => {}} />);
    rerender(<MessageBubble message={messageB} index={0} onCopy={() => {}} onDelete={() => {}} />);

    expect(maybeRunLocalFamilyGuard).toHaveBeenCalledTimes(1);
  });

  it("re-runs the safety guard only when the content or Family Safe flag changes", () => {
    testSettings.redTeamMode = true;
    testSettings.localFamilySafeModeEnabled = true;
    const messageA: ChatMessage = { role: "assistant", content: "Hello world" };
    const messageB: ChatMessage = { role: "assistant", content: "different content" };

    const { rerender } = render(<MessageBubble message={messageA} index={0} onCopy={() => {}} onDelete={() => {}} />);
    expect(maybeRunLocalFamilyGuard).toHaveBeenCalledTimes(1);

    rerender(<MessageBubble message={messageB} index={0} onCopy={() => {}} onDelete={() => {}} />);
    expect(maybeRunLocalFamilyGuard).toHaveBeenCalledTimes(2);

    rerender(<MessageBubble message={messageB} index={0} onCopy={() => {}} onDelete={() => {}} />);
    expect(maybeRunLocalFamilyGuard).toHaveBeenCalledTimes(2);
  });
});
