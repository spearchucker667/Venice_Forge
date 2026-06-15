import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  upsert: vi.fn(),
  lorebook: {
    schema: "LorebookV1" as const,
    id: "lorebook-1",
    name: "Tester",
    description: "Description",
    tags: [],
    entries: [],
    createdAt: 1,
    updatedAt: 1,
  },
}));

vi.mock("../../stores/lorebook-store", () => {
  const state = { lorebooks: [mocks.lorebook], upsert: mocks.upsert };
  return { useLorebookStore: (selector: (value: typeof state) => unknown) => selector(state) };
});

import { LorebookEditor } from "./LorebookManager";

describe("LorebookEditor error handling", () => {
  it("renders a fixed safe message when save rejects", async () => {
    mocks.upsert.mockRejectedValueOnce(
      new Error("Authorization: Bearer secret /Users/private/lorebook.json"),
    );
    render(<LorebookEditor lorebookId="lorebook-1" onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    const alert = await screen.findByText("Failed to save lorebook. Please try again.");
    expect(alert).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("Bearer secret");
    expect(document.body.textContent).not.toContain("/Users/private");
  });
});
