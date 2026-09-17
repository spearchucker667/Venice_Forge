// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { PromptLimitMeter } from "./prompt-limit";
import { i18n } from "../../i18n";

describe("PromptLimitMeter (VF-20260916-P2-006)", () => {
  beforeEach(async () => {
    await act(async () => {
      await i18n.changeLanguage("en-US");
    });
  });

  it("renders the current count against the effective limit", () => {
    render(<PromptLimitMeter current={42} limit={2500} />);
    const meter = screen.getByTestId("prompt-limit-meter");
    expect(meter).toHaveTextContent("42/2,500");
    expect(meter).not.toHaveAttribute("data-over-limit");
    expect(meter).toHaveAttribute("role", "status");
  });

  it("flags over-limit input with an alert role", () => {
    render(<PromptLimitMeter current={2501} limit={2500} />);
    const meter = screen.getByTestId("prompt-limit-meter");
    expect(meter).toHaveTextContent("2,501/2,500");
    expect(meter).toHaveAttribute("data-over-limit", "true");
    expect(meter).toHaveAttribute("role", "alert");
  });

  it("accepts a custom test id", () => {
    render(<PromptLimitMeter current={1} limit={500} testId="music-prompt-meter" />);
    expect(screen.getByTestId("music-prompt-meter")).toBeInTheDocument();
  });
});
