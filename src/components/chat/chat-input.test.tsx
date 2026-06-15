// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { ChatInput } from "./chat-input";

vi.mock("../../services/attachmentService", () => ({
  isSupportedImageFile: vi.fn((file: File) => file.type === "image/png" || file.type === "image/jpeg" || file.type === "image/webp"),
  readImageAttachment: vi.fn(async (file: File) => ({
    id: "mock-id",
    type: "image" as const,
    name: file.name,
    content: `data:${file.type};base64,mock`,
    size: 1,
  })),
}));

vi.mock("../../stores/toast-store", () => ({
  toast: { warn: vi.fn(), error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

import { isSupportedImageFile, readImageAttachment } from "../../services/attachmentService";
import { toast } from "../../stores/toast-store";

const mockIsSupportedImageFile = vi.mocked(isSupportedImageFile);
const mockReadImageAttachment = vi.mocked(readImageAttachment);
const mockToastWarn = vi.mocked(toast.warn);
const mockToastError = vi.mocked(toast.error);

describe("ChatInput", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsSupportedImageFile.mockImplementation(
      (file: File) => file.type === "image/png" || file.type === "image/jpeg" || file.type === "image/webp",
    );
    mockReadImageAttachment.mockImplementation(async (file: File) => ({
      id: "mock-id",
      type: "image" as const,
      name: file.name,
      content: `data:${file.type};base64,mock`,
      size: 1,
    }));
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

  it("disables image attach when disableImageAttach is true", () => {
    render(
      <ChatInput
        onSend={vi.fn()}
        onStop={vi.fn()}
        isStreaming={false}
        disableImageAttach
      />,
    );

    expect(screen.getByRole("button", { name: "Attach image" })).toBeDisabled();
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
    expect(mockReadImageAttachment).toHaveBeenCalledWith(file);

    const input = screen.getByLabelText("Message input");
    await userEvent.type(input, "Look at this");
    await userEvent.keyboard("{Enter}");

    expect(onSend).toHaveBeenCalledWith("Look at this", ["data:image/png;base64,mock"]);
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

    expect(onSend).toHaveBeenCalledWith("", ["data:image/png;base64,mock"]);
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
    expect(onSend).toHaveBeenCalledWith("", ["data:image/png;base64,mock"]);
  });

  it("does not submit when no text and no images are present (regression guard)", async () => {
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} onStop={vi.fn()} isStreaming={false} />);

    const input = screen.getByLabelText("Message input");
    await userEvent.click(input);
    await userEvent.keyboard("{Enter}");

    expect(onSend).not.toHaveBeenCalled();
  });

  it("routes image uploads through attachmentService.readImageAttachment (P1-002)", async () => {
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} onStop={vi.fn()} isStreaming={false} />);

    const file = new File(["hello"], "photo.jpg", { type: "image/jpeg" });
    const fileInput = screen.getByLabelText("Message input").parentElement?.querySelector('input[type="file"]') as HTMLInputElement;

    await userEvent.upload(fileInput, file);

    await waitFor(() => expect(screen.getByAltText("Attachment 1")).toBeInTheDocument());
    expect(mockIsSupportedImageFile).toHaveBeenCalledWith(file);
    expect(mockReadImageAttachment).toHaveBeenCalledWith(file);
  });

  it("warns and skips an unsupported image MIME type instead of crashing", async () => {
    const onSend = vi.fn();
    mockIsSupportedImageFile.mockReturnValue(false);
    render(<ChatInput onSend={onSend} onStop={vi.fn()} isStreaming={false} />);

    const file = new File(["dummy"], "photo.bmp", { type: "image/bmp" });
    const fileInput = screen.getByLabelText("Message input").parentElement?.querySelector('input[type="file"]') as HTMLInputElement;

    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => expect(mockToastWarn).toHaveBeenCalledWith(
      "Unsupported image",
      expect.stringContaining("photo.bmp"),
    ));
    expect(mockReadImageAttachment).not.toHaveBeenCalled();
    expect(screen.queryByAltText("Attachment 1")).not.toBeInTheDocument();
  });

  it("surfaces a toast error when readImageAttachment throws", async () => {
    const onSend = vi.fn();
    mockReadImageAttachment.mockRejectedValueOnce(new Error("decode failure"));
    render(<ChatInput onSend={onSend} onStop={vi.fn()} isStreaming={false} />);

    const file = new File(["dummy"], "broken.png", { type: "image/png" });
    const fileInput = screen.getByLabelText("Message input").parentElement?.querySelector('input[type="file"]') as HTMLInputElement;

    await userEvent.upload(fileInput, file);

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith(
      "Image attachment failed",
      expect.stringContaining("decode failure"),
    ));
    expect(screen.queryByAltText("Attachment 1")).not.toBeInTheDocument();
  });

  it("uses the attachmentService pipeline for pasted images, not the raw FileReader", async () => {
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} onStop={vi.fn()} isStreaming={false} />);

    const file = new File(["pasted"], "paste.png", { type: "image/png" });
    const clipboardData = {
      items: [
        { type: "image/png", getAsFile: () => file },
      ],
    };

    const input = screen.getByLabelText("Message input") as HTMLTextAreaElement;
    fireEvent.paste(input, { clipboardData });

    await waitFor(() => expect(screen.getByAltText("Attachment 1")).toBeInTheDocument());
    expect(mockReadImageAttachment).toHaveBeenCalledWith(file);
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
});
