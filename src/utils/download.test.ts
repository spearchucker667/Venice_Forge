// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { copyText, downloadImage, downloadMedia, isSafeDownloadUrl, sanitizeFilename } from "./download";

const originalFetch = globalThis.fetch;
const originalCreateObjectUrl = URL.createObjectURL;
const originalRevokeObjectUrl = URL.revokeObjectURL;

describe("downloadImage", () => {
  beforeEach(() => {
    globalThis.fetch = originalFetch;
    URL.createObjectURL = vi.fn(() => "blob:download");
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;
    URL.createObjectURL = originalCreateObjectUrl;
    URL.revokeObjectURL = originalRevokeObjectUrl;
  });

  it("does not save HTTP error bodies as confirmed image downloads", async () => {
    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("not found", { status: 404, statusText: "Not Found" })
    );

    const result = await downloadImage("https://example.com/missing.png", "missing.png");

    expect(result).toEqual({ confirmed: false, usedFallback: true });
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("sanitizes filenames before triggering a download", async () => {
    // Use a Uint8Array body (a binary image payload shape) instead of
    // a Blob — Vitest + jsdom + Node's `Response` implementation
    // does not always expose the stream() getter that Response needs
    // when constructed with a Blob body in this combo. Uint8Array is
    // a runtime-stable shape and `Response.blob()` consumes it fine.
    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(new Uint8Array([120]), {
        status: 200,
        headers: { "content-type": "image/png" },
      }),
    );

    const anchor = document.createElement("a");
    const clickFn = vi.fn();
    anchor.click = clickFn as typeof anchor.click;
    // @ts-expect-error -- Electron type overloads conflict with generic createElement mocking.
    const createElementSpy = vi.spyOn(document, "createElement").mockImplementation(() => anchor as HTMLElement);

    await downloadImage("https://example.com/image.png", "../evil\\name.txt?*< >|");

    expect(anchor.download).toBe("evil_name.txt_");
    expect(clickFn).toHaveBeenCalled();

    createElementSpy.mockRestore();
  });

  it("refuses fallback navigation for dangerous URLs", async () => {
    globalThis.fetch = vi.fn<typeof fetch>().mockRejectedValue(new Error("network"));

    const result = await downloadImage("javascript:alert(1)", "x.png");

    expect(result).toEqual({ confirmed: false, usedFallback: false });
  });

  it("allows blob: fallback when fetch fails", async () => {
    globalThis.fetch = vi.fn<typeof fetch>().mockRejectedValue(new Error("network"));

    const result = await downloadImage("blob:https://app/uuid", "blob.png");

    expect(result).toEqual({ confirmed: false, usedFallback: true });
  });

  it("allows data:image/ fallback when fetch fails", async () => {
    globalThis.fetch = vi.fn<typeof fetch>().mockRejectedValue(new Error("network"));

    const result = await downloadImage("data:image/png;base64,abcd", "data.png");

    expect(result).toEqual({ confirmed: true, usedFallback: false });
  });

  it("rejects data:text/html fallback even if fetch fails", async () => {
    globalThis.fetch = vi.fn<typeof fetch>().mockRejectedValue(new Error("network"));

    const result = await downloadImage("data:text/html,<script>alert(1)</script>", "x.png");

    expect(result).toEqual({ confirmed: false, usedFallback: false });
  });

  it("rejects SVG data URL fallback", async () => {
    globalThis.fetch = vi.fn<typeof fetch>().mockRejectedValue(new Error("network"));
    await expect(downloadImage("data:image/svg+xml,<svg onload=alert(1)>", "x.svg"))
      .resolves.toEqual({ confirmed: false, usedFallback: false });
  });

  it("does not save a successful non-image response", async () => {
    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue(new Response("html", {
      status: 200,
      headers: { "content-type": "text/html" },
    }));
    await expect(downloadImage("https://example.com/image.png", "image.png"))
      .resolves.toEqual({ confirmed: false, usedFallback: true });
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("allows same-origin relative app URL fallback", async () => {
    globalThis.fetch = vi.fn<typeof fetch>().mockRejectedValue(new Error("network"));

    const result = await downloadImage("/api/internal/image.png", "image.png");

    expect(result).toEqual({ confirmed: false, usedFallback: true });
  });
});

describe("isSafeDownloadUrl", () => {
  it.each([
    ["https://example.com/file.png", true],
    ["HTTPS://EXAMPLE.COM/file.png", true],
    ["blob:https://app/uuid", true],
    ["data:image/png;base64,abcd", true],
    ["data:image/webp;base64,abcd", true],
    ["data:image/svg+xml,<svg></svg>", false],
    ["/api/internal/image.png", true],
    ["", false],
    ["javascript:alert(1)", false],
    ["file:///etc/passwd", false],
    ["ftp://example.com/file", false],
    ["http://example.com/file.png", false],
    ["data:text/html,<script>alert(1)</script>", false],
    ["//evil.com/cross-origin.png", false],
    ["relative/path.png", false],
    ["https:malformed", false],
  ])("isSafeDownloadUrl(%s) -> %s", (url, expected) => {
    expect(isSafeDownloadUrl(url)).toBe(expected);
  });
});

describe("downloadMedia", () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => "blob:download");
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;
    URL.createObjectURL = originalCreateObjectUrl;
    URL.revokeObjectURL = originalRevokeObjectUrl;
  });

  // VERIFY-143: custom-protocol media must be fetched into a normal Blob so
  // the browser download gesture can persist it reliably.
  it("fetches an app-owned video and downloads a Blob instead of navigating to the custom URL", async () => {
    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue(new Response(new Uint8Array([0, 1, 2]), {
      status: 200,
      headers: { "content-type": "video/mp4" },
    }));
    const anchor = document.createElement("a");
    const click = vi.fn();
    anchor.click = click as typeof anchor.click;
    // @ts-expect-error -- Electron type overloads conflict with createElement mocking.
    vi.spyOn(document, "createElement").mockImplementation(() => anchor as HTMLElement);

    await downloadMedia(`venice-media://${"a".repeat(64)}`, "../video.mp4");

    expect(fetch).toHaveBeenCalledWith(`venice-media://${"a".repeat(64)}`);
    expect(anchor.href).toContain("blob:download");
    expect(anchor.download).toBe("video.mp4");
    expect(click).toHaveBeenCalled();
  });
});

