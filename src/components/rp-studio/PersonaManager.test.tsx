import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

const fixture = vi.hoisted(() => {
  const persona = {
    schema: "UserPersonaV1" as const,
    id: "persona-1",
    name: "Tester",
    description: "Description",
    tags: [],
    createdAt: 1,
    updatedAt: 1,
  };
  const personaWithImage = {
    ...persona,
    id: "persona-2",
    name: "WithImage",
    image: { mimeType: "image/png" as const, data: "iVBORw0KGgo=", byteLength: 12 },
  };
  return { persona, personaWithImage };
});

const mocks = vi.hoisted(() => ({
  isSupportedImageFile: vi.fn(),
  readImageAttachment: vi.fn(),
  upsert: vi.fn(),
  remove: vi.fn(),
  load: vi.fn(),
  setActive: vi.fn(),
  createBlank: vi.fn(),
  setSearchQuery: vi.fn(),
}));

vi.mock("../../services/attachmentService", () => ({
  isSupportedImageFile: mocks.isSupportedImageFile,
  readImageAttachment: mocks.readImageAttachment,
}));

vi.mock("../../stores/persona-store", () => {
  const state = {
    personas: [fixture.persona, fixture.personaWithImage],
    isLoading: false,
    hasLoaded: true,
    error: null,
    activePersonaId: null,
    searchQuery: "",
    load: mocks.load,
    upsert: mocks.upsert,
    remove: mocks.remove,
    setActive: mocks.setActive,
    createBlank: mocks.createBlank,
    setSearchQuery: mocks.setSearchQuery,
    getById: (id: string) => state.personas.find((p: typeof fixture.persona) => p.id === id),
  };
  return { usePersonaStore: (selector: (value: typeof state) => unknown) => selector(state) };
});

import { PersonaEditor, PersonaManager } from "./PersonaManager";

describe("PersonaEditor error handling", () => {
  it("renders a fixed safe message when save rejects", async () => {
    const onSave = vi.fn().mockRejectedValueOnce(
      new Error("Authorization: Bearer secret /Users/private/persona.json"),
    );
    render(<PersonaEditor personaId="persona-1" onClose={vi.fn()} onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    const alert = await screen.findByText("Failed to save persona. Please try again.");
    expect(alert).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("Bearer secret");
    expect(document.body.textContent).not.toContain("/Users/private");
  });
});

// VERIFY-081 regression guard — PersonaManager/PersonaEditor image upload,
// preview, replace, and remove paths.
describe("PersonaEditor image handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isSupportedImageFile.mockReturnValue(true);
    mocks.readImageAttachment.mockImplementation(async (file: File) => ({
      id: "att-1",
      type: "image" as const,
      name: file.name,
      content: `data:${file.type || "image/png"};base64,YWJj`,
      size: 3,
    }));
  });

  it("renders an image preview when the persona has an image", () => {
    render(<PersonaEditor personaId="persona-2" onClose={vi.fn()} onSave={vi.fn()} />);
    const img = screen.getByTestId("persona-image-preview") as HTMLImageElement;
    expect(img).toBeInTheDocument();
    expect(img.src).toContain("data:image/png;base64,iVBORw0KGgo=");
  });

  it("uploading a new image renders a preview", async () => {
    render(<PersonaEditor personaId="persona-1" onClose={vi.fn()} onSave={vi.fn()} />);
    const input = screen.getByTestId("persona-image-input") as HTMLInputElement;
    const file = new File([new ArrayBuffer(100)], "avatar.png", { type: "image/png" });

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByTestId("persona-image-preview")).toBeInTheDocument();
    });
    expect(mocks.readImageAttachment).toHaveBeenCalledWith(file);
  });

  it("removing the image clears the preview", async () => {
    render(<PersonaEditor personaId="persona-2" onClose={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByTestId("persona-image-preview")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Remove image" }));

    await waitFor(() => {
      expect(screen.queryByTestId("persona-image-preview")).not.toBeInTheDocument();
    });
  });

  it("rejects a non-image file with a safe error message", async () => {
    mocks.isSupportedImageFile.mockReturnValue(false);
    render(<PersonaEditor personaId="persona-1" onClose={vi.fn()} onSave={vi.fn()} />);
    const input = screen.getByTestId("persona-image-input") as HTMLInputElement;
    const file = new File(["x"], "evil.exe", { type: "application/octet-stream" });

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText(/Persona image must be PNG, JPEG, or WebP/i)).toBeInTheDocument();
    });
    expect(mocks.readImageAttachment).not.toHaveBeenCalled();
  });

  it("rejects an oversized image file", async () => {
    render(<PersonaEditor personaId="persona-1" onClose={vi.fn()} onSave={vi.fn()} />);
    const input = screen.getByTestId("persona-image-input") as HTMLInputElement;
    const file = new File([new ArrayBuffer(6 * 1024 * 1024)], "huge.png", { type: "image/png" });

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText(/no larger than 5 MiB/i)).toBeInTheDocument();
    });
    expect(mocks.readImageAttachment).not.toHaveBeenCalled();
  });

  it("surfaces a safe error when the attachment cannot be decoded", async () => {
    mocks.readImageAttachment.mockResolvedValue({
      id: "att-bad",
      type: "image" as const,
      name: "bad.png",
      content: "not-a-data-url",
      size: 3,
    });
    render(<PersonaEditor personaId="persona-1" onClose={vi.fn()} onSave={vi.fn()} />);
    const input = screen.getByTestId("persona-image-input") as HTMLInputElement;

    fireEvent.change(input, { target: { files: [new File(["x"], "bad.png", { type: "image/png" })] } });

    await waitFor(() => {
      expect(screen.getByText(/could not be decoded safely/i)).toBeInTheDocument();
    });
  });
});

describe("PersonaManager list", () => {
  it("renders the persona list and opens the editor", () => {
    render(<PersonaManager />);
    expect(screen.getByText("Tester")).toBeInTheDocument();
    expect(screen.getByText("WithImage")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[0]);
    expect(screen.getByDisplayValue("Tester")).toBeInTheDocument();
  });
});
