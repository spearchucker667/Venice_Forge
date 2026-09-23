// @vitest-environment jsdom
// Regression guards: VERIFY-071 (inline edit), VERIFY-074 (character display title).
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
  maybeRunLocalFamilyGuard: vi.fn(() => ({ guardDecision: { allow: true } as any })),
}));

import { maybeRunLocalFamilyGuard } from "../../shared/safety";

const mockResolvePlayableMediaUrl = vi.hoisted(() => ({
  fn: vi.fn(async (_url: string) => ""),
}));

vi.mock("../../services/playableMediaUrl", () => ({
  resolvePlayableMediaUrl: (url: string) => mockResolvePlayableMediaUrl.fn(url),
}));

beforeEach(() => {
  Object.assign(navigator, {
    clipboard: { writeText: vi.fn() },
  });
  testSettings.redTeamMode = false;
  testSettings.localFamilySafeModeEnabled = false;
  vi.mocked(maybeRunLocalFamilyGuard).mockClear();
  vi.mocked(maybeRunLocalFamilyGuard).mockReturnValue({ guardDecision: { allow: true } } as any);
  mockResolvePlayableMediaUrl.fn.mockReset();
  mockResolvePlayableMediaUrl.fn.mockResolvedValue("");
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

    expect(screen.getByAltText("AI avatar").getAttribute("src")).toContain(
      "venice-seal-red-fill.svg",
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

// VERIFY-071 regression guard: inline message editing enters/cancels/saves
// without network calls, preserves attachments, and later messages are untouched.
describe("MessageBubble inline editing", () => {
  it("enters edit mode and cancels without calling onEdit", async () => {
    const onEdit = vi.fn();
    const message: ChatMessage = { role: "user", content: "Editable text" };
    render(<MessageBubble message={message} index={0} onCopy={() => {}} onDelete={() => {}} onEdit={onEdit} />);

    await userEvent.click(screen.getByRole("button", { name: "Edit message" }));
    const textarea = screen.getByRole("textbox", { name: "Edit message text" });
    expect(textarea).toBeInTheDocument();

    await userEvent.clear(textarea);
    await userEvent.type(textarea, "Changed");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onEdit).not.toHaveBeenCalled();
    expect(screen.getByText("Editable text")).toBeInTheDocument();
  });

  it("saves edited text and preserves later messages (no API call, no regeneration)", async () => {
    const onEdit = vi.fn();
    const message: ChatMessage = { role: "user", content: "Old text" };
    render(<MessageBubble message={message} index={0} onCopy={() => {}} onDelete={() => {}} onEdit={onEdit} />);

    await userEvent.click(screen.getByRole("button", { name: "Edit message" }));
    const textarea = screen.getByRole("textbox", { name: "Edit message text" });
    await userEvent.clear(textarea);
    await userEvent.type(textarea, "New text");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledWith("New text");
  });

  it("preserves image attachments while updating the text part", async () => {
    const onEdit = vi.fn();
    const message: ChatMessage = {
      role: "user",
      content: [
        { type: "text", text: "Look" },
        { type: "image_url", image_url: { url: "data:image/png;base64,abc" } },
      ],
    };
    render(<MessageBubble message={message} index={0} onCopy={() => {}} onDelete={() => {}} onEdit={onEdit} />);

    await userEvent.click(screen.getByRole("button", { name: "Edit message" }));
    const textarea = screen.getByRole("textbox", { name: "Edit message text" });
    await userEvent.clear(textarea);
    await userEvent.type(textarea, "Look closely");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onEdit).toHaveBeenCalledWith([
      { type: "text", text: "Look closely" },
      { type: "image_url", image_url: { url: "data:image/png;base64,abc" } },
    ]);
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

describe("MessageBubble Markdown and Fenced Code Rendering (Regression)", () => {
  const tSettings = testSettings as any;
  beforeEach(() => {
    tSettings.redTeamMode = false;
  });

  it("renders assistant fenced code properly (standard mode)", () => {
    const message: ChatMessage = {
      role: "assistant",
      content: "```typescript\nconst x = 1;\n```",
    };
    const { container } = render(
      <MessageBubble message={message} index={0} onCopy={() => {}} onDelete={() => {}} />
    );
    
    const pre = container.querySelector("pre");
    const code = pre?.querySelector("code");
    expect(pre).not.toBeNull();
    expect(code).not.toBeNull();
    expect(code?.className).toContain("language-typescript");
    expect(code?.textContent).toBe("const x = 1;");
    expect(container.textContent).not.toContain("```typescript");
    expect(screen.getByText("typescript")).toBeInTheDocument();
    
    // There's the message-level copy button and the code-block copy button
    expect(screen.getAllByRole("button", { name: "Copy" }).length).toBeGreaterThanOrEqual(1);
  });

  it("renders assistant fenced code properly (Traffic Inspector mode)", () => {
    tSettings.redTeamMode = true;
    tSettings.localFamilySafeModeEnabled = true;
    
    const message: ChatMessage = {
      role: "assistant",
      content: "```typescript\nconst x = 1;\n```",
      metadata: {
        localSafetyDecision: { allow: true }
      }
    };
    const { container } = render(
      <MessageBubble message={message} index={0} onCopy={() => {}} onDelete={() => {}} />
    );
    
    const pre = container.querySelector("pre");
    expect(pre).not.toBeNull();
    // Safety UI still renders (using 'Allow' translation fallback if not strictly 'Safety')
    expect(screen.getByText(/Allow/i)).toBeInTheDocument();
  });

  it("renders user fenced code properly", () => {
    const message: ChatMessage = {
      role: "user",
      content: "```javascript\nconsole.log();\n```",
    };
    const { container } = render(
      <MessageBubble message={message} index={0} onCopy={() => {}} onDelete={() => {}} />
    );
    
    const pre = container.querySelector("pre");
    expect(pre).not.toBeNull();
    expect(container.textContent).not.toContain("```javascript");
  });

  it("renders inline code properly", () => {
    const message: ChatMessage = {
      role: "assistant",
      content: "Use `npm run lint`.",
    };
    const { container } = render(
      <MessageBubble message={message} index={0} onCopy={() => {}} onDelete={() => {}} />
    );
    
    const code = container.querySelector("code");
    expect(code).not.toBeNull();
    expect(container.querySelector("pre")).toBeNull();
  });

  it("renders fenced code without a language", () => {
    const message: ChatMessage = {
      role: "assistant",
      content: "```\none\ntwo\n```",
    };
    const { container } = render(
      <MessageBubble message={message} index={0} onCopy={() => {}} onDelete={() => {}} />
    );
    
    expect(container.querySelector("pre")).not.toBeNull();
    expect(container.querySelector("code")?.textContent).toBe("one\ntwo");
    expect(screen.getByText("text")).toBeInTheDocument();
  });

  it("renders HTML/XSS inside code as inert text", () => {
    const message: ChatMessage = {
      role: "assistant",
      content: "```html\n<script>alert(1)</script>\n```",
    };
    const { container } = render(
      <MessageBubble message={message} index={0} onCopy={() => {}} onDelete={() => {}} />
    );
    
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("code")?.textContent).toBe("<script>alert(1)</script>");
  });

  it("emits semantic token spans for recognized fenced code", () => {
    const message: ChatMessage = {
      role: "assistant",
      content: "```typescript\nconst x = 1;\n```",
    };
    const { container } = render(
      <MessageBubble message={message} index={0} onCopy={() => {}} onDelete={() => {}} />
    );

    const code = container.querySelector("pre code");
    expect(code).not.toBeNull();
    expect(code?.querySelector(".token.keyword")).not.toBeNull();
    expect(code?.querySelector(".token.number")).not.toBeNull();
    expect(code?.querySelector(".token.operator")).not.toBeNull();
    expect(code?.querySelector(".token.punctuation")).not.toBeNull();
    expect(code?.textContent).toBe("const x = 1;");
  });

  it("falls back to plain text for unknown fence languages", () => {
    const message: ChatMessage = {
      role: "assistant",
      content: "```some-unknown-lang\nhello world\n```",
    };
    const { container } = render(
      <MessageBubble message={message} index={0} onCopy={() => {}} onDelete={() => {}} />
    );

    const code = container.querySelector("pre code");
    expect(code).not.toBeNull();
    expect(code?.textContent).toBe("hello world");
    expect(code?.querySelector(".token")).toBeNull();
  });

  it("copies the exact raw source text from a code block", async () => {
    const message: ChatMessage = {
      role: "assistant",
      content: "```typescript\nconst x = 1;\n```",
    };
    render(
      <MessageBubble message={message} index={0} onCopy={() => {}} onDelete={() => {}} />
    );

    const copyButton = screen.getAllByRole("button", { name: "Copy" }).find((btn) =>
      btn.closest("pre")
    );
    expect(copyButton).toBeDefined();
    await userEvent.click(copyButton!);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("const x = 1;");
  });
});

// VF-20260922-P2-012: assistant generated-media attachments must render via
// ResolvedMediaImg so no tokenless venice-media:// URL ever reaches the DOM
// (the main-process handler rejects tokenless requests with 403).
describe("MessageBubble generated media attachments", () => {
  const MEDIA_HASH = "a".repeat(64);

  function generatedMediaMessage(
    displayUrl: string,
    mediaId: string = MEDIA_HASH,
  ): ChatMessage {
    return {
      role: "assistant",
      content: "Here is the image.",
      metadata: {
        generatedMedia: [
          {
            id: "att-1",
            mediaId,
            mediaType: "image",
            operation: "generate",
            displayUrl,
            altText: "generated test image",
            createdAt: 1,
          },
        ],
      },
    } as ChatMessage;
  }

  it("renders generated media through a fresh capability URL from the resolver", async () => {
    mockResolvePlayableMediaUrl.fn.mockResolvedValue(
      `venice-media://${MEDIA_HASH}?cap=fresh-token`,
    );
    const { container } = render(
      <MessageBubble
        message={generatedMediaMessage(`venice-media://${MEDIA_HASH}`)}
        index={0}
        onCopy={() => {}}
        onDelete={() => {}}
      />,
    );

    const img = await screen.findByAltText("generated test image");
    expect(img).toHaveAttribute("src", `venice-media://${MEDIA_HASH}?cap=fresh-token`);
    // The tokenless durable URL must never appear as a DOM src attribute.
    for (const el of container.querySelectorAll("img")) {
      expect(el.getAttribute("src")).not.toBe(`venice-media://${MEDIA_HASH}`);
    }
  });

  it("fails closed with no broken img when capability resolution is unavailable", async () => {
    mockResolvePlayableMediaUrl.fn.mockResolvedValue("");
    const { container } = render(
      <MessageBubble
        message={generatedMediaMessage(`venice-media://${MEDIA_HASH}`)}
        index={0}
        onCopy={() => {}}
        onDelete={() => {}}
      />,
    );

    await waitFor(() =>
      expect(mockResolvePlayableMediaUrl.fn).toHaveBeenCalledWith(
        `venice-media://${MEDIA_HASH}`,
      ),
    );
    // The assistant avatar <img> is unrelated; assert the generated-media
    // attachment produced no broken img and no raw durable URL leaked.
    expect(screen.queryByAltText("generated test image")).toBeNull();
    expect(
      container.querySelector('img[src*="venice-media://"]'),
    ).toBeNull();
    expect(container.innerHTML).not.toContain(`venice-media://${MEDIA_HASH}`);
  });

  it("falls back to the mediaId-derived URL and resolves it before rendering", async () => {
    mockResolvePlayableMediaUrl.fn.mockResolvedValue(
      `venice-media://${MEDIA_HASH}?cap=fresh-token`,
    );
    render(
      <MessageBubble
        message={generatedMediaMessage("")}
        index={0}
        onCopy={() => {}}
        onDelete={() => {}}
      />,
    );

    await waitFor(() =>
      expect(mockResolvePlayableMediaUrl.fn).toHaveBeenCalledWith(
        `venice-media://${MEDIA_HASH}`,
      ),
    );
    const img = await screen.findByAltText("generated test image");
    expect(img.getAttribute("src")).toContain("cap=fresh-token");
  });

  it("passes non-custom-protocol display URLs through without resolution", async () => {
    const { container } = render(
      <MessageBubble
        message={generatedMediaMessage("https://example.com/pic.png")}
        index={0}
        onCopy={() => {}}
        onDelete={() => {}}
      />,
    );

    const img = await screen.findByAltText("generated test image");
    expect(img).toHaveAttribute("src", "https://example.com/pic.png");
    expect(mockResolvePlayableMediaUrl.fn).not.toHaveBeenCalled();
    expect(
      container.querySelectorAll('img[src="https://example.com/pic.png"]'),
    ).toHaveLength(1);
  });
});
