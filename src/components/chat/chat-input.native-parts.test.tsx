// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChatInput } from "./chat-input";
import { i18n } from "../../i18n";
import type { ComposerAttachment } from "../../types/chatAttachment";

vi.mock("../../services/ingestion/attachmentAssembler", () => ({
  processFileAttachment: vi.fn(),
}));

vi.mock("../../services/nativeFileInput", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../services/nativeFileInput")>();
  return {
    ...actual,
    readFileAsNativeFileDataUrl: vi.fn(),
  };
});

vi.mock("../../stores/toast-store", () => ({
  toast: { warn: vi.fn(), error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

import { processFileAttachment } from "../../services/ingestion/attachmentAssembler";
import {
  NativeFileInputError,
  readFileAsNativeFileDataUrl,
} from "../../services/nativeFileInput";
import { toast } from "../../stores/toast-store";

const mockProcessFileAttachment = vi.mocked(processFileAttachment);
const mockReadNativeFile = vi.mocked(readFileAsNativeFileDataUrl);
const mockToastError = vi.mocked(toast.error);

function mockTextAttachment(name = "notes.txt"): ComposerAttachment {
  return {
    id: `att-${name}`,
    kind: "text",
    name,
    extension: "txt",
    mimeType: "text/plain",
    sizeBytes: 3,
    createdAt: "2026-01-01T00:00:00.000Z",
    text: "hello world",
    extraction: {
      route: "local-text",
      local: true,
      truncated: false,
      warnings: [],
      errors: [],
    },
    modelRequirements: { requiresVision: false, canFallbackToText: true },
    security: {
      untrusted: true as const,
      macrosExecuted: false as const,
      scriptsExecuted: false as const,
      htmlSanitized: true as const,
    },
  };
}

function fileInput() {
  return screen
    .getByLabelText("Message input")
    .parentElement?.querySelector('input[type="file"]') as HTMLInputElement;
}

describe("ChatInput native file/video inputs (FEAT-006)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockProcessFileAttachment.mockImplementation(async (file: File) =>
      mockTextAttachment(file.name),
    );
    await act(async () => {
      await i18n.changeLanguage("en-US");
    });
  });

  it("offers an 'Add video URL' composer action that creates a native-video draft", () => {
    render(<ChatInput onSend={vi.fn()} onStop={vi.fn()} isStreaming={false} />);

    fireEvent.click(screen.getByTestId("composer-add-video-url"));

    expect(
      screen.getByLabelText("Video URL for Video URL"),
    ).toBeInTheDocument();
    expect(screen.getByText("Video URL")).toBeInTheDocument();
  });

  it("sends a validated video URL as a native-video attachment", async () => {
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} onStop={vi.fn()} isStreaming={false} />);

    fireEvent.click(screen.getByTestId("composer-add-video-url"));
    const urlInput = screen.getByLabelText("Video URL for Video URL");
    fireEvent.change(urlInput, {
      target: { value: "https://example.com/clip.mp4" },
    });

    const messageInput = screen.getByLabelText("Message input");
    await userEvent.type(messageInput, "Summarize the video");
    await userEvent.keyboard("{Enter}");

    expect(onSend).toHaveBeenCalledWith(
      "Summarize the video",
      [
        expect.objectContaining({
          sendMode: "native-video",
          nativeVideoUrl: "https://example.com/clip.mp4",
        }),
      ],
    );
  });

  it("accepts YouTube URLs for native video input", async () => {
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} onStop={vi.fn()} isStreaming={false} />);

    fireEvent.click(screen.getByTestId("composer-add-video-url"));
    fireEvent.change(screen.getByLabelText("Video URL for Video URL"), {
      target: { value: "https://www.youtube.com/watch?v=abc123" },
    });

    await userEvent.type(screen.getByLabelText("Message input"), "check this");
    await userEvent.keyboard("{Enter}");

    expect(onSend).toHaveBeenCalledWith(
      "check this",
      [
        expect.objectContaining({
          sendMode: "native-video",
          nativeVideoUrl: "https://www.youtube.com/watch?v=abc123",
        }),
      ],
    );
  });

  it("annotates a raw local path, blocks the send, and keeps the draft", async () => {
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} onStop={vi.fn()} isStreaming={false} />);

    fireEvent.click(screen.getByTestId("composer-add-video-url"));
    // The card title follows the entered URL, so locate the input by its
    // stable placeholder.
    const urlInput = screen.getByPlaceholderText(
      /video\.mp4 or a YouTube link/i,
    );
    fireEvent.change(urlInput, {
      target: { value: "/Users/someone/Movies/clip.mp4" },
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Local file paths can't be sent",
    );

    await userEvent.type(screen.getByLabelText("Message input"), "describe");
    await userEvent.keyboard("{Enter}");

    expect(onSend).not.toHaveBeenCalled();
    expect(mockToastError).toHaveBeenCalledWith(
      "Attachment can't be sent",
      expect.stringContaining("Local file paths"),
    );
    // Draft preserved so the user can fix the URL.
    expect(screen.getByPlaceholderText(/video\.mp4 or a YouTube link/i)).toHaveValue(
      "/Users/someone/Movies/clip.mp4",
    );
    expect(screen.getByLabelText("Message input")).toHaveValue("describe");
  });

  it("blocks submit with more than three video inputs", async () => {
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} onStop={vi.fn()} isStreaming={false} />);

    for (let i = 0; i < 4; i++) {
      fireEvent.click(screen.getByTestId("composer-add-video-url"));
      const inputs = screen.getAllByLabelText("Video URL for Video URL");
      fireEvent.change(inputs[inputs.length - 1], {
        target: { value: `https://example.com/clip${i}.mp4` },
      });
    }

    await userEvent.type(screen.getByLabelText("Message input"), "compare");
    await userEvent.keyboard("{Enter}");

    expect(onSend).not.toHaveBeenCalled();
    expect(mockToastError).toHaveBeenCalledWith(
      "Attachment can't be sent",
      expect.stringContaining("At most 3 video inputs"),
    );
  });

  it("switches an uploaded file to native-file mode and sends the data URL", async () => {
    const onSend = vi.fn();
    mockReadNativeFile.mockResolvedValue("data:text/plain;base64,aGVsbG8=");
    render(<ChatInput onSend={onSend} onStop={vi.fn()} isStreaming={false} />);

    const file = new File(["hello"], "notes.txt", { type: "text/plain" });
    await userEvent.upload(fileInput(), file);
    await waitFor(() =>
      expect(screen.getByText("notes.txt")).toBeInTheDocument(),
    );

    fireEvent.change(screen.getByTestId("attachment-mode-att-notes.txt"), {
      target: { value: "native-file" },
    });

    await waitFor(() =>
      expect(mockReadNativeFile).toHaveBeenCalledWith(file),
    );
    expect(
      screen.queryByTestId("attachment-error-att-notes.txt"),
    ).not.toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Message input"), "read this");
    await userEvent.keyboard("{Enter}");

    expect(onSend).toHaveBeenCalledWith(
      "read this",
      [
        expect.objectContaining({
          sendMode: "native-file",
          nativeFileDataUrl: "data:text/plain;base64,aGVsbG8=",
          name: "notes.txt",
        }),
      ],
    );
  });

  it("annotates oversized native files and points at the local-context path", async () => {
    mockReadNativeFile.mockRejectedValue(
      new NativeFileInputError("too-large", { sizeBytes: 99_999_999 }),
    );
    render(<ChatInput onSend={vi.fn()} onStop={vi.fn()} isStreaming={false} />);

    const file = new File(["big"], "big.pdf", { type: "application/pdf" });
    await userEvent.upload(fileInput(), file);
    await waitFor(() => expect(screen.getByText("big.pdf")).toBeInTheDocument());

    fireEvent.change(screen.getByTestId("attachment-mode-att-big.pdf"), {
      target: { value: "native-file" },
    });

    await waitFor(() =>
      expect(screen.getByTestId("attachment-error-att-big.pdf")).toHaveTextContent(
        "too large to upload as a native file",
      ),
    );
  });

  it("annotates unsupported file types for native-file mode", async () => {
    mockReadNativeFile.mockRejectedValue(
      new NativeFileInputError("unsupported-type", { extension: "zip" }),
    );
    render(<ChatInput onSend={vi.fn()} onStop={vi.fn()} isStreaming={false} />);

    // .zip is outside the picker's accept list, so drive the input directly
    // (a dropped file would take the same code path).
    const file = new File(["zip"], "archive.zip", { type: "application/zip" });
    fireEvent.change(fileInput(), { target: { files: [file] } });
    await waitFor(() =>
      expect(screen.getByText("archive.zip")).toBeInTheDocument(),
    );

    fireEvent.change(screen.getByTestId("attachment-mode-att-archive.zip"), {
      target: { value: "native-file" },
    });

    await waitFor(() =>
      expect(
        screen.getByTestId("attachment-error-att-archive.zip"),
      ).toHaveTextContent("Unsupported file type for native input"),
    );
  });

  it("keeps local-context mode as the default for uploaded files", async () => {
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} onStop={vi.fn()} isStreaming={false} />);

    const file = new File(["hello"], "notes.txt", { type: "text/plain" });
    await userEvent.upload(fileInput(), file);
    await waitFor(() =>
      expect(screen.getByText("notes.txt")).toBeInTheDocument(),
    );

    expect(screen.getByTestId("attachment-mode-att-notes.txt")).toHaveValue(
      "context",
    );

    await userEvent.type(screen.getByLabelText("Message input"), "plain send");
    await userEvent.keyboard("{Enter}");

    expect(onSend).toHaveBeenCalledWith(
      "plain send",
      [expect.objectContaining({ text: "hello world" })],
    );
    const sentAttachment = onSend.mock.calls[0][1][0];
    expect(sentAttachment.sendMode).toBeUndefined();
    expect(mockReadNativeFile).not.toHaveBeenCalled();
  });
});
