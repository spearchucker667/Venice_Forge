/** @fileoverview Tests for the Media Studio selection action bar: visibility,
 * capability gating with disabled+reason, the upscale menu, mask-editor
 * handoff, and failure/retry behaviour. */

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../services/imageDerivedOperations", () => ({
  runImageDerivedOperation: vi.fn(),
  resolveMediaItemImageInput: vi.fn(async () => "data:image/png;base64,AAAA"),
}));

vi.mock("../../stores/toast-store", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    fromError: vi.fn(),
  },
}));

import {
  runImageDerivedOperation,
} from "../../services/imageDerivedOperations";
import { MediaStudioActionBar } from "./MediaStudioActionBar";
import type { MediaItem } from "../../types/media";

function makeItem(overrides: Partial<MediaItem> = {}): MediaItem {
  return {
    id: "img-1",
    image: "data:image/png;base64,AAAA",
    prompt: "Copper city at dusk",
    model: "flux-2-max-edit",
    timestamp: 1,
    mediaType: "image",
    operation: "generate",
    parentId: null,
    childrenIds: [],
    tags: [],
    note: "",
    favorite: false,
    ...overrides,
  };
}

describe("MediaStudioActionBar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("is visible with enabled actions for a selected compatible image", () => {
    render(<MediaStudioActionBar items={[makeItem()]} />);
    expect(screen.getByTestId("media-studio-action-bar")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Upscale/ }) as HTMLButtonElement,
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Remove Background" }) as HTMLButtonElement,
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Inpaint" }) as HTMLButtonElement,
    ).toBeEnabled();
  });

  it("renders nothing when the selection has no compatible image", () => {
    const { container } = render(
      <MediaStudioActionBar
        items={[makeItem({ id: "vid-1", mediaType: "video", model: "veo-3" })]}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("offers 2× and 4× in the upscale menu and fans out on selection", async () => {
    vi.mocked(runImageDerivedOperation).mockResolvedValue({
      status: "completed",
      asset: makeItem({ id: "derived-1", parentId: "img-1", operation: "upscale" }),
    });
    render(<MediaStudioActionBar items={[makeItem()]} />);

    fireEvent.click(screen.getByRole("button", { name: /Upscale/ }));
    const menu = screen.getByRole("menu", { name: "Upscale" });
    expect(menu).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "2×" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "4×" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("menuitem", { name: "2×" }));
    await waitFor(() => expect(runImageDerivedOperation).toHaveBeenCalledTimes(1));
    expect(runImageDerivedOperation).toHaveBeenCalledWith(
      expect.objectContaining({ operation: { kind: "upscale", scale: 2 } }),
    );
  });

  it("disables inpainting with a specific reason under multi-select", () => {
    render(<MediaStudioActionBar items={[makeItem(), makeItem({ id: "img-2" })]} />);
    const inpaint = screen.getByRole("button", { name: "Inpaint" }) as HTMLButtonElement;
    expect(inpaint).toBeDisabled();
    expect(inpaint).toHaveAttribute(
      "title",
      "Inpainting requires a single selected image",
    );
  });

  it("disables operations with a reason when the selection includes a non-image asset", () => {
    render(
      <MediaStudioActionBar
        items={[makeItem(), makeItem({ id: "vid-1", mediaType: "video", model: "veo-3" })]}
      />,
    );
    const upscale = screen.getByRole("button", { name: /Upscale/ }) as HTMLButtonElement;
    expect(upscale).toBeDisabled();
    expect(upscale).toHaveAttribute("title", "This operation requires an image asset");
    const removeBg = screen.getByRole("button", {
      name: "Remove Background",
    }) as HTMLButtonElement;
    expect(removeBg).toBeDisabled();
  });

  it("disables inpainting with a reason when the selected model is not edit-capable", () => {
    render(<MediaStudioActionBar items={[makeItem({ model: "z-image-turbo" })]} />);
    const inpaint = screen.getByRole("button", { name: "Inpaint" }) as HTMLButtonElement;
    expect(inpaint).toBeDisabled();
    expect(inpaint).toHaveAttribute(
      "title",
      "Inpainting is unavailable for the selected model",
    );
  });

  it("opens the mask editor with the selected asset when Inpaint is clicked", () => {
    const item = makeItem({ prompt: "Portrait study" });
    render(<MediaStudioActionBar items={[item]} />);
    fireEvent.click(screen.getByRole("button", { name: "Inpaint" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Inpaint — paint a mask")).toBeInTheDocument();
    // The selected asset's prompt is surfaced as the dialog context.
    expect(screen.getByText("Portrait study")).toBeInTheDocument();
  });

  it("shows an error with Retry on failure and re-invokes the same operation on retry", async () => {
    vi.mocked(runImageDerivedOperation).mockResolvedValue({
      status: "failed",
      operation: { kind: "remove-background" },
      error: "503 Venice/server retryable error: capacity",
      retryable: true,
    });
    render(<MediaStudioActionBar items={[makeItem()]} />);

    fireEvent.click(screen.getByRole("button", { name: "Remove Background" }));

    const retry = await screen.findByRole("button", { name: "Retry" });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Background removal failed for Copper city at dusk",
    );
    expect(runImageDerivedOperation).toHaveBeenCalledTimes(1);
    expect(runImageDerivedOperation).toHaveBeenCalledWith(
      expect.objectContaining({ operation: { kind: "remove-background" } }),
    );

    fireEvent.click(retry);
    await waitFor(() => expect(runImageDerivedOperation).toHaveBeenCalledTimes(2));
    expect(runImageDerivedOperation).toHaveBeenLastCalledWith(
      expect.objectContaining({ operation: { kind: "remove-background" } }),
    );
  });
});
