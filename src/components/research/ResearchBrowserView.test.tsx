import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ResearchBrowserState } from "../../types/researchBrowser";
import { ResearchBrowserView } from "./ResearchBrowserView";

const bridge = vi.hoisted(() => ({
  create: vi.fn(),
  destroy: vi.fn(),
  setVisible: vi.fn(),
  setBounds: vi.fn(),
  navigate: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  reload: vi.fn(),
  stop: vi.fn(),
  getState: vi.fn(),
  openExternal: vi.fn(),
  scrapeCurrent: vi.fn(),
  captureMetadata: vi.fn(),
  onStateChanged: vi.fn(),
}));

vi.mock("../../services/researchBrowserBridge", () => ({
  researchBrowserBridge: bridge,
}));

class TestResizeObserver {
  private readonly callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  observe(target: Element): void {
    this.callback([{ target } as ResizeObserverEntry], this as unknown as ResizeObserver);
  }

  unobserve(): void {}

  disconnect(): void {}
}

const readyState: ResearchBrowserState = {
  visible: false,
  url: null,
  title: "",
  canGoBack: false,
  canGoForward: false,
  loading: false,
  error: null,
  securityLabel: "internal",
};

describe("ResearchBrowserView", () => {
  const originalResizeObserver = globalThis.ResizeObserver;
  const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;

  beforeEach(() => {
    vi.clearAllMocks();
    bridge.create.mockResolvedValue({ ok: true });
    bridge.destroy.mockResolvedValue({ ok: true });
    bridge.setVisible.mockResolvedValue({ ok: true });
    bridge.setBounds.mockResolvedValue({ ok: true });
    bridge.navigate.mockResolvedValue({ ok: true, state: readyState });
    bridge.getState.mockResolvedValue({ ok: true, state: readyState });
    bridge.onStateChanged.mockReturnValue(vi.fn());
    globalThis.ResizeObserver = TestResizeObserver;
  });

  afterEach(() => {
    globalThis.ResizeObserver = originalResizeObserver;
    HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
  });

  it("renders the toolbar address input before the native browser viewport", async () => {
    render(<ResearchBrowserView />);

    const input = await screen.findByPlaceholderText("Search or enter URL");
    const viewport = await screen.findByTestId("research-browser-viewport");

    expect(input.compareDocumentPosition(viewport) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("submits address input through the research browser bridge without changing routes", async () => {
    render(<ResearchBrowserView />);

    const input = await screen.findByPlaceholderText("Search or enter URL");
    await userEvent.type(input, "venice.ai{enter}");

    expect(bridge.navigate).toHaveBeenCalledWith({ urlOrQuery: "venice.ai" });
  });

  it("does not show the native browser view for a minuscule viewport", async () => {
    HTMLElement.prototype.getBoundingClientRect = vi.fn(() => ({
      x: 12,
      y: 34,
      width: 80,
      height: 90,
      top: 34,
      left: 12,
      right: 92,
      bottom: 124,
      toJSON: () => ({}),
    }));

    render(<ResearchBrowserView />);

    await waitFor(() => expect(bridge.setVisible).toHaveBeenCalledWith(false));
    expect(bridge.setBounds).not.toHaveBeenCalledWith(expect.objectContaining({ visible: true }));
  });

  it("sets bounds from the dedicated browser viewport", async () => {
    HTMLElement.prototype.getBoundingClientRect = vi.fn(function getRect(this: HTMLElement) {
      if (this.dataset.testid === "research-browser-viewport") {
        return {
          x: 40,
          y: 120,
          width: 900,
          height: 640,
          top: 120,
          left: 40,
          right: 940,
          bottom: 760,
          toJSON: () => ({}),
        };
      }
      return {
        x: 0,
        y: 0,
        width: 1200,
        height: 800,
        top: 0,
        left: 0,
        right: 1200,
        bottom: 800,
        toJSON: () => ({}),
      };
    });

    render(<ResearchBrowserView />);

    await waitFor(() => expect(bridge.setBounds).toHaveBeenCalledWith({
      x: 40,
      y: 120,
      width: 900,
      height: 640,
      visible: true,
    }));
  });

  it("hides the native browser view on unmount", async () => {
    HTMLElement.prototype.getBoundingClientRect = vi.fn(() => ({
      x: 0,
      y: 100,
      width: 800,
      height: 600,
      top: 100,
      left: 0,
      right: 800,
      bottom: 700,
      toJSON: () => ({}),
    }));

    const { unmount } = render(<ResearchBrowserView />);
    await waitFor(() => expect(bridge.setBounds).toHaveBeenCalled());

    await act(async () => {
      unmount();
    });

    expect(bridge.setVisible).toHaveBeenCalledWith(false);
    expect(bridge.destroy).toHaveBeenCalled();
  });

  // VERIFY-RB-001 regression guard — navigate-before-create (Bug 2):
  // When ResearchBrowserView mounts with an initialUrl, it must call navigate
  // after create() succeeds, not before. This proves the renderer-side half of
  // the fix for the "Not initialized" race.
  it("navigates to initialUrl after create() completes, not before", async () => {
    const callOrder: string[] = [];
    bridge.create.mockImplementation(async () => {
      callOrder.push("create");
      return { ok: true };
    });
    bridge.navigate.mockImplementation(async () => {
      callOrder.push("navigate");
      return { ok: true, state: readyState };
    });

    render(<ResearchBrowserView initialUrl="https://venice.ai" onInitialUrlConsumed={vi.fn()} />);

    await waitFor(() => expect(bridge.navigate).toHaveBeenCalledWith({ urlOrQuery: "https://venice.ai" }));
    expect(callOrder).toEqual(["create", "navigate"]);
  });

  // VERIFY-RB-002 regression guard — onInitialUrlConsumed fires exactly once.
  it("calls onInitialUrlConsumed once after navigating to initialUrl", async () => {
    const onConsumed = vi.fn();

    render(<ResearchBrowserView initialUrl="https://venice.ai" onInitialUrlConsumed={onConsumed} />);

    await waitFor(() => expect(bridge.navigate).toHaveBeenCalled());
    expect(onConsumed).toHaveBeenCalledTimes(1);
  });

  // VERIFY-RB-003 regression guard — navigate errors are surfaced in the UI.
  it("shows navigation error in the status bar when navigate returns an error", async () => {
    bridge.navigate.mockResolvedValueOnce({ ok: false, error: "Blocked unsafe URL" });

    render(<ResearchBrowserView initialUrl="javascript:alert(1)" onInitialUrlConsumed={vi.fn()} />);

    await waitFor(() => expect(bridge.navigate).toHaveBeenCalled());
    await screen.findByText("Blocked unsafe URL");
  });

  // VERIFY-RB-004 regression guard — initialUrl is not re-navigated on re-render.
  it("does not navigate again if the component re-renders with the same initialUrl", async () => {
    const onConsumed = vi.fn();

    const { rerender } = render(
      <ResearchBrowserView initialUrl="https://venice.ai" onInitialUrlConsumed={onConsumed} />
    );

    await waitFor(() => expect(bridge.navigate).toHaveBeenCalledTimes(1));

    // Re-render with same prop (parent hasn't cleared it yet).
    rerender(<ResearchBrowserView initialUrl="https://venice.ai" onInitialUrlConsumed={onConsumed} />);

    // navigate should still have been called exactly once.
    expect(bridge.navigate).toHaveBeenCalledTimes(1);
  });

  // VERIFY-RB-005 regression guard — when no initialUrl is provided, navigate is
  // not called on mount (existing behaviour preserved).
  it("does not call navigate on mount when no initialUrl is given", async () => {
    render(<ResearchBrowserView />);

    // Let the async init settle.
    await waitFor(() => expect(bridge.create).toHaveBeenCalled());
    expect(bridge.navigate).not.toHaveBeenCalled();
  });
});
