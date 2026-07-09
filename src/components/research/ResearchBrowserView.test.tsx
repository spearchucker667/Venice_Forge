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
  displayUrl: null,
  title: "",
  canGoBack: false,
  canGoForward: false,
  loading: false,
  error: null,
  securityLabel: "internal",
};

function domRect(input: {
  x: number;
  y: number;
  width: number;
  height: number;
}): DOMRect {
  return {
    x: input.x,
    y: input.y,
    width: input.width,
    height: input.height,
    top: input.y,
    left: input.x,
    right: input.x + input.width,
    bottom: input.y + input.height,
    toJSON: () => ({}),
  } as DOMRect;
}

function installRectMock(rects?: {
  shell?: DOMRect;
  toolbar?: DOMRect;
  viewport?: DOMRect;
  fallback?: DOMRect;
}): void {
  const shell = rects?.shell ?? domRect({ x: 0, y: 0, width: 1000, height: 760 });
  const toolbar = rects?.toolbar ?? domRect({ x: 0, y: 0, width: 1000, height: 48 });
  const viewport = rects?.viewport ?? domRect({ x: 0, y: 48, width: 1000, height: 712 });
  const fallback = rects?.fallback ?? shell;

  HTMLElement.prototype.getBoundingClientRect = vi.fn(function getRect(this: HTMLElement) {
    if (this.dataset.testid === "research-browser-shell") return shell;
    if (this.dataset.testid === "research-browser-toolbar") return toolbar;
    if (this.dataset.testid === "research-browser-viewport") return viewport;
    return fallback;
  });
}

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
    installRectMock();
  });

  afterEach(() => {
    globalThis.ResizeObserver = originalResizeObserver;
    HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
  });

  it("renders the toolbar address input before the native browser viewport", async () => {
    render(<ResearchBrowserView />);

    const input = await screen.findByPlaceholderText("Search or enter website");
    const viewport = await screen.findByTestId("research-browser-viewport");

    expect(input.compareDocumentPosition(viewport) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("submits address input through the research browser bridge without changing routes", async () => {
    render(<ResearchBrowserView />);

    const input = await screen.findByPlaceholderText("Search or enter website");
    await userEvent.type(input, "venice.ai{enter}");

    expect(bridge.navigate).toHaveBeenCalledWith({ urlOrQuery: "venice.ai" });
  });

  it("shows internal home display text instead of a local file path", async () => {
    bridge.getState.mockResolvedValueOnce({
      ok: true,
      state: {
        ...readyState,
        url: "data:text/html;charset=utf-8,%3Chtml%3E%3C%2Fhtml%3E",
        displayUrl: "Venice Research Home",
        securityLabel: "internal",
      },
    });

    render(<ResearchBrowserView />);

    const input = await screen.findByPlaceholderText("Search or enter website");
    await waitFor(() => expect((input as HTMLInputElement).value).toBe("Venice Research Home"));
    expect((input as HTMLInputElement).value).not.toContain("file:///");
  });

  it("does not show the native browser view for a minuscule viewport", async () => {
    installRectMock({
      shell: domRect({ x: 0, y: 0, width: 1000, height: 180 }),
      toolbar: domRect({ x: 0, y: 0, width: 1000, height: 48 }),
      viewport: domRect({ x: 12, y: 48, width: 80, height: 90 }),
    });

    render(<ResearchBrowserView />);

    await waitFor(() => expect(bridge.setVisible).toHaveBeenCalledWith(false));
    expect(bridge.setBounds).not.toHaveBeenCalledWith(expect.objectContaining({ visible: true }));
    await screen.findByText("Research Browser viewport is too small; native browser view hidden.");
  });

  it("sets bounds from the dedicated browser viewport", async () => {
    installRectMock({
      shell: domRect({ x: 0, y: 0, width: 1200, height: 800 }),
      toolbar: domRect({ x: 0, y: 70, width: 1200, height: 50 }),
      viewport: domRect({ x: 40, y: 120, width: 900, height: 640 }),
    });

    render(<ResearchBrowserView />);

    await waitFor(() => expect(bridge.setBounds).toHaveBeenCalledWith(expect.objectContaining({
      x: 40,
      y: 120,
      width: 900,
      height: 640,
      visible: true,
      geometry: expect.objectContaining({
        shell: expect.objectContaining({ x: 0, y: 0, width: 1200, height: 800 }),
        toolbar: expect.objectContaining({ x: 0, y: 70, width: 1200, height: 50 }),
        viewport: expect.objectContaining({ x: 40, y: 120, width: 900, height: 640 }),
      }),
    })));
  });

  it("hides the native browser view on unmount", async () => {
    installRectMock({
      shell: domRect({ x: 0, y: 0, width: 800, height: 700 }),
      toolbar: domRect({ x: 0, y: 52, width: 800, height: 48 }),
      viewport: domRect({ x: 0, y: 100, width: 800, height: 600 }),
    });

    const { unmount } = render(<ResearchBrowserView />);
    await waitFor(() => expect(bridge.setBounds).toHaveBeenCalled());

    await act(async () => {
      unmount();
    });

    expect(bridge.setVisible).toHaveBeenCalledWith(false);
    expect(bridge.destroy).toHaveBeenCalled();
  });

  it("hides the native browser view when viewport geometry would cover the toolbar", async () => {
    installRectMock({
      shell: domRect({ x: 0, y: 0, width: 1000, height: 760 }),
      toolbar: domRect({ x: 0, y: 0, width: 1000, height: 48 }),
      viewport: domRect({ x: 0, y: 30, width: 1000, height: 700 }),
    });

    render(<ResearchBrowserView />);

    await waitFor(() => expect(bridge.setVisible).toHaveBeenCalledWith(false));
    expect(bridge.setBounds).not.toHaveBeenCalledWith(expect.objectContaining({ visible: true }));
    await screen.findByText("Research Browser viewport overlaps the toolbar; native browser view hidden.");
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
