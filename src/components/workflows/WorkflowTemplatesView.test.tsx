import { describe, it, expect, beforeEach, vi } from "vitest";
import "@testing-library/jest-dom";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { WorkflowTemplatesView } from "./WorkflowTemplatesView";
import { useWorkflowTemplateStore } from "../../stores/workflow-template-store";

vi.mock("../../services/storageService", () => ({
  default: {
    getEncrypted: vi.fn().mockResolvedValue([]),
    getItems: vi.fn().mockResolvedValue([]),
    saveItem: vi.fn().mockResolvedValue(undefined),
    deleteItem: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("../../stores/project-store", () => ({
  useProjectStore: Object.assign(
    () => ({ activeProject: null }),
    { getState: () => ({ activeProject: null }) }
  ),
}));

vi.mock("../../stores/settings-store", () => ({
  useSettingsStore: Object.assign(
    () => vi.fn(),
    { getState: () => ({ activeProjectId: null }) }
  ),
}));

describe("WorkflowTemplatesView", () => {
  beforeEach(() => {
    useWorkflowTemplateStore.setState({
      workflows: [],
      activeWorkflowId: null,
      hydrated: true,
    });
    vi.clearAllMocks();
  });

  it("renders empty state initially", () => {
    render(<WorkflowTemplatesView />);
    expect(screen.getByTestId("empty-state")).toBeInTheDocument();
    expect(screen.getByText("Select or create a workflow to begin.")).toBeInTheDocument();
  });

  it("creates and selects a new workflow", async () => {
    render(<WorkflowTemplatesView />);
    
    const createBtn = screen.getByTestId("create-workflow-btn");
    fireEvent.click(createBtn);

    await waitFor(() => {
        expect(screen.getByTestId("workflow-detail")).toBeInTheDocument();
    });
    
    const titleInput = screen.getByTestId("workflow-title-input") as HTMLInputElement;
    expect(titleInput.value).toBe("New Workflow");
  });

  it("adds and removes steps", async () => {
    // Setup initial state with a workflow
    const store = useWorkflowTemplateStore.getState();
    const w = await store.createWorkflow({ title: "Test WF" });
    store.setActiveWorkflow(w.id);

    render(<WorkflowTemplatesView />);
    
    // Add step
    const addStepBtn = screen.getByTestId("add-step-btn");
    fireEvent.click(addStepBtn);

    // Should have 1 step now
    let stepItems = await screen.findAllByTestId("workflow-step-item");
    expect(stepItems).toHaveLength(1);
    expect(stepItems[0]).toHaveTextContent("New Prompt Step");

    // Remove step
    const removeBtn = screen.getByTestId("remove-step-btn");
    fireEvent.click(removeBtn);

    await waitFor(() => {
        expect(screen.queryByTestId("workflow-step-item")).not.toBeInTheDocument();
    });
  });

  it("shows compile and run plan previews", async () => {
    const store = useWorkflowTemplateStore.getState();
    const w = await store.createWorkflow({ title: "Test WF" });
    await store.addStep(w.id, { kind: "prompt", target: "chat", title: "Test Step", enabled: true });
    store.setActiveWorkflow(w.id);

    render(<WorkflowTemplatesView />);

    expect(screen.getByTestId("compile-preview")).toBeInTheDocument();
    expect(screen.getByText("Workflow is valid.")).toBeInTheDocument();

    expect(screen.getByTestId("run-plan-preview")).toBeInTheDocument();
    expect(screen.getByText("Send prompt to chat")).toBeInTheDocument();
    expect(screen.getByTestId("run-step-btn")).toBeInTheDocument();
  });
});