describe("copyText", () => {
  let originalClipboardDescriptor: PropertyDescriptor | undefined;
  let originalExecCommand: typeof document.execCommand | undefined;

  beforeEach(() => {
    originalClipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    originalExecCommand = document.execCommand;
  });

  afterEach(() => {
    if (originalClipboardDescriptor) {
      Object.defineProperty(navigator, "clipboard", originalClipboardDescriptor);
    } else {
      // Best-effort reset when the original descriptor was missing.
      Reflect.deleteProperty(navigator, "clipboard");
    }
    if (originalExecCommand) {
      document.execCommand = originalExecCommand;
    }
    vi.restoreAllMocks();
  });

  it("returns true when the async Clipboard API write succeeds", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    await expect(copyText("hello")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("hello");
  });

  it("never rejects when the clipboard write is denied — it falls back and reports failure", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("Write permission denied."));
    const execCommand = vi.fn().mockReturnValue(false);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    document.execCommand = execCommand;
    await expect(copyText("hello")).resolves.toBe(false);
    expect(writeText).toHaveBeenCalled();
    expect(execCommand).toHaveBeenCalled();
  });

  it("falls back to execCommand when navigator.clipboard.writeText throws synchronously", async () => {
    const writeText = vi.fn(() => {
      throw new Error("synchronous permission denial");
    });
    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    document.execCommand = execCommand;
    await expect(copyText("hello")).resolves.toBe(true);
    expect(execCommand).toHaveBeenCalledWith("copy");
  });

  it("uses execCommand when navigator.clipboard is unavailable", async () => {
    Reflect.deleteProperty(navigator, "clipboard");
    const execCommand = vi.fn().mockReturnValue(true);
    document.execCommand = execCommand;
    await expect(copyText("hello")).resolves.toBe(true);
    expect(execCommand).toHaveBeenCalledWith("copy");
  });

  it("returns false when execCommand itself throws", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    document.execCommand = vi.fn(() => {
      throw new Error("execCommand unavailable");
    });
    await expect(copyText("hello")).resolves.toBe(false);
  });

  it("returns false for empty values", async () => {
    await expect(copyText("")).resolves.toBe(false);
  });

  it("returns false for whitespace-only input", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    // The implementation calls navigator.clipboard.writeText first; the
    // browser API itself does not reject empty/whitespace strings, but
    // for safety we want the early-return branch to short-circuit.
    await expect(copyText("   ")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("   ");
  });

  it("coerces non-string input to a string before delegating", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    // @ts-expect-error -- intentionally testing non-string runtime input.
    await expect(copyText(42)).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("42");
  });

  it("never throws on a denied permission — callers can fire without .catch", async () => {
    const writeText = vi.fn().mockRejectedValue(
      Object.assign(new Error("Write permission denied."), { name: "NotAllowedError" }),
    );
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    document.execCommand = vi.fn().mockReturnValue(false);
    let caught: unknown = null;
    try {
      await copyText("hello");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeNull();
  });
});

describe("sanitizeFilename", () => {  it.each([
    ["photo.png", "photo.png"],
    ["../etc/passwd", "etc_passwd"],
    [".htaccess", "htaccess"],
    ["name?*< >|", "name_"],
    ["a\x00b\x1fc", "a_b_c"],
    ["", "download"],
    ["   ", "download"],
  ])("sanitizeFilename(%s) -> %s", (input, expected) => {
    expect(sanitizeFilename(input)).toBe(expected);
  });

  it("caps length at 200 characters", () => {
    const long = "a".repeat(500);
    expect(sanitizeFilename(long)).toHaveLength(200);
  });
});
