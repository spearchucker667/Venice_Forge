import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";
import React from "react";
import { useResolvedMediaUrl } from "./useResolvedMediaUrl";
import { resolvePlayableMediaUrl } from "../services/playableMediaUrl";

vi.mock("../services/playableMediaUrl", () => ({
  resolvePlayableMediaUrl: vi.fn(async (url: string) => `${url}?cap=token`),
}));

function Probe({ src }: { src: string | null | undefined }) {
  const { url, retry } = useResolvedMediaUrl(src);
  return (
    <div>
      <div data-testid="out">{url ?? "<null>"}</div>
      <button data-testid="retry" type="button" onClick={() => retry()}>
        retry
      </button>
    </div>
  );
}

describe("useResolvedMediaUrl", () => {
  beforeEach(() => {
    vi.mocked(resolvePlayableMediaUrl).mockClear();
    vi.mocked(resolvePlayableMediaUrl).mockImplementation(
      async (url: string) => `${url}?cap=token`,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("passes non-custom URLs through synchronously", () => {
    render(<Probe src="data:image/png;base64,abc" />);
    expect(screen.getByTestId("out").textContent).toBe("data:image/png;base64,abc");
    expect(resolvePlayableMediaUrl).not.toHaveBeenCalled();
  });

  it("passes http(s) URLs through synchronously", () => {
    render(<Probe src="https://example.com/img.png" />);
    expect(screen.getByTestId("out").textContent).toBe("https://example.com/img.png");
    expect(resolvePlayableMediaUrl).not.toHaveBeenCalled();
  });

  it("passes blob: URLs through synchronously", () => {
    render(<Probe src="blob:https://app/abc" />);
    expect(screen.getByTestId("out").textContent).toBe("blob:https://app/abc");
    expect(resolvePlayableMediaUrl).not.toHaveBeenCalled();
  });

  it("passes already-tokenized URLs through synchronously", () => {
    const url = `venice-media://${"a".repeat(64)}?cap=existing`;
    render(<Probe src={url} />);
    expect(screen.getByTestId("out").textContent).toBe(url);
    expect(resolvePlayableMediaUrl).not.toHaveBeenCalled();
  });

  it("passes venice-character-cache tokenized URLs through synchronously", () => {
    const url = `venice-character-cache://${"a".repeat(64)}?cap=t`;
    render(<Probe src={url} />);
    expect(screen.getByTestId("out").textContent).toBe(url);
    expect(resolvePlayableMediaUrl).not.toHaveBeenCalled();
  });

  it("returns null for custom-protocol URLs until the capability URL resolves", async () => {
    render(<Probe src={`venice-media://${"b".repeat(64)}`} />);
    expect(screen.getByTestId("out").textContent).toBe("<null>");
    await waitFor(() => {
      expect(screen.getByTestId("out").textContent).toBe(
        `venice-media://${"b".repeat(64)}?cap=token`,
      );
    });
  });

  it("returns null for venice-character-cache:// until resolved", async () => {
    const id = "c".repeat(64);
    render(<Probe src={`venice-character-cache://${id}`} />);
    expect(screen.getByTestId("out").textContent).toBe("<null>");
    await waitFor(() => {
      expect(screen.getByTestId("out").textContent).toBe(
        `venice-character-cache://${id}?cap=token`,
      );
    });
  });

  it("returns null for a null src", () => {
    render(<Probe src={null} />);
    expect(screen.getByTestId("out").textContent).toBe("<null>");
    expect(resolvePlayableMediaUrl).not.toHaveBeenCalled();
  });

  it("returns null for an undefined src", () => {
    render(<Probe src={undefined} />);
    expect(screen.getByTestId("out").textContent).toBe("<null>");
    expect(resolvePlayableMediaUrl).not.toHaveBeenCalled();
  });

  it("returns null for an empty string src", () => {
    render(<Probe src="" />);
    expect(screen.getByTestId("out").textContent).toBe("<null>");
    expect(resolvePlayableMediaUrl).not.toHaveBeenCalled();
  });

  it("surfaces empty string when resolvePlayableMediaUrl fails closed", async () => {
    // Under VF-IMGINS-P2-003, resolvePlayableMediaUrl fails closed to ""
    // rather than returning a tokenless custom protocol URL that triggers a 403.
    vi.mocked(resolvePlayableMediaUrl).mockImplementation(async () => "");
    const url = `venice-media://${"d".repeat(64)}`;
    render(<Probe src={url} />);
    await waitFor(() => {
      expect(screen.getByTestId("out").textContent).toBe("");
    });
  });

  it("re-resolves when src changes from one custom URL to another (retains previous value during pending)", async () => {
    const idA = "e".repeat(64);
    const idB = "f".repeat(64);
    const { rerender } = render(<Probe src={`venice-media://${idA}`} />);
    await waitFor(() => {
      expect(screen.getByTestId("out").textContent).toBe(`venice-media://${idA}?cap=token`);
    });
    expect(resolvePlayableMediaUrl).toHaveBeenCalledTimes(1);

    // On src change the hook intentionally retains the previous resolved
    // value while the new resolution is in flight. This prevents a flash
    // through `null` and re-triggering 403s on rapidly-updating lists.
    rerender(<Probe src={`venice-media://${idB}`} />);
    expect(resolvePlayableMediaUrl).toHaveBeenCalledTimes(2);
    await waitFor(() => {
      expect(screen.getByTestId("out").textContent).toBe(`venice-media://${idB}?cap=token`);
    });
  });

  it("drops a stale in-flight resolution when src changes mid-flight", async () => {
    let resolveFirst!: (url: string) => void;
    vi.mocked(resolvePlayableMediaUrl).mockImplementationOnce(
      () => new Promise<string>((res) => { resolveFirst = res; }),
    );
    const idA = "1".repeat(64);
    const idB = "2".repeat(64);

    const { rerender } = render(<Probe src={`venice-media://${idA}`} />);
    expect(resolvePlayableMediaUrl).toHaveBeenCalledTimes(1);

    // Change src before the first resolution settles — the hook should
    // ignore the late first resolution and resolve the second URL.
    rerender(<Probe src={`venice-media://${idB}`} />);
    expect(resolvePlayableMediaUrl).toHaveBeenCalledTimes(2);

    // Settle the FIRST (now-stale) resolution after the second one is in flight.
    await act(async () => {
      resolveFirst(`venice-media://${idA}?cap=stale`);
    });

    // The stale token must NOT be applied — the hook is bound to idB now.
    await waitFor(() => {
      expect(screen.getByTestId("out").textContent).toBe(`venice-media://${idB}?cap=token`);
    });
  });

  it("does not call resolvePlayableMediaUrl after unmount while pending", async () => {
    let resolveIt!: (url: string) => void;
    vi.mocked(resolvePlayableMediaUrl).mockImplementationOnce(
      () => new Promise<string>((res) => { resolveIt = res; }),
    );
    const id = "3".repeat(64);
    const { unmount } = render(<Probe src={`venice-media://${id}`} />);
    expect(resolvePlayableMediaUrl).toHaveBeenCalledTimes(1);
    unmount();
    // Resolving the now-orphaned promise must not throw, and React's
    // unmount cleanup must have prevented any setState on the unmounted
    // component.
    expect(() => resolveIt(`venice-media://${id}?cap=ignored`)).not.toThrow();
  });

  it("retry() is a no-op for non-custom-protocol URLs", () => {
    render(<Probe src="https://example.com/img.png" />);
    expect(resolvePlayableMediaUrl).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("retry"));
    expect(resolvePlayableMediaUrl).not.toHaveBeenCalled();
  });

  it("retry() triggers a fresh resolution for a custom-protocol URL", async () => {
    const id = "4".repeat(64);
    render(<Probe src={`venice-media://${id}`} />);
    await waitFor(() => {
      expect(screen.getByTestId("out").textContent).toBe(`venice-media://${id}?cap=token`);
    });
    expect(resolvePlayableMediaUrl).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId("retry"));
    await waitFor(() => {
      expect(resolvePlayableMediaUrl).toHaveBeenCalledTimes(2);
    });
  });

  it("retry() is one-shot: a second call before src change is a no-op", async () => {
    const id = "5".repeat(64);
    render(<Probe src={`venice-media://${id}`} />);
    await waitFor(() => {
      expect(resolvePlayableMediaUrl).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByTestId("retry"));
    await waitFor(() => {
      expect(resolvePlayableMediaUrl).toHaveBeenCalledTimes(2);
    });

    fireEvent.click(screen.getByTestId("retry"));
    await new Promise((r) => setTimeout(r, 10));
    expect(resolvePlayableMediaUrl).toHaveBeenCalledTimes(2);
  });

  it("retry() is re-armed when src changes", async () => {
    const idA = "6".repeat(64);
    const idB = "7".repeat(64);
    const { rerender } = render(<Probe src={`venice-media://${idA}`} />);
    await waitFor(() => {
      expect(resolvePlayableMediaUrl).toHaveBeenCalledTimes(1);
    });

    // Consume the retry on idA.
    fireEvent.click(screen.getByTestId("retry"));
    await waitFor(() => {
      expect(resolvePlayableMediaUrl).toHaveBeenCalledTimes(2);
    });
    fireEvent.click(screen.getByTestId("retry"));
    await new Promise((r) => setTimeout(r, 10));
    expect(resolvePlayableMediaUrl).toHaveBeenCalledTimes(2);

    // After src changes, retry budget resets and a new retry is allowed.
    rerender(<Probe src={`venice-media://${idB}`} />);
    await waitFor(() => {
      expect(screen.getByTestId("out").textContent).toBe(`venice-media://${idB}?cap=token`);
    });
    fireEvent.click(screen.getByTestId("retry"));
    await waitFor(() => {
      expect(resolvePlayableMediaUrl).toHaveBeenCalledTimes(4);
    });
  });
});
