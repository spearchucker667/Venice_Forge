/** @fileoverview Unit tests for minimal markdown rendering and HTML escaping. */

import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { Markdown, minimalMarkdown, escapeHtml } from "./markdown";

/** Tests for the escapeHtml helper. */
describe("escapeHtml", () => {
  /** Verifies that the five HTML special characters are escaped correctly. */
  it("escapes the five HTML special characters", () => {
    expect(escapeHtml("<script>alert('x')</script>")).toBe(
      "&lt;script&gt;alert(&#039;x&#039;)&lt;/script&gt;"
    );
    expect(escapeHtml('"quoted"')).toBe("&quot;quoted&quot;");
    expect(escapeHtml("a & b")).toBe("a &amp; b");
  });

  /** Verifies that empty or nullish input yields an empty string. */
  it("returns empty string for empty string and nullish input", () => {
    expect(escapeHtml("")).toBe("");
    expect(escapeHtml(null as any)).toBe("");
    expect(escapeHtml(undefined as any)).toBe("");
  });
});

/** Tests for the minimalMarkdown helper. */
describe("minimalMarkdown", () => {
  /** Verifies that bold markdown renders as strong tags. */
  it("renders bold text", () => {
    expect(minimalMarkdown("**hello**")).toContain("<strong>hello</strong>");
  });

  /** Verifies that inline code renders as code tags. */
  it("renders inline code", () => {
    expect(minimalMarkdown("`code`")).toContain("<code>code</code>");
  });

  /** Verifies that raw HTML tags are escaped and not rendered. */
  it("does not allow raw HTML tags through", () => {
    const output = minimalMarkdown("<img src=x onerror=alert(1)>");
    expect(output).not.toContain("<img");
    expect(output).toContain("&lt;img");
  });

  /** Verifies that script tags in markdown input are escaped. */
  it("does not allow script injection via markdown input", () => {
    const output = minimalMarkdown("<script>alert('xss')</script>");
    expect(output).not.toContain("<script>");
    expect(output).toContain("&lt;script&gt;");
  });

  /** Verifies that HTML event attributes are escaped rather than preserved. */
  it("escapes event-handler attributes instead of preserving them", () => {
    const output = minimalMarkdown("<img src=x onerror=alert(1)>");
    expect(output).not.toContain("<img src=x onerror=");
    expect(output).toContain("onerror=alert(1)");
    expect(output).toContain("&lt;img");
  });

  /** Verifies that fenced code blocks preserve content without executing it. */
  it("preserves fenced code blocks without executing their content", () => {
    const output = minimalMarkdown("```\n<b>not bold</b>\n```");
    expect(output).toContain("<pre><code>");
    expect(output).not.toContain("<b>not bold</b>");
    expect(output).toContain("&lt;b&gt;not bold&lt;/b&gt;");
  });

  /** Verifies that unsafe code-block text cannot escape the generated code element. */
  it("escapes code-block text before reinserting generated copy markup", () => {
    const output = minimalMarkdown("```\n</code><img src=x onerror=alert(1)>\n```");
    expect(output).not.toContain("<img");
    expect(output).not.toContain("</code><img");
    expect(output).toContain("&lt;/code&gt;&lt;img");
  });

  /** Verifies that heading markdown renders as h1, h2, and h3 tags. */
  it("renders headings for #, ##, ###", () => {
    expect(minimalMarkdown("# H1")).toContain("<h1>H1</h1>");
    expect(minimalMarkdown("## H2")).toContain("<h2>H2</h2>");
    expect(minimalMarkdown("### H3")).toContain("<h3>H3</h3>");
  });

  /** Verifies that four-hash headings are not rendered as h3. */
  it("does not render #### as h3", () => {
    const output = minimalMarkdown("#### H4");
    expect(output).not.toContain("<h3>H4</h3>");
    expect(output).toContain("#### H4");
  });
});

describe("Markdown copy control", () => {
  it("shows success only after the clipboard write resolves", async () => {
    let resolveCopy!: () => void;
    const writeText = vi.fn(() => new Promise<void>((resolve) => { resolveCopy = resolve; }));
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const { container } = render(createElement(Markdown, { text: "```code```" }));
    const button = container.querySelector("button")!;
    fireEvent.click(button);
    expect(button.textContent).toBe("⎘");
    resolveCopy();
    await waitFor(() => expect(button.textContent).toBe("Copied"));
  });

  it("shows copy failure when the clipboard rejects", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    });
    const { container } = render(createElement(Markdown, { text: "```code```" }));
    const button = container.querySelector("button")!;
    fireEvent.click(button);
    await waitFor(() => expect(button.textContent).toBe("Copy failed"));
  });
});
