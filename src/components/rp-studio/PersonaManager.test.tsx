import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  persona: {
    schema: "UserPersonaV1" as const,
    id: "persona-1",
    name: "Tester",
    description: "Description",
    tags: [],
    createdAt: 1,
    updatedAt: 1,
  },
}));

vi.mock("../../stores/persona-store", () => {
  const state = { personas: [fixture.persona] };
  return { usePersonaStore: (selector: (value: typeof state) => unknown) => selector(state) };
});

import { PersonaEditor } from "./PersonaManager";

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
