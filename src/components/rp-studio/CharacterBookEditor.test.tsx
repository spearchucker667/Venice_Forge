import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CharacterBookEditor } from "./CharacterBookEditor";

describe("CharacterBookEditor", () => {
  it("exposes labelled keyboard-operable entry controls and preserves all V2 entry fields", () => {
    const onChange = vi.fn();
    render(<CharacterBookEditor book={{ name: "World", extensions: {}, entries: [{ id: 1, name: "Beacon", keys: ["beacon"], secondary_keys: ["signal"], content: "Content", extensions: {}, enabled: true, constant: false, selective: true, case_sensitive: false, insertion_order: 4, priority: 2, position: "before_char", comment: "Note" }] }} onChange={onChange} />);
    expect(screen.getByRole("group", { name: "Entry 1" })).toBeInTheDocument();
    expect(screen.getByLabelText("Character book entry 1 content")).toHaveValue("Content");
    expect(screen.getByRole("checkbox", { name: "enabled" })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Add entry" }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ entries: expect.arrayContaining([expect.objectContaining({ enabled: true, extensions: {} })]) }));
  });
});
