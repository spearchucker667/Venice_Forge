// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { ChatInput } from "./chat-input";

class MockFileReader {
  result: string | ArrayBuffer | null = null;
  onload: (() => void) | null = null;
  readAsDataURL(_file: Blob) {
    this.result = "data:image/png;base64,mock";
    queueMicrotask(() => {
      if (this.onload) this.onload();
    });
  }
}

describe("ChatInput", () => {
  beforeEach(() => {
    Object.assign(globalThis, { FileReader: MockFileReader });
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

    const input = screen.getByLabelText("Message input");
    await userEvent.type(input, "Look at this");
    await userEvent.keyboard("{Enter}");

    expect(onSend).toHaveBeenCalledWith("Look at this", ["data:image/png;base64,mock"]);
  });
});
