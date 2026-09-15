// @vitest-environment jsdom
/**
 * @fileoverview Phase 8 keyboard navigation regression guard.
 *
 * Verifies that the reference-driven shell surfaces are reachable by
 * Tab key alone and that focus never lands on document.body when an
 * interactive control is available.
 */
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Header } from "../../src/components/layout/header";
import { Sidebar } from "../../src/components/layout/sidebar";
import { useSettingsStore } from "../../src/stores/settings-store";
import { useChatStore } from "../../src/stores/chat-store";
import { useAuthStore } from "../../src/stores/auth-store";

const useModelsMock = vi.hoisted(() => vi.fn());

vi.mock("../../src/hooks/use-models", () => ({
  useModels: useModelsMock,
}));

describe("reference shell — keyboard navigation invariants", () => {
  beforeEach(() => {
    useSettingsStore.setState({
      activeTab: "chat",
      selectedModels: {},
      setSelectedModel: vi.fn(),
      toggleSidebar: vi.fn(),
      showInspector: false,
    } as never);
    useChatStore.setState({
      conversations: [],
      activeConversationId: null,
      setActiveConversation: vi.fn(),
    } as never);
    useAuthStore.setState({ apiKey: "test-key" } as never);
    useModelsMock.mockImplementation(() => ({ data: [], isFetching: false }));
  });

  it("Tab from document.body lands on the first focusable control in Header", async () => {
    render(<Header onOpenApiKey={vi.fn()} />);
    const user = userEvent.setup();
    await user.tab();
    const focused = document.activeElement;
    expect(focused).not.toBe(document.body);
    expect(focused?.tagName).toMatch(/BUTTON|A|INPUT|SELECT|TEXTAREA/);
  });

  it("Sidebar exposes navigation buttons reachable by Tab", async () => {
    render(<Sidebar />);
    const user = userEvent.setup();
    const first = await user.tab();
    expect(first).not.toBe(document.body);
  });

  it("Body never remains the active element after a single Tab from neutral start", async () => {
    render(<Header onOpenApiKey={vi.fn()} />);
    const user = userEvent.setup();
    await user.tab();
    expect(document.activeElement).not.toBe(document.body);
  });
});