// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { askSecret, ModalRequestHost } from "./modal-requests";

describe("ModalRequestHost secret entry", () => {
  it("masks passphrases and requires matching confirmation", async () => {
    render(<ModalRequestHost />);
    let resultPromise!: Promise<string | null>;
    await act(async () => {
      resultPromise = askSecret({ title: "Create passphrase", confirm: true, minLength: 8 });
    });

    const primary = document.querySelector('input[aria-label="Create passphrase"]') as HTMLInputElement;
    const confirmation = screen.getByLabelText("Create passphrase confirmation") as HTMLInputElement;
    expect(primary.type).toBe("password");
    expect(confirmation.type).toBe("password");

    fireEvent.change(primary, { target: { value: "correct horse" } });
    fireEvent.change(confirmation, { target: { value: "different value" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText("Passphrases do not match.")).toBeTruthy();

    fireEvent.change(confirmation, { target: { value: "correct horse" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await expect(resultPromise).resolves.toBe("correct horse");
  });
});
