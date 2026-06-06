import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NewChatDialog } from "./RpChatList";

describe("NewChatDialog focus management", () => {
  it("focuses the title, closes with Escape, and restores trigger focus", async () => {
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    trigger.focus();
    const onClose = vi.fn();
    const { unmount } = render(
      <NewChatDialog
        onClose={onClose}
        onCreate={vi.fn()}
        cards={[]}
        personas={[]}
        lorebooks={[]}
        defaultModel="test-model"
      />,
    );

    expect(screen.getByLabelText("Title")).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();

    unmount();
    expect(trigger).toHaveFocus();
    trigger.remove();
  });
});
