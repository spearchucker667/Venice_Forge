/** @fileoverview Workflow Templates view smoke tests (VERIFY-049). */
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { WorkflowsView } from "./workflows-view";
import { useWorkflowStore } from "../../stores/workflow-store";

vi.mock("../../lib/workflow-engine", () => ({
  executeWorkflow: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../stores/toast-store", () => ({
  toast: {
    success: vi.fn(),
    fromError: vi.fn(),
  },
}));

vi.mock("@xyflow/react", async () => {
  const React = await import("react");
  return {
    ReactFlow: ({ children, ...rest }: React.PropsWithChildren<Record<string, unknown>>) => (
      <div data-testid="react-flow" data-props={JSON.stringify(rest)}>
        {children}
      </div>
    ),
    ReactFlowProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    Background: () => null,
    Controls: () => null,
    MiniMap: () => null,
    useNodesState: (initial: unknown) => [initial, vi.fn(), vi.fn()],
    useEdgesState: (initial: unknown) => [initial, vi.fn(), vi.fn()],
    useReactFlow: () => ({ getNodes: () => [], getEdges: () => [], fitView: vi.fn() }),
    addEdge: (edge: unknown, edges: unknown[]) => [...edges, edge],
    Position: { Top: "top", Bottom: "bottom" },
    BackgroundVariant: { Dots: "dots" },
  };
});

function resetStore() {
  useWorkflowStore.setState({
    workflows: [],
    activeWorkflowId: null,
    runResults: {},
    isRunning: false,
    currentRunId: null,
    currentRunStartedAt: null,
    runHistory: [],
  });
}

describe("WorkflowsView", () => {
  beforeEach(() => {
    resetStore();
  });

  it("renders the empty list with templates and a create form", () => {
    render(<WorkflowsView />);
    expect(screen.getByRole("heading", { name: "Workflows" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Workflow name...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New Workflow" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Templates" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Album Cover/ })).toBeInTheDocument();
  });

  it("creates a blank workflow and shows the canvas", async () => {
    render(<WorkflowsView />);
    const input = screen.getByPlaceholderText("Workflow name...");
    await userEvent.type(input, "My Workflow");
    await userEvent.click(screen.getByRole("button", { name: "New Workflow" }));

    expect(screen.getByTestId("react-flow")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();
    expect(screen.getByText("My Workflow")).toBeInTheDocument();
  });

  it("creates a workflow from a template", async () => {
    render(<WorkflowsView />);
    await userEvent.click(screen.getByRole("button", { name: /Song Writer/ }));

    expect(screen.getByTestId("react-flow")).toBeInTheDocument();
    expect(screen.getByText("Song Writer")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();
  });

  it("returns to the list from the active workflow canvas", async () => {
    render(<WorkflowsView />);
    await userEvent.click(screen.getByRole("button", { name: /Album Cover/ }));
    expect(screen.getByTestId("react-flow")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("heading", { name: "Workflows" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Album Cover/ })).toBeInTheDocument();
  });

  it("lists saved workflows and deletes one", async () => {
    useWorkflowStore.setState({
      workflows: [
        { id: "wf-1", name: "First Workflow", nodes: [], edges: [], createdAt: Date.now() },
        { id: "wf-2", name: "Second Workflow", nodes: [], edges: [], createdAt: Date.now() },
      ],
    });

    render(<WorkflowsView />);
    expect(screen.getByText("First Workflow")).toBeInTheDocument();
    expect(screen.getByText("Second Workflow")).toBeInTheDocument();

    const deleteButtons = screen.getAllByRole("button", { name: "Delete" });
    expect(deleteButtons).toHaveLength(2);
    await userEvent.click(deleteButtons[0]);

    expect(screen.queryByText("First Workflow")).not.toBeInTheDocument();
    expect(screen.getByText("Second Workflow")).toBeInTheDocument();
  });

  it("opens a saved workflow into the canvas", async () => {
    useWorkflowStore.setState({
      workflows: [
        { id: "wf-1", name: "Saved Workflow", nodes: [], edges: [], createdAt: Date.now() },
      ],
    });

    render(<WorkflowsView />);
    await userEvent.click(screen.getByText("Saved Workflow"));
    expect(screen.getByTestId("react-flow")).toBeInTheDocument();
    expect(screen.getByText("Saved Workflow")).toBeInTheDocument();
  });
});
