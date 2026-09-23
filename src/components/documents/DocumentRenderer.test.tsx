import "@testing-library/jest-dom/vitest";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DocumentRenderer } from "./DocumentRenderer";
import type { DocumentBlock } from "../../agent/contracts/documents";

describe("DocumentRenderer math rendering", () => {
  it("renders paragraph math through the canonical safe markdown renderer", () => {
    const blocks: DocumentBlock[] = [
      { id: "p1", type: "paragraph", text: "The curve $x^2 + y^2 = r^2$ is a circle." },
      { id: "p2", type: "paragraph", text: "Area:\n$$A = \\pi r^2$$" },
    ];
    const { container } = render(<DocumentRenderer blocks={blocks} />);
    expect(container.querySelectorAll(".katex").length).toBeGreaterThan(0);
    expect(container.textContent).toContain("circle");
  });

  it("renders quote block math", () => {
    const blocks: DocumentBlock[] = [
      { id: "q1", type: "quote", text: "Energy equals $E = mc^2$." },
    ];
    const { container } = render(<DocumentRenderer blocks={blocks} />);
    expect(container.querySelector(".katex")).not.toBeNull();
  });

  it("keeps non-math paragraphs as plain text without katex output", () => {
    const blocks: DocumentBlock[] = [
      { id: "p1", type: "paragraph", text: "Just plain text, no math here." },
    ];
    const { container } = render(<DocumentRenderer blocks={blocks} />);
    expect(container.querySelector(".katex")).toBeNull();
    expect(container.textContent).toContain("Just plain text, no math here.");
  });
});
