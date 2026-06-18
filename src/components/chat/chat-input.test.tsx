// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { ChatInput } from "./chat-input";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockImageAttachment = (name = "test.png", mimeType = "image/png") => ({
  id: "mock-id",
  kind: "image" as const,
  name,
  extension: name.split(".").pop() ?? "png",
  mimeType,
  sizeBytes: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  dataUrl: `data:${mimeType};base64,mock`,
  image: {
    width: 1,
    height: 1,
    animated: false,
    originalMimeType: mimeType,
  },
  extraction: {
    route: "browser-image-decode" as const,
    local: true,
    truncated: false,
    warnings: [],
    errors: [],
  },
  modelRequirements: {
    requiresVision: true,
    canFallbackToText: false,
  },
  security: {
    untrusted: true as const,
    macrosExecuted: false as const,
    scriptsExecuted: false as const,
    htmlSanitized: true as const,
  },
});

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("../../services/ingestion/attachmentAssembler", () => ({
  processFileAttachment: vi.fn(async (file: File) => mockImageAttachment(file.name, file.type)),
}));

vi.mock("../../stores/toast-store", () => ({
  toast: { warn: vi.fn(), error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

import { processFileAttachment } from "../../services/ingestion/attachmentAssembler";
import { toast } from "../../stores/toast-store";

const mockProcessFileAttachment = vi.mocked(processFileAttachment);
const mockToastWarn = vi.mocked(toast.warn);
const mockToastError = vi.mocked(toast.error);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ChatInput", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProcessFileAttachment.mockImplementation(async (file: File) =>
      mockImageAttachment(file.name, file.type),
    );
  });

  it("renders a disabled textarea and send button when disabled", () => {
    render(<ChatInput onSend={vi.fn()} onStop={vi.fn()} isStreaming={false} disabled />);

    expect(screen.getByLabelText("Message input")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
  });

  it("typing enables the send button", async () => {
    render(<ChatInput onSend={vi.fn()} onStop={vi.fn()} isStreaming={false} />);

    const input = screen.getByLabelText("Message input");
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();

    await userEvent.type(input, "Hello");
    expect(screen.getByRole("button", { name: "Send message" })).toBeEnabled();
  });

  it("submits the trimmed message and clears the input on Enter", async () => {
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} onStop={vi.fn()} isStreaming={false} />);

    const input = screen.getByLabelText("Message input");
    await userEvent.type(input, "  Hello world  ");
    await userEvent.keyboard("{Enter}");

    expect(onSend).toHaveBeenCalledWith("Hello world", undefined);
    expect(input).toHaveValue("");
  });

  it("does not submit when disabled", async () => {
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} onStop={vi.fn()} isStreaming={false} disabled />);

    const input = screen.getByLabelText("Message input") as HTMLTextAreaElement;
    input.value = "Hello";
    fireEvent.change(input);

    await userEvent.keyboard("{Enter}");
    expect(onSend).not.toHaveBeenCalled();
  });

  it("keeps file attach button enabled when disableImageAttach is true", () => {
    render(
      <ChatInput
        onSend={vi.fn()}
        onStop={vi.fn()}
        isStreaming={false}
        disableImageAttach
      />,
    );

    expect(screen.getByRole("button", { name: "Attach file" })).toBeEnabled();
  });

  it("warns and preserves image attachments when the selected model is not vision capable", async () => {
    render(
      <ChatInput
        onSend={vi.fn()}
        onStop={vi.fn()}
        isStreaming={false}
        disableImageAttach
        visionUnsupportedModelId="llama-3.3-70b"
      />,
    );

    const file = new File(["dummy"], "test.png", { type: "image/png" });
    const fileInput = screen.getByLabelText("Message input").parentElement?.querySelector('input[type="file"]') as HTMLInputElement;

    await userEvent.upload(fileInput, file);

    await waitFor(() =>
      expect(mockToastWarn).toHaveBeenCalledWith(
        "AI is not vision capable",
        "“llama-3.3-70b” cannot read image attachments. Select a vision-capable model or convert the image/PDF to text first.",
      ),
    );
    expect(screen.getByAltText("Attachment 1")).toBeInTheDocument();
  });

  it("warns when a model switch invalidates queued image attachments", async () => {
    const { rerender } = render(
      <ChatInput
        onSend={vi.fn()}
        onStop={vi.fn()}
        isStreaming={false}
        disableImageAttach={false}
        visionUnsupportedModelId="qwen-vl"
      />,
    );

    const file = new File(["dummy"], "test.png", { type: "image/png" });
    const fileInput = screen.getByLabelText("Message input").parentElement?.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(fileInput, file);
    await waitFor(() => expect(screen.getByAltText("Attachment 1")).toBeInTheDocument());
    expect(mockToastWarn).not.toHaveBeenCalledWith("AI is not vision capable", expect.any(String));

    rerender(
      <ChatInput
        onSend={vi.fn()}
        onStop={vi.fn()}
        isStreaming={false}
        disableImageAttach
        visionUnsupportedModelId="llama-3.3-70b"
      />,
    );

    await waitFor(() =>
      expect(mockToastWarn).toHaveBeenCalledWith(
        "AI is not vision capable",
        "“llama-3.3-70b” cannot read image attachments. Select a vision-capable model or convert the image/PDF to text first.",
      ),
    );
  });

  it("calls onStop while streaming", () => {
    const onStop = vi.fn();
    render(<ChatInput onSend={vi.fn()} onStop={onStop} isStreaming />);

    fireEvent.click(screen.getByRole("button", { name: "Stop generating" }));
    expect(onStop).toHaveBeenCalled();
  });

  it("sends attached images along with the message", async () => {
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} onStop={vi.fn()} isStreaming={false} />);

    const file = new File(["dummy"], "test.png", { type: "image/png" });
    const fileInput = screen.getByLabelText("Message input").parentElement?.querySelector('input[type="file"]') as HTMLInputElement;

    await userEvent.upload(fileInput, file);

    await waitFor(() => expect(screen.getByAltText("Attachment 1")).toBeInTheDocument());
    expect(mockProcessFileAttachment).toHaveBeenCalledWith(file);

    const input = screen.getByLabelText("Message input");
    await userEvent.type(input, "Look at this");
    await userEvent.keyboard("{Enter}");

    expect(onSend).toHaveBeenCalledWith(
      "Look at this",
      [expect.objectContaining({ kind: "image", name: "test.png" })],
    );
  });

  it("enables the send button when only an image is attached (no text)", async () => {
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} onStop={vi.fn()} isStreaming={false} />);

    const file = new File(["dummy"], "test.png", { type: "image/png" });
    const fileInput = screen.getByLabelText("Message input").parentElement?.querySelector('input[type="file"]') as HTMLInputElement;

    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();

    await userEvent.upload(fileInput, file);

    await waitFor(() => expect(screen.getByAltText("Attachment 1")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Send message" })).toBeEnabled();
  });

  it("submits an image-only turn with empty text via Enter", async () => {
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} onStop={vi.fn()} isStreaming={false} />);

    const file = new File(["dummy"], "test.png", { type: "image/png" });
    const fileInput = screen.getByLabelText("Message input").parentElement?.querySelector('input[type="file"]') as HTMLInputElement;

    await userEvent.upload(fileInput, file);
    await waitFor(() => expect(screen.getByAltText("Attachment 1")).toBeInTheDocument());

    const input = screen.getByLabelText("Message input");
    await userEvent.click(input);
    await userEvent.keyboard("{Enter}");

    expect(onSend).toHaveBeenCalledWith(
      "",
      [expect.objectContaining({ kind: "image", name: "test.png" })],
    );
    expect(input).toHaveValue("");
  });

  it("clears attached images after a successful submit", async () => {
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} onStop={vi.fn()} isStreaming={false} />);

    const file = new File(["dummy"], "test.png", { type: "image/png" });
    const fileInput = screen.getByLabelText("Message input").parentElement?.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(fileInput, file);
    await waitFor(() => expect(screen.getByAltText("Attachment 1")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => expect(screen.queryByAltText("Attachment 1")).not.toBeInTheDocument());
    expect(onSend).toHaveBeenCalledWith(
      "",
      [expect.objectContaining({ kind: "image", name: "test.png" })],
    );
  });

  it("does not submit when no text and no images are present (regression guard)", async () => {
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} onStop={vi.fn()} isStreaming={false} />);

    const input = screen.getByLabelText("Message input");
    await userEvent.click(input);
    await userEvent.keyboard("{Enter}");

    expect(onSend).not.toHaveBeenCalled();
  });

  it("routes image uploads through processFileAttachment (P1-002)", async () => {
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} onStop={vi.fn()} isStreaming={false} />);

    const file = new File(["hello"], "photo.jpg", { type: "image/jpeg" });
    const fileInput = screen.getByLabelText("Message input").parentElement?.querySelector('input[type="file"]') as HTMLInputElement;

    await userEvent.upload(fileInput, file);

    await waitFor(() => expect(screen.getByAltText("Attachment 1")).toBeInTheDocument());
    expect(mockProcessFileAttachment).toHaveBeenCalledWith(file);
  });

  it("surfaces a toast error when processFileAttachment throws", async () => {
    const onSend = vi.fn();
    mockProcessFileAttachment.mockRejectedValueOnce(new Error("decode failure"));
    render(<ChatInput onSend={onSend} onStop={vi.fn()} isStreaming={false} />);

    const file = new File(["dummy"], "broken.png", { type: "image/png" });
    const fileInput = screen.getByLabelText("Message input").parentElement?.querySelector('input[type="file"]') as HTMLInputElement;

    await userEvent.upload(fileInput, file);

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith(
        "Attachment failed",
        expect.stringContaining("decode failure"),
      ),
    );
    expect(screen.queryByAltText("Attachment 1")).not.toBeInTheDocument();
  });

  it("uses the processFileAttachment pipeline for pasted files, not raw FileReader", async () => {
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} onStop={vi.fn()} isStreaming={false} />);

    const file = new File(["pasted"], "paste.png", { type: "image/png" });
    const clipboardData = {
      items: [
        { kind: "file", type: "image/png", getAsFile: () => file },
      ],
    };

    const input = screen.getByLabelText("Message input") as HTMLTextAreaElement;
    fireEvent.paste(input, { clipboardData });

    await waitFor(() => expect(screen.getByAltText("Attachment 1")).toBeInTheDocument());
    expect(mockProcessFileAttachment).toHaveBeenCalledWith(file);
  });

  it("does not use hardcoded white/black theme classes (light-theme regression guard)", () => {
    render(<ChatInput onSend={vi.fn()} onStop={vi.fn()} isStreaming={false} />);
    const textarea = screen.getByLabelText("Message input");
    expect(textarea.className).not.toMatch(/\btext-white/);
    expect(textarea.className).not.toMatch(/\bplaceholder:text-white/);
  });

  it("uses semantic accent tokens for the active send button", async () => {
    render(<ChatInput onSend={vi.fn()} onStop={vi.fn()} isStreaming={false} />);
    const input = screen.getByLabelText("Message input");
    await userEvent.type(input, "Hello");

    const sendButton = screen.getByRole("button", { name: "Send message" });
    expect(sendButton.className).toContain("bg-accent");
    expect(sendButton.className).toContain("text-accent-fg");
    expect(sendButton.className).toContain("hover:bg-accent-hover");
  });

  it("uses semantic surface tokens for the disabled send button", async () => {
    render(<ChatInput onSend={vi.fn()} onStop={vi.fn()} isStreaming={false} />);
    const sendButton = screen.getByRole("button", { name: "Send message" });
    expect(sendButton.className).toContain("bg-surface-elevated");
    expect(sendButton.className).toContain("text-text-muted");
  });

  it("uses semantic surface tokens for the stop button", () => {
    render(<ChatInput onSend={vi.fn()} onStop={vi.fn()} isStreaming />);
    const stopButton = screen.getByRole("button", { name: "Stop generating" });
    expect(stopButton.className).toContain("bg-surface-elevated");
    expect(stopButton.className).toContain("text-text-primary");
  });

  // Warn spy for unsupported attachment type (processFileAttachment rejects with UnsupportedFileTypeError)
  it("surfaces a toast error when an unsupported file type is attached", async () => {
    const onSend = vi.fn();
    const { UnsupportedFileTypeError } = await import("../../services/ingestion/ingestionErrors");
    mockProcessFileAttachment.mockRejectedValueOnce(new UnsupportedFileTypeError("photo.bmp"));
    render(<ChatInput onSend={onSend} onStop={vi.fn()} isStreaming={false} />);

    const file = new File(["dummy"], "photo.bmp", { type: "image/bmp" });
    const fileInput = screen.getByLabelText("Message input").parentElement?.querySelector('input[type="file"]') as HTMLInputElement;

    await userEvent.upload(fileInput, file);

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith(
        "Attachment failed",
        expect.stringContaining("photo.bmp"),
      ),
    );
    expect(screen.queryByAltText("Attachment 1")).not.toBeInTheDocument();
  });
});